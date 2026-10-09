import assert from 'node:assert/strict';
export function directCacheStore(store,sdk){
    store.supportsDirectCacheWrite=true;
    store.savePageData=async(path,key,text,flush,useCache,options)=>{
        assert.equal(key,'content');assert.equal(flush,true);assert.equal(useCache,true);assert.deepEqual(options,{directWrite:true});
        const result=await sdk.editFileByFullPath(store.getRemotePagePath(path),text,undefined,true);
        if(result?.success!==true)throw Error('云端尚未确认写入');
    };
    store.syncToGit=()=>assert.fail('directWrite must not sync again');
    return store;
}
