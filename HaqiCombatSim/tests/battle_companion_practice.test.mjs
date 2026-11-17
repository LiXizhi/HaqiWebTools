import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createCompanionPractice,selectCompanionPractice,castCompanionPractice} from '../js/companion_practice_core.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));

test('practice requires selecting a recovery card and its legal partner target',()=>{
 const s=createCompanionPractice(dataset),partner=s.arena.unitsById.companion,before=partner.hp;
 assert.equal(castCompanionPractice(s,'companion'),false);assert.equal(s.done,false);
 selectCompanionPractice(s,s.keys[0]);assert.equal(castCompanionPractice(s,'companion'),false);
 assert.equal(partner.hp,before);assert.equal(s.done,false);
 selectCompanionPractice(s,s.keys[1]);assert.equal(castCompanionPractice(s,'student'),false);
 assert.equal(castCompanionPractice(s,'companion'),true);
 assert.equal(partner.hp,partner.maxHp);assert.equal(s.recovered,80);
 const snapshot=JSON.stringify(s);assert.equal(castCompanionPractice(s,'companion'),false);assert.equal(selectCompanionPractice(s,s.keys[0]),false);assert.equal(JSON.stringify(s),snapshot);
});

test('all five starting schools have usable rehearsal cards and isolated health',()=>{
 const before=JSON.stringify(dataset);
 for(const school of ['fire','ice','storm','life','death']){
  const s=createCompanionPractice(dataset,{school,seed:42});
  assert.equal(s.arena.resolved.cards[s.keys[0]].spellSchool,school);
  selectCompanionPractice(s,s.keys[1]);assert.equal(castCompanionPractice(s,'companion'),true);
  const restarted=createCompanionPractice(dataset,{school,seed:42});assert.equal(restarted.done,false);assert.equal(restarted.arena.unitsById.companion.hp,restarted.arena.unitsById.companion.maxHp-80);
 }
 assert.equal(JSON.stringify(dataset),before);
});

import { createOpeningController } from '../js/adventure/opening_controller.js';

test('completion retries a failed save once and ignores closed or stale practice callbacks',()=>{
 for(const stale of [null,'closed','role','save']){
  let save={id:'original'},panel='companion-practice',roleEpoch=1;
  const session={save,epoch:1,lesson:{done:true}};
  let callbacks,writes=0,tracked=0,fail=true;
  const ctrl=createOpeningController({
   nodes:{overlay:{}},
   getContext:()=>({save,roleEpoch,panel,stage:'world',roleStorage:{},assets:{content:{}},setSave:next=>{save=next;},setStorageWarning:()=>{},setPanel:next=>{panel=next;}}),
   model:()=>({}),
   renderCompanionPractice:(_root,_model,_lesson,cb)=>{callbacks=cb;},
   safely:fn=>{try{return fn();}catch{return false;}},
   persistRewardFn:()=>{writes++;if(fail)throw Error('storage full');return {save:{id:'committed'}};},
   close:()=>{panel=null;ctrl.setCompanionPractice(null);},
   petScene:()=>({dialogue(){}}),
   queueCloudSave(){},
   paintHud(){},
   track:()=>tracked++,
  });
  ctrl.setCompanionPractice(session);
  ctrl.paintCompanionPractice();
  if(stale==='closed')panel=null;
  if(stale==='role')roleEpoch=2;
  if(stale==='save')save={id:'other'};
  callbacks.complete();
  if(stale){assert.equal(writes,0,stale);continue;}
  assert.equal(save.id,'original');assert.equal(ctrl.getCompanionPractice(),session);assert.equal(tracked,0);
  fail=false;callbacks.complete();callbacks.complete();
  assert.equal(writes,2);assert.equal(save.id,'committed');assert.equal(tracked,1);assert.equal(ctrl.getCompanionPractice(),null);
 }
});
