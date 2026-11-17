import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createAdventure,parseSave} from '../js/adventure_core.js';
import {SimpleBot} from '../js/combat_policy_core.js';
import {playTacticsFieldRound} from '../js/tactics_field_battle_core.js';
import {createOpeningController} from '../js/adventure/opening_controller.js';

const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {content,dataset}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));

function harness(){
 let stored,writes=0,cloud=0,fail=false;
 const ctx={
  stage:'world',panel:null,roleEpoch:1,save:createAdventure(content,{school:'fire',seed:23}),
  assets:{content,dataset},roleStorage:{},path:[],destination:null,nodes:{hud:{}},battle:null,
  selected:null,discarded:[],animation:null,petCardsOpen:false,runeCardsOpen:false,
  setSave:next=>{ctx.save=next;},
  setPanel:next=>{ctx.panel=next;},
  setBattle:next=>{ctx.battle=next;},
  setStage:next=>{ctx.stage=next;},
  setSelected:next=>{ctx.selected=next;},
  setDiscarded:next=>{ctx.discarded=next;},
  setAnimation:next=>{ctx.animation=next;},
  setPetCardsOpen:next=>{ctx.petCardsOpen=next;},
  setRuneCardsOpen:next=>{ctx.runeCardsOpen=next;},
  clearMovementInput:()=>{ctx.path=[];ctx.destination=null;},
 };
 const opening=createOpeningController({
  nodes:ctx.nodes,
  getContext:()=>ctx,
  close:()=>{ctx.panel=null;},
  openPanel:kind=>{ctx.panel=kind;},
  enterWorld:async()=>{ctx.stage='world';},
  saveLocal:next=>{if(fail)throw Error('storage unavailable');stored=JSON.stringify(next);writes++;},
  queueCloudSave:()=>cloud++,
  paintBattle(){},
  stopBattleChatVoice(){},
 });
 const state=()=>opening.getTacticsPractice();
 function win(){
  for(let i=0;i<40&&!ctx.battle.finished;i++){
   const result=playTacticsFieldRound({...state(),battle:ctx.battle},{...new SimpleBot().pick(ctx.battle,ctx.battle.sides.near[0]),aiVersion:1});
   assert.equal(result.error,null);ctx.battle=result.battle;
  }
  assert.equal(ctx.battle.winner,'near');
 }
 return {ctx,state,win,open:options=>opening.openTacticsTraining(options),finish:options=>opening.finishTacticsFight(options),
  fail:v=>{fail=v;},stored:()=>stored,writes:()=>writes,cloud:()=>cloud};
}

test('NPC entry directly opens normal two-sided combat without a theory panel or role encounter',()=>{
 const h=harness(),before=JSON.stringify(h.ctx.save);h.open();
 assert.equal(h.ctx.stage,'battle');assert.equal(h.ctx.panel,null);assert.equal(h.ctx.battle.tacticsField.id,'focus');
 assert.equal(h.ctx.battle.sides.near.length,2);assert.equal(h.ctx.battle.sides.far.length,2);
 assert.equal(JSON.stringify(h.ctx.save),before);assert.equal(h.ctx.nodes.hud.hidden,true);
 const current=h.state();h.open({lesson:'guard'});assert.equal(h.state(),current);
});

test('actual victory saves once and preserves character resources',async()=>{
 const h=harness(),initial=structuredClone(h.ctx.save);h.open();h.win();await h.finish();await h.finish();
 assert.equal(h.writes(),1);assert.equal(h.cloud(),1);assert.equal(h.ctx.stage,'world');
 const saved=parseSave(h.stored(),content);
 assert.equal(saved.tacticsTraining.completed.focus.fieldWins,1);assert.equal(saved.revision,initial.revision+1);
 for(const key of ['inventory','hp','seed','currency'])assert.deepEqual(saved[key],initial[key]);
});

test('failed storage retains the completed fight and retries before leaving',async()=>{
 const h=harness(),before=JSON.stringify(h.ctx.save);h.open({lesson:'guard',returnTo:'forest-commission'});h.win();h.fail(true);
 await assert.rejects(h.finish(),/storage unavailable/);
 assert.equal(h.ctx.stage,'battle');assert.equal(h.state().recorded,false);assert.equal(JSON.stringify(h.ctx.save),before);
 h.fail(false);await h.finish();await h.finish();
 assert.equal(h.writes(),1);assert.equal(h.cloud(),1);assert.equal(h.ctx.panel,'forest-commission');
 assert.equal(h.ctx.save.tacticsTraining.completed.guard.fieldWins,1);
});

test('retreat and defeat do not write a victory or consume character resources',async()=>{
 for(const lost of [false,true]){
  const h=harness(),before=JSON.stringify(h.ctx.save);h.open();
  if(lost){h.ctx.battle.finished=true;h.ctx.battle.winner='far';}
  await h.finish();assert.equal(h.ctx.stage,'world');assert.equal(h.writes(),0);assert.equal(h.cloud(),0);
  assert.equal(JSON.stringify(h.ctx.save),before);
 }
});

test('continue changes monster group after victory and retry keeps the lost group',async()=>{
 const h=harness();h.open();h.win();await h.finish({next:true});
 assert.equal(h.ctx.stage,'battle');assert.equal(h.ctx.battle.tacticsField.id,'break-shield');assert.equal(h.writes(),1);
 h.ctx.battle.finished=true;h.ctx.battle.winner='far';await h.finish({next:true});
 assert.equal(h.ctx.battle.tacticsField.id,'break-shield');assert.equal(h.writes(),1);
});

test('stale role and pending formal encounter cannot receive practice progress',async()=>{
 const h=harness();h.open();h.win();h.ctx.save=createAdventure(content,{school:'ice',seed:99});h.ctx.roleEpoch++;
 const before=JSON.stringify(h.ctx.save);await h.finish();assert.equal(JSON.stringify(h.ctx.save),before);assert.equal(h.writes(),0);
 const p=harness();p.ctx.save.pendingEncounter={};p.open();assert.equal(p.state(),null);assert.equal(p.ctx.stage,'world');
});
