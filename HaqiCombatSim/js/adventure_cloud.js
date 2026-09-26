// Optional browser IO adapter. PersonalPageStore owns the workspace and writes;
// Server pageCache reads verify acknowledged writes without the store's local fallback.
import { makeCloudSnapshot, parseCloudSnapshot, snapshotPath, checkpointPaths } from './adventure_cloud_core.js';
import { tr } from './locale_runtime.js';
import { validateRoles, emptyRoles, roleIdValid } from './adventure_roles_core.js';
import { splitRoleSave, joinRoleSave, storageParts, stableJson, coreCatalogKey, durableSave, restoreRuntime } from './adventure_storage_core.js';

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
    const partCache = new Map();
    const check = session => {
        if (!sdk?.token || !owner || authVersion !== session.version || store?.getUsername() !== session.owner || store.isUseLocal()) throw new CloudError('登录状态已变化，请重新连接 Keepwork。');
    };
    async function guarded(fn) {
        try { return await fn(); } catch (error) {
            if (error?.status === 401) throw new CloudError('登录已过期，请点击“切换账号”重新登录；本地进度仍然保留。');
            // The generic banner hides SDK/format causes; keep the original for DevTools diagnosis.
            if (!(error instanceof CloudError)) console.warn('cloud operation failed, original error:', error);
            throw error instanceof CloudError ? error : new CloudError('云端操作未完成。请检查网络或重新登录；本地进度仍然保留。');
        }
    }
    async function session() {
        if (!owner) throw new CloudError('请先连接 Keepwork。');
        const current = { owner, version: authVersion };check(current);
        const profile = await timeout(sdk.getUserProfile({ useCache: true }));
        if (profile?.username !== current.owner) throw new CloudError('登录账号已变化，请重新连接 Keepwork。');
        check(current);return current;
    }
    async function remoteText(path, current) {
        check(current);
        const fullPath = store.getRemotePagePath(path);
        if (!fullPath.startsWith(`${current.owner}/`)) throw new CloudError('云端账号不一致，请重新连接。');
        const text = await timeout(sdk.getFileByFullPath(fullPath, undefined, true));
        check(current);
        if (typeof text !== 'string' || !text) throw new CloudError('无法从云端读取记录，请检查网络后重试。');
        return text;
    }
    const rolesPath = 'roles/index.json';
    async function readEnvelope(current) {
        // Only an explicit missing-page response means a new account.
        // Network failures must never be treated as an empty role catalog.
        check(current);
        const full = store.getRemotePagePath(rolesPath);
        if (!full.startsWith(`${current.owner}/`)) throw new CloudError('云端账号不一致');
        const parts = full.split('/');
        let result;
        try { result = await timeout(sdk.loadPage({ sitePath: parts.slice(0, 2).join('/'), pagePath: parts.slice(2).join('/'), useCache: true, useServerCache: true })); }
        catch (error) {
            check(current);
            if (error.message === `Page not found: ${full}`) return { owner: current.owner, revision: null, catalog: emptyRoles() };
            throw error;
        }
        check(current);
        if (result?.success === false && result.fromServerCache === true && result.content === '') return { owner: current.owner, revision: null, catalog: emptyRoles() };
        if (result?.success !== true || typeof result.content !== 'string' || result.content.length > 6 * 1024 * 1024) throw new CloudError('角色列表读取失败，请重试。');
        const value = JSON.parse(result.content);
        if (value.owner !== current.owner || !roleIdValid(value.revision)) throw new CloudError('角色列表身份或版本无效');
        return value;
    }
    async function readPart(path, roleId, part, current) {
        const prefix=`roles/${roleId}/${part}/`;
        if(typeof path!=='string'||!path.startsWith(prefix)||!roleIdValid(path.slice(prefix.length,-5))||!path.endsWith('.json'))throw new CloudError('角色分文件路径无效');
        const key=`${current.owner}:${path}`;check(current);
        if(!partCache.has(key))partCache.set(key,remoteText(path,current).then(text=>{
            if(text.length>6*1024*1024)throw new CloudError('角色分文件过大');
            const value=JSON.parse(text);
            if(value.schemaVersion!==2||value.owner!==current.owner||value.roleId!==roleId||value.part!==part||!value.data)throw new CloudError('角色分文件身份无效');
            return value.data;
        }).catch(error=>{partCache.delete(key);throw error;}));
        const result=await partCache.get(key);check(current);return structuredClone(result);
    }
    async function readRoles(current,{quiet=false}={}) {
        const value=await readEnvelope(current);
        if(value.revision===null)return value;
        let catalog=value.catalog,partsStale=[];
        if(value.schemaVersion===2){
            if(!Array.isArray(catalog?.roles)||catalog.roles.length>5)throw new CloudError('角色列表格式无效');
            // Storage-format changes make old cloud witnesses mismatch; primary fields still merge.
            // Drifted role IDs are reported so the next saveRoles rewrites their part files.
            const joinRemote=(row,parts)=>{
                try { return {save:joinRoleSave(row.state,parts,content),stale:false}; }
                catch(error) { if(!quiet)console.warn('cloud role parts failed consistency join, loading without witnesses:',error);return {save:joinRoleSave(row.state,parts,content,{strict:false}),stale:true}; }
            };
            const rows=await Promise.all(catalog.roles.map(async row=>{
                if(!roleIdValid(row.id))throw new CloudError('角色编号无效');
                const parts=Object.fromEntries(await Promise.all(storageParts.map(async part=>[part,await readPart(row.files?.[part],row.id,part,current)])));
                await prepareSaves([row.state]);check(current);
                const joined=joinRemote(row,parts);
                return {id:row.id,lastPlayedAt:row.lastPlayedAt,save:joined.save,stale:joined.stale};
            }));
            partsStale=rows.filter(row=>row.stale).map(row=>row.id);
            catalog={...catalog,roles:rows.map(({stale,...row})=>row)};
        }else if(value.schemaVersion!==undefined&&value.schemaVersion!==1)throw new CloudError('角色存储版本不兼容');
        await prepareSaves((catalog?.roles||[]).map(row=>row.save));check(current);
        try { catalog=validateRoles(catalog,content,dataset); }
        catch(error){throw new CloudError(`已登录，但云端角色校验失败：${error.message}。云端记录未修改，本地进度仍保留。`);}
        return {owner:current.owner,revision:value.revision,catalog,manifest:value,partsStale};
    }
    async function writeVerified(path, text, current) {
        const target = store;
        await timeout(target.savePageData(path, 'content', text, false, true));check(current);
        if (!await timeout(target.syncToGit(path, true))) throw new CloudError('角色云端保存未完成，本地进度已保留。');
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
            const previous = await readRoles(current,{quiet:true});
            if (previous.revision !== expectedRevision) throw new CloudError('其他设备已更新角色列表，请先处理云端冲突。');
            if(clean.roles.some(row=>row.save.pendingEncounter))throw new CloudError('战斗尚未结束，进度先保存在本机，结算后再同步。');
            // Drifted part files are rewritten in the current format even when durable content is unchanged,
            // otherwise old witnesses would trip the strict join on every later load.
            const staleParts=new Set(previous.partsStale||[]);
            if(previous.manifest?.schemaVersion===2&&staleParts.size===0&&coreCatalogKey(clean)===coreCatalogKey(previous.catalog))return previous.revision;
            const revision=uuid(),rows=[];
            for(const row of clean.roles){
                const split=splitRoleSave(row.save),files={};
                const old=previous.catalog.roles.find(other=>other.id===row.id);
                const oldParts=old&&splitRoleSave(old.save);
                const oldFiles=previous.manifest?.schemaVersion===2?previous.manifest.catalog.roles.find(other=>other.id===row.id)?.files:null;
                const drifted=staleParts.has(row.id);
                for(const part of storageParts){
                    if(!drifted&&oldFiles?.[part]&&stableJson(oldParts[part])===stableJson(split[part]))files[part]=oldFiles[part];
                    else{
                        const path=`roles/${row.id}/${part}/${revision}.json`;
                        await writeVerified(path,JSON.stringify({schemaVersion:2,owner:current.owner,roleId:row.id,part,data:split[part]}),current);
                        partCache.set(`${current.owner}:${path}`,Promise.resolve(structuredClone(split[part])));
                        files[part]=path;
                    }
                }
                rows.push({id:row.id,lastPlayedAt:row.lastPlayedAt,state:split.state,files});
            }
            const manifestCatalog={...clean,roles:rows};
            const text=JSON.stringify({schemaVersion:2,owner:current.owner,revision,parentRevision:expectedRevision,catalog:manifestCatalog});
            // Immutable parts are verified first. Index/history contain only small
            // state and references, so failed writes cannot publish a mixed version.
            await writeVerified(`roles/history/${revision}.json`,text,current);
            if((await readEnvelope(current)).revision!==expectedRevision)throw new CloudError('其他设备已更新角色列表，本次进度已保留，请刷新处理冲突。');
            await writeVerified(rolesPath,text,current);
            return revision;
        }),
        disconnect: () => guarded(async () => {
            sdk ||= await loadSDK();
            try { await sdk.logout(); }
            catch (error) { if (sdk.token) throw error; }
            authVersion++;owner = null;store = null;partCache.clear();
        }),
        connect: ({ interactive = true } = {}) => guarded(async () => {
            sdk = await loadSDK();
            if (!unsubscribe) unsubscribe = sdk.onAuthStateChange(() => { authVersion++;owner = null;store = null;partCache.clear();onAccountChange(); });
            if (!sdk.token) {
                if (!interactive) throw new CloudError('请登录 Keepwork 后继续账号角色。');
                try { await sdk.showLoginWindow({ title: tr('登录 Keepwork，继续魔法旅程'), lang: 'zhCN' }); }
                catch (error) {
                    if (/cancel|取消/i.test(error?.message || '')) throw new CloudError('已取消登录，你可以继续本地冒险。');
                    throw new CloudError('登录窗口暂时不可用，请刷新后重试；本地进度仍然保留。');
                }
            }
            if (!sdk.token) throw new CloudError('已取消登录，你可以继续本地冒险。');
            const version = authVersion;
            const profile = await timeout(sdk.getUserProfile({ useCache: true }));
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
            if(save.pendingEncounter)throw new CloudError('战斗尚未结束，请结算后再保存云端快照。');
            const snapshot = makeCloudSnapshot(restoreRuntime(durableSave(save),content), content, dataset, now(), uuid());
            snapshot.save=durableSave(snapshot.save);snapshot.storageVersion=2;
            const text = JSON.stringify(snapshot), path = snapshotPath(snapshot), current = await session();
            const targetStore = store;
            // Stage without background flush, then await the server cache write
            // and read it back before reporting success.
            await timeout(targetStore.savePageData(path, 'content', text, false, true));check(current);
            const synced = await timeout(targetStore.syncToGit(path, true));check(current);
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
            const envelope=JSON.parse(raw);
            if(envelope.storageVersion!==undefined&&envelope.storageVersion!==2)throw new CloudError('云端记录存储版本不兼容');
            const normalized=envelope.storageVersion===2?JSON.stringify({...envelope,save:restoreRuntime(envelope.save,content)}):raw;
            const result = parseCloudSnapshot(normalized, content, dataset);
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
            await timeout(store.savePageData('memory.md', 'content', body, false, true));check(current);
            if (!await timeout(store.syncToGit('memory.md', true))) throw new CloudError('学习档案尚未写入云端，本地进度已保留。');
            if (await remoteText('memory.md', current) !== body) throw new CloudError('学习档案未通过远端核验。本地进度已保留。');
            return true;
        }),
    };
}
