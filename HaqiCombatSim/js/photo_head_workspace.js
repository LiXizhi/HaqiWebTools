import {loadKeepwork} from './adventure_cloud.js';
import {saveWorkspaceFile} from './keepwork_file_io.js';
import {PHOTO_HEAD_PAGE_SIZE,PHOTO_HEAD_LIMIT,validatePhotoHeadPreview,publicPhotoHead,photoHeadQuota,photoHeadOutfitPreference} from './photo_head_core.js';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const clone=x=>structuredClone(x);
const prefix='appearance/photo-heads/';
// Account cache + serialized writes. This is deliberately not server-side quota enforcement.
export function createPhotoHeadWorkspace({getOwner,loadSDK=loadKeepwork}={}) {
    let identity=null,epoch=0;const reads=new Map(),subscriptions=new WeakSet();let queue=Promise.resolve();
    const serial=fn=>{const task=queue.catch(()=>{}).then(fn);queue=task;return task;};
    async function connect(){
        const owner=getOwner();assert(owner,'请先登录 Keepwork 云端账号');
        const sdk=await loadSDK(),token=sdk.token;assert(token,'请先登录 Keepwork 云端账号');
        if(!subscriptions.has(sdk)){subscriptions.add(sdk);sdk.onAuthStateChange?.(()=>{epoch++;identity=null;reads.clear();});}
        if(identity!==`${owner}:${token}`){identity=`${owner}:${token}`;epoch++;reads.clear();}
        const version=epoch;
        const check=()=>assert(getOwner()===owner&&sdk.token===token&&epoch===version,'账号已切换，请重新打开形象窗口');
        const profile=await sdk.getUserProfile({useCache:true});check();assert(profile?.username===owner,'云端账号不一致');
        const store=sdk.personalPageStore.withWorkspace('HaqiAdventure');
        async function read(path,optional=false){
            check();assert(path.startsWith(prefix)&&!path.includes('..'),'形象文件路径无效');
            if(!reads.has(path)){
                const request=(async()=>{
                    const full=store.getRemotePagePath(path);assert(full.startsWith(owner+'/'),'云端账号不一致');
                    const parts=full.split('/');const result=await sdk.loadPage({sitePath:parts.slice(0,2).join('/'),pagePath:parts.slice(2).join('/'),useCache:true,useServerCache:true});check();
                    if(optional&&result?.success===false&&result.fromServerCache===true&&result.content===''&&!result.error)return null;
                    assert(result?.success===true&&result.fromServerCache===true&&typeof result.content==='string','无法读取形象目录，请重试');
                    return JSON.parse(result.content);
                })();reads.set(path,request);request.catch(()=>{if(reads.get(path)===request)reads.delete(path);});
            }
            const value=await reads.get(path);check();return clone(value);
        }
        async function write(path,value){check();await saveWorkspaceFile({store,owner,path,text:JSON.stringify(value),check});check();reads.set(path,Promise.resolve(clone(value)));}
        async function index(){
            const row=await read(prefix+'index.json',true)||{version:2,owner,freeUsed:false,heads:[],pending:null};
            assert(row.owner===owner&&[1,2].includes(row.version),'形象目录无效');
            if(row.version===1){
                assert(Array.isArray(row.pages),'形象目录无效');
                // Legacy metadata only; no per-head file or atlas is read during migration.
                const heads=[];for(const path of row.pages){const page=await read(path);assert(Array.isArray(page),'形象分页无效');heads.push(...page);}
                const {pages,...rest}=row;return {...rest,version:2,heads};
            }
            assert(Array.isArray(row.heads),'形象目录无效');return row;
        }
        async function page(cursor=0){const root=await index(),start=cursor*PHOTO_HEAD_PAGE_SIZE;return {rows:root.heads.slice(start,start+PHOTO_HEAD_PAGE_SIZE),next:start+PHOTO_HEAD_PAGE_SIZE<root.heads.length?cursor+1:null,total:root.heads.length,limit:PHOTO_HEAD_LIMIT};}
        async function listedHead(path){const root=await index();const row=root.heads.find(row=>row.path===path);assert(row,'形象不在当前账号目录');return publicPhotoHead(await read(path),{owner,id:row.id});}
        return {owner,sdk,check,index,page,readHead:listedHead,
            reserve:task=>serial(async()=>{const root=await index();assert(!root.pending||root.pending.id===task.id,'上次生成尚未处理，请先恢复或放弃');assert(root.heads.length<PHOTO_HEAD_LIMIT,'最多保留10个形象，请先删除不需要的形象');assert(photoHeadQuota(root,task.vip).allowed,'照片生成形象为会员专属功能，请开通会员后使用。');await write(prefix+'index.json',{...root,pending:{id:task.id,vip:!!task.vip,appearance:task.appearance}});}),
            release:id=>serial(async()=>{const root=await index();if(root.pending?.id===id)await write(prefix+'index.json',{...root,pending:null});}),
            remove:id=>serial(async()=>{
                const root=await index();assert(root.heads.some(row=>row.id===id),'形象不在当前账号目录');
                // Removing the library entry must not break a head already worn by a saved role.
                await write(prefix+'index.json',{...root,heads:root.heads.filter(row=>row.id!==id)});
            }),
            save:(task,head,{edit=false,preview}={})=>serial(async()=>{
                check();head=publicPhotoHead(head,{owner});const root=await index();
                if(!edit&&root.lastCompleted===task.id)return head;
                const previous=root.heads.find(row=>row.id===head.id);
                if(edit)assert(previous,'形象不在当前账号目录');
                else {assert(root.pending?.id===task.id,'生成记录已变化');assert(root.heads.length<PHOTO_HEAD_LIMIT,'最多保留10个形象，请先删除不需要的形象');}
                const path=prefix+`heads/${head.id}.json`;
                // One current document per head. Unchanged heads are never rewritten or loaded.
                const outfit=photoHeadOutfitPreference(head,{appearance:previous?.appearance||task.appearance,bodyId:previous?.bodyId});
                const summary={id:head.id,gender:head.gender,path,preview:validatePhotoHeadPreview(preview||previous?.preview),createdAt:previous?.createdAt||task.createdAt||new Date().toISOString(),...outfit};
                await write(path,head);
                const heads=edit?root.heads.map(row=>row.id===head.id?summary:row):[summary,...root.heads];
                await write(prefix+'index.json',{...root,heads,...(!edit?{freeUsed:root.freeUsed===true||!task.vip,pending:null,lastCompleted:task.id}:{})});return head;
            }),
            rememberOutfit:(id,outfit)=>serial(async()=>{
                const root=await index(),previous=root.heads.find(row=>row.id===id);
                assert(previous,'形象不在当前账号目录');
                const next={...previous,...photoHeadOutfitPreference({gender:previous.gender},outfit)};
                await write(prefix+'index.json',{...root,heads:root.heads.map(row=>row.id===id?next:row)});
                return next;
            })};
    }
    return {connect};
}
