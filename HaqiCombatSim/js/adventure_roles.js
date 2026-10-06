import {packPetFilesSync,unpackPetPages,hydratePetFile} from './adventure_pet_files.js';
import {initialPetIds} from './adventure_pet_files_core.js';
// Local account cache is one atomic JSON write. Legacy storage calls receive a
// role-scoped facade so cloud/debug backups never leak between roles/accounts.
import { durableSave, runtimeValues, restoreRuntime, coreCatalogKey } from './adventure_storage_core.js';
import { createRuntimeStore } from './adventure_runtime_store.js';
import { SAVE_KEY } from './adventure_assets.js';
import { MAX_ROLES, emptyRoles, validateRoles, addRole, selectRole, grantMagicBeans } from './adventure_roles_core.js';

export function createRoleStore({ content, dataset, storage = localStorage, uuid = () => crypto.randomUUID(), now = () => Date.now(), prepareSaves = async () => {}, runtimeStore = createRuntimeStore() }) {
    let owner = null, state, raw, lastCoreKey;
    const preparationErrors = new Map();
    const scope=(accountKey,id)=>`${accountKey}.${id}`;
    const accountKey=account=>`haqi.roles.v1.${account===null?'guest':'account.'+encodeURIComponent(account)}`;
    const fileIO=scope=>({read:path=>{const text=storage.getItem(`${scope}.pet-file.${path}`);if(!text)throw Error('宠物文件尚未下载，请连接原账号后重试');return JSON.parse(text);},write:(path,value)=>{const text=JSON.stringify(value),key=`${scope}.pet-file.${path}`;if(storage.getItem(key)&&storage.getItem(key)!==text)throw Error('宠物文件版本冲突');storage.setItem(key,text);if(storage.getItem(key)!==text)throw Error('宠物文件保存失败');}});
    function unpack(save,accountKey,id){const io=fileIO(scope(accountKey,id)),next=unpackPetPages(save,scope(accountKey,id),io.read);for(const petId of initialPetIds(next))hydratePetFile(next,petId,scope(accountKey,id),io.read,content);return next;}
    const key = () => accountKey(owner);
    const runtimeKey = (accountKey,id) => `${accountKey}.${id}`;
    function hydrate(catalog,accountKey,localFormat) {
        return {...catalog,roles:catalog.roles.map(row=>({...row,save:localFormat===2
            ? restoreRuntime(unpack(row.save,accountKey,row.id),content,runtimeStore.get(runtimeKey(accountKey,row.id))) : row.save}))};
    }
    function changed(catalog) {return state.dirty || coreCatalogKey(catalog)!==lastCoreKey;}
    function write(next) {
        if (storage.getItem(key()) !== raw) throw Error('角色进度已在其他页面变化，请刷新后继续。');
        if(state?.recoveryBackup)next={...next,recoveryBackup:state.recoveryBackup};
        const packed=next.catalog.roles.map(row=>{const old=state?.catalog.roles.find(r=>r.id===row.id)?.save;const input={...row.save,...(row.save.petInstanceVersion===1?{petFileRefs:{...old?.petFileRefs,...row.save.petFileRefs},petPages:old?.petPages||row.save.petPages}:{})};if(input.petInstanceVersion===1)for(const id of [...Object.keys(input.pets||{}),...Object.keys(input.petWorld||{})])if(old?.petFileRefs?.[id])input.petFileRefs[id]=old.petFileRefs[id];return {...row,save:packPetFilesSync(durableSave(input),scope(key(),row.id),content,uuid,fileIO(scope(key(),row.id)))};});
        const persisted={...next,localFormat:2,catalog:{...next.catalog,roles:packed}};
        next={...next,catalog:{...next.catalog,roles:next.catalog.roles.map((row,i)=>({...row,save:{...row.save,...(row.save.petInstanceVersion===1?{petFileRefs:unpackPetPages(packed[i].save,scope(key(),row.id),fileIO(scope(key(),row.id)).read).petFileRefs,petPages:packed[i].save.petPages}:{})}}))}};
        const text=JSON.stringify(persisted);
        if(text!==raw)storage.setItem(key(),text);
        for(const row of next.catalog.roles)runtimeStore.set(runtimeKey(key(),row.id),runtimeValues(row.save));
        state=next;raw=text;lastCoreKey=coreCatalogKey(next.catalog);
    }
    return {
        flushRuntime: () => runtimeStore.flush(),
        petFileIO(roleId){return fileIO(scope(key(),roleId));},
        // Cloud downloads can arrive before this store switches off the guest account.
        petFileIOFor(account,roleId){return fileIO(scope(accountKey(account),roleId));},
        petScope(roleId){return scope(key(),roleId);},
        loadPet(save,id,roleId=state.catalog.activeId){const next=JSON.parse(JSON.stringify(save));hydratePetFile(next,id,scope(key(),roleId),fileIO(scope(key(),roleId)).read,content);return restoreRuntime(durableSave(next),content,runtimeValues(next));},
        get owner() { return owner; },
        get catalog() { return state.catalog; },
        get base() { return state.base; },
        get dirty() { return state.dirty; },
        get recovering() { return !!state?.recoveryBackup; },
        async prepareOpen(account = null, {recover = false} = {}) {
            const storageKey=accountKey(account);
            const captured=storage.getItem(storageKey),legacy=!captured&&account===null?storage.getItem(SAVE_KEY):null;
            if(recover){
                preparationErrors.clear();
                let rows;
                try{rows=captured?JSON.parse(captured).catalog?.roles:legacy?[{id:'legacy',save:JSON.parse(legacy)}]:[];if(!Array.isArray(rows))return;}catch{return;}
                await runtimeStore.prepare(rows.filter(row=>row?.id).map(row=>runtimeKey(storageKey,row.id)));
                for(const row of rows){
                    try{
                        const runtime=runtimeStore.get(runtimeKey(storageKey,row.id));
                        await prepareSaves([row.save,...(runtime?.values?.coopRun&&runtime.revision===row.save?.revision?[{...row.save,zone:runtime.coopZone,cityFallback:runtime.values?.cityFallback}]:[]),...(runtime?.earthDungeonZone&&runtime.revision===row.save?.revision?[{...row.save,zone:runtime.earthDungeonZone,dungeonRuns:runtime.cityDungeonRuns,cityReturnStack:runtime.values?.cityReturnStack,cityFallback:runtime.values?.cityFallback}]:[])]);
                    }catch(error){preparationErrors.set(`${storageKey}.${row?.id}`,error);}
                }
                if(storage.getItem(storageKey)!==captured||legacy!==null&&storage.getItem(SAVE_KEY)!==legacy)throw Error('角色进度已变化，请重新读取。');
                return;
            }
            if(captured)await runtimeStore.prepare((JSON.parse(captured).catalog?.roles||[]).map(row=>runtimeKey(storageKey,row.id)));
            const saves=captured?(JSON.parse(captured).catalog?.roles||[]).map(row=>row.save):legacy?[JSON.parse(legacy)]:[];
            await prepareSaves(saves);
            if(captured){const rows=JSON.parse(captured).catalog?.roles||[];for(const row of rows){const r=runtimeStore.get(runtimeKey(storageKey,row.id));if(r?.earthDungeonZone&&r.revision===row.save.revision)await prepareSaves([{...row.save,zone:r.earthDungeonZone,dungeonRuns:r.cityDungeonRuns,cityReturnStack:r.values?.cityReturnStack,cityFallback:r.values?.cityFallback}]);}}
            if(captured){const records=JSON.parse(captured).catalog?.roles||[];const cooperative=records.flatMap(row=>{const r=runtimeStore.get(runtimeKey(storageKey,row.id));return r?.values?.coopRun&&r.revision===row.save.revision?[{...row.save,zone:r.coopZone,cityFallback:r.values?.cityFallback}]:[];});if(cooperative.length)await prepareSaves(cooperative);}
            if(storage.getItem(storageKey)!==captured||legacy!==null&&storage.getItem(SAVE_KEY)!==legacy)throw Error('角色进度已变化，请重新读取。');
        },
        open(account = null, {recover = false} = {}) {
            const nextKey = accountKey(account);
            const nextRaw = storage.getItem(nextKey);
            const legacy = !nextRaw&&account===null?storage.getItem(SAVE_KEY):null;
            let next;
            try{
                next = nextRaw ? JSON.parse(nextRaw) : { catalog: emptyRoles(), base: null, dirty: false };
                if(recover&&next.catalog.roles.some(row=>preparationErrors.has(`${nextKey}.${row.id}`)))throw Error('角色资源暂时无法读取');
                next.catalog = validateRoles(hydrate(next.catalog,nextKey,next.localFormat), content, dataset);
                if(recover&&legacy){
                    if(preparationErrors.has(`${nextKey}.legacy`))throw Error('角色资源暂时无法读取');
                    validateRoles(addRole(emptyRoles(),'00000000-0000-0000-0000-000000000000',JSON.parse(legacy),now()),content,dataset);
                }
            }catch(error){
                if(!recover)throw error;
                let source;try{source=JSON.parse(nextRaw);}catch{}
                const recovered=emptyRoles(),seen=new Set();
                // Keep valid roles available independently; never repair or erase a rejected save.
                try{
                    const header=validateRoles({...source.catalog,roles:[],activeId:null},content,dataset);
                    Object.assign(recovered,header);
                    for(const row of source.catalog.roles){
                        try{
                            if(seen.has(row.id)||preparationErrors.has(`${nextKey}.${row.id}`))continue;
                            const single=validateRoles(hydrate({...header,roles:[row],activeId:row.id},nextKey,source.localFormat),content,dataset);
                            if(recovered.roles.length<MAX_ROLES){recovered.roles.push(single.roles[0]);seen.add(row.id);}
                        }catch{/* Original bytes and runtime remain in the recovery backup below. */}
                    }
                }catch{/* A malformed catalog can still open the character creation screen. */}
                next={catalog:recovered,base:source?.base??null,dirty:source?.dirty===true,recoveryBackup:{raw:nextRaw,legacy,reason:error.message}};
            }
            owner = account;raw = nextRaw;state = next;lastCoreKey=coreCatalogKey(next.catalog);
            if (!raw && account === null && !state.recoveryBackup) {
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
        // Fully hydrate lazy pet files before moving a guest save to another scope.
        guestTransfer() {
            if(owner!==null) return null;
            const row=state.catalog.roles.find(r=>r.id===state.catalog.activeId);
            if(!row)throw Error('请先选择本地角色。');
            const save=JSON.parse(JSON.stringify(row.save));
            for(const id of Object.keys(save.petFileRefs||{}))if(!String(id).startsWith('npc-pet:'))hydratePetFile(save,id,scope(key(),row.id),fileIO(scope(key(),row.id)).read,content);
            for(const id of Object.keys(save.petFileRefs||{}))if(String(id).startsWith('npc-pet:'))delete save.petFileRefs[id];
            for(const id of Object.keys(save.petWorld||{}))if(String(id).startsWith('npc-pet:'))delete save.petWorld[id];
            delete save.petFileRefs;delete save.petPages;
            return {id:row.id,save:restoreRuntime(durableSave(save),content,runtimeValues(row.save))};
        },
        adoptGuest(row) {
            if(!owner)throw Error('请先登录 KeepWork。');
            // Stable role IDs make retries idempotent; never overwrite an existing cloud role.
            if(state.catalog.roles.some(r=>r.id===row.id))return row.id;
            const next=addRole(state.catalog,row.id,row.save,now());
            write({...state,catalog:validateRoles(next,content,dataset),dirty:true});
            return row.id;
        },
        create(save) { const next = addRole(state.catalog, uuid(), save, now());write({ ...state, catalog: next, dirty: true });return next.activeId; },
        select(id) { const catalog=selectRole(state.catalog,id,now());write({...state,catalog,dirty:changed(catalog)}); },
        remove(id) {
            if (!state.catalog.roles.some(row => row.id === id)) throw Error('角色不存在');
            const catalog = {...state.catalog, roles: state.catalog.roles.filter(row => row.id !== id), activeId: state.catalog.activeId === id ? null : state.catalog.activeId};
            write({...state, catalog, dirty: true});
        },
        commitMagicBeanExchange(nextSave, exchangedUntil) {
            const id = state.catalog.activeId;
            const catalog = validateRoles(grantMagicBeans(state.catalog, id, nextSave, exchangedUntil), content, dataset);
            write({ ...state, catalog, dirty: true });
            return catalog.roles.find(row => row.id === id).save;
        },
        checkpoint() { return JSON.stringify(state.catalog); },
        markSynced(base, captured) { write({ ...state, base, dirty: coreCatalogKey(state.catalog) !== coreCatalogKey(JSON.parse(captured)) }); },
        commitRoles(updates) {
            const ids=Object.keys(updates);
            if(!ids.length||ids.some(id=>!state.catalog.roles.some(row=>row.id===id)))throw Error('角色不存在');
            const catalog={...state.catalog,roles:state.catalog.roles.map(row=>updates[row.id]?{...row,save:structuredClone(updates[row.id])}:row)};
            write({...state,catalog,dirty:changed(catalog)});
            return ids.map(id=>state.catalog.roles.find(row=>row.id===id).save);
        },
        scoped(roleId=null) {
            const capturedOwner = owner, id = roleId||state.catalog.activeId, accountKey = key();
            if (!id) throw Error('请先选择角色');
            const assertCurrent = () => { if (capturedOwner !== owner || (!roleId&&id !== state.catalog.activeId)||!state.catalog.roles.some(row=>row.id===id)) throw Error('角色已切换，请重新操作。'); };
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
