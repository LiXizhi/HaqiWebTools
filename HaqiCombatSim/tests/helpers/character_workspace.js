import {createCharacterWorkspace} from '../../js/character_workspace.js';
export function fakeWorkspace(){
    const files=new Map(),reads=[],writes=[];let owner='alice',sequence=0,fail=null;
    const sdk={token:'fixture',getUserProfile:async()=>({username:owner}),loadPage:async({sitePath,pagePath})=>{const path=sitePath+'/'+pagePath;reads.push(path);if(fail==='read')throw Error('offline');return files.has(path)?{success:true,fromServerCache:true,content:files.get(path)}:{success:false,fromServerCache:true,content:''};},getFileByFullPath:async path=>{reads.push(path);if(fail==='read')throw Error('offline');return files.get(path)??null;},personalPageStore:{withWorkspace:()=>({getRemotePagePath:path=>`${owner}/workspace/${path}`,savePageData:async(path,key,text)=>{if(fail===path||fail==='write')throw Error('offline');files.set(`${owner}/workspace/${path}`,text);writes.push(path);},syncToGit:async()=>true})}};
    const workspace=createCharacterWorkspace({getOwner:()=>owner,loadSDK:async()=>sdk,locks:null,uuid:()=>`rev-${++sequence}`,now:()=>Date.parse('2026-09-27T00:00:00Z')});
    return {workspace,files,reads,writes,setOwner:value=>{owner=value;},fail:value=>{fail=value;}};
}
