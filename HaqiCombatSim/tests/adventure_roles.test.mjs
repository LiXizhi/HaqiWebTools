import {directCacheStore} from './helpers/direct_cache_store.js';
import test from 'node:test';
import {createRuntimeStore} from '../js/adventure_runtime_store.js';
import {coreCatalogKey,durableSave,restoreRuntime} from '../js/adventure_storage_core.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAdventure, beginEncounter, recordDecision } from '../js/adventure_core.js';
import { restorePveBattle, playPveRound } from '../js/combat_pve_core.js';
import { createRoleStore } from '../js/adventure_roles.js';
import { validateRoles, emptyRoles, addRole, roleLimit, MAX_ROLES_VIP, directSignInRequested, startupRoleId } from '../js/adventure_roles_core.js';
import { SAVE_KEY, saveLocal, readLocal, replaceLocalWithBackup, readBackup } from '../js/adventure_assets.js';
import { storeDebugEdit, restoreDebugBackup, hasDebugBackup } from '../js/adventure_debug.js';
import { createCloudClient } from '../js/adventure_cloud.js';
import {recordFishingCatch} from '../js/adventure_fishing_records_core.js';
const load = n => JSON.parse(fs.readFileSync(new URL(`../data/adventure/${n}.json`, import.meta.url)));
const content = load('chapter'), dataset = load('combat');
const hero = name => createAdventure(content, { name });
const id = n => `12345678-1234-1234-1234-${String(n).padStart(12, '0')}`;
function local() {
    const data = new Map(),runtimeStore=createRuntimeStore({indexedDB:null});let n = 0;
    const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
    return { data, storage, make: () => createRoleStore({ content, dataset, storage, runtimeStore, uuid: () => id(++n), now: () => 1000 + n }) };
}
test('duo selection survives reload in player order, stays local and is account scoped', () => {
    const l = local(), store = l.make();store.open();
    const a = store.create(hero('一号')), b = store.create(hero('二号'));
    store.markSynced(id(9), store.checkpoint());
    const before = store.checkpoint();
    store.rememberDuoSelection([b, a]);
    assert.equal(store.checkpoint(), before);assert.equal(store.dirty, false);
    const loaded = l.make();loaded.open();assert.deepEqual(loaded.duoSelection, [b, a]);
    loaded.open('alice');assert.deepEqual(loaded.duoSelection, [null, null]);
    const c = loaded.create(hero('三号')), d = loaded.create(hero('四号'));
    loaded.rememberDuoSelection([c, d]);
    loaded.open();assert.deepEqual(loaded.duoSelection, [b, a]);
    loaded.open('alice');assert.deepEqual(loaded.duoSelection, [c, d]);
});

test('duo selection leaves missing roles empty and rejects invalid stored preferences', () => {
    const l = local(), store = l.make();store.open();
    const a = store.create(hero('一号')), b = store.create(hero('二号'));
    store.rememberDuoSelection([b, a]);store.remove(b);
    assert.deepEqual(store.duoSelection, [null, a]);
    for (const raw of ['broken', '{}', '[]', JSON.stringify([a, a]), JSON.stringify([42, a])]) {
        l.storage.setItem('haqi.roles.v1.guest.duo-selection', raw);
        const selected = store.duoSelection;
        assert.equal(selected.length, 2);
        assert.ok(selected.filter(Boolean).length <= 1);
    }
});

test('unavailable local preference storage does not block role selection', () => {
    const l = local(), store = l.make();store.open();
    const a = store.create(hero('一号')), b = store.create(hero('二号'));
    l.storage.setItem = () => { throw Error('quota'); };
    assert.doesNotThrow(() => store.rememberDuoSelection([a, b]));
    l.storage.getItem = () => { throw Error('blocked'); };
    assert.deepEqual(store.duoSelection, [null, null]);
});
test('legacy save migrates once to guest role without changing source or binding to an account', () => {
    const l = local();saveLocal(hero('旧角色'), l.storage);const original = l.storage.getItem(SAVE_KEY);
    const store = l.make();store.open();assert.equal(store.catalog.roles.length, 1);assert.equal(store.catalog.roles[0].save.name, '旧角色');
    store.open('alice');assert.equal(store.catalog.roles.length, 0);store.create(hero('账号角色'));
    store.open();assert.equal(store.catalog.roles.length, 1);assert.equal(l.storage.getItem(SAVE_KEY), original);
    store.open('alice');assert.equal(store.catalog.roles[0].save.name, '账号角色');
});
test('five role limit does not replace existing progress and recent role survives reload', () => {
    const l = local(), store = l.make();store.open('alice');
    const ids = Array.from({ length: 5 }, (_, i) => store.create(hero(`角色${i}`)));
    const before = store.checkpoint();assert.throws(() => store.create(hero('第六个')), /5/);assert.equal(store.checkpoint(), before);
    store.select(ids[1]);const loaded = l.make();loaded.open('alice');assert.equal(loaded.catalog.activeId, ids[1]);
    assert.equal(loaded.catalog.roles.length, 5);
});
test('VIP accounts can create up to 20 roles while free accounts stay at 5', () => {
    assert.equal(roleLimit(false), 5);assert.equal(roleLimit(true), MAX_ROLES_VIP);
    const l = local(), store = l.make();store.open('alice');
    for (let i = 0; i < 5; i++) store.create(hero(`免费${i}`));
    assert.throws(() => store.create(hero('超限'), { isVip: false }), /5/);
    for (let i = 5; i < 20; i++) store.create(hero(`会员${i}`), { isVip: true });
    assert.equal(store.catalog.roles.length, 20);
    assert.throws(() => store.create(hero('第二十一'), { isVip: true }), /20/);
    assert.equal(validateRoles(store.catalog, content, dataset).roles.length, 20);
});
test('role saves and both kinds of backup remain isolated across roles and accounts', () => {
    const l = local(), store = l.make();store.open('alice');const a = store.create(hero('一号')), scopeA = store.scoped();
    replaceLocalWithBackup(hero('恢复后'), scopeA);assert.equal(JSON.parse(readBackup(scopeA)).name, '一号');
    storeDebugEdit(hero('调试前'), hero('调试后'), scopeA);assert.equal(hasDebugBackup(scopeA), true);
    store.create(hero('二号'));const scopeB = store.scoped();assert.equal(readBackup(scopeB), null);assert.equal(hasDebugBackup(scopeB), false);
    assert.throws(() => saveLocal(hero('迟到写入'), scopeA), /切换/);
    store.select(a);assert.equal(restoreDebugBackup(hero('当前'), content, store.scoped()).name, '调试前');
    store.open('bob');store.create(hero('别的账号'));assert.equal(readBackup(store.scoped()), null);
    store.open('alice');store.select(a);assert.equal(JSON.parse(readLocal(store.scoped())).name, '调试前');
});
test('quota and another tab changes fail before replacing role catalog', () => {
    const l = local(), store = l.make();store.open();store.create(hero('原角色'));const before = store.checkpoint();
    const set = l.storage.setItem;l.storage.setItem = () => { throw Error('quota'); };
    assert.throws(() => store.create(hero('失败')), /quota/);assert.equal(store.checkpoint(), before);l.storage.setItem = set;
    const second = l.make();second.open();second.create(hero('另一个页面'));
    assert.throws(() => store.create(hero('过期页面')), /其他页面/);
});
test('validation rejects duplicate IDs, bad active ID and invalid combat; drops credential-like extras', () => {
    const catalog = addRole(emptyRoles(), id(1), hero('测试'), 100);
    catalog.roles[0].save.token = 'do-not-save';assert.equal(validateRoles(catalog, content, dataset).roles[0].save.token, undefined);
    assert.throws(() => validateRoles({ ...catalog, activeId: id(2) }, content, dataset));
    assert.throws(() => validateRoles({ ...catalog, roles: [...catalog.roles, ...catalog.roles] }, content, dataset));
    const bad = structuredClone(catalog);bad.roles[0].save.contentVersion = 'bad';assert.throws(() => validateRoles(bad, content, dataset));
});
test('sync completion keeps later local progress dirty', () => {
    const l = local(), store = l.make();store.open('alice');store.create(hero('之前'));
    const captured = store.checkpoint();saveLocal(hero('之后'), store.scoped());store.markSynced(id(9), captured);
    assert.equal(store.dirty, true);assert.equal(store.base, id(9));assert.equal(store.catalog.roles[0].save.name, '之后');
});

function cloudMock() {
    const remote = new Map(), listeners = [];let serial = 100, readFailure = false, syncFailure = false;
    const sdk = { token: 'private', username: 'alice', getUserProfile: async () => ({ username: sdk.username }),
        onAuthStateChange: cb => { listeners.push(cb);return () => {}; }, showLoginWindow: async () => {},
        logout: async () => { sdk.token = null;listeners.forEach(cb => cb()); },
        loadPage: async opts => {
            assert.equal(opts.useCache, true);assert.equal(opts.useServerCache, true);
            if (readFailure) throw Error('network failure');
            const full = `${opts.sitePath}/${opts.pagePath}`;
            if (!remote.has(full)) throw Error(`Page not found: ${full}`);
            return { success: true, content: remote.get(full) };
        },
        getFileByFullPath: async (full, _, useCache) => { assert.equal(useCache, true);return remote.get(full) ?? null; },
    };
    const store = { getUsername: () => sdk.username, isUseLocal: () => !sdk.token,
        getRemotePagePath: path => `${sdk.username}/edunotes/store/HaqiAdventure/${path}`,
    };
    sdk.editFileByFullPath=async(full,text,_,useCache)=>{
        assert.equal(useCache,true);
        if(syncFailure)return {success:false};
        remote.set(full,text);return {success:true};
    };
    directCacheStore(store,sdk);
    sdk.personalPageStore = { withWorkspace: () => store };
    return { sdk, store, remote, setReadFailure: v => readFailure = v, setSyncFailure: v => syncFailure = v,
        client: () => createCloudClient({ content, dataset, loadSDK: async () => sdk, uuid: () => id(++serial) }) };
}
test('role deletion persists, isolates accounts and rejects stale writes', () => {
    const localStore=local(),store=localStore.make();store.open();
    saveLocal(hero('旧角色'),localStore.storage);
    const first=store.create(hero('删除')),stale=store.scoped();
    const second=store.create(hero('保留'));store.select(first);
    store.remove(first);
    assert.equal(store.catalog.activeId,null);
    assert.deepEqual(store.catalog.roles.map(row=>row.id),[second]);
    assert.throws(()=>saveLocal(hero('迟到写入'),stale),/切换/);
    assert.equal(store.dirty,true);
    store.open('alice');store.create(hero('其他账号'));
    store.open();store.remove(second);store.open();
    assert.equal(store.catalog.roles.length,0);
    store.open('alice');assert.equal(store.catalog.roles[0].save.name,'其他账号');
});
test('deleted role disappears from verified cloud catalog while account grants survive',async()=>{
    const localStore=local(),store=localStore.make();store.open('alice');
    const role=store.create(hero('删除'));
    const catalog={...store.catalog,magicBeanExchange:{exchangedUntil:'2026-10-01'}};
    store.replace(catalog,null,true);
    const mock=cloudMock(),client=mock.client();await client.connect();
    const captured=store.checkpoint(),revision=await client.saveRoles(store.catalog,null);store.markSynced(revision,captured);
    store.remove(role);
    await client.saveRoles(store.catalog,store.base);
    const remote=await client.roles();
    assert.equal(remote.catalog.roles.length,0);
    assert.equal(remote.catalog.activeId,null);
    assert.deepEqual(remote.catalog.magicBeanExchange,catalog.magicBeanExchange);
});
test('fishing species rankings survive role reload and verified workspace file sync',async()=>{
    const l=local(),s=l.make();s.open('alice');const save=hero('钓鱼者');
    recordFishingCatch(save,[{id:17108,count:15},{id:17111,count:2}]);s.create(save);
    const reopened=l.make();reopened.open('alice');
    assert.deepEqual(reopened.catalog.roles[0].save.fishingRecords,save.fishingRecords);
    const m=cloudMock(),c=m.client();await c.connect();const revision=await c.saveRoles(reopened.catalog,null);
    const index=JSON.parse(m.remote.get(m.store.getRemotePagePath('roles/index.json')));
    assert.equal(index.revision,revision);
    const file=JSON.parse(m.remote.get(m.store.getRemotePagePath(index.catalog.roles[0].files.records)));
    assert.equal(file.owner,'alice');
    assert.deepEqual(file.data.fishingRecords,save.fishingRecords);
    assert.equal(file.data.fishingRecords.byFish[17108].length,10);
    assert.deepEqual((await c.roles()).catalog.roles[0].save.fishingRecords,save.fishingRecords);
});
test('failed records part PUT does not publish the role catalog',async()=>{
    const m=cloudMock(),c=m.client();await c.connect();
    const original=m.sdk.editFileByFullPath;
    m.sdk.editFileByFullPath=async(path,...args)=>path.includes('/records/')?{success:false}:original(path,...args);
    const save=hero('钓鱼者');recordFishingCatch(save,[{id:17108,count:1}]);
    await assert.rejects(c.saveRoles(addRole(emptyRoles(),id(1),save,1),null),/云端/);
    assert.equal(m.remote.has(m.store.getRemotePagePath('roles/index.json')),false);
});
test('cloud role catalog roundtrip with five roles creates no history; logout invalidates access', async () => {
    const m = cloudMock(), c = m.client();await c.connect();assert.deepEqual((await c.roles()).catalog, emptyRoles());
    let catalog = emptyRoles();for (let n = 1; n <= 5; n++) catalog = addRole(catalog, id(n), hero(`角色${n}`), n);
    const rev = await c.saveRoles(catalog, null);const loaded = await c.roles();assert.equal(loaded.revision, rev);assert.deepEqual(loaded.catalog, validateRoles(catalog, content, dataset));
    assert.equal([...m.remote.keys()].filter(k => k.includes('/history/')).length, 0);
    assert.equal([...m.remote.values()].some(v => v.includes('private')), false);
    await c.disconnect();assert.equal(c.owner, null);await assert.rejects(c.roles(), /连接/);
});
test('network failure is not an empty cloud account; failed sync cannot claim success', async () => {
    const m = cloudMock(), c = m.client();await c.connect();m.setReadFailure(true);await assert.rejects(c.roles());
    m.setReadFailure(false);m.setSyncFailure(true);await assert.rejects(c.saveRoles(emptyRoles(), null), /云端/);assert.equal(m.remote.size, 0);
});
test('drifted cloud part witnesses load primary fields instead of blocking the account', async () => {
    const m = cloudMock(), c = m.client();await c.connect();
    const catalog = addRole(emptyRoles(), id(1), hero('旧格式'), 1);
    const revision = await c.saveRoles(catalog, null);
    const index = JSON.parse(m.remote.get(m.store.getRemotePagePath('roles/index.json')));
    const itemsPath = m.store.getRemotePagePath(index.catalog.roles[0].files.items);
    const itemsFile = JSON.parse(m.remote.get(itemsPath));
    itemsFile.data.ownedItemIds = ['999'];
    m.remote.set(itemsPath, JSON.stringify(itemsFile));
    const warnings = [];const warn = console.warn;console.warn = (...args) => warnings.push(args.join(' '));
    try {
        const reader = m.client();await reader.connect();
        const loaded = await reader.roles();
        assert.equal(loaded.revision, revision);
        assert.equal(loaded.catalog.roles[0].save.name, '旧格式');
        assert.deepEqual(loaded.catalog.roles[0].save.inventory, catalog.roles[0].save.inventory);
    } finally { console.warn = warn; }
    assert.equal(warnings.some(text => text.includes('consistency join')), true);
});
test('drifted cloud part witnesses self-heal on the next save so later loads stay strict', async () => {
    const m = cloudMock(), c = m.client();await c.connect();
    const catalog = addRole(emptyRoles(), id(1), hero('旧格式'), 1);
    await c.saveRoles(catalog, null);
    const index = () => JSON.parse(m.remote.get(m.store.getRemotePagePath('roles/index.json')));
    const beforeFiles = { ...index().catalog.roles[0].files };
    const itemsPath = m.store.getRemotePagePath(beforeFiles.items);
    const itemsFile = JSON.parse(m.remote.get(itemsPath));
    itemsFile.data.ownedItemIds = ['999'];
    m.remote.set(itemsPath, JSON.stringify(itemsFile));
    const reader = m.client();await reader.connect();
    const loaded = await reader.roles();
    assert.deepEqual(loaded.partsStale, [id(1)]);
    const warnings = [];const warn = console.warn;console.warn = (...args) => warnings.push(args.join(' '));
    try {
        // Healing save with unchanged durable content must rewrite the drifted part files.
        const revision = await reader.saveRoles(loaded.catalog, loaded.revision);
        const after = index();
        assert.notEqual(after.revision, loaded.revision);assert.equal(after.revision, revision);
        assert.notEqual(after.catalog.roles[0].files.items, beforeFiles.items);
        assert.notEqual(after.catalog.roles[0].files.records, beforeFiles.records);
        const healed = await reader.roles();
        assert.deepEqual(healed.partsStale, []);
        assert.equal(healed.revision, revision);
        assert.deepEqual(healed.catalog.roles[0].save.inventory, catalog.roles[0].save.inventory);
        // A clean no-op afterwards writes nothing again.
        let writes = 0;const original = m.sdk.editFileByFullPath;m.sdk.editFileByFullPath = (...args) => { writes++;return original(...args); };
        assert.equal(await reader.saveRoles(healed.catalog, healed.revision), healed.revision);
        assert.equal(writes, 0);m.sdk.editFileByFullPath = original;
    } finally { console.warn = warn; }
    assert.equal(warnings.length, 0);
});
test('stale device does not overwrite a newer role catalog', async () => {
    const m = cloudMock(), a = m.client(), b = m.client();await a.connect();await b.connect();
    const catalog = addRole(emptyRoles(), id(1), hero('云端'), 1);await a.saveRoles(catalog, null);
    await assert.rejects(b.saveRoles(addRole(emptyRoles(), id(2), hero('旧设备'), 2), null), /冲突/);
    assert.equal((await a.roles()).catalog.roles[0].save.name, '云端');
});
test('cloud account change during write never publishes catalog under another account', async () => {
    const m = cloudMock(), c = m.client();await c.connect();
    m.sdk.editFileByFullPath = async () => { m.sdk.username = 'bob'; };
    await assert.rejects(c.saveRoles(emptyRoles(), null), /登录/);assert.equal(m.remote.size, 0);
});
test('silent reconnect does not open a login window without a session', async () => {
    const m = cloudMock();m.sdk.token = null;m.sdk.showLoginWindow = () => { throw Error('should not open'); };
    await assert.rejects(m.client().connect({ interactive: false }), /请登录/);
});
test('logout before connect clears existing SDK session and permits a different account', async () => {
    const mock = cloudMock(), client = mock.client();
    await client.disconnect();assert.equal(mock.sdk.token, null);
    mock.sdk.showLoginWindow = async () => { mock.sdk.username = 'bob';mock.sdk.token = 'new-session'; };
    assert.equal(await client.connect(), 'bob');
    assert.equal(mock.remote.size, 0);
});
test('logout API failure does not block switching when SDK already cleared credentials', async () => {
    const mock = cloudMock(), client = mock.client();await client.connect();
    mock.sdk.logout = async () => { mock.sdk.token = null;throw Error('offline'); };
    await client.disconnect();assert.equal(client.owner, null);
    await assert.rejects(client.connect(), /取消登录/);
    assert.equal(mock.remote.size, 0);
});
test('expired authentication has actionable feedback without opening silent login', async () => {
    const mock = cloudMock(), client = mock.client();
    mock.sdk.getUserProfile = async () => { throw Object.assign(Error('unauthorized'), { status: 401 }); };
    await assert.rejects(client.connect({ interactive: false }), /登录已过期.*切换账号/);
    assert.equal(client.owner, null);
});
test('invalid remote roles report validation failure while retaining authenticated identity', async () => {
    const mock = cloudMock(), client = mock.client();await client.connect();
    mock.remote.set(mock.store.getRemotePagePath('roles/index.json'), JSON.stringify({owner:'alice',revision:id(1),catalog:{schemaVersion:99,roles:[]}}));
    const before = [...mock.remote];
    await assert.rejects(client.roles(), /已登录.*角色校验失败/);
    assert.equal(client.owner, 'alice');assert.deepEqual([...mock.remote], before);
});
test('repeated state changes overwrite only the current index without accumulating history files', async () => {
    const m = cloudMock(), c = m.client();await c.connect();
    const catalog=addRole(emptyRoles(),id(1),hero('角色'),1);
    let revision=await c.saveRoles(catalog,null);
    const paths=[...m.remote.keys()],writes=[];
    const original=m.sdk.editFileByFullPath;
    m.sdk.editFileByFullPath=(path,...args)=>{writes.push(path);return original(path,...args);};
    const indexPath=m.store.getRemotePagePath('roles/index.json');
    for(let n=0;n<5;n++){
        catalog.roles[0].save.name=`改名${n}`;
        const next=await c.saveRoles(catalog,revision);assert.notEqual(next,revision);revision=next;
        const manifest=JSON.parse(m.remote.get(indexPath));
        assert.equal(manifest.revision,revision);
        assert.equal(Object.hasOwn(manifest,'parentRevision'),false);
    }
    assert.deepEqual(writes,Array(5).fill(indexPath));
    assert.deepEqual([...m.remote.keys()],paths);
    assert.equal(paths.some(path=>path.includes('/roles/history/')),false);
    const reader=m.client();await reader.connect();
    assert.equal((await reader.roles()).catalog.roles[0].save.name,'改名4');
});

test('legacy parentRevision needs no history reads and failed index writes preserve the current catalog', async () => {
    const m=cloudMock(),writer=m.client();await writer.connect();
    const catalog=addRole(emptyRoles(),id(1),hero('原角色'),1);
    const first=await writer.saveRoles(catalog,null),path=m.store.getRemotePagePath('roles/index.json');
    const legacy={...JSON.parse(m.remote.get(path)),parentRevision:id(99)};
    m.remote.set(path,JSON.stringify(legacy));
    const read=m.sdk.getFileByFullPath;
    m.sdk.getFileByFullPath=(full,...args)=>{assert.equal(full.includes('/roles/history/'),false);return read(full,...args);};
    const client=m.client();await client.connect();
    const loaded=await client.roles();assert.equal(loaded.catalog.roles[0].save.name,'原角色');
    loaded.catalog.roles[0].save.name='新角色';
    const write=m.sdk.editFileByFullPath;
    m.sdk.editFileByFullPath=(full,...args)=>full===path?{success:false}:write(full,...args);
    await assert.rejects(client.saveRoles(loaded.catalog,first),/云端/);
    assert.deepEqual(JSON.parse(m.remote.get(path)),legacy);
    assert.equal((await client.roles()).revision,first);
    m.sdk.editFileByFullPath=write;
    const revision=await client.saveRoles(loaded.catalog,first);
    const manifest=JSON.parse(m.remote.get(path));
    assert.equal(manifest.revision,revision);assert.equal(Object.hasOwn(manifest,'parentRevision'),false);
    assert.equal([...m.remote.keys()].some(full=>full.includes('/roles/history/')),false);
});
test('a corrupt account cache cannot replace the current guest identity or catalog', () => {
    const l = local(), store = l.make();store.open();store.create(hero('访客'));
    l.data.set('haqi.roles.v1.account.bad', '{"catalog":{"roles":null}}');
    assert.throws(() => store.open('bad'));assert.equal(store.owner, null);assert.equal(store.catalog.roles[0].save.name, '访客');
});
test('recovery isolates incompatible roles and preserves original bytes while selecting and creating', async()=>{
    const l=local(),store=l.make();store.open();
    const good=store.create(hero('可用角色')),bad=store.create(hero('不兼容角色'));
    const key='haqi.roles.v1.guest',value=JSON.parse(l.storage.getItem(key));
    value.catalog.roles.find(row=>row.id===bad).save.contentVersion='incompatible';
    const original=JSON.stringify(value);l.storage.setItem(key,original);
    const recovered=l.make();await recovered.prepareOpen(null,{recover:true});recovered.open(null,{recover:true});
    assert.equal(recovered.recovering,true);assert.equal(recovered.catalog.activeId,null);
    assert.deepEqual(recovered.catalog.roles.map(row=>row.id),[good]);
    assert.equal(l.storage.getItem(key),original,'opening recovery must not overwrite storage');
    recovered.select(good);assert.equal(recovered.catalog.activeId,good);
    const created=recovered.create(hero('新旅程'));assert.equal(recovered.catalog.activeId,created);
    assert.equal(JSON.parse(l.storage.getItem(key)).recoveryBackup.raw,original);
    const reopened=l.make();reopened.open(null,{recover:true});
    assert.equal(reopened.recovering,true);assert.equal(reopened.catalog.roles.length,2);
    assert.equal(JSON.parse(l.storage.getItem(key)).recoveryBackup.raw,original);
});
test('malformed catalogs and legacy saves allow creation without deleting their source',async()=>{
    for(const key of ['haqi.roles.v1.guest',SAVE_KEY]){
        const l=local();l.storage.setItem(key,'{broken JSON');
        const store=l.make();await store.prepareOpen(null,{recover:true});store.open(null,{recover:true});
        assert.equal(store.recovering,true);assert.equal(store.catalog.roles.length,0);
        store.create(hero('重新启程'));
        const persisted=JSON.parse(l.storage.getItem('haqi.roles.v1.guest'));
        assert.equal(key===SAVE_KEY?persisted.recoveryBackup.legacy:persisted.recoveryBackup.raw,'{broken JSON');
        if(key===SAVE_KEY)assert.equal(l.storage.getItem(SAVE_KEY),'{broken JSON');
    }
});
test('one role resource preparation failure does not block other roles or lose account isolation',async()=>{
    const l=local(),store=l.make();store.open('alice');store.create(hero('缺少资源'));const good=store.create(hero('可用角色'));
    const recovered=createRoleStore({content,dataset,storage:l.storage,runtimeStore:createRuntimeStore({indexedDB:null}),prepareSaves:async saves=>{if(saves[0].name==='缺少资源')throw Error('resource unavailable');}});
    await recovered.prepareOpen('alice',{recover:true});recovered.open('alice',{recover:true});
    assert.equal(recovered.owner,'alice');assert.equal(recovered.recovering,true);
    assert.deepEqual(recovered.catalog.roles.map(row=>row.id),[good]);
    recovered.open(null,{recover:true});assert.equal(recovered.recovering,false);assert.equal(recovered.catalog.roles.length,0);
});
test('incompatible runtime battles are backed up and failed recovery writes leave original storage intact',()=>{
    const l=local(),runtimeStore=createRuntimeStore({indexedDB:null});let serial=200;
    const make=()=>createRoleStore({content,dataset,storage:l.storage,runtimeStore,uuid:()=>id(++serial)});
    const store=make();store.open();const save=hero('战斗中');beginEncounter(save,content,'ice-scout');
    const role=store.create(save),key='haqi.roles.v1.guest',original=l.storage.getItem(key);
    const runtime=runtimeStore.get(`${key}.${role}`);
    runtime.values.pendingEncounter.player.level=999;
    runtimeStore.set(`${key}.${role}`,runtime);
    const recovered=make();recovered.open(null,{recover:true});
    assert.equal(recovered.recovering,true);assert.equal(recovered.catalog.roles.length,0);
    const write=l.storage.setItem;l.storage.setItem=()=>{throw Error('quota');};
    assert.throws(()=>recovered.create(hero('新角色')),/quota/);
    assert.equal(l.storage.getItem(key),original);assert.equal(recovered.catalog.roles.length,0);
    l.storage.setItem=write;recovered.create(hero('新角色'));
    const backup=JSON.parse(l.storage.getItem(key)).recoveryBackup;
    assert.equal(backup.raw,original);assert.equal(backup.runtime,undefined);
    assert.deepEqual(runtimeStore.get(`${key}.${role}`),runtime);
});
test('switching and reloading preserves each role combat checkpoint and deterministic replay', () => {
    const l = local(), store = l.make();store.open('alice');
    const save = hero('战斗角色');beginEncounter(save, content, 'ice-scout');
    const battle = restorePveBattle(dataset, content, save.pendingEncounter);
    playPveRound(battle, { pass: true });recordDecision(save, { pass: true });
    const combatId = store.create(save);store.create(hero('平静角色'));
    store.select(combatId);const reload = l.make();reload.open('alice');
    const combatSave = reload.catalog.roles.find(row => row.id === combatId).save;
    const restored = restorePveBattle(dataset, content, combatSave.pendingEncounter);
    assert.deepEqual(restored.events, battle.events);assert.equal(restored.rng.state(), battle.rng.state());
    assert.equal(reload.catalog.roles.find(row => row.id !== combatId).save.pendingEncounter, null);
});


test('workspace cache 404 is a new account; other failed responses are not', async () => {
    const m=cloudMock(),c=m.client();await c.connect();
    m.sdk.loadPage=async()=>({success:false,fromServerCache:true,content:''});
    assert.deepEqual((await c.roles()).catalog,emptyRoles());
    m.sdk.loadPage=async()=>({success:false,content:''});
    await assert.rejects(c.roles({refresh:true}),/读取失败/);
});

test('records files only change with records and are absent from the small index',async()=>{
    const m=cloudMock(),c=m.client();await c.connect();
    const index=()=>JSON.parse(m.remote.get(m.store.getRemotePagePath('roles/index.json')));
    const catalog=addRole(emptyRoles(),id(1),hero('钓鱼者'),1);
    let revision=await c.saveRoles(catalog,null),before=index();
    recordFishingCatch(catalog.roles[0].save,[{id:17108,count:1}]);
    revision=await c.saveRoles(catalog,revision);let after=index();
    assert.notEqual(after.catalog.roles[0].files.records,before.catalog.roles[0].files.records);
    assert.equal(after.catalog.roles[0].files.items,before.catalog.roles[0].files.items);
    assert.equal(JSON.stringify(after).includes('fishingRecords'),false);
    before=after;catalog.roles[0].save.name='改名';
    revision=await c.saveRoles(catalog,revision);after=index();
    assert.deepEqual(after.catalog.roles[0].files,before.catalog.roles[0].files);
    assert.equal(m.remote.has(m.store.getRemotePagePath('fishing/records.json')),false);
});


test('legacy all-in-one cloud catalog migrates losslessly and later reads reuse immutable files',async()=>{
    const m=cloudMock(),c=m.client();await c.connect();
    const catalog=addRole(emptyRoles(),id(1),hero('旧版角色'),1);
    recordFishingCatch(catalog.roles[0].save,[{id:17108,count:2}]);
    const path=m.store.getRemotePagePath('roles/index.json');
    m.remote.set(path,JSON.stringify({owner:'alice',revision:id(2),parentRevision:null,catalog}));
    const legacy=await c.roles();assert.deepEqual(legacy.catalog,validateRoles(catalog,content,dataset));
    const revision=await c.saveRoles(legacy.catalog,legacy.revision);
    const manifest=JSON.parse(m.remote.get(path));assert.equal(manifest.schemaVersion,2);
    assert.equal(manifest.catalog.roles[0].save,undefined);
    const reader=m.client();await reader.connect();let reads=0;
    const original=m.sdk.getFileByFullPath;m.sdk.getFileByFullPath=(...args)=>{reads++;return original(...args);};
    assert.equal(coreCatalogKey((await reader.roles()).catalog),coreCatalogKey(catalog));
    assert.equal(reads,3);await reader.roles();assert.equal(reads,3);
    assert.equal((await reader.roles()).revision,revision);
});

test('cloud no-op suppresses writes while loadout changes reuse collection and record files',async()=>{
    const m=cloudMock(),c=m.client();await c.connect();
    const catalog=addRole(emptyRoles(),id(1),hero('角色'),1);
    let revision=await c.saveRoles(catalog,null);
    const index=()=>JSON.parse(m.remote.get(m.store.getRemotePagePath('roles/index.json')));
    const before=index();let writes=[];
    const original=m.sdk.editFileByFullPath;m.sdk.editFileByFullPath=(path,...args)=>{writes.push(path.slice(m.store.getRemotePagePath('').length));return original(path,...args);};
    catalog.roles[0].save.position.x+=10;catalog.roles[0].save.revision++;catalog.roles[0].lastPlayedAt++;
    assert.equal(await c.saveRoles(catalog,revision),revision);assert.equal(writes.length,0);
    catalog.roles[0].save.deck=[...catalog.roles[0].save.deck].reverse();
    revision=await c.saveRoles(catalog,revision);
    const after=index();assert.notEqual(after.catalog.roles[0].files.battle,before.catalog.roles[0].files.battle);
    assert.equal(after.catalog.roles[0].files.items,before.catalog.roles[0].files.items);
    assert.equal(after.catalog.roles[0].files.records,before.catalog.roles[0].files.records);
    assert.equal(writes.length,2); // battle part + current index
    assert.equal(writes.some(path=>path.includes('/items/')),false);
});

test('incomplete or cross-role cloud parts fail closed without replacing the manifest',async()=>{
    const m=cloudMock(),c=m.client();await c.connect();
    await c.saveRoles(addRole(emptyRoles(),id(1),hero('角色'),1),null);
    const path=m.store.getRemotePagePath('roles/index.json'),text=m.remote.get(path),manifest=JSON.parse(text);
    m.remote.delete(m.store.getRemotePagePath(manifest.catalog.roles[0].files.items));
    const reader=m.client();await reader.connect();await assert.rejects(reader.roles());assert.equal(m.remote.get(path),text);
    manifest.catalog.roles[0].files.items=`roles/${id(999)}/items/${id(3)}.json`;
    m.remote.set(path,JSON.stringify(manifest));await assert.rejects(reader.roles({refresh:true}),/路径/);
});

test('startup stays on the title unless signin=direct names a playable role', () => {
    const catalog = { activeId: 'recent', roles: [{ id: 'recent' }, { id: 'other' }] };
    assert.equal(directSignInRequested(''), false);
    assert.equal(directSignInRequested('?lang=zh-CN'), false);
    assert.equal(directSignInRequested('?signin=direct&lang=zh-CN'), true);
    assert.equal(startupRoleId(catalog, { direct: false }), null);
    assert.equal(startupRoleId(catalog, { direct: true }), 'recent');
    assert.equal(startupRoleId(catalog, { direct: true, blocked: true }), null);
    assert.equal(startupRoleId({ activeId: null, roles: [{ id: 'only' }] }, { direct: true }), 'only');
    assert.equal(startupRoleId({ activeId: null, roles: [{ id: 'a' }, { id: 'b' }] }, { direct: true }), null);
    assert.equal(startupRoleId({ activeId: null, roles: [] }, { direct: true }), null);
});

test('single-client save uses its loaded manifest without remote conflict reads',async()=>{
    const m=cloudMock(),c=m.client();await c.connect();
    const catalog=addRole(emptyRoles(),id(1),hero('角色'),1);
    const first=await c.saveRoles(catalog,null),path=m.store.getRemotePagePath('roles/index.json');
    const original=m.sdk.editFileByFullPath;
    m.sdk.editFileByFullPath=async(...args)=>{const result=await original(...args);if(args[0].includes('/battle/')){const remote=JSON.parse(m.remote.get(path));remote.revision=id(999);m.remote.set(path,JSON.stringify(remote));}return result;};
    catalog.roles[0].save.deck.reverse();
    const revision=await c.saveRoles(catalog,first);
    assert.equal(JSON.parse(m.remote.get(path)).revision,revision);assert.notEqual(revision,id(999));
});

test('guest transfer preserves progress, existing account roles and guest backup; retry is idempotent',()=>{
    const l=local(),store=l.make();store.open();const guest=hero('本地主角');guest.inventory[100]=123;
    const guestId=store.create(guest),before=store.checkpoint(),transfer=store.guestTransfer();
    store.open('alice');const existing=store.create(hero('云端主角'));
    assert.equal(store.adoptGuest(transfer),guestId);assert.equal(store.catalog.roles.length,2);
    assert.equal(store.catalog.roles.find(r=>r.id===guestId).save.inventory[100],123);
    assert.equal(store.catalog.roles.find(r=>r.id===existing).save.name,'云端主角');
    const adopted=store.checkpoint();store.adoptGuest(transfer);assert.equal(store.checkpoint(),adopted);
    store.open();assert.deepEqual(JSON.parse(store.checkpoint()),JSON.parse(before));assert.throws(()=>store.adoptGuest(transfer),/登录/);
});
test('full account rejects guest migration without changing either catalog',()=>{
    const l=local(),store=l.make();store.open();store.create(hero('本地'));const transfer=store.guestTransfer(),backup=store.checkpoint();
    store.open('alice');for(let i=0;i<5;i++)store.create(hero('云端'+i));const before=store.checkpoint();
    assert.throws(()=>store.adoptGuest(transfer),/5/);assert.equal(store.checkpoint(),before);
    store.open();assert.deepEqual(JSON.parse(store.checkpoint()),JSON.parse(backup));
});

test('guest migration retries failed cloud verification without duplicate roles or losing the guest',async()=>{
    const l=local(),store=l.make();store.open();const guestId=store.create(hero('待迁移'));const transfer=store.guestTransfer();
    const mock=cloudMock(),client=mock.client();await client.connect();store.open('alice');store.adoptGuest(transfer);
    mock.setSyncFailure(true);await assert.rejects(client.saveRoles(store.catalog,store.base));assert.equal(store.dirty,true);
    assert.equal(mock.remote.has(mock.store.getRemotePagePath('roles/index.json')),false);
    store.adoptGuest(transfer);mock.setSyncFailure(false);const captured=store.checkpoint();
    const revision=await client.saveRoles(JSON.parse(captured),store.base);store.markSynced(revision,captured);
    const remote=await client.roles();assert.equal(remote.catalog.roles.length,1);assert.equal(remote.catalog.roles[0].id,guestId);assert.equal(store.dirty,false);
    store.open();assert.equal(store.catalog.roles[0].save.name,'待迁移');
});


test('login reads once; subsequent changes only PUT and unchanged saves make no requests',async()=>{
    const m=cloudMock(),c=m.client();await c.connect();const calls=[];
    const get=m.sdk.getFileByFullPath,load=m.sdk.loadPage,put=m.sdk.editFileByFullPath;
    m.sdk.getFileByFullPath=async(path,...args)=>{calls.push(['get',path]);return get(path,...args);};
    m.sdk.loadPage=async(opts)=>{calls.push(['head',opts.pagePath]);return load(opts);};
    m.sdk.editFileByFullPath=async(path,...args)=>{calls.push(['put',path]);return put(path,...args);};
    const catalog=addRole(emptyRoles(),id(1),hero('请求计数'),1);
    const revision=await c.saveRoles(catalog,null);
    assert.equal(calls.filter(([method])=>method==='get').length,0);
    assert.equal(calls.filter(([method])=>method==='head').length,1);
    assert.equal(calls.filter(([method])=>method==='put').length,4);
    assert.ok(calls.at(-1)[1].endsWith('/roles/index.json'));
    calls.length=0;assert.equal(await c.saveRoles(catalog,revision),revision);
    assert.deepEqual(calls,[]);
    catalog.roles[0].save.name='内存修改';await c.saveRoles(catalog,revision);
    assert.ok(calls.length>0);assert.ok(calls.every(([method])=>method==='put'));
    calls.length=0;await c.roles();assert.deepEqual(calls,[]);
    await c.roles({refresh:true});assert.equal(calls.filter(([method])=>method==='head').length,1);
});


test('concurrent identical local saves share the acknowledged revision without duplicate PUTs',async()=>{
    const m=cloudMock(),c=m.client();await c.connect();await c.roles();let puts=0;
    const put=m.sdk.editFileByFullPath;m.sdk.editFileByFullPath=async(...args)=>{puts++;return put(...args);};
    const catalog=addRole(emptyRoles(),id(1),hero('同一份进度'),1);
    const [first,second]=await Promise.all([c.saveRoles(catalog,null),c.saveRoles(catalog,null)]);
    assert.equal(first,second);assert.equal(puts,4);
});
