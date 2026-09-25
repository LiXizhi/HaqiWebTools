// Local account cache is one atomic JSON write. Legacy storage calls receive a
// role-scoped facade so cloud/debug backups never leak between roles/accounts.
import { durableSave, runtimeValues, restoreRuntime, coreCatalogKey } from './adventure_storage_core.js';
import { createRuntimeStore } from './adventure_runtime_store.js';
import { SAVE_KEY } from './adventure_assets.js';
import { emptyRoles, validateRoles, addRole, selectRole, grantMagicBeans } from './adventure_roles_core.js';

export function createRoleStore({ content, dataset, storage = localStorage, uuid = () => crypto.randomUUID(), now = () => Date.now(), prepareSaves = async () => {}, runtimeStore = createRuntimeStore() }) {
    let owner = null, state, raw, lastCoreKey;
    const key = () => `haqi.roles.v1.${owner === null ? 'guest' : 'account.' + encodeURIComponent(owner)}`;
    const runtimeKey = (accountKey,id) => `${accountKey}.${id}`;
    function hydrate(catalog,accountKey,localFormat) {
        return {...catalog,roles:catalog.roles.map(row=>({...row,save:localFormat===2
            ? restoreRuntime(row.save,content,runtimeStore.get(runtimeKey(accountKey,row.id))) : row.save}))};
    }
    function changed(catalog) {return state.dirty || coreCatalogKey(catalog)!==lastCoreKey;}
    function write(next) {
        if (storage.getItem(key()) !== raw) throw Error('角色进度已在其他页面变化，请刷新后继续。');
        const persisted={...next,localFormat:2,catalog:{...next.catalog,roles:next.catalog.roles.map(row=>({...row,save:durableSave(row.save)}))}};
        const text=JSON.stringify(persisted);
        if(text!==raw)storage.setItem(key(),text);
        for(const row of next.catalog.roles)runtimeStore.set(runtimeKey(key(),row.id),runtimeValues(row.save));
        state=next;raw=text;lastCoreKey=coreCatalogKey(next.catalog);
    }
    return {
        flushRuntime: () => runtimeStore.flush(),
        get owner() { return owner; },
        get catalog() { return state.catalog; },
        get base() { return state.base; },
        get dirty() { return state.dirty; },
        async prepareOpen(account = null) {
            const accountKey=`haqi.roles.v1.${account===null?'guest':'account.'+encodeURIComponent(account)}`;
            const captured=storage.getItem(accountKey),legacy=!captured&&account===null?storage.getItem(SAVE_KEY):null;
            if(captured)await runtimeStore.prepare((JSON.parse(captured).catalog?.roles||[]).map(row=>runtimeKey(accountKey,row.id)));
            const saves=captured?(JSON.parse(captured).catalog?.roles||[]).map(row=>row.save):legacy?[JSON.parse(legacy)]:[];
            await prepareSaves(saves);
            if(storage.getItem(accountKey)!==captured||legacy!==null&&storage.getItem(SAVE_KEY)!==legacy)throw Error('角色进度已变化，请重新读取。');
        },
        open(account = null) {
            const nextKey = `haqi.roles.v1.${account === null ? 'guest' : 'account.' + encodeURIComponent(account)}`;
            const nextRaw = storage.getItem(nextKey);
            const next = nextRaw ? JSON.parse(nextRaw) : { catalog: emptyRoles(), base: null, dirty: false };
            next.catalog = validateRoles(hydrate(next.catalog,nextKey,next.localFormat), content, dataset);
            owner = account;raw = nextRaw;state = next;lastCoreKey=coreCatalogKey(next.catalog);
            if (!raw && account === null) {
                const legacy = storage.getItem(SAVE_KEY);
                if (legacy) {
                    const catalog = addRole(emptyRoles(), uuid(), JSON.parse(legacy), now());
                    write({ ...state, catalog: validateRoles(catalog, content, dataset), dirty: true });
                }
            }
            return state.catalog;
        },
        replace(catalog, base, dirty = false) {
            // Preserve this device's runtime only for the same durable role version.
            const hydrated={...catalog,roles:catalog.roles.map(row=>{
                const previous=state.catalog.roles.find(old=>old.id===row.id);
                const same=previous&&coreCatalogKey({...catalog,roles:[previous]})===coreCatalogKey({...catalog,roles:[row]});
                const durable=durableSave(row.save);
                if(same)durable.revision=previous.save.revision;
                return {...row,save:restoreRuntime(durable,content,same?(runtimeStore.get(runtimeKey(key(),row.id))||runtimeValues(previous.save)):row.save.pendingEncounter?runtimeValues(row.save):null)};
            })};
            write({catalog:validateRoles(hydrated,content,dataset),base,dirty});
        },
        create(save) { const next = addRole(state.catalog, uuid(), save, now());write({ ...state, catalog: next, dirty: true });return next.activeId; },
        select(id) { const catalog=selectRole(state.catalog,id,now());write({...state,catalog,dirty:changed(catalog)}); },
        commitMagicBeanExchange(nextSave, exchangedUntil) {
            const id = state.catalog.activeId;
            const catalog = validateRoles(grantMagicBeans(state.catalog, id, nextSave, exchangedUntil), content, dataset);
            write({ ...state, catalog, dirty: true });
            return catalog.roles.find(row => row.id === id).save;
        },
        checkpoint() { return JSON.stringify(state.catalog); },
        markSynced(base, captured) { write({ ...state, base, dirty: coreCatalogKey(state.catalog) !== coreCatalogKey(JSON.parse(captured)) }); },
        scoped() {
            const capturedOwner = owner, id = state.catalog.activeId, accountKey = key();
            if (!id) throw Error('请先选择角色');
            const assertCurrent = () => { if (capturedOwner !== owner || id !== state.catalog.activeId) throw Error('角色已切换，请重新操作。'); };
            return {
                getItem(k) { assertCurrent();return k === SAVE_KEY ? JSON.stringify(state.catalog.roles.find(row => row.id === id).save) : storage.getItem(`${accountKey}.${id}.${k}`); },
                setItem(k, text) {
                    assertCurrent();
                    if (k !== SAVE_KEY) { storage.setItem(`${accountKey}.${id}.${k}`, text);return; }
                    const catalog = { ...state.catalog, roles: state.catalog.roles.map(row => row.id === id ? { ...row, save: JSON.parse(text) } : row) };
                    write({ ...state, catalog, dirty: changed(catalog) });
                },
            };
        },
    };
}
