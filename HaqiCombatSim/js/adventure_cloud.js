// Optional browser IO adapter. PersonalPageStore owns the workspace and writes;
// uncached SDK file reads verify the remote server, avoiding the store's local fallback.
import { makeCloudSnapshot, parseCloudSnapshot, snapshotPath, checkpointPaths } from './adventure_cloud_core.js';

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
export function createCloudClient({ content, dataset, loadSDK = loadKeepwork, now = () => new Date().toISOString(), uuid = () => crypto.randomUUID(), onAccountChange = () => {} }) {
    let sdk, store, owner = null, authVersion = 0, unsubscribe;
    const check = session => {
        if (!sdk?.token || !owner || authVersion !== session.version || store?.getUsername() !== session.owner || store.isUseLocal()) throw new CloudError('登录状态已变化，请重新连接 Keepwork。');
    };
    async function guarded(fn) {
        try { return await fn(); } catch (error) { throw error instanceof CloudError ? error : new CloudError('云端操作未完成。请检查网络或重新登录；本地进度仍然保留。'); }
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
    return {
        get owner() { return owner; },
        connect: () => guarded(async () => {
            sdk = await loadSDK();
            if (!unsubscribe) unsubscribe = sdk.onAuthStateChange(() => { authVersion++;owner = null;store = null;onAccountChange(); });
            if (!sdk.token) {
                try { await sdk.showLoginWindow({ title: '登录 Keepwork，继续魔法旅程', lang: 'zhCN' }); }
                catch { throw new CloudError('已取消登录，你可以继续本地冒险。'); }
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
            const result = parseCloudSnapshot(await remoteText(path, current), content, dataset);
            if (snapshotPath(result.snapshot) !== path) throw new CloudError('云端记录与文件编号不一致');
            return { ...result, owner: current.owner, authVersion: current.version };
        }),
        assertPreview: preview => check({ owner: preview.owner, version: preview.authVersion }),
    };
}
