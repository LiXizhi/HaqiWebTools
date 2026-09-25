import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCloudClient } from '../js/adventure_cloud.js';
import { makeCloudSnapshot,parseCloudSnapshot,snapshotPath,checkpointPaths } from '../js/adventure_cloud_core.js';
import { SAVE_KEY,BACKUP_KEY,saveLocal,replaceLocalWithBackup } from '../js/adventure_assets.js';
import * as A from '../js/adventure_core.js';
import * as P from '../js/combat_pve_core.js';
const load=n=>JSON.parse(fs.readFileSync(new URL(`../data/adventure/${n}.json`,import.meta.url)));
const content=load('chapter'),dataset=load('combat'),date='2026-09-17T10:20:30.123Z';
const id='12345678-1234-1234-1234-123456789abc';
function mockSDK(options={}) {
    const remote=new Map(),cache=new Map(),listeners=[];
    const sdk={token:'fixture-token',username:'fixture-user',getUserProfile:async()=>({username:sdk.username}),
        showLoginWindow:async()=>null,onAuthStateChange:cb=>{listeners.push(cb);return()=>{};},
        getFileByFullPath:async(path,cb,useCache)=>{assert.equal(useCache,true);if(options.readFail)return null;return remote.get(path)||null;},
        changeAccount(name){sdk.username=name;for(const cb of listeners)cb();},
    };
    const store={getUsername:()=>sdk.username,isUseLocal:()=>!sdk.token,getRemotePagePath:path=>`${sdk.username}/edunotes/store/HaqiAdventure/${path}`,
        savePageData:async(path,key,text,flush,useCache)=>{assert.equal(key,'content');assert.equal(flush,false);assert.equal(useCache,true);cache.set(path,text);},
        syncToGit:async(path,useCache)=>{assert.equal(useCache,true);if(options.syncFail)return false;if(!options.cacheOnly)remote.set(store.getRemotePagePath(path),JSON.stringify(JSON.parse(cache.get(path)),null,2));return true;},
        listDir:async(dir,recursive,opts)=>{assert.equal(dir,'checkpoints');assert.equal(opts.remoteOnly,true);return [...remote.keys()].map(x=>x.split('/').at(-1)).join('\n');},
    };
    sdk.personalPageStore={withWorkspace:name=>{assert.equal(name,'HaqiAdventure');return store;}};
    return {sdk,store,remote,cache};
}
function client(mock,extra={}) {return createCloudClient({content,dataset,loadSDK:async()=>mock.sdk,now:()=>date,uuid:()=>id,...extra});}
test('cloud snapshots exclude local runtime and defer unfinished battles',async()=>{
    const save=A.createAdventure(content),mock=mockSDK(),c=client(mock);await c.connect();
    A.beginEncounter(save,content,'ice-scout');
    await assert.rejects(c.upload(save),/战斗尚未结束/);assert.equal(mock.remote.size,0);
    save.pendingEncounter=null;save.position.x+=10;
    const original=JSON.stringify(save),uploaded=await c.upload(save);
    assert.equal(JSON.stringify(save),original);
    const stored=JSON.parse(mock.remote.get(mock.store.getRemotePagePath(uploaded.path)));
    assert.equal(stored.save.position,undefined);assert.equal(stored.save.pendingEncounter,undefined);
    assert.deepEqual(await c.list(),[uploaded.path]);
    const loaded=await c.read(uploaded.path);assert.equal(loaded.save.pendingEncounter,null);
    assert.deepEqual(loaded.save.inventory,save.inventory);assert.doesNotThrow(()=>c.assertPreview(loaded));
});
test('each cloud write preserves earlier device snapshots instead of overwriting latest',async()=>{
    const mock=mockSDK();let serial=0;const c=client(mock,{uuid:()=>`${id.slice(0,-1)}${serial++}`});await c.connect();
    const save=A.createAdventure(content);const first=await c.upload(save);save.name='第二台设备';const second=await c.upload(save);
    assert.notEqual(first.path,second.path);assert.equal(mock.remote.size,2);assert.equal((await c.read(first.path)).save.name,'小哈奇');
});
test('cloud refuses successful local writes with failed sync or unavailable remote verification',async()=>{
    for(const options of [{syncFail:true},{cacheOnly:true},{readFail:true}]){
        const mock=mockSDK(options),c=client(mock);await c.connect();await assert.rejects(c.upload(A.createAdventure(content)),/云端/);assert.equal(mock.cache.size,1);
    }
});
test('cloud rejects mismatched remote content even after sync reports success',async()=>{
    const mock=mockSDK(),c=client(mock);mock.sdk.getFileByFullPath=async()=>'{"unexpected":true}';await c.connect();await assert.rejects(c.upload(A.createAdventure(content)),/核验/);
});
test('login cancellation and SDK failure preserve local-only operation',async()=>{
    const mock=mockSDK();mock.sdk.token=null;const c=client(mock);await assert.rejects(c.connect(),/取消登录/);assert.equal(c.owner,null);
    mock.sdk.showLoginWindow=async()=>{throw Error('Login cancelled');};await assert.rejects(c.connect(),/取消登录/);
    const failure=client(mock,{loadSDK:async()=>{throw Error('network');}});await assert.rejects(failure.connect(),/本地进度/);
});
test('account changes invalidate previews and in-flight writes',async()=>{
    const mock=mockSDK();let changed=0;const c=client(mock,{onAccountChange:()=>changed++});await c.connect();
    const uploaded=await c.upload(A.createAdventure(content)),preview=await c.read(uploaded.path);
    mock.sdk.changeAccount('another-user');assert.equal(c.owner,null);assert.equal(changed,1);assert.throws(()=>c.assertPreview(preview),/登录/);
    await c.connect();mock.store.savePageData=async()=>mock.sdk.changeAccount('third-user');await assert.rejects(c.upload(A.createAdventure(content)),/登录/);
});
test('cloud awaits cache sync and verifies it without a background flush race',async()=>{
    const mock=mockSDK();
    mock.store.createFile=async(path,text)=>{mock.cache.set(path,text);throw Error('createFile only writes server cache');};
    const c=client(mock);await c.connect();const result=await c.upload(A.createAdventure(content));
    assert.ok(mock.remote.has(mock.store.getRemotePagePath(result.path)));
});
test('cloud paths exclude traversal and invalid/unbounded directory entries',()=>{
    const snapshot=makeCloudSnapshot(A.createAdventure(content),content,dataset,date,id),path=snapshotPath(snapshot);
    assert.deepEqual(checkpointPaths(`${path.split('/')[1]}\n../other.json\nfolder/\n${path.split('/')[1]}`),[path]);
    assert.throws(()=>makeCloudSnapshot(snapshot.save,content,dataset,'invalid',id));
    assert.throws(()=>makeCloudSnapshot(snapshot.save,content,dataset,date,'../../invalid'));
});
test('cloud rejects incompatible saves, corrupted combat decisions and oversized input',()=>{
    const save=A.createAdventure(content);A.beginEncounter(save,content,'ice-scout');
    const snapshot=makeCloudSnapshot(save,content,dataset,date,id);
    const wrong=structuredClone(snapshot);wrong.save.contentVersion='other';assert.throws(()=>parseCloudSnapshot(JSON.stringify(wrong),content,dataset));
    const bad=structuredClone(snapshot);bad.save.pendingEncounter.decisions=[{key:'InvalidSpell',seq:999,targetId:'mob0'}];assert.throws(()=>parseCloudSnapshot(JSON.stringify(bad),content,dataset));
    assert.throws(()=>parseCloudSnapshot('x'.repeat(1024*1024+1),content,dataset));
});
test('cloud restore backs up local progress before replacement; quota failure preserves it',()=>{
    const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};
    const previous=A.createAdventure(content),next=A.createAdventure(content,{name:'云端角色'});saveLocal(previous,storage);replaceLocalWithBackup(next,storage);
    assert.deepEqual(JSON.parse(map.get(BACKUP_KEY)),previous);assert.deepEqual(JSON.parse(map.get(SAVE_KEY)),next);
    const quota={...storage,setItem:(k,v)=>{if(k===BACKUP_KEY)throw Error('quota');storage.setItem(k,v);}};
    assert.throws(()=>replaceLocalWithBackup(previous,quota));assert.deepEqual(JSON.parse(map.get(SAVE_KEY)),next);
    assert.throws(()=>replaceLocalWithBackup(previous,storage,JSON.stringify(previous)),/其他页面/);assert.deepEqual(JSON.parse(map.get(SAVE_KEY)),next);
});
