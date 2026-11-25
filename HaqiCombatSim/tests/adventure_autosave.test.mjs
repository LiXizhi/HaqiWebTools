import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutoSave} from '../js/adventure_autosave.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('app autosave distinguishes failed local persistence from cloud failure and retries',async()=>{
    // Run the real app wiring; isolate browser/storage services, not its save/error callbacks.
    const source=readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
    const start=source.indexOf('const autoSave=createAutoSave({');
    const end=source.indexOf('\nfunction queueCloudSave()',start);
    assert.ok(start>=0&&end>start);
    let time=0,localFails=true,cloudFails=true,syncs=0;
    const messages=[],state={storageWarning:false},cloud={error:''};
    const autoSave=vm.runInNewContext(source.slice(start,end)+'\nautoSave;',{
        createAutoSave:options=>createAutoSave({...options,now:()=>time}),
        roleCloud:{canAutoSave:()=>true},roles:{},state,cloud,
        persist:()=>{state.storageWarning=localFails;},
        syncRoles:async()=>{syncs++;if(cloudFails)throw Error('offline');},
        toast:message=>messages.push(message),
    });
    autoSave.request();await autoSave.tick();
    assert.equal(syncs,0);
    assert.equal(messages.at(-1),'进度未能保存，可能是其他页面已更新。请勿关闭页面，检查存储后重试。');
    time=30000;localFails=false;await autoSave.tick();
    assert.equal(syncs,1);
    assert.equal(messages.at(-1),'云存档暂未完成，本地进度已保留，将自动重试。');
    time=60000;cloudFails=false;assert.equal(await autoSave.tick(),true);
    assert.equal(syncs,2);assert.equal(cloud.error,'');assert.equal(messages.length,2);
});
test('major actions save immediately, unchanged play saves at ten minutes, guests/conflicts wait',async()=>{
    let time=0,count=0,eligible=false;const a=createAutoSave({now:()=>time,eligible:()=>eligible,save:async()=>{count++;}});
    a.request();await a.tick();assert.equal(count,0);eligible=true;await a.tick();assert.equal(count,1);
    time=599999;await a.tick();assert.equal(count,1);time=600000;await a.tick();assert.equal(count,2);
});
test('failure retries and a mutation during upload remains queued without concurrent uploads',async()=>{
    let time=0,count=0,release,errors=0;
    const a=createAutoSave({now:()=>time,eligible:()=>true,onError:()=>errors++,save:async()=>{count++;if(count===1)throw Error('offline');await new Promise(r=>release=r);}});
    a.request();await a.tick();assert.equal(errors,1);time=29999;await a.tick();assert.equal(count,1);
    time=30000;const pending=a.tick();a.request();await a.tick();assert.equal(count,2);release();await pending;
    time=60000;const next=a.tick();assert.equal(count,3);release();await next;
});
test('switching role while upload finishes does not consume a new role request',async()=>{
    let time=0,count=0,release;const a=createAutoSave({now:()=>time,eligible:()=>true,save:async()=>{count++;await new Promise(r=>release=r);}});
    a.request();const pending=a.tick();a.reset();a.request();release();await pending;
    const next=a.tick();assert.equal(count,2);release();await next;
});
