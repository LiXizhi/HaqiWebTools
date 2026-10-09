import {directCacheStore} from './direct_cache_store.js';
import {createCharacterWorkspace} from '../../js/character_workspace.js';
export function fakeWorkspace({now=()=>Date.parse('2026-09-27T00:00:00Z')}={}){
    const files=new Map(),reads=[],writes=[];let owner='alice',sequence=0,fail=null;
    const sdk={token:'fixture',getUserProfile:async()=>({username:owner}),loadPage:async({sitePath,pagePath})=>{const path=sitePath+'/'+pagePath;reads.push(path);if(fail==='read')throw Error('offline');return files.has(path)?{success:true,fromServerCache:true,content:files.get(path)}:{success:false,fromServerCache:true,content:''};},getFileByFullPath:async path=>{reads.push(path);if(fail==='read')throw Error('offline');return files.get(path)??null;},editFileByFullPath:async(full,text,_,useCache)=>{if(useCache!==true)throw Error('expected pageCache');const path=full.slice(`${owner}/workspace/`.length);if(fail===path||fail==='write')throw Error('offline');files.set(full,text);writes.push(path);return {success:true};},personalPageStore:{withWorkspace:()=>({getRemotePagePath:path=>`${owner}/workspace/${path}`})}};
    const store=sdk.personalPageStore.withWorkspace();directCacheStore(store,sdk);sdk.personalPageStore.withWorkspace=()=>store;
    const workspace=createCharacterWorkspace({getOwner:()=>owner,loadSDK:async()=>sdk,locks:null,uuid:()=>`rev-${++sequence}`,now});
    return {workspace,files,reads,writes,setOwner:value=>{owner=value;},fail:value=>{fail=value;}};
}
