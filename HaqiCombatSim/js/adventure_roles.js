// Local account cache is one atomic JSON write. Legacy storage calls receive a
// role-scoped facade so cloud/debug backups never leak between roles/accounts.
import { SAVE_KEY } from './adventure_assets.js';
import { emptyRoles, validateRoles, addRole, selectRole } from './adventure_roles_core.js';

export function createRoleStore({ content, dataset, storage = localStorage, uuid = () => crypto.randomUUID(), now = () => Date.now(), prepareSaves = async () => {} }) {
    let owner = null, state, raw;
    const key = () => `haqi.roles.v1.${owner === null ? 'guest' : 'account.' + encodeURIComponent(owner)}`;
    function write(next) {
        if (storage.getItem(key()) !== raw) throw Error('角色进度已在其他页面变化，请刷新后继续。');
        const text = JSON.stringify(next);storage.setItem(key(), text);state = next;raw = text;
    }
    return {
        get owner() { return owner; },
        get catalog() { return state.catalog; },
        get base() { return state.base; },
        get dirty() { return state.dirty; },
        async prepareOpen(account = null) {
            const accountKey=`haqi.roles.v1.${account===null?'guest':'account.'+encodeURIComponent(account)}`;
            const captured=storage.getItem(accountKey),legacy=!captured&&account===null?storage.getItem(SAVE_KEY):null;
            const saves=captured?(JSON.parse(captured).catalog?.roles||[]).map(row=>row.save):legacy?[JSON.parse(legacy)]:[];
            await prepareSaves(saves);
            if(storage.getItem(accountKey)!==captured||legacy!==null&&storage.getItem(SAVE_KEY)!==legacy)throw Error('角色进度已变化，请重新读取。');
        },
        open(account = null) {
            const nextKey = `haqi.roles.v1.${account === null ? 'guest' : 'account.' + encodeURIComponent(account)}`;
            const nextRaw = storage.getItem(nextKey);
            const next = nextRaw ? JSON.parse(nextRaw) : { catalog: emptyRoles(), base: null, dirty: false };
            next.catalog = validateRoles(next.catalog, content, dataset);
            owner = account;raw = nextRaw;state = next;
            if (!raw && account === null) {
                const legacy = storage.getItem(SAVE_KEY);
                if (legacy) {
                    const catalog = addRole(emptyRoles(), uuid(), JSON.parse(legacy), now());
                    write({ ...state, catalog: validateRoles(catalog, content, dataset), dirty: true });
                }
            }
            return state.catalog;
        },
        replace(catalog, base, dirty = false) { write({ catalog: validateRoles(catalog, content, dataset), base, dirty }); },
        create(save) { const next = addRole(state.catalog, uuid(), save, now());write({ ...state, catalog: next, dirty: true });return next.activeId; },
        select(id) { write({ ...state, catalog: selectRole(state.catalog, id, now()), dirty: true }); },
        checkpoint() { return JSON.stringify(state.catalog); },
        markSynced(base, captured) { write({ ...state, base, dirty: JSON.stringify(state.catalog) !== captured }); },
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
                    write({ ...state, catalog, dirty: true });
                },
            };
        },
    };
}
