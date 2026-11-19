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
 let stored,writes=0,cloud=0,fail=false,worldFail=false,menu,retry;
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
  renderTacticsChallengesView:(_node,_save,actions,preset)=>{menu=actions;retry=preset;},
  getContext:()=>ctx,
  close:()=>{ctx.panel=null;},
  openPanel:kind=>{ctx.panel=kind;},
  enterWorld:async()=>{if(worldFail)throw Error('world unavailable');ctx.stage='world';},
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
  menu:()=>menu,retry:()=>retry,
  failWorld:v=>{worldFail=v;},
  fail:v=>{fail=v;},stored:()=>stored,writes:()=>writes,cloud:()=>cloud};
}

test('NPC entry directly opens normal two-sided combat without a theory panel or role encounter',()=>{
 const h=harness(),before=JSON.stringify(h.ctx.save);h.open({lesson:'focus'});
 assert.equal(h.ctx.stage,'battle');assert.equal(h.ctx.panel,null);assert.equal(h.ctx.battle.tacticsField.id,'focus');
 assert.equal(h.ctx.battle.sides.near.length,2);assert.equal(h.ctx.battle.sides.far.length,2);
 assert.equal(JSON.stringify(h.ctx.save),before);assert.equal(h.ctx.nodes.hud.hidden,true);
 const current=h.state();h.open({lesson:'guard'});assert.equal(h.state(),current);
});

test('actual victory saves once and preserves character resources',async()=>{
 const h=harness(),initial=structuredClone(h.ctx.save);h.open({lesson:'focus'});h.win();await h.finish();await h.finish();
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
  const h=harness(),before=JSON.stringify(h.ctx.save);h.open({lesson:'focus'});
  if(lost){h.ctx.battle.finished=true;h.ctx.battle.winner='far';}
  await h.finish();assert.equal(h.ctx.stage,'world');assert.equal(h.writes(),0);assert.equal(h.cloud(),0);
  assert.equal(JSON.stringify(h.ctx.save),before);
 }
});

test('continue changes monster group after victory and retry keeps the lost group',async()=>{
 const h=harness();h.open({lesson:'focus'});h.win();await h.finish({next:true});
 assert.equal(h.ctx.stage,'battle');assert.equal(h.ctx.battle.tacticsField.id,'break-shield');assert.equal(h.writes(),1);
 h.ctx.battle.finished=true;h.ctx.battle.winner='far';await h.finish({next:true});
 assert.equal(h.ctx.battle.tacticsField.id,'break-shield');assert.equal(h.writes(),1);
});

test('stale role and pending formal encounter cannot receive practice progress',async()=>{
 const h=harness();h.open({lesson:'focus'});h.win();h.ctx.save=createAdventure(content,{school:'ice',seed:99});h.ctx.roleEpoch++;
 const before=JSON.stringify(h.ctx.save);await h.finish();assert.equal(JSON.stringify(h.ctx.save),before);assert.equal(h.writes(),0);
 const p=harness();p.ctx.save.pendingEncounter={};p.open();assert.equal(p.state(),null);assert.equal(p.ctx.stage,'world');
});

 test('formal challenge menu selects school and encounter without consuming resources',()=>{
 const h=harness(),before=JSON.stringify(h.ctx.save);h.open();
 assert.equal(h.ctx.panel,'tactics-challenges');assert.equal(h.ctx.stage,'world');
 h.menu().start('elite','ice','guard');assert.equal(h.ctx.battle.tacticsField.loadout,'guard');assert.equal(h.ctx.battle.tacticsField.id,'elite');
 assert.equal(h.ctx.battle.tacticsField.school,'ice');assert.equal(h.ctx.battle.sides.near.length,2);
 assert.equal(JSON.stringify(h.ctx.save),before);
 });
 test('challenge storage failure retries once and next challenge keeps borrowed school',async()=>{
 const h=harness();h.open({challenge:'normal',school:'ice'});h.win();const rounds=h.ctx.battle.completedDecisions;h.fail(true);
 await assert.rejects(h.finish(),/storage unavailable/);assert.equal(h.state().recorded,false);
 h.fail(false);await h.finish({next:true});assert.equal(h.writes(),1);
 assert.equal(h.ctx.save.tacticsChallenges.completed.normal.wins,1);
 assert.equal(h.ctx.save.tacticsChallenges.completed.normal.bestRounds,rounds);
 assert.equal(h.ctx.battle.tacticsField.id,'elite');assert.equal(h.ctx.battle.tacticsField.school,'ice');
 });

test('world return failure keeps receipt and allows retry without double rewards',async()=>{
 const h=harness();h.open({challenge:'normal',school:'ice'});h.win();h.failWorld(true);
 await assert.rejects(h.finish(),/world unavailable/);assert.equal(h.writes(),1);assert.equal(h.state().recorded,true);
 h.failWorld(false);await h.finish();assert.equal(h.writes(),1);assert.equal(h.ctx.stage,'world');assert.equal(h.state(),null);
});

test('retry preserves selected challenge loadout',async()=>{
 const h=harness();h.open({challenge:'boss',school:'death',loadout:'burst'});
 h.ctx.battle.finished=true;h.ctx.battle.winner='far';await h.finish({next:true});
 assert.equal(h.ctx.battle.tacticsField.loadout,'burst');assert.equal(h.ctx.battle.tacticsField.school,'death');assert.equal(h.ctx.battle.tacticsField.id,'boss');
});

test('challenge retries keep the deal, while clearing the same encounter changes its next deal',async()=>{
 const h=harness();
 const options={challenge:'normal',school:'ice'};
 h.open(options);
 const first=h.ctx.battle.rng.seed;
 assert.equal(first,h.ctx.save.seed);
 h.ctx.battle.finished=true;h.ctx.battle.winner='far';await h.finish({next:true});
 assert.equal(h.ctx.battle.rng.seed,first);
 h.win();await h.finish();h.open(options);
 const rematch=h.ctx.battle.rng.seed;
 assert.notEqual(rematch,first);
 assert.equal(h.state().create().rng.seed,rematch);
 await h.finish();h.open({challenge:'elite',school:'ice'});
 assert.equal(h.ctx.battle.rng.seed,first);
});

test('defeat allows a new loadout for the same challenge and keeps the borrowed school',async()=>{
 const h=harness();h.open({challenge:'elite',school:'death',loadout:'attack'});
 h.ctx.battle.finished=true;h.ctx.battle.winner='far';
 await h.finish({adjust:true});
 assert.equal(h.ctx.panel,'tactics-challenges');
 assert.deepEqual(h.retry(),{id:'elite',school:'death',loadout:'attack'});
 assert.equal(h.writes(),0);
 h.menu().start('elite','death','guard');
 assert.equal(h.ctx.battle.tacticsField.loadout,'guard');
 assert.equal(h.ctx.battle.tacticsField.id,'elite');
});

test('shared menu retains all original practice encounters',()=>{
 for(const id of ['focus','break-shield','guard','squad']){const h=harness();h.open();h.menu().lesson(id);assert.equal(h.ctx.battle.tacticsField.id,id);assert.ok(!h.ctx.battle.tacticsField.challenge);}
});
