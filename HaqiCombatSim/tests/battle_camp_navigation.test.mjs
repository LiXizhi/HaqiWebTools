import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createIslandHeroNavigation} from '../js/island_hero_navigation.js';
function harness({available=true,direct=false}={}){
    const messages=[],scheduled=new Map(),timers=new Map(),results=[];let serial=0,clock=0,live=true;
    const worker={postMessage:data=>messages.push(data),terminate(){this.terminated=true;}},world={zone:'camp',layout:{},paths:[],trees:[],buildings:[]};
    const from={x:0,y:0},to={x:100,y:0};
    const nav=createIslandHeroNavigation({workerFactory:available?()=>worker:null,clear:()=>direct,steps:function*(){for(let i=0;i<30;i++)yield;return [to];},now:()=>clock++,schedule:fn=>{scheduled.set(++serial,fn);return serial;},cancelSchedule:id=>scheduled.delete(id),setTimer:fn=>{timers.set(++serial,fn);return serial;},clearTimer:id=>timers.delete(id)});
    const request=(target=to)=>nav.request(world,from,target,{roleId:'role-a',isLive:()=>live,onResult:path=>results.push(path)});
    return {nav,world,from,to,worker,messages,scheduled,timers,results,request,leave:()=>{live=false;},reply:(message,path=[to])=>worker.onmessage({data:{id:message.id,sceneVersion:message.sceneVersion,path}}),drain(){while(scheduled.size){const [id,fn]=scheduled.entries().next().value;scheduled.delete(id);fn();}}};
}
test('straight hero requests resolve immediately without creating a worker',()=>{const h=harness({direct:true});h.request();assert.deepEqual(h.results,[[h.to]]);assert.equal(h.messages.length,0);});
test('only the latest request can apply; role/scene/geometry changes invalidate responses',()=>{
    for(const action of ['click','cancel','role','geometry']){
        const h=harness();h.request();const first=h.messages.at(-1);assert.equal(first.type,'hero-path');assert.equal(first.roleId,'role-a');
        if(action==='click')h.request({x:200,y:0});if(action==='cancel')h.nav.cancel();if(action==='role')h.leave();if(action==='geometry')h.world.trees=[];
        h.reply(first);assert.deepEqual(h.results,[]);
        if(action==='click'){const latest=h.messages.filter(m=>m.type==='hero-path').at(-1);h.reply(latest,[{x:200,y:0}]);assert.deepEqual(h.results,[[{x:200,y:0}]]);}
        h.nav.dispose();assert.equal(h.timers.size,0);
    }
});
test('missing, failed and timed-out workers use cancellable short fallback slices',()=>{
    for(const mode of ['missing','failed','timeout']){
        const h=harness({available:mode!=='missing'});h.request();
        if(mode==='failed')h.worker.onerror();if(mode==='timeout')[...h.timers.values()][0]();
        assert.deepEqual(h.results,[]);assert.ok(h.scheduled.size);h.drain();assert.deepEqual(h.results,[[h.to]]);assert.equal(h.nav.stats().pending,false);
        h.request();h.nav.cancel();h.drain();assert.equal(h.results.length,1);h.nav.dispose();
    }
});
test('late worker replies cannot race an active fallback or disposed scene',()=>{const h=harness();h.request();const first=h.messages.at(-1);h.worker.onerror();h.nav.dispose();h.reply(first);h.drain();assert.deepEqual(h.results,[]);assert.equal(h.scheduled.size,0);});

test('the actual adventure controller invalidates paths on manual input, battle, island and role switches',()=>{
    const source=fs.readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
    const start=source.indexOf('function requestHeroPath('),script=source.slice(start,source.indexOf('\nfunction walkTo(',start));
    for(const change of [c=>c.keys.add('right'),c=>c.joystick.x=1,c=>c.heldPointer={active:true},c=>c.stage='battle',c=>c.encounterStarting=true,c=>c.world={zone:'town'},c=>c.save={position:{x:0,y:0}},c=>c.roleStore.catalog.activeId='other',c=>c.document.hidden=true]){
        let request,cancels=0;
        const c=vm.createContext({world:{zone:'camp'},save:{position:{x:0,y:0}},roleStore:{catalog:{activeId:'a'}},path:[],keys:new Set(),joystick:{x:0,y:0},heldPointer:null,stage:'world',panel:null,dialog:null,encounterStarting:false,languageAdventure:{},characterChat:{},secondCharacterChat:null,localPlay:{paused:false},document:{hidden:false},W:{distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)},heroNavigation:{cancel(){cancels++;},request(world,from,to,options){request=options;}}});
        vm.runInContext(script+';requestHeroPath({x:300,y:0});',c);
        assert.equal(cancels,1);assert.equal(request.isLive(),true);change(c);assert.equal(request.isLive(),false);
    }
});
