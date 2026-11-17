import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as A from '../js/adventure_core.js';
import * as W from '../js/adventure_world_core.js';
import {persistReward} from '../js/adventure_reward_persistence.js';
import {forestCommissionPhase,FOREST_NPCS,FOREST_SITES,FOREST_PATROL_DUNGEON} from '../js/forest_commission_core.js';
import {createOpeningController} from '../js/adventure/opening_controller.js';

const read=file=>JSON.parse(fs.readFileSync(new URL('../data/'+file,import.meta.url)));
const content=read('adventure/chapter.json');
content.worldMaps={camp:read('adventure/maps/camp.json')};

function harness(){
 let callbacks,view,written,fail=false;
 const calls=[],errors=[];
 const ctx={
  save:A.createAdventure(content,{school:'fire',seed:23}),
  panel:'forest-commission',
  world:null,
 };
 ctx.world=W.createWorld('camp',content,ctx.save);
 const storage={getItem(){return written||null;},setItem(key,value){if(fail)throw Error('quota');if(!key.endsWith('.updated'))written=value;}};
 const ctrl=createOpeningController({
  nodes:{overlay:{}},
  getContext:()=>({save:ctx.save,world:ctx.world,panel:ctx.panel,assets:{content},roleStore:{catalog:{activeId:'r1'}},setPanel:next=>{ctx.panel=next;}}),
  model:()=>({save:ctx.save,assets:{content}}),
  close:()=>{ctx.panel=null;},
  openPanel:panel=>calls.push({panel}),
  onOpenTacticsTraining:options=>calls.push({training:options}),
  openJourney:id=>calls.push({journey:id}),
  walkTo:(target,interact)=>calls.push({walk:target,interact}),
  track:()=>calls.push({mainline:true}),
  toast:line=>calls.push({toast:line}),
  spellSound:{play(){}},
  renderForestCommissionView:(_root,model,cb)=>{view=model;callbacks=cb;},
  performAction:(action,access)=>{
   try{const result=persistReward(ctx.save,content,action,access,storage);ctx.save=result.save;ctrl.paintForestCommission();return result.result;}
   catch(error){errors.push(error);return false;}
  },
 });
 const paint=()=>{ctrl.paintForestCommission();return callbacks;};
 const arrive=()=>{const target=ctrl.forestTarget();assert.ok(target);ctx.save.position={x:target.x,y:target.y};return paint();};
 return {ctx,calls,errors,paint,arrive,cb:()=>callbacks,view:()=>view,stored:()=>written,fail:value=>{fail=value;}};
}

test('camp commission follows real scene targets through pickup, delivery and a retained route note',()=>{
 const h=harness();
 // An already-created camp must receive the new sites once, without rebuilding its NPCs.
 h.ctx.world.landmarks=h.ctx.world.landmarks.filter(row=>!row.forestSite);
 const npcs=h.ctx.world.npcs;h.paint();h.paint();
 assert.equal(h.ctx.world.npcs,npcs);
 for(const id of Object.values(FOREST_SITES))assert.equal(h.ctx.world.landmarks.filter(row=>row.id===id).length,1);
 h.cb().go();assert.equal(h.calls.at(-1).walk.id,FOREST_NPCS.giver);assert.equal(h.calls.at(-1).walk.forestCommission,true);
 h.arrive().action({step:'accept'});assert.equal(forestCommissionPhase(h.ctx.save),'boots');
 h.cb().go();assert.equal(h.calls.at(-1).walk.id,FOREST_SITES.boots);
 const before=JSON.stringify(h.ctx.save);assert.equal(h.cb().action({step:'take-boots',object:'boots'}),false);
 assert.equal(JSON.stringify(h.ctx.save),before,'a callback cannot pick up supplies from the previous NPC position');
 h.arrive().action({step:'take-boots',object:'boots'});assert.equal(forestCommissionPhase(h.ctx.save),'delivery');
 assert.equal(h.ctx.save.inventory[1260]||0,0,'carried boots are still a quest object');
 h.arrive().action({step:'deliver'});assert.equal(h.ctx.save.inventory[1260],1);assert.equal(forestCommissionPhase(h.ctx.save),'note');
 h.arrive().action({step:'take-note',revealed:true});assert.equal(forestCommissionPhase(h.ctx.save),'briefing');
 h.arrive().action({step:'brief'});assert.equal(forestCommissionPhase(h.ctx.save),'patrol');
 const restored=A.parseSave(h.stored(),content);assert.equal(forestCommissionPhase(restored),'patrol');
 h.ctx.save=restored;h.ctx.world=W.createWorld('camp',content,restored);h.paint();
 h.cb().training('focus');assert.equal(h.calls.at(-1).training.lesson,'focus');assert.equal(h.calls.at(-1).training.returnTo,'forest-commission');
 h.cb().mainline();assert.equal(h.calls.at(-1).mainline,true);
 h.cb().patrol();assert.equal(h.calls.at(-1).journey,FOREST_PATROL_DUNGEON);
 h.cb().nextChallenge();assert.equal(h.calls.at(-1).journey,'journey:lost-spark');
 assert.equal(h.errors.length,1,'only the deliberately distant pickup was rejected');
});

test('a failed delivery write preserves the carried object and retry grants the reward once',()=>{
 const h=harness();h.arrive().action({step:'accept'});h.arrive().action({step:'take-boots',object:'boots'});h.arrive();
 const before=JSON.stringify(h.ctx.save);h.fail(true);
 assert.equal(h.cb().action({step:'deliver'}),false);assert.equal(JSON.stringify(h.ctx.save),before);
 h.fail(false);h.cb().action({step:'deliver'});assert.equal(h.ctx.save.inventory[1260],1);
 const delivered=JSON.stringify(h.ctx.save);assert.equal(h.cb().action({step:'deliver'}),false);
 assert.equal(JSON.stringify(h.ctx.save),delivered);
 assert.equal(forestCommissionPhase(A.parseSave(h.stored(),content)),'note');
});

test('outside the camp the same saved quest offers return travel, and onboarding closes the panel',()=>{
 const h=harness();h.ctx.save.zone='earth';h.paint();assert.equal(h.view().nearby,false);
 h.cb().go();assert.equal(h.calls.at(-2).panel,'worldmap');assert.match(h.calls.at(-1).toast,/回营地/);
 h.ctx.save.zone='camp';h.ctx.save.openingJourney={version:1,phase:'offer'};h.paint();assert.equal(h.ctx.panel,null);
});
