import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createAdventure,parseSave} from '../js/adventure_core.js';
import {TACTICS_LESSONS,createTacticsTraining,trainingStep,selectTrainingCard,castTrainingCard,recordTacticsTraining} from '../js/tactics_training_core.js';

const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
const app=fs.readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('let tacticsPractice=null;'),app.indexOf('function openCompanionPractice(){'));

function harness(){
 let callbacks,stored,writes=0,cloud=0,fail=false;
 const errors=[];
 const ctx={structuredClone,TACTICS_LESSONS,createTacticsTraining,selectTrainingCard,castTrainingCard,recordTacticsTraining,
  stage:'world',panel:null,roleEpoch:1,save:createAdventure(content,{school:'fire',seed:23}),
  assets:{content,dataset},roleStorage:{},path:[],destination:null,nodes:{overlay:{}},
  safely:fn=>{try{return fn();}catch(error){errors.push(error);}},
  saveLocal:next=>{if(fail)throw Error('storage unavailable');stored=JSON.stringify(next);writes++;},
  queueCloudSave:()=>cloud++,paintHud:()=>{},spellSound:{play(){}},
  V:{renderTacticsTraining:(_root,_model,_lesson,cb)=>{callbacks=cb;}}};
 ctx.close=()=>{ctx.panel=null;};ctx.model=()=>({save:ctx.save,assets:ctx.assets});
 ctx.openPanel=kind=>{ctx.panel=kind;};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const state=()=>vm.runInContext('tacticsPractice',ctx);
 function finish(){
  while(!state().lesson.done){
   const step=trainingStep(state().lesson);callbacks.select(step.card);callbacks.target(step.target);
  }
 }
 return {ctx,errors,state,finish,open:options=>ctx.openTacticsTraining(options),cb:()=>callbacks,
  fail:v=>{fail=v;},stored:()=>stored,writes:()=>writes,cloud:()=>cloud};
}

test('a completed lesson persists once across stale final clicks, menu and close',()=>{
 const h=harness(),initial=structuredClone(h.ctx.save);h.open();h.cb().start('focus');h.finish();
 const done=h.cb();done.target('enemy');done.menu();done.close();
 assert.equal(h.writes(),1);assert.equal(h.cloud(),1);assert.equal(h.errors.length,0);
 const saved=parseSave(h.stored(),content);
 assert.equal(saved.tacticsTraining.completed.focus.runs,1);
 assert.equal(saved.revision,initial.revision+1);
 for(const key of ['inventory','hp','seed','currency'])assert.deepEqual(saved[key],initial[key]);
});

test('a failed write leaves role progress intact and menu retries the finished lesson once',()=>{
 const h=harness(),before=JSON.stringify(h.ctx.save);h.open();h.cb().start('guard');h.fail(true);h.finish();
 assert.equal(h.errors.length,1);assert.equal(h.state().lesson.done,true);
 assert.equal(JSON.stringify(h.ctx.save),before);assert.equal(h.writes(),0);assert.equal(h.cloud(),0);
 h.fail(false);h.cb().menu();assert.equal(h.writes(),1);assert.equal(h.cloud(),1);
 assert.equal(h.ctx.save.tacticsTraining.completed.guard.runs,1);
 h.cb().close();assert.equal(h.writes(),1);
});

test('failed completion cannot be discarded by the lesson close or restart buttons',()=>{
 const h=harness();h.open();h.cb().start('focus');h.fail(true);h.finish();
 const lesson=h.state().lesson;h.cb().close();h.cb().start('guard');
 assert.equal(h.ctx.panel,'tactics-training');assert.equal(h.state().lesson,lesson);
 assert.equal(h.ctx.save.tacticsTraining,undefined);
 h.fail(false);h.cb().start('guard');
 assert.equal(h.ctx.save.tacticsTraining.completed.focus.runs,1);
 assert.equal(h.state().lesson.lesson.id,'guard');
});

test('an unsaved completed lesson survives Escape and reopening for the same role',()=>{
 const h=harness();h.open();h.cb().start('guard');h.fail(true);h.finish();
 const lesson=h.state().lesson;h.ctx.close();h.open();
 assert.equal(h.state().lesson,lesson);assert.equal(h.ctx.panel,'tactics-training');
 h.fail(false);h.cb().menu();assert.equal(h.writes(),1);
 assert.equal(h.ctx.save.tacticsTraining.completed.guard.runs,1);
});

test('a different role cannot inherit an unsaved completed lesson',()=>{
 const h=harness();h.open();h.cb().start('focus');h.fail(true);h.finish();h.ctx.close();
 h.ctx.save=createAdventure(content,{school:'ice',seed:99});h.ctx.roleEpoch++;h.open();
 assert.equal(h.state().lesson,null);assert.equal(h.ctx.save.tacticsTraining,undefined);
});

test('callbacks from a previous role cannot train or save to the newly active role',()=>{
 const h=harness();h.open();h.cb().start('focus');const old=h.cb(),oldLesson=h.state().lesson;
 h.ctx.save=createAdventure(content,{school:'ice',seed:99});h.ctx.roleEpoch++;
 const before=JSON.stringify(h.ctx.save);
 old.select('Fire_FireDamageBlade');old.target('striker');old.menu();old.close();old.start('guard');
 assert.equal(oldLesson.actions.length,0);assert.equal(JSON.stringify(h.ctx.save),before);
 assert.equal(h.writes(),0);assert.equal(h.cloud(),0);
});

test('reopening the classroom invalidates callbacks from its previous session',()=>{
 const h=harness();h.open();h.cb().start('focus');const old=h.cb();
 h.open();h.cb().start('guard');const current=h.state().lesson;
 old.select('Fire_FireDamageBlade');old.target('striker');old.menu();old.close();old.start('focus');
 assert.equal(h.state().lesson,current);assert.equal(current.actions.length,0);assert.equal(h.writes(),0);
});

test('an unfinished encounter or a non-world screen cannot open borrowed-card training',()=>{
 for(const mode of ['pending','battle']){
  const h=harness();if(mode==='pending')h.ctx.save.pendingEncounter={};else h.ctx.stage='battle';
  const before=JSON.stringify(h.ctx.save);h.open();
  assert.equal(h.ctx.panel,null);assert.equal(h.state(),null);assert.equal(JSON.stringify(h.ctx.save),before);
 }
});

test('a forest clue opens its matching exercise and returns after saving exactly once',()=>{
 for(const lesson of TACTICS_LESSONS){
  const h=harness();h.open({lesson:lesson.id,returnTo:'forest-commission'});
  assert.equal(h.state().lesson.lesson.id,lesson.id);assert.equal(typeof h.cb().back,'function');
  h.finish();const old=h.cb();old.back();
  assert.equal(h.ctx.panel,'forest-commission');assert.equal(h.writes(),1);
  assert.equal(h.ctx.save.tacticsTraining.completed[lesson.id].runs,1);
  old.back();old.start('focus');assert.equal(h.writes(),1);assert.equal(h.ctx.panel,'forest-commission');
 }
});

test('forest return cannot discard an unsaved result, and retries before leaving',()=>{
 const h=harness();h.open({lesson:'guard',returnTo:'forest-commission'});h.fail(true);h.finish();
 const lesson=h.state().lesson;h.cb().back();
 assert.equal(h.ctx.panel,'tactics-training');assert.equal(h.state().lesson,lesson);assert.equal(h.writes(),0);
 h.fail(false);h.cb().back();assert.equal(h.ctx.panel,'forest-commission');assert.equal(h.writes(),1);
});

test('a requested exercise preserves a previous unsaved result and ignores event-like options',()=>{
 const h=harness();h.open();h.cb().start('focus');h.fail(true);h.finish();
 const completed=h.state().lesson;h.ctx.close();h.open({lesson:'guard',returnTo:'forest-commission'});
 assert.equal(h.state().lesson,completed);h.fail(false);h.cb().back();
 assert.equal(h.ctx.save.tacticsTraining.completed.focus.runs,1);
 h.open({type:'click',returnTo:'unexpected'});assert.equal(h.state().lesson,null);assert.equal(h.cb().back,null);
});
