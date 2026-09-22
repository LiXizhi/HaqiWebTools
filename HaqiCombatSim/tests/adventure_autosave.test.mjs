import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutoSave} from '../js/adventure_autosave.js';
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
