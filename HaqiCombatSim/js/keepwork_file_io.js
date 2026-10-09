// Haqi opts into PersonalPageStore's cache-only whole-file write. No global SDK
// behavior is changed. Older CDN bundles keep their awaited cache sync path.
export async function saveWorkspaceFile({store,owner,path,text,check=()=>{}}) {
    check();
    const fullPath=store.getRemotePagePath(path);
    if(!owner||!fullPath.startsWith(`${owner}/`))throw Error('云端账号不一致，请重新连接。');
    if(typeof store.savePageData!=='function')throw Error('Keepwork 云端写入接口暂时不可用，请刷新后重试。');
    try{
        if(store.supportsDirectCacheWrite===true){
            await store.savePageData(path,'content',text,true,true,{directWrite:true});
        }else{
            await store.savePageData(path,'content',text,false,true);check();
            if(typeof store.syncToGit!=='function'||!await store.syncToGit(path,true))throw Error('云端尚未确认写入，本地进度已保留，请稍后重试。');
        }
    }finally{check();}
}
