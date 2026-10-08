import {packPetFilesAsync,openPetFiles,hydratePetFile} from './adventure_pet_files.js';
import {saveWorkspaceFile} from './keepwork_file_io.js';
// Optional browser IO adapter. PersonalPageStore resolves workspace paths;
// whole-file PUT acknowledgements confirm writes without redundant readback.
import { makeCloudSnapshot, parseCloudSnapshot, snapshotPath, checkpointPaths } from './adventure_cloud_core.js';
import { tr } from './locale_runtime.js';
import { validateRoles, emptyRoles, roleIdValid } from './adventure_roles_core.js';
import { splitRoleSave, joinRoleSave, storageParts, stableJson, coreCatalogKey, durableSave, restoreRuntime } from './adventure_storage_core.js';

export const SDK_URL = typeof __HAQI_SDK_URL__ !== 'undefined'
    ? __HAQI_SDK_URL__
    : 'https://cdn.keepwork.com/sdk/keepworkSDK.core.iife.js?v=75e8ab429ea1';
let sdkLoading;
class CloudError extends Error {}
function timeout(promise, ms = 25000) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new CloudError('连接超时。当前本地进度仍然保留，请稍后刷新云端记录。')), ms); })]).finally(() => clearTimeout(timer));
}
export function loadKeepwork() {
    const configure=sdk=>{
        if(sdk?.personalPageStore)sdk.personalPageStore.disableLegacyFileFallback=true;
        return sdk;
    };
    if (globalThis.keepwork) return Promise.resolve(configure(globalThis.keepwork));
    if (!sdkLoading) sdkLoading = new Promise((resolve, reject) => {
        const script = document.createElement('script');script.src = SDK_URL;script.async = true;
        script.onload = () => globalThis.keepwork ? resolve(configure(globalThis.keepwork)) : reject(new CloudError('Keepwork 暂时不可用，请继续本地冒险。'));
        script.onerror = () => { script.remove();reject(new CloudError('无法连接 Keepwork，请检查网络后重试。')); };
        document.head.append(script);
    }).catch(error => { sdkLoading = null;throw error; });
    return timeout(sdkLoading);
}
export function createCloudClient({ content, dataset, loadSDK = loadKeepwork, now = () => new Date().toISOString(), uuid = () => crypto.randomUUID(), onAccountChange = () => {}, prepareSaves = async () => {}, petFileStore = () => null }) {
    let sdk, store, owner = null, authVersion = 0, authToken = null, unsubscribe;
    const partCache = new Map(), textCache = new Map();
    let envelopeValue=null,envelopeTask=null,saveQueue=Promise.resolve();
    function clearReads(){envelopeValue=null;envelopeTask=null;partCache.clear();textCache.clear();acknowledgedFiles.clear();}
    function queueSave(fn){const next=saveQueue.catch(()=>{}).then(fn);saveQueue=next;return next;}

    // Immutable files acknowledged by pageCache. A failed index write must not upload them again.
    const acknowledgedFiles = new Map();
    const check = session => {
        if (!sdk?.token || sdk.token!==authToken || !owner || authVersion !== session.version || store?.getUsername() !== session.owner || store.isUseLocal()) throw new CloudError('登录状态已变化，请重新连接 Keepwork。');
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
        return current;
    }
    async function remoteText(path, current) {
        check(current);
        const fullPath = store.getRemotePagePath(path);
        if (!fullPath.startsWith(`${current.owner}/`)) throw new CloudError('云端账号不一致，请重新连接。');
        const key=`${current.owner}:${path}`;
        if(!textCache.has(key)){
            const task=timeout(sdk.getFileByFullPath(fullPath, undefined, true)).then(value=>{
                check(current);if(typeof value!=='string'||!value)throw new CloudError('无法从云端读取记录，请检查网络后重试。');return value;
            }).catch(error=>{if(textCache.get(key)===task)textCache.delete(key);throw error;});
            textCache.set(key,task);
        }
        const text = await textCache.get(key);
        check(current);
        if (typeof text !== 'string' || !text) throw new CloudError('无法从云端读取记录，请检查网络后重试。');
        return text;
    }
    const petScope=(owner,id)=>`haqi.roles.v1.account.${encodeURIComponent(owner)}.${id}`;
    const petIO=(roleId,current,known=null)=>({
        async read(path){
            if(!/^(pets\/[0-9a-f-]+\/[a-zA-Z0-9_-]+|pet-pages\/[a-zA-Z0-9_-]+)\.json$/.test(path))throw new CloudError('宠物文件路径无效');
            const full=`roles/${roleId}/${path}`,key=`${current.owner}:${full}`;
            const stored=acknowledgedFiles.get(key);
            if(stored){const value=JSON.parse(stored);if(value.scope!==petScope(current.owner,roleId))throw new CloudError('宠物文件账号不一致');known?.add(path);return value;}
            // Pet paths are immutable. A local copy is the same bytes as pageCache, so a dungeon
            // save must not re-download every body that is already on this device.
            const local=petFileStore(roleId);
            if(local){
                let value;
                try{value=local.read(path);}catch{/* Only a missing local copy falls back to reading the server. */}
                if(value){
                    if(value?.scope!==petScope(current.owner,roleId))throw new CloudError('宠物文件账号不一致');
                    if(known&&!known.has(path)){await writeAcknowledged(full,JSON.stringify(value),current);known.add(path);}
                    else acknowledgedFiles.set(key,JSON.stringify(value));
                    return value;
                }
            }
            const value=JSON.parse(await remoteText(full,current));
            if(value.scope!==petScope(current.owner,roleId))throw new CloudError('宠物文件账号不一致');
            acknowledgedFiles.set(key,JSON.stringify(value));
            petFileStore(roleId)?.write(path,value);return value;
        },
        async write(path,value){await writeAcknowledged(`roles/${roleId}/${path}`,JSON.stringify(value),current);petFileStore(roleId)?.write(path,value);known?.add(path);}
    });
    async function publishPetFiles(roleId,current,known,refs,onProgress){
        const pending=[];const seen=new Set();
        for(const ref of Object.values(refs||{})){if(!ref?.path||known.has(ref.path)||seen.has(ref.path))continue;seen.add(ref.path);pending.push(ref.path);}
        if(!pending.length)return;
        let cursor=0,done=0;
        const io=petIO(roleId,current,known);
        async function run(){while(cursor<pending.length){const path=pending[cursor++];await io.read(path);onProgress?.({done:++done,total:pending.length});}}
        await Promise.all(Array.from({length:Math.min(4,pending.length)},run));
    }
    const rolesPath = 'roles/index.json';
    async function readEnvelope(current) {
        check(current);
        if(!envelopeValue){
            if(!envelopeTask){
                const task=fetchEnvelope(current).then(value=>{check(current);envelopeValue=value;return value;}).finally(()=>{if(envelopeTask===task)envelopeTask=null;});
                envelopeTask=task;
            }
            await envelopeTask;
        }
        check(current);return structuredClone(envelopeValue);
    }
    async function fetchEnvelope(current) {
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
                const parts=Object.fromEntries(await Promise.all(storageParts.map(async part=>{
                    if(part!=='towers')return [part,await readPart(row.files?.[part],row.id,part,current)];
                    const refs=row.files?.towers;
                    if(!refs)return [part,{}]; // Legacy roles have no tower files.
                    if(typeof refs!=='object'||Array.isArray(refs))throw new CloudError('试炼塔文件索引无效');
                    const records=await Promise.all(Object.entries(refs).map(async([id,path])=>{
                        if(!/^journey:tower-(camp|town|fire|ice|desert|dark)$/.test(id))throw new CloudError('试炼塔编号无效');
                        return [id,await readPart(path,row.id,`towers/${id.slice(8)}`,current)];
                    }));
                    return [part,{towerRecords:Object.fromEntries(records)}];
                })));
                await prepareSaves([row.state]);check(current);
                if(parts.items.petPages){const opened=await openPetFiles({...row.state,...parts.items,...parts.battle},petScope(current.owner,row.id),content,petIO(row.id,current));Object.assign(parts.items,{pets:opened.pets,petWorld:opened.petWorld,petFileRefs:opened.petFileRefs});}
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
    async function writeAcknowledged(path, text, current) {
        check(current);
        const key=`${current.owner}:${path}`;
        // Mutable index writes publish the latest local state; only immutable paths
        // can skip an already acknowledged identical write.
        const immutable=path!==rolesPath;
        if(immutable&&acknowledgedFiles.get(key)===text)return;
        await timeout(saveWorkspaceFile({store,owner:current.owner,path,text,check:()=>check(current)}));
        textCache.set(key,Promise.resolve(text));
        if(immutable)acknowledgedFiles.set(key,text);
    }
    return {
        get owner() { return owner; },
        petFile:(roleId,path)=>guarded(async()=>petIO(roleId,await session()).read(path)),
        roles: ({refresh=false}={}) => guarded(async () => {const current=await session();return queueSave(async()=>{check(current);if(refresh)clearReads();return readRoles(current);});}),
        saveRoles: (catalog, expectedRevision, options) => guarded(async () => {
            const clean = validateRoles(catalog, content, dataset), current = await session();
            return queueSave(async()=>{check(current);
            const previous = await readRoles(current,{quiet:true});
            if(clean.roles.some(row=>row.save.pendingEncounter))throw new CloudError('战斗尚未结束，进度先保存在本机，结算后再同步。');
            // Drifted part files are rewritten in the current format even when durable content is unchanged,
            // otherwise old witnesses would trip the strict join on every later load.
            const staleParts=new Set(previous.partsStale||[]);
            if(previous.manifest?.schemaVersion===2&&staleParts.size===0&&coreCatalogKey(clean)===coreCatalogKey(previous.catalog))return previous.revision;
            if (previous.revision !== expectedRevision) throw new CloudError('角色版本已更新，请重试保存或刷新角色列表处理冲突。');
            const revision=uuid(),rows=[];
            for(const row of clean.roles){
                let split=splitRoleSave(row.save);const files={};
                const old=previous.catalog.roles.find(other=>other.id===row.id);
                const known=new Set([...(old?.save?.petPages||[]),...Object.values(old?.save?.petFileRefs||{}).map(r=>r.path)]);
                if(row.save.petInstanceVersion===1){await publishPetFiles(row.id,current,known,row.save.petFileRefs,options?.onProgress);const packed=await packPetFilesAsync(row.save,petScope(current.owner,row.id),content,uuid,petIO(row.id,current,known));const active=split.battle.activePets;split=splitRoleSave(packed);split.battle.activePets=active;}
                const oldParts=old&&splitRoleSave(old.save);
                if(oldParts?.items.petPages){oldParts.items.pets={};oldParts.items.petWorld={};delete oldParts.items.petFileRefs;}
                const oldFiles=previous.manifest?.schemaVersion===2?previous.manifest.catalog.roles.find(other=>other.id===row.id)?.files:null;
                const drifted=staleParts.has(row.id);
                for(const part of storageParts){
                    if(part==='towers'){
                        const refs={};
                        for(const [id,data] of Object.entries(split.towers.towerRecords||{})){
                            const previousPath=oldFiles?.towers?.[id];
                            if(previousPath&&stableJson(oldParts?.towers?.towerRecords?.[id])===stableJson(data)){refs[id]=previousPath;continue;}
                            const section=`towers/${id.slice(8)}`,path=`roles/${row.id}/${section}/${revision}.json`;
                            await writeAcknowledged(path,JSON.stringify({schemaVersion:2,owner:current.owner,roleId:row.id,part:section,data}),current);
                            partCache.set(`${current.owner}:${path}`,Promise.resolve(structuredClone(data)));refs[id]=path;
                        }
                        if(Object.keys(refs).length)files.towers=refs;
                        continue;
                    }
                    if(!drifted&&oldFiles?.[part]&&stableJson(oldParts[part])===stableJson(split[part]))files[part]=oldFiles[part];
                    else{
                        const path=`roles/${row.id}/${part}/${revision}.json`;
                        await writeAcknowledged(path,JSON.stringify({schemaVersion:2,owner:current.owner,roleId:row.id,part,data:split[part]}),current);
                        partCache.set(`${current.owner}:${path}`,Promise.resolve(structuredClone(split[part])));
                        files[part]=path;
                    }
                }
                rows.push({id:row.id,lastPlayedAt:row.lastPlayedAt,state:split.state,files});
            }
            const manifestCatalog={...clean,roles:rows};
            const text=JSON.stringify({schemaVersion:2,owner:current.owner,revision,catalog:manifestCatalog});
            // Acknowledge immutable parts before publishing the current index.
            // Failed part writes leave the previous index intact; no history copy is needed.
            await writeAcknowledged(rolesPath,text,current);
            envelopeValue=JSON.parse(text);
            return revision;
            });
        }),
        disconnect: () => guarded(async () => {
            sdk ||= await loadSDK();
            try { await sdk.logout(); }
            catch (error) { if (sdk.token) throw error; }
            authVersion++;owner = null;store = null;clearReads();
        }),
        connect: ({ interactive = true } = {}) => guarded(async () => {
            sdk = await loadSDK();authVersion++;clearReads();
            if (!unsubscribe) unsubscribe = sdk.onAuthStateChange(() => { authVersion++;owner = null;store = null;clearReads();onAccountChange(); });
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
            store = sdk.personalPageStore.withWorkspace('HaqiAdventure');owner = profile.username;authToken=sdk.token;
            // Raw JSON must not probe the legacy file.json.md alias; that 404s once per new pet file.
            store.disableLegacyFileFallback = true;
            check({ owner, version });
            if (typeof sdk.getFileByFullPath !== 'function' || typeof store.savePageData !== 'function') throw new CloudError('Keepwork 存储接口暂时不可用，请稍后重试。');
            return owner;
        }),
        list: () => guarded(async () => {
            const current = await session();
            const listing = await timeout(store.listDir('checkpoints', false, { remoteOnly: true }));check(current);
            // SDK listing may return empty on failure: UI deliberately offers refresh, not a claim that no saves exist.
            return checkpointPaths(listing);
        }),
        upload: (save,{roleId}={}) => guarded(async () => {
            // Capture the complete checkpoint before asynchronous work; gameplay RNG is untouched.
            if(save.pendingEncounter)throw new CloudError('战斗尚未结束，请结算后再保存云端快照。');
            const snapshot = makeCloudSnapshot(restoreRuntime(durableSave(save),content), content, dataset, now(), uuid());
            snapshot.save=durableSave(snapshot.save);snapshot.storageVersion=2;
            if(save.petInstanceVersion===1){if(!roleIdValid(roleId))throw new CloudError('请选择角色后保存宠物快照');const current=await session(),known=new Set(),io=petIO(roleId,current,known);await publishPetFiles(roleId,current,known,save.petFileRefs);snapshot.save=await packPetFilesAsync(snapshot.save,petScope(current.owner,roleId),content,uuid,io);snapshot.storageVersion=3;snapshot.petRoleId=roleId;}
            const text = JSON.stringify(snapshot), path = snapshotPath(snapshot), current = await session();
            await timeout(saveWorkspaceFile({store,owner:current.owner,path,text,check:()=>check(current)}));
            return { path, snapshot };
        }),
        read: path => guarded(async () => {
            if (!checkpointPaths(path.replace(/^checkpoints\//, '')).includes(path)) throw new CloudError('云端记录路径无效');
            const current = await session();
            const raw=await remoteText(path,current);
            if(raw.length>1024*1024)throw new CloudError('存档文件过大');
            await prepareSaves([JSON.parse(raw).save]);check(current);
            const envelope=JSON.parse(raw),splitPetSnapshot=JSON.parse(raw).storageVersion===3;
            if(envelope.storageVersion!==undefined&&![2,3].includes(envelope.storageVersion))throw new CloudError('云端记录存储版本不兼容');
            if(envelope.storageVersion===3){if(!roleIdValid(envelope.petRoleId))throw new CloudError('宠物快照角色无效');const io=petIO(envelope.petRoleId,current),scope=petScope(current.owner,envelope.petRoleId);envelope.save=await openPetFiles(envelope.save,scope,content,io);for(const [id,ref]of Object.entries(envelope.save.petFileRefs||{})){if(!envelope.save[ref.group][id]){const file=await io.read(ref.path);hydratePetFile(envelope.save,id,scope,()=>file,content);}}delete envelope.save.petFileRefs;delete envelope.save.petPages;envelope.storageVersion=2;}
            const normalized=envelope.storageVersion===2?JSON.stringify({...envelope,save:restoreRuntime(envelope.save,content)}):raw;
            const result = parseCloudSnapshot(splitPetSnapshot?{...envelope,save:restoreRuntime(envelope.save,content)}:normalized, content, dataset);
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
            await timeout(saveWorkspaceFile({store,owner:current.owner,path:'memory.md',text:body,check:()=>check(current)}));
            textCache.set(`${current.owner}:memory.md`,Promise.resolve(body));
            return true;
        }),
    };
}
