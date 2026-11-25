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

import { createWorldInteractionController } from '../js/adventure/world_interaction_controller.js';
import { createInputBindings } from '../js/adventure/input_bindings.js';

function inputNavigationHarness(t){
    const h=harness(),originalDocument=globalThis.document,originalWindow=globalThis.window;
    globalThis.document=Object.assign(new EventTarget(),{hidden:false});
    globalThis.window=new EventTarget();
    t.after(()=>{h.nav.dispose();globalThis.document=originalDocument;globalThis.window=originalWindow;});
    const state={world:h.world,save:{position:{x:0,y:0}},roleEpoch:1,roleStore:{owner:'guest',catalog:{activeId:'a'}},path:[],keys:new Set(),joystick:{x:0,y:0},heldPointer:null,stage:'world',panel:null,dialog:null,encounterStarting:false,characterChat:{active:false},secondCharacterChat:null,
        setPath(next){this.path=next;},clearMovementPath(){this.path=[];this.destination=null;},setHeldPointer(next){this.heldPointer=next;},setTalkApproach(next){this.talkApproach=next;}};
    const surface=Object.assign(new EventTarget(),{focus(){},getBoundingClientRect:()=>({left:0,top:0}),setPointerCapture(){},hasPointerCapture:()=>false});
    const ctrl=createWorldInteractionController({nodes:{world:surface},getContext:()=>state,heroNavigation:h.nav,languageAdventure:{active:false,close(){}},localPlay:()=>({paused:false,key:()=>false}),framePacer:{wake(){}},sceneLoading:{active:false},sceneFishing:{key:()=>false}});
    ctrl.bindEvents();
    const dispatch=(target,type,properties)=>{const event=new Event(type,{cancelable:true});Object.assign(event,properties);target.dispatchEvent(event);};
    return {...h,state,ctrl,surface,dispatch};
}

for(const input of ['gamepad tap','keyboard tap','desktop pointer down','desktop pointer cancellation']){
    test(`actual ${input} permanently cancels an older worker route before the hero moves`,t=>{
        const h=inputNavigationHarness(t),destination={x:300,y:0};
        h.ctrl.requestHeroPath(destination);
        const pending=h.messages.at(-1);
        assert.equal(pending.type,'hero-path');
        if(input==='gamepad tap'){
            h.ctrl.controllerAction('right',true);h.ctrl.controllerAction('right',false);
        }else if(input==='keyboard tap'){
            h.dispatch(window,'keydown',{key:'d'});h.dispatch(window,'keyup',{key:'d'});
        }else{
            const pointer={pointerType:'mouse',pointerId:1,button:0,clientX:300,clientY:100};
            h.dispatch(h.surface,'pointerdown',pointer);
            assert.equal(h.state.heldPointer.active,false);
            if(input==='desktop pointer cancellation')h.dispatch(h.surface,'pointercancel',pointer);
        }
        assert.deepEqual(h.state.save.position,{x:0,y:0});
        assert.equal(h.state.keys.size,0);
        h.reply(pending,[destination]);
        assert.deepEqual(h.state.path,[],'old worker route must not revive after a new input intent');
        if(h.state.heldPointer)h.dispatch(h.surface,'pointercancel',{pointerId:1});
        const next={x:400,y:0};h.ctrl.requestHeroPath(next);h.reply(h.messages.at(-1),[next]);
        assert.deepEqual(h.state.path,[next],'a fresh route still works after manual cancellation');
    });
}

test('second-player mouse routing leaves the main hero pending worker route intact',t=>{
    const h=inputNavigationHarness(t),surface=Object.assign(new EventTarget(),{focus(){}});
    let routed=0;
    const input=createInputBindings({nodes:{world:surface},getContext:()=>h.state,
        heroNavigation:h.nav,framePacer:{wake(){}},localPlay:()=>({active:true,mouseOwner:1}),
        clickWorld:()=>{routed++;},languageAdventure:{active:false}});
    input.bindEvents();
    const destination={x:300,y:0};h.ctrl.requestHeroPath(destination);const pending=h.messages.at(-1);
    h.dispatch(surface,'pointerdown',{pointerType:'mouse',pointerId:1,button:0,clientX:300,clientY:100});
    assert.equal(routed,1);assert.equal(h.state.heldPointer,null);
    h.reply(pending,[destination]);assert.deepEqual(h.state.path,[destination]);
});

for(const scenario of ['ground','unhandled ground','memory node','social interception','main hero social interception']){
    test(`actual scene click preserves pointer ownership: ${scenario}`,t=>{
        const h=inputNavigationHarness(t),calls=[],mainHero=scenario.startsWith('main hero');
        const p={x:200,y:100},destination={x:300,y:0};
        Object.assign(h.world,{npcs:[],encounters:[],portal:{x:900,y:900},memoryNodes:scenario==='memory node'?[{...p,id:'memory-a'}]:[]});
        // Projection and local-play routing are boundary fixtures; clickWorld and worker navigation are real.
        Object.assign(h.state,{renderer:{screenToWorld:(x,y)=>({x,y})},bumpFishingLoadEpoch(){},setDestination(next){this.destination=next;}});
        const clear=h.state.clearMovementPath;
        h.state.clearMovementPath=function(){calls.push('clear');clear.call(this);};
        const lp={active:true,mouseOwner:mainHero?0:1,paused:false,
            interceptSocial(point){assert.deepEqual(point,p);calls.push('social');return scenario.includes('social interception');},
            routePointer(point){assert.deepEqual(point,p);calls.push('route');return scenario!=='unhandled ground';},
            collectClick(){calls.push('collect');return true;}};
        const ctrl=createWorldInteractionController({nodes:{world:h.surface},getContext:()=>h.state,heroNavigation:h.nav,localPlay:()=>lp,
            languageAdventure:{active:false},framePacer:{wake(){}},close:()=>calls.push('close'),onMovementIntent:()=>calls.push('walk')});
        ctrl.requestHeroPath(destination);const pending=h.messages.at(-1),messageCount=h.messages.length;
        const existing=[{x:50,y:0}];h.state.path=existing;
        ctrl.clickWorld(p.x,p.y);
        if(mainHero){
            assert.deepEqual(calls,['social','clear']);
            h.reply(pending,[destination]);assert.deepEqual(h.state.path,[]);
        }else{
            assert.deepEqual(calls,scenario==='social interception'?['social']:['social','route']);
            assert.equal(h.messages.length,messageCount,'second-player memory nodes must not start a main-hero route');
            assert.equal(h.state.path,existing,'second-player clicks must not clear the main-hero path');
            h.reply(pending,[destination]);assert.deepEqual(h.state.path,[destination]);
        }
    });
}

test('actual controller accepts a delayed route after a same-role pet save commit',()=>{
 const h=harness();
 let world=h.world,save={position:{x:0,y:0},inventory:{100:50}},roleEpoch=1,roleStore={owner:'guest',catalog:{activeId:'a'}},path=[],keys=new Set(),joystick={x:0,y:0},heldPointer=null,stage='world',panel=null,dialog=null,encounterStarting=false;
 const originalDoc=globalThis.document;
 globalThis.document={hidden:false};
 try{
  const ctrl=createWorldInteractionController({
   nodes:{},
   getContext:()=>({world,save,roleEpoch,roleStore,path,keys,joystick,heldPointer,stage,panel,dialog,encounterStarting,characterChat:{active:false},secondCharacterChat:null,setPath:next=>{path=next;}}),
   heroNavigation:h.nav,
   languageAdventure:{active:false},
   localPlay:()=>({paused:false}),
  });
  ctrl.requestHeroPath({x:300,y:0});
  const request=h.messages.at(-1);
  save={...save,inventory:{100:50},petWorld:{lastPrune:1}};
  h.reply(request,[{x:300,y:0}]);
  assert.equal(path.length,1,'a background pet commit must not silently discard the pending route');
  assert.equal(path[0].x,300);h.nav.dispose();
 }finally{globalThis.document=originalDoc;}
});

test('the actual adventure controller invalidates paths on manual input, battle, island and role switches',()=>{
    const originalDoc=globalThis.document;
    globalThis.document={hidden:false};
    try{
        for(const change of [c=>c.keys.add('right'),c=>c.joystick.x=1,c=>c.heldPointer={active:true},c=>c.stage='battle',c=>c.encounterStarting=true,c=>c.world={zone:'town'},c=>c.save={position:{x:20,y:0}},c=>c.roleEpoch++,c=>c.roleStore.owner='other-account',c=>c.roleStore.catalog.activeId='other',c=>globalThis.document.hidden=true]){
            globalThis.document.hidden=false;
            let request,cancels=0;
            const c={world:{zone:'camp'},save:{position:{x:0,y:0}},roleEpoch:1,roleStore:{owner:'guest',catalog:{activeId:'a'}},path:[],keys:new Set(),joystick:{x:0,y:0},heldPointer:null,stage:'world',panel:null,dialog:null,encounterStarting:false};
            const ctrl=createWorldInteractionController({
                nodes:{},
                getContext:()=>({...c,characterChat:{active:false},secondCharacterChat:null,setPath:next=>{c.path=next;}}),
                heroNavigation:{cancel(){cancels++;},request(world,from,to,options){request=options;}},
                languageAdventure:{active:false},
                localPlay:()=>({paused:false}),
            });
            ctrl.requestHeroPath({x:300,y:0});
            assert.equal(cancels,1);assert.equal(request.isLive(),true);change(c);assert.equal(request.isLive(),false);
        }
    }finally{globalThis.document=originalDoc;}
});
