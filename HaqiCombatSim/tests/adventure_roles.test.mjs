import test from 'node:test';
import {createRuntimeStore} from '../js/adventure_runtime_store.js';
import {coreCatalogKey,durableSave,restoreRuntime} from '../js/adventure_storage_core.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAdventure, beginEncounter, recordDecision } from '../js/adventure_core.js';
import { restorePveBattle, playPveRound } from '../js/combat_pve_core.js';
import { createRoleStore } from '../js/adventure_roles.js';
import { validateRoles, emptyRoles, addRole } from '../js/adventure_roles_core.js';
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
    const remote = new Map(), pending = new Map(), listeners = [];let serial = 100, readFailure = false, syncFailure = false;
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
        savePageData: async (path, key, text, flush, cache) => { assert.equal(flush, false);assert.equal(cache, true);pending.set(path, text); },
        syncToGit: async (path,useCache) => { assert.equal(useCache,true); if (syncFailure) return false;remote.set(store.getRemotePagePath(path), pending.get(path));return true; },
    };
    sdk.personalPageStore = { withWorkspace: () => store };
    return { sdk, store, remote, setReadFailure: v => readFailure = v, setSyncFailure: v => syncFailure = v,
        client: () => createCloudClient({ content, dataset, loadSDK: async () => sdk, uuid: () => id(++serial) }) };
}
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
test('failed history part verification does not publish the role catalog',async()=>{
    const m=cloudMock(),c=m.client();await c.connect();
    const original=m.sdk.getFileByFullPath;
    m.sdk.getFileByFullPath=async(path,...args)=>path.includes('/records/')?'{}':original(path,...args);
    const save=hero('钓鱼者');recordFishingCatch(save,[{id:17108,count:1}]);
    await assert.rejects(c.saveRoles(addRole(emptyRoles(),id(1),save,1),null),/核验/);
    assert.equal(m.remote.has(m.store.getRemotePagePath('roles/index.json')),false);
});
test('cloud role catalog roundtrip, five roles and immutable history; logout invalidates access', async () => {
    const m = cloudMock(), c = m.client();await c.connect();assert.deepEqual((await c.roles()).catalog, emptyRoles());
    let catalog = emptyRoles();for (let n = 1; n <= 5; n++) catalog = addRole(catalog, id(n), hero(`角色${n}`), n);
    const rev = await c.saveRoles(catalog, null);const loaded = await c.roles();assert.equal(loaded.revision, rev);assert.deepEqual(loaded.catalog, validateRoles(catalog, content, dataset));
    assert.equal([...m.remote.keys()].filter(k => k.includes('/history/')).length, 1);
    assert.equal([...m.remote.values()].some(v => v.includes('private')), false);
    await c.disconnect();assert.equal(c.owner, null);await assert.rejects(c.roles(), /连接/);
});
test('network failure is not an empty cloud account; failed sync cannot claim success', async () => {
    const m = cloudMock(), c = m.client();await c.connect();m.setReadFailure(true);await assert.rejects(c.roles());
    m.setReadFailure(false);m.setSyncFailure(true);await assert.rejects(c.saveRoles(emptyRoles(), null), /保存/);assert.equal(m.remote.size, 0);
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
test('stale device does not overwrite a newer role catalog', async () => {
    const m = cloudMock(), a = m.client(), b = m.client();await a.connect();await b.connect();
    const catalog = addRole(emptyRoles(), id(1), hero('云端'), 1);await a.saveRoles(catalog, null);
    await assert.rejects(b.saveRoles(addRole(emptyRoles(), id(2), hero('旧设备'), 2), null), /冲突/);
    assert.equal((await a.roles()).catalog.roles[0].save.name, '云端');
});
test('cloud account change during write never publishes catalog under another account', async () => {
    const m = cloudMock(), c = m.client();await c.connect();
    m.store.savePageData = async () => { m.sdk.username = 'bob'; };
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
test('immutable ancestry distinguishes later progress from a competing device branch', async () => {
    const m = cloudMock(), c = m.client();await c.connect();
    const first = await c.saveRoles(emptyRoles(), null), second = await c.saveRoles(addRole(emptyRoles(),id(1),hero('变化'),1), first);
    assert.equal(await c.roleAncestor(first, second), true);
    assert.equal(await c.roleAncestor(second, first), false);
    const other = id(999);
    m.remote.set(m.store.getRemotePagePath(`roles/history/${other}.json`), JSON.stringify({ owner: 'alice', revision: other, parentRevision: first, catalog: emptyRoles() }));
    assert.equal(await c.roleAncestor(second, other), false);
});
test('a corrupt account cache cannot replace the current guest identity or catalog', () => {
    const l = local(), store = l.make();store.open();store.create(hero('访客'));
    l.data.set('haqi.roles.v1.account.bad', '{"catalog":{"roles":null}}');
    assert.throws(() => store.open('bad'));assert.equal(store.owner, null);assert.equal(store.catalog.roles[0].save.name, '访客');
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
    await assert.rejects(c.roles(),/读取失败/);
});

test('history files only change with records and are absent from the small index',async()=>{
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
    const original=m.store.savePageData;m.store.savePageData=(path,...args)=>{writes.push(path);return original(path,...args);};
    catalog.roles[0].save.position.x+=10;catalog.roles[0].save.revision++;catalog.roles[0].lastPlayedAt++;
    assert.equal(await c.saveRoles(catalog,revision),revision);assert.equal(writes.length,0);
    catalog.roles[0].save.deck=[...catalog.roles[0].save.deck].reverse();
    revision=await c.saveRoles(catalog,revision);
    const after=index();assert.notEqual(after.catalog.roles[0].files.battle,before.catalog.roles[0].files.battle);
    assert.equal(after.catalog.roles[0].files.items,before.catalog.roles[0].files.items);
    assert.equal(after.catalog.roles[0].files.records,before.catalog.roles[0].files.records);
    assert.equal(writes.length,3); // battle part + small history manifest + index
    assert.equal(writes.some(path=>path.includes('/items/')),false);
});

test('incomplete or cross-role cloud parts fail closed without replacing the manifest',async()=>{
    const m=cloudMock(),c=m.client();await c.connect();
    await c.saveRoles(addRole(emptyRoles(),id(1),hero('角色'),1),null);
    const path=m.store.getRemotePagePath('roles/index.json'),text=m.remote.get(path),manifest=JSON.parse(text);
    m.remote.delete(m.store.getRemotePagePath(manifest.catalog.roles[0].files.items));
    const reader=m.client();await reader.connect();await assert.rejects(reader.roles());assert.equal(m.remote.get(path),text);
    manifest.catalog.roles[0].files.items=`roles/${id(999)}/items/${id(3)}.json`;
    m.remote.set(path,JSON.stringify(manifest));await assert.rejects(reader.roles(),/路径/);
});

test('concurrent manifest update prevents publication of newly written parts',async()=>{
    const m=cloudMock(),c=m.client();await c.connect();
    const catalog=addRole(emptyRoles(),id(1),hero('角色'),1);
    const first=await c.saveRoles(catalog,null),path=m.store.getRemotePagePath('roles/index.json');
    const original=m.store.syncToGit;
    m.store.syncToGit=async(...args)=>{const result=await original(...args);if(args[0].includes('/battle/')){const remote=JSON.parse(m.remote.get(path));remote.revision=id(999);m.remote.set(path,JSON.stringify(remote));}return result;};
    catalog.roles[0].save.deck.reverse();
    await assert.rejects(c.saveRoles(catalog,first),/冲突/);
    assert.equal(JSON.parse(m.remote.get(path)).revision,id(999));
});
