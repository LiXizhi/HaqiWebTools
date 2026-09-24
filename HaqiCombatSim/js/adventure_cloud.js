// Optional browser IO adapter. PersonalPageStore owns the workspace and writes;
// uncached SDK file reads verify the remote server, avoiding the store's local fallback.
import { makeCloudSnapshot, parseCloudSnapshot, snapshotPath, checkpointPaths } from './adventure_cloud_core.js';
import { validateRoles, emptyRoles, roleIdValid } from './adventure_roles_core.js';

export const SDK_URL = 'https://cdn.keepwork.com/sdk/keepworkSDK.core.iife.js';
let sdkLoading;
class CloudError extends Error {}
function timeout(promise, ms = 25000) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new CloudError('连接超时。当前本地进度仍然保留，请稍后刷新云端记录。')), ms); })]).finally(() => clearTimeout(timer));
}
export function loadKeepwork() {
    if (globalThis.keepwork) return Promise.resolve(globalThis.keepwork);
    if (!sdkLoading) sdkLoading = new Promise((resolve, reject) => {
        const script = document.createElement('script');script.src = SDK_URL;script.async = true;
        script.onload = () => globalThis.keepwork ? resolve(globalThis.keepwork) : reject(new CloudError('Keepwork 暂时不可用，请继续本地冒险。'));
        script.onerror = () => { script.remove();reject(new CloudError('无法连接 Keepwork，请检查网络后重试。')); };
        document.head.append(script);
    }).catch(error => { sdkLoading = null;throw error; });
    return timeout(sdkLoading);
}
export function createCloudClient({ content, dataset, loadSDK = loadKeepwork, now = () => new Date().toISOString(), uuid = () => crypto.randomUUID(), onAccountChange = () => {}, prepareSaves = async () => {} }) {
    let sdk, store, owner = null, authVersion = 0, unsubscribe;
    const check = session => {
        if (!sdk?.token || !owner || authVersion !== session.version || store?.getUsername() !== session.owner || store.isUseLocal()) throw new CloudError('登录状态已变化，请重新连接 Keepwork。');
    };
    async function guarded(fn) {
        try { return await fn(); } catch (error) {
            if (error?.status === 401) throw new CloudError('登录已过期，请点击“切换账号”重新登录；本地进度仍然保留。');
            throw error instanceof CloudError ? error : new CloudError('云端操作未完成。请检查网络或重新登录；本地进度仍然保留。');
        }
    }
    async function session() {
        if (!owner) throw new CloudError('请先连接 Keepwork。');
        const current = { owner, version: authVersion };check(current);
        const profile = await timeout(sdk.getUserProfile({ forceRefresh: true, useCache: false }));
        if (profile?.username !== current.owner) throw new CloudError('登录账号已变化，请重新连接 Keepwork。');
        check(current);return current;
    }
    async function remoteText(path, current) {
        check(current);
        const fullPath = store.getRemotePagePath(path);
        if (!fullPath.startsWith(`${current.owner}/`)) throw new CloudError('云端账号不一致，请重新连接。');
        const text = await timeout(sdk.getFileByFullPath(fullPath, undefined, false));
        check(current);
        if (typeof text !== 'string' || !text) throw new CloudError('无法从云端读取记录，请检查网络后重试。');
        return text;
    }
    const rolesPath = 'roles/index.json';
    async function readRoles(current) {
        // getFileByFullPath conflates 404 and network errors. loadPage preserves
        // the SDK's explicit "Page not found" error; only that means a new account.
        check(current);
        const full = store.getRemotePagePath(rolesPath);
        if (!full.startsWith(`${current.owner}/`)) throw new CloudError('云端账号不一致');
        const parts = full.split('/');
        let result;
        try { result = await timeout(sdk.loadPage({ sitePath: parts.slice(0, 2).join('/'), pagePath: parts.slice(2).join('/'), useCache: false, useServerCache: false })); }
        catch (error) {
            check(current);
            if (error.message === `Page not found: ${full}`) return { owner: current.owner, revision: null, catalog: emptyRoles() };
            throw error;
        }
        check(current);
        if (result?.success !== true || typeof result.content !== 'string' || result.content.length > 6 * 1024 * 1024) throw new CloudError('角色列表读取失败，请重试。');
        const value = JSON.parse(result.content);
        if (value.owner !== current.owner || !roleIdValid(value.revision)) throw new CloudError('角色列表身份或版本无效');
        await prepareSaves((value.catalog?.roles||[]).map(row=>row.save));check(current);
        let catalog;
        try { catalog = validateRoles(value.catalog, content, dataset); }
        catch (error) { throw new CloudError(`已登录，但云端角色校验失败：${error.message}。云端记录未修改，本地进度仍保留。`); }
        return { owner: current.owner, revision: value.revision, catalog };
    }
    async function writeVerified(path, text, current) {
        const target = store;
        await timeout(target.savePageData(path, 'content', text, false, false));check(current);
        if (!await timeout(target.syncToGit(path, false))) throw new CloudError('角色云端保存未完成，本地进度已保留。');
        check(current);
        if (JSON.stringify(JSON.parse(await remoteText(path, current))) !== text) throw new CloudError('角色云端保存未通过远端核验。');
    }
    return {
        get owner() { return owner; },
        roles: () => guarded(async () => readRoles(await session())),
        roleAncestor: (base, head) => guarded(async () => {
            const current = await session();let revision = head;
            // A clean cache can still belong to a concurrently overwritten branch.
            // Require ancestry before replacing it; large gaps fail closed to UI backup.
            for (let i = 0; i < 64; i++) {
                if (revision === base) return true;
                if (!roleIdValid(revision)) return false;
                const row = JSON.parse(await remoteText(`roles/history/${revision}.json`, current));
                if (row.owner !== current.owner || row.revision !== revision) throw new CloudError('角色历史记录无效');
                revision = row.parentRevision;
            }
            return false;
        }),
        saveRoles: (catalog, expectedRevision) => guarded(async () => {
            const clean = validateRoles(catalog, content, dataset), current = await session();
            const previous = await readRoles(current);
            if (previous.revision !== expectedRevision) throw new CloudError('其他设备已更新角色列表，请先处理云端冲突。');
            const revision = uuid();
            const text = JSON.stringify({ owner: current.owner, revision, parentRevision: expectedRevision, catalog: clean });
            // Immutable full-catalog history preserves both sides of a write race.
            await writeVerified(`roles/history/${revision}.json`, text, current);
            if ((await readRoles(current)).revision !== expectedRevision) throw new CloudError('其他设备已更新角色列表，本次进度已保留，请刷新处理冲突。');
            await writeVerified(rolesPath, text, current);
            return revision;
        }),
        disconnect: () => guarded(async () => {
            sdk ||= await loadSDK();
            try { await sdk.logout(); }
            catch (error) { if (sdk.token) throw error; }
            authVersion++;owner = null;store = null;
        }),
        connect: ({ interactive = true } = {}) => guarded(async () => {
            sdk = await loadSDK();
            if (!unsubscribe) unsubscribe = sdk.onAuthStateChange(() => { authVersion++;owner = null;store = null;onAccountChange(); });
            if (!sdk.token) {
                if (!interactive) throw new CloudError('请登录 Keepwork 后继续账号角色。');
                try { await sdk.showLoginWindow({ title: '登录 Keepwork，继续魔法旅程', lang: 'zhCN' }); }
                catch (error) {
                    if (/cancel|取消/i.test(error?.message || '')) throw new CloudError('已取消登录，你可以继续本地冒险。');
                    throw new CloudError('登录窗口暂时不可用，请刷新后重试；本地进度仍然保留。');
                }
            }
            if (!sdk.token) throw new CloudError('已取消登录，你可以继续本地冒险。');
            const version = authVersion;
            const profile = await timeout(sdk.getUserProfile({ forceRefresh: true, useCache: false }));
            if (version !== authVersion || !sdk.token || !profile?.username) throw new CloudError('登录未完成，请重新连接 Keepwork。');
            store = sdk.personalPageStore.withWorkspace('HaqiAdventure');owner = profile.username;
            check({ owner, version });
            if (typeof sdk.getFileByFullPath !== 'function' || typeof store.syncToGit !== 'function' || typeof store.savePageData !== 'function') throw new CloudError('Keepwork 存储接口暂时不可用，请稍后重试。');
            return owner;
        }),
        list: () => guarded(async () => {
            const current = await session();
            const listing = await timeout(store.listDir('checkpoints', false, { remoteOnly: true }));check(current);
            // SDK listing may return empty on failure: UI deliberately offers refresh, not a claim that no saves exist.
            return checkpointPaths(listing);
        }),
        upload: save => guarded(async () => {
            // Capture the complete checkpoint before asynchronous work; gameplay RNG is untouched.
            const snapshot = makeCloudSnapshot(save, content, dataset, now(), uuid());
            const text = JSON.stringify(snapshot), path = snapshotPath(snapshot), current = await session();
            const targetStore = store;
            // createFile hardcodes bFlush=true,bUseCache=true: its background pageCache
            // write can clear pending changes before a durable sync. Stage without either.
            await timeout(targetStore.savePageData(path, 'content', text, false, false));check(current);
            const synced = await timeout(targetStore.syncToGit(path, false));check(current);
            if (!synced) throw new CloudError('云端尚未确认写入，请稍后刷新检查。本地存档已保留。');
            if (JSON.stringify(JSON.parse(await remoteText(path, current))) !== text) throw new CloudError('云端内容未通过核验，请稍后刷新检查。本地存档已保留。');
            return { path, snapshot };
        }),
        read: path => guarded(async () => {
            if (!checkpointPaths(path.replace(/^checkpoints\//, '')).includes(path)) throw new CloudError('云端记录路径无效');
            const current = await session();
            const raw=await remoteText(path,current);
            if(raw.length>1024*1024)throw new CloudError('存档文件过大');
            await prepareSaves([JSON.parse(raw).save]);check(current);
            const result = parseCloudSnapshot(raw, content, dataset);
            if (snapshotPath(result.snapshot) !== path) throw new CloudError('云端记录与文件编号不一致');
            return { ...result, owner: current.owner, authVersion: current.version };
        }),
        assertPreview: preview => check({ owner: preview.owner, version: preview.authVersion }),
        readMemory: () => guarded(async () => {
            const current = await session();
            try { return await remoteText('memory.md', current); }
            catch { return ''; }
        }),
        writeMemory: text => guarded(async () => {
            const body = String(text ?? '');
            const current = await session();
            await timeout(store.savePageData('memory.md', 'content', body, false, false));check(current);
            if (!await timeout(store.syncToGit('memory.md', false))) throw new CloudError('学习档案尚未写入云端，本地进度已保留。');
            if (await remoteText('memory.md', current) !== body) throw new CloudError('学习档案未通过远端核验。本地进度已保留。');
            return true;
        }),
    };
}
