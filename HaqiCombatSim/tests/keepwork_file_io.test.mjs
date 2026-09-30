import {directCacheStore} from './helpers/direct_cache_store.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {saveWorkspaceFile} from '../js/keepwork_file_io.js';

function harness(result={success:true}) {
    const calls=[];
    const store={getRemotePagePath:path=>`alice/edunotes/store/HaqiAdventure/${path}`,
        savePageData:()=>assert.fail('whole-file writes must not enter SDK merge/batch sync'),
        syncToGit:()=>assert.fail('whole-file writes must not enter SDK merge/batch sync')};
    const sdk={editFileByFullPath:async(...args)=>{calls.push(args);return result;},
        getFileByFullPath:()=>assert.fail('no writeback GET')};
    directCacheStore(store,sdk);
    return {calls,args:{sdk,store,owner:'alice',path:'roles/index.json',text:'{"revision":"new"}'}};
}
test('whole-file write performs one server-cache PUT with the scoped path',async()=>{
    const h=harness();await saveWorkspaceFile(h.args);
    assert.deepEqual(h.calls,[['alice/edunotes/store/HaqiAdventure/roles/index.json','{"revision":"new"}',undefined,true]]);
});
test('missing or negative acknowledgement is never success',async()=>{
    for(const result of [null,{},false,{success:false}])await assert.rejects(saveWorkspaceFile(harness(result).args),/确认写入/);
});
test('network rejection is propagated and a later explicit retry can succeed',async()=>{
    const h=harness();const put=h.args.sdk.editFileByFullPath;
    h.args.sdk.editFileByFullPath=async()=>{throw Error('offline');};
    await assert.rejects(saveWorkspaceFile(h.args),/offline/);
    h.args.sdk.editFileByFullPath=put;await saveWorkspaceFile(h.args);assert.equal(h.calls.length,1);
});
test('wrong account path is rejected before PUT and a stale response cannot succeed',async()=>{
    const h=harness();await assert.rejects(saveWorkspaceFile({...h.args,owner:'bob'}),/账号/);assert.equal(h.calls.length,0);
    let current=true;h.args.check=()=>{if(!current)throw Error('account changed');};
    h.args.sdk.editFileByFullPath=async()=>{current=false;return {success:true};};
    await assert.rejects(saveWorkspaceFile(h.args),/account changed/);
});
test('write promise remains pending until the server acknowledges it',async()=>{
    const h=harness();let acknowledge,finished=false;
    h.args.sdk.editFileByFullPath=()=>new Promise(resolve=>{acknowledge=resolve;});
    const task=saveWorkspaceFile(h.args).then(()=>{finished=true;});
    await Promise.resolve();assert.equal(finished,false);
    acknowledge({success:true});await task;assert.equal(finished,true);
});


test('older SDK keeps the cache staging/sync path without an application GET',async()=>{
    const calls=[],store={getRemotePagePath:p=>`alice/workspace/${p}`,savePageData:async(...args)=>calls.push(['save',...args]),syncToGit:async(...args)=>{calls.push(['sync',...args]);return true;}};
    await saveWorkspaceFile({store,owner:'alice',path:'roles/index.json',text:'{}'});
    assert.deepEqual(calls,[['save','roles/index.json','content','{}',false,true],['sync','roles/index.json',true]]);
    store.syncToGit=async()=>false;await assert.rejects(saveWorkspaceFile({store,owner:'alice',path:'roles/index.json',text:'{}'}),/确认写入/);
});
