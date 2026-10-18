import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
const travel=app.slice(app.indexOf('async function travelEarth(geo){'),app.indexOf('async function practiceEarth('));
function fixture(service){
    const states=[];let entered=0;
    const context=vm.createContext({save:{zone:'earth'},roleStore:{catalog:{activeId:'one'}},earthViewTicket:1,earthTraveling:false,earthView:{busy(){},error(){}},earthOwner:null,
        assets:{content:{}},dungeonFor:()=>null,toast(){},showEarthSceneLoading:(state,actions)=>states.push({state,actions}),getEarth:()=>service,
        enterWorld:async()=>entered++,showTitle(){},showTeleportEffect(){},W:{invalidateWorldObjects(){}},islandSocial:{},earthPlaces:{}});
    vm.runInContext(travel,context);
    return {context,states,get entered(){return entered;},run:()=>vm.runInContext('travelEarth({lon:114,lat:22})',context)};
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
    let resolve;const service=new Promise(r=>resolve=r),f=fixture(service);const pending=f.run();f.context.earthViewTicket++;
    resolve({prepare:()=>assert.fail('cancelled travel prepared a scene')});await pending;assert.equal(f.entered,0);
});
