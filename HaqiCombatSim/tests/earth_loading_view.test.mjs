import test from 'node:test';
import assert from 'node:assert/strict';
import {createEarthController} from '../js/adventure/earth_controller.js';

function fixture(service){
    const states=[];let entered=0;
    const state={save:{zone:'earth'},roleStore:{catalog:{activeId:'one'}},assets:{content:{}},world:{}};
    const controller=createEarthController({
        nodes:{overlay:{}},
        getContext:()=>state,
        toast(){},
        enterWorld:async()=>entered++,
        showTitle(){},
        showTeleportEffect(){},
        islandSocial:()=>({refreshEarth(){}}),
        showEarthSceneLoadingFn:(loadingState,actions)=>states.push({state:loadingState,actions}),
        getEarthFn:()=>service,
        earthPlacesClient:{visit:async()=>{}},
    });
    return {controller,states,state,get entered(){return entered;},run:()=>controller.travelEarth({lon:114,lat:22})};
}
test('earth travel forwards preparation progress to the shared loading view before entry',async()=>{
    const f=fixture({prepare:async(_geo,{onProgress})=>{onProgress({done:5,total:6,message:'正在准备地图显示…'});return {position:{x:1,y:2},world:{}};}});
    await f.run();assert.equal(f.states[0].state.phase,'assets');assert.equal(f.states[1].state.phase,'map');assert.equal(f.states[1].state.done,5);assert.equal(f.entered,1);
});
test('earth preparation failure keeps the shared window retryable',async()=>{
    const f=fixture({prepare:async()=>{throw Error('网络失败');}});await f.run();
    assert.equal(f.states.at(-1).state.phase,'error');assert.equal(f.states.at(-1).state.message,'网络失败');assert.equal(typeof f.states[0].actions.retry,'function');assert.equal(f.entered,0);
});
test('cancelling while the earth service loads prevents a late preparation request',async()=>{
    let resolve;const service=new Promise(r=>resolve=r),f=fixture(service);const pending=f.run();f.controller.closeAll();
    resolve({prepare:()=>assert.fail('cancelled travel prepared a scene')});await pending;assert.equal(f.entered,0);
});

test('earth travel accepts one destination at a time and allows another after arrival',async()=>{
    const prepared=[],arrivals=[];let finish;
    const f=fixture({prepare:geo=>{prepared.push(geo);return new Promise(resolve=>{finish=()=>{arrivals.push(geo);resolve({position:{x:geo.lon,y:geo.lat},world:{}});};});}});
    const first=f.controller.travelEarth({id:'one',name:'第一站',lon:114,lat:22});await Promise.resolve();
    await f.controller.travelEarth({id:'two',name:'第二站',lon:121,lat:31});
    assert.equal(prepared.length,1);finish();await first;
    assert.deepEqual(f.state.save.position,{x:114,y:22});
    const next=f.controller.travelEarth({id:'two',name:'第二站',lon:121,lat:31});await Promise.resolve();finish();await next;
    assert.deepEqual(arrivals.map(geo=>geo.id),['one','two']);assert.deepEqual(f.state.save.position,{x:121,y:31});assert.equal(f.entered,2);
});

for(const reset of ['closeAll','resetSession'])test(`${reset} lets the next destination arrive without a late previous destination overwriting it`,async()=>{
    const pending=new Map();
    const f=fixture({prepare:geo=>new Promise(resolve=>pending.set(geo.id,()=>resolve({position:{x:geo.lon,y:geo.lat},world:{id:geo.id}})))});
    const old=f.controller.travelEarth({id:'old',lon:114,lat:22});await Promise.resolve();f.controller[reset]();
    const current=f.controller.travelEarth({id:'current',lon:121,lat:31});await Promise.resolve();
    pending.get('current')();await current;pending.get('old')();await old;
    assert.equal(f.entered,1);assert.deepEqual(f.state.save.position,{x:121,y:31});assert.equal(f.state.assets.content.earthWorld.id,'current');
});
