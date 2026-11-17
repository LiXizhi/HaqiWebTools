import test from 'node:test';
import assert from 'node:assert/strict';
import {createIslandSceneLoading} from '../js/island_scene_loading.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const flush=()=>new Promise(setImmediate);
function fixture(identity=save=>save){
    const requests=[],views=[];let prepared=0,starts=0,ends=0,hidden=0,progress={ready:0,total:4};
    const gate=createIslandSceneLoading({identity,warm:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),prepare:()=>{prepared++;return progress;},show:state=>views.push(state),hide:()=>hidden++,onStart:()=>starts++,onReady:()=>ends++,timeout:100});
    return {gate,requests,views,world:{layout:{}},save:{},set progress(value){progress=value;},get prepared(){return prepared;},get starts(){return starts;},get ends(){return ends;},get hidden(){return hidden;}};
}

test('entry waits for resources and every visible tile; later movement does not reopen loading',async()=>{
    const f=fixture();assert.equal(f.gate.update(f.world,f.save,0),true);await flush();
    assert.equal(f.gate.update(f.world,f.save,1),true);assert.equal(f.prepared,0);
    f.requests[0].resolve();await flush();assert.equal(f.gate.update(f.world,f.save,2),true);
    f.progress={ready:3,total:4};assert.equal(f.gate.update(f.world,f.save,3),true);
    assert.deepEqual(f.views.at(-1),{phase:'terrain',ready:3,total:4});
    f.progress={ready:4,total:4};assert.equal(f.gate.update(f.world,f.save,4),false);assert.equal(f.ends,1);
    f.progress={ready:0,total:8};f.save.position={x:999,y:999};assert.equal(f.gate.update(f.world,f.save,5),false);
    assert.equal(f.starts,1);assert.equal(f.gate.active,false);
});
test('duo save snapshots do not restart loading during preparation or walking',async()=>{
    const f=fixture(()=> 'account:role');
    f.gate.update(f.world,f.save,0);await flush();
    f.save={position:{x:10,y:20}};
    assert.equal(f.gate.update(f.world,f.save,1),true);assert.equal(f.starts,1);
    f.requests[0].resolve();await flush();f.progress={ready:4,total:4};
    assert.equal(f.gate.update(f.world,f.save,2),false);
    for(let i=3;i<20;i++){
        f.save={...f.save,position:{x:i*10,y:20}};
        assert.equal(f.gate.update(f.world,f.save,i),false);
    }
    assert.equal(f.starts,1);assert.equal(f.requests.length,1);assert.equal(f.ends,1);
});
test('stable player identity still reloads after role, account or scene changes',async()=>{
    let owner='guest',role='one';const f=fixture(()=>JSON.stringify([owner,role]));
    async function enter(now){
        assert.equal(f.gate.update(f.world,{},now),true);await flush();
        f.requests.at(-1).resolve();await flush();f.progress={ready:4,total:4};
        assert.equal(f.gate.update(f.world,{},now+1),false);
    }
    await enter(0);role='two';await enter(2);owner='account';await enter(4);
    f.world={layout:{}};await enter(6);f.gate.invalidate();await enter(8);
    assert.equal(f.starts,5);assert.equal(f.ends,5);
});
test('a changed viewport is evaluated before release',async()=>{
    const f=fixture();f.gate.update(f.world,f.save,0);await flush();f.requests[0].resolve();await flush();
    f.progress={ready:4,total:6};assert.equal(f.gate.update(f.world,f.save,1),true);
    f.progress={ready:6,total:6};assert.equal(f.gate.update(f.world,f.save,2),false);
});
test('earth entry stays blocked until the visible ground has finished baking',async()=>{
    const f=fixture();f.world.isEarth=true;
    assert.equal(f.gate.update(f.world,f.save,0),true);await flush();f.requests[0].resolve();await flush();
    f.progress={ready:4,total:32};assert.equal(f.gate.update(f.world,f.save,1),true);assert.equal(f.ends,0);
    assert.equal(f.views.at(-1).ready,4);
    f.progress={ready:32,total:32};assert.equal(f.gate.update(f.world,f.save,2),false);assert.equal(f.ends,1);
    f.progress={ready:4,total:32};assert.equal(f.gate.update(f.world,f.save,3),false);
});
test('timeout keeps movement blocked and retry ignores the old resource response',async()=>{
    const f=fixture();f.gate.update(f.world,f.save,0);await flush();
    assert.equal(f.gate.update(f.world,f.save,101),true);assert.equal(f.views.at(-1).phase,'error');
    f.gate.retry();f.gate.update(f.world,f.save,102);await flush();f.requests[0].resolve();await flush();
    f.gate.update(f.world,f.save,103);assert.equal(f.prepared,0);
    f.requests[1].resolve();await flush();f.progress={ready:4,total:4};assert.equal(f.gate.update(f.world,f.save,104),false);
});
test('resource failure remains blocked with an explicit error',async()=>{
    const f=fixture();f.gate.update(f.world,f.save,0);await flush();f.requests[0].reject(Error('network'));await flush();
    assert.equal(f.gate.update(f.world,f.save,1),true);assert.equal(f.views.at(-1).phase,'error');assert.equal(f.ends,0);
});

test('late resources and terrain automatically finish after the timeout without manual retry',async()=>{
 const f=fixture();f.gate.update(f.world,f.save,0);await flush();
 assert.equal(f.gate.update(f.world,f.save,101),true);
 f.requests[0].resolve();await flush();f.progress={ready:3,total:4};
 assert.equal(f.gate.update(f.world,f.save,102),true);assert.equal(f.ends,0);
 f.progress={ready:4,total:4};assert.equal(f.gate.update(f.world,f.save,103),false);
 assert.equal(f.ends,1);assert.equal(f.starts,1);assert.equal(f.gate.active,false);
});
test('scene/character changes and cancellation cannot be unlocked by stale work',async()=>{
    const f=fixture();f.gate.update(f.world,f.save,0);await flush();const next={layout:{}};
    f.gate.update(next,f.save,1);await flush();f.requests[0].resolve();await flush();f.gate.update(next,f.save,2);assert.equal(f.prepared,0);
    f.gate.cancel();f.requests[1].resolve();await flush();assert.equal(f.gate.active,false);assert.equal(f.ends,0);
    f.gate.update(next,{},3);assert.equal(f.starts,3);
});
test('battle, title and city dungeons do not enter the island gate',()=>{
    const f=fixture();for(const world of [null,{}, {layout:{},isCityDungeon:true}])assert.equal(f.gate.update(world,f.save,0),false);
    assert.equal(f.gate.update(f.world,f.save,0,false),false);assert.equal(f.starts,0);
});
test('returning from battle to the same warm world does not block again',async()=>{
    const f=fixture();f.gate.update(f.world,f.save,0);await flush();f.requests[0].resolve();await flush();f.progress={ready:4,total:4};f.gate.update(f.world,f.save,1);
    f.gate.update(f.world,f.save,2,false);assert.equal(f.gate.update(f.world,f.save,3),false);assert.equal(f.starts,1);
});

import { createWorldInteractionController } from '../js/adventure/world_interaction_controller.js';

test('the real app frame skips gamepad, movement and scene drawing while entry is blocked',()=>{
    const originalDoc=globalThis.document,originalRaf=globalThis.requestAnimationFrame;
    const forbidden=()=>assert.fail('world work ran behind loading');
    let lastFrame=0,lastCare=0;
    const social={step:forbidden},pet={step:forbidden},save={position:{x:1,y:2}};
    globalThis.document={hidden:false,body:{append(){}}};
    globalThis.requestAnimationFrame=()=>{};
    try{
        const ctrl=createWorldInteractionController({
            nodes:{},
            getContext:()=>({
                stage:'world',panel:null,dialog:null,keys:new Set(),joystick:{x:0,y:0},heldPointer:null,
                world:{},save,renderer:{render:forbidden,pauseFrameMeter(){}},
                setLastFrame:v=>{lastFrame=v;},
                setLastCare:v=>{lastCare=v;},
            }),
            heroNavigation:{cancel(){}},
            localPlay:()=>({paused:false,pollInput:forbidden}),
            wordLearning:{wordPractice:{active:false}},
            islandSocial:()=>social,
            petScene:()=>pet,
            sceneLoading:{update:()=>true},
            adaptiveGraphics:{suspend(){}},
            perf:{enabled:false,frame(){}},
        });
        ctrl.frame(5000);
        assert.equal(lastFrame,5000);assert.equal(lastCare,5000);assert.equal(pet.lastFrame,5000);
        assert.equal(save.position.x,1);assert.equal(save.position.y,2);
    }finally{globalThis.document=originalDoc;globalThis.requestAnimationFrame=originalRaf;}
});

 test('returning from a home with released terrain prepares the same world again',async()=>{
    const f=fixture();f.gate.update(f.world,f.save,0);await flush();f.requests[0].resolve();await flush();
    f.progress={ready:4,total:4};assert.equal(f.gate.update(f.world,f.save,1),false);
    f.gate.invalidate();f.progress={ready:0,total:4};
    assert.equal(f.gate.update(f.world,f.save,2,false),false);
    assert.equal(f.gate.update(f.world,f.save,3),true);await flush();
    assert.equal(f.requests.length,2);f.requests[1].resolve();await flush();
    assert.equal(f.gate.update(f.world,f.save,4),true);
    f.progress={ready:4,total:4};assert.equal(f.gate.update(f.world,f.save,5),false);
 });
