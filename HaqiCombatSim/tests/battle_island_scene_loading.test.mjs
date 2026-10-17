import test from 'node:test';
import assert from 'node:assert/strict';
import {createIslandSceneLoading} from '../js/island_scene_loading.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const flush=()=>new Promise(setImmediate);
function fixture(){
    const requests=[],views=[];let prepared=0,starts=0,ends=0,hidden=0,progress={ready:0,total:4};
    const gate=createIslandSceneLoading({warm:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),prepare:()=>{prepared++;return progress;},show:state=>views.push(state),hide:()=>hidden++,onStart:()=>starts++,onReady:()=>ends++,timeout:100});
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
test('a changed viewport is evaluated before release',async()=>{
    const f=fixture();f.gate.update(f.world,f.save,0);await flush();f.requests[0].resolve();await flush();
    f.progress={ready:4,total:6};assert.equal(f.gate.update(f.world,f.save,1),true);
    f.progress={ready:6,total:6};assert.equal(f.gate.update(f.world,f.save,2),false);
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
test('scene/character changes and cancellation cannot be unlocked by stale work',async()=>{
    const f=fixture();f.gate.update(f.world,f.save,0);await flush();const next={layout:{}};
    f.gate.update(next,f.save,1);await flush();f.requests[0].resolve();await flush();f.gate.update(next,f.save,2);assert.equal(f.prepared,0);
    f.gate.cancel();f.requests[1].resolve();await flush();assert.equal(f.gate.active,false);assert.equal(f.ends,0);
    f.gate.update(next,{},3);assert.equal(f.starts,3);
});
test('battle, title, earth and city dungeons do not enter the island gate',()=>{
    const f=fixture();for(const world of [null,{}, {layout:{},isEarth:true},{layout:{},isCityDungeon:true}])assert.equal(f.gate.update(world,f.save,0),false);
    assert.equal(f.gate.update(f.world,f.save,0,false),false);assert.equal(f.starts,0);
});
test('returning from battle to the same warm world does not block again',async()=>{
    const f=fixture();f.gate.update(f.world,f.save,0);await flush();f.requests[0].resolve();await flush();f.progress={ready:4,total:4};f.gate.update(f.world,f.save,1);
    f.gate.update(f.world,f.save,2,false);assert.equal(f.gate.update(f.world,f.save,3),false);assert.equal(f.starts,1);
});

test('the real app frame skips gamepad, movement and scene drawing while entry is blocked',()=>{
    const source=readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
    const frame=source.slice(source.indexOf('function frame(now) {'),source.indexOf('// Opt-in, local diagnostics.'));
    const forbidden=()=>assert.fail('world work ran behind loading');
    const context=vm.createContext({wordPractice:{active:false},hanziAnimationActive:()=>false,stage:'world',document:{hidden:false},panel:null,dialog:null,keys:new Set(),joystick:{x:0,y:0},heldPointer:null,localPlay:{paused:false,pollInput:forbidden},hanziIsland:null,dictionary:null,perf:{enabled:false,frame(){}},world:{},save:{position:{x:1,y:2}},renderer:{render:forbidden,pauseFrameMeter(){}},sceneLoading:{update:()=>true},requestAnimationFrame(){},lastFrame:0,lastCare:0,islandSocial:{step:forbidden},petScene:{step:forbidden},adaptiveGraphics:{suspend(){}}});
    vm.runInContext(frame+'\nframe(5000);',context);
    assert.equal(context.lastFrame,5000);assert.equal(context.lastCare,5000);assert.equal(context.petScene.lastFrame,5000);
    assert.equal(context.save.position.x,1);assert.equal(context.save.position.y,2);
});
