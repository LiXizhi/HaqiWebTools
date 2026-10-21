import test from 'node:test';
import assert from 'node:assert/strict';
import {createPortraitScheduler} from '../js/portrait_scheduler.js';

function fixture(observe=true){
    let notify;const frames=new Map(),listeners=new Map(),observed=new Set();let id=0,paints=0;
    const doc={hidden:false,addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k)};
    class Observer{constructor(fn){notify=fn;}observe(n){observed.add(n);}unobserve(n){observed.delete(n);}disconnect(){observed.clear();}}
    const scheduler=createPortraitScheduler({document:doc,Observer:observe?Observer:null,requestFrame:fn=>{frames.set(++id,fn);return id;},cancelFrame:id=>frames.delete(id)});
    const view={node:{isConnected:true},paint:()=>paints++};
    return {scheduler,view,frames,observed,listeners,get paints(){return paints;},
        visibility(visible){notify([{target:view.node,isIntersecting:visible}]);},
        hidden(value){doc.hidden=value;listeners.get('visibilitychange')();},
        tick(time){const callbacks=[...frames.values()];frames.clear();for(const fn of callbacks)fn(time);}};
}
test('portraits stop scheduling when clipped, hidden or removed and resume on visibility',()=>{
    const f=fixture();f.scheduler.add(f.view);assert.equal(f.frames.size,0);
    f.visibility(true);f.tick(0);assert.equal(f.paints,1);
    f.tick(16);assert.equal(f.paints,1);f.tick(50);assert.equal(f.paints,2);
    f.visibility(false);assert.equal(f.frames.size,0);
    f.visibility(true);f.tick(60);assert.equal(f.paints,3);
    f.hidden(true);assert.equal(f.frames.size,0);
    f.hidden(false);f.tick(70);assert.equal(f.paints,4);
    f.view.node.isConnected=false;f.tick(120);
    assert.equal(f.frames.size,0);assert.equal(f.observed.size,0);
    f.scheduler.dispose();assert.equal(f.listeners.size,0);
});
test('fallback keeps visible animations and explicit removal stops the final loop',()=>{
    const f=fixture(false);f.scheduler.add(f.view);f.scheduler.add(f.view);
    assert.equal(f.frames.size,1);f.tick(0);assert.equal(f.paints,1);
    f.scheduler.delete(f.view);assert.equal(f.frames.size,0);
    f.scheduler.add(f.view);f.scheduler.dispose();assert.equal(f.frames.size,0);
});
test('one visible portrait does not redraw clipped siblings',()=>{
    const f=fixture();let otherPaints=0;
    f.scheduler.add(f.view);f.scheduler.add({node:{isConnected:true},paint:()=>otherPaints++});
    f.visibility(true);for(let i=0;i<120;i++)f.tick(i*1000/120);
    assert.equal(f.paints,20);assert.equal(otherPaints,0);f.scheduler.dispose();
});
