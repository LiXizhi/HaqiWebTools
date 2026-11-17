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
    return {controller,states,get entered(){return entered;},run:()=>controller.travelEarth({lon:114,lat:22})};
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
