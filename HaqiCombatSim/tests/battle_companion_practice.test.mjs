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

test('completion retries a failed save once and ignores closed or stale practice callbacks',()=>{
 const source=fs.readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
 const paint=source.slice(source.indexOf('function paintCompanionPractice('),source.indexOf('let encounterStarting='));
 for(const stale of [null,'closed','role','save']){
  const save={id:'original'},session={save,epoch:1,lesson:{done:true}};
  let callbacks,writes=0,tracked=0,fail=true;
  const context=vm.createContext({companionPractice:session,save,roleEpoch:1,panel:'companion-practice',stage:'world',roleStorage:{},assets:{content:{}},nodes:{overlay:{}},model:()=>({}),
   V:{renderCompanionPractice:(_root,_model,_lesson,cb)=>{callbacks=cb;}},safely:fn=>{try{return fn();}catch{return false;}},
   persistReward:()=>{writes++;if(fail)throw Error('storage full');return {save:{id:'committed'}};},storageWarning:false,
   close:()=>{context.panel=null;context.companionPractice=null;},petScene:{dialogue(){}},queueCloudSave(){},paintHud(){},track:()=>tracked++
  });
  vm.runInContext(paint,context);context.paintCompanionPractice();
  if(stale==='closed')context.panel=null;
  if(stale==='role')context.roleEpoch=2;
  if(stale==='save')context.save={id:'other'};
  callbacks.complete();
  if(stale){assert.equal(writes,0,stale);continue;}
  assert.equal(context.save,save);assert.equal(context.companionPractice,session);assert.equal(tracked,0);
  fail=false;callbacks.complete();callbacks.complete();
  assert.equal(writes,2);assert.equal(context.save.id,'committed');assert.equal(tracked,1);assert.equal(context.companionPractice,null);
 }
});
