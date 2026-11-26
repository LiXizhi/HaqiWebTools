import test from 'node:test';
import assert from 'node:assert/strict';
import {createPanelController} from '../js/adventure/panel_controller.js';

function harness(zone='camp'){
 const calls={walk:[],close:0,travel:[],actions:[],toasts:[]};
 const site={id:'camp-ember-herb-bed',forgeSite:true,x:400,y:500};
 const content={shopConfig:{categories:[]},items:{},quests:[],cardItems:{}};
 const ctx={stage:'world',panel:null,world:{zone,npcs:[],encounters:[],landmarks:[site]},
  save:{zone,inventory:{},cards:{},pets:{},questProgress:{},equipmentGuids:{}},
  assets:{content},equipmentView:{tab:'hunt',slot:0,page:0,query:''},strengtheningView:{},gemView:{},shopView:{},petView:{},
  setPanel:next=>{ctx.panel=next;},clearMovementPath:()=>{},setServiceNpc:()=>{}};
 let callbacks,travelResult=true;
 const ctrl=createPanelController({
  nodes:{hud:{},overlay:{querySelector:()=>null,querySelectorAll:()=>[]}},
  getContext:()=>ctx,model:()=>ctx,
  services:{navigation:{close:()=>{ctx.panel=null;calls.close++;}},
   feedback:{toast:value=>calls.toasts.push(value),safely:fn=>fn()},
   runtime:{gameSettings:{value:{}},adaptiveGraphics:{effects:()=>({})}}},
  bus:null,localPlay:()=>({active:false,openPersonal:()=>false,closeAll:()=>{},clearKeys:()=>{}}),
  islandSocial:()=>({state:()=>({})}),languageAdventure:{emit:()=>{}},languageTasks:{snapshot:()=>({rows:[]})},
  wordLearning:{},earth:{},opening:{},dungeon:{},roleCloud:{},spellSound:{play:()=>{}},refreshMembership:()=>{},
  travel:async next=>{calls.travel.push(next);return typeof travelResult==='function'?travelResult(next):travelResult;},
  walkTo:(...args)=>calls.walk.push(args),performAction:(...args)=>calls.actions.push(args),
  renderPanelFn:(_root,_kind,_model,cb)=>{callbacks=cb;},
 });
 ctrl.openPanel('equipment',{tab:'hunt'});
 calls.close=0;
 return {ctx,site,calls,get cb(){return callbacks;},setTravel:value=>{travelResult=value;}};
}

test('forge navigation closes the panel and walks to the actual camp site',async()=>{
 const h=harness();await h.cb.forgeTravel();
 assert.equal(h.calls.close,1);assert.deepEqual(h.calls.travel,[]);
 assert.deepEqual(h.calls.walk,[[{...h.site,kind:'landmark'},true]]);
});

test('a declined camp trip leaves the current panel and movement alone',async()=>{
 const h=harness('forest');h.setTravel(false);await h.cb.forgeTravel();
 assert.deepEqual(h.calls.travel,['camp']);assert.equal(h.calls.close,0);assert.deepEqual(h.calls.walk,[]);
});

test('a completed trip resolves the current camp site after travel',async()=>{
 const h=harness('forest');const destination={...h.site,x:900};
 h.setTravel(()=>{h.ctx.save.zone='camp';h.ctx.world={zone:'camp',landmarks:[destination]};return true;});
 await h.cb.forgeTravel();assert.equal(h.calls.close,1);
 assert.deepEqual(h.calls.walk,[[{...destination,kind:'landmark'},true]]);
});

test('role changes, pending encounters and missing sites prevent stale navigation',async()=>{
 for(const kind of ['role','battle','missing']){
  const h=harness('forest');h.setTravel(()=>{
   h.ctx.save.zone='camp';
   if(kind==='role')h.ctx.save={...h.ctx.save};
   if(kind==='battle')h.ctx.save.pendingEncounter={id:'active'};
   if(kind==='missing')h.ctx.world.landmarks=[];
   return true;
  });
  await h.cb.forgeTravel();assert.equal(h.calls.close,0);assert.deepEqual(h.calls.walk,[]);
  assert.equal(h.calls.toasts.length,kind==='missing'?1:0);
 }
});

test('commission actions use current world access rather than coordinates from the button',()=>{
 const h=harness();h.cb.forgeCommission({step:'gather',choice:'herb',language:'en',now:0,forgeTarget:{x:0,y:0}});
 const [action,access]=h.calls.actions[0];
 assert.equal(action.type,'forge-commission');assert.ok(action.now>0);
 assert.deepEqual(access,{forgeTarget:{...h.site,kind:'landmark'}});
});
