import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createMentorPractice,selectMentorPractice,castMentorPractice,mentorPracticeCue,mentorPracticeName} from '../js/mentor_practice_core.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
const cast=(s,key,id)=>{assert.equal(selectMentorPractice(s,key),true);return castMentorPractice(s,id);};
test('all five mentors require different real engine effects',()=>{
 const original=JSON.stringify(dataset);
 for(const [npcId,key,target] of [[36206,'Fire_AreaAttackWithDOT_Level4','enemy1'],[36207,'Ice_GlobalShield','companion'],[36208,'Storm_SingleAttack_Level1','enemy2'],[36209,'Life_SingleHeal_Level0','companion'],[36210,'Death_SingleAttackWithLifeTap_Level2','enemy1']]){
  const s=createMentorPractice(dataset,{npcId,seed:42});
  assert.equal(cast(s,key,target),true);
  if(npcId===36207){assert.equal(s.done,false);assert.equal(s.failed,false);assert.equal(s.phase,'counter');assert.ok(s.arena.unitsById.companion.hp>0&&s.arena.unitsById.companion.hp<95);cast(s,'Ice_SingleAttack_Level1','enemy1');}
  assert.equal(s.done,true,`mentor ${npcId}: ${s.message}`);assert.equal(s.failed,false);assert.ok(s.feedback.length);
  const snapshot=JSON.stringify(s);assert.equal(castMentorPractice(s,target),false);assert.equal(JSON.stringify(s),snapshot);
 }
 assert.equal(JSON.stringify(dataset),original);
});
test('wrong strategies fail, illegal targets stay retryable and restart is isolated',()=>{
 for(const [npcId,key,target] of [[36206,'Fire_SingleAttackWithDOT_Level1','enemy1'],[36207,'Ice_GlobalShield','student'],[36208,'Storm_SingleAttack_Level1','enemy1'],[36209,'Life_SingleHeal_Level0','student'],[36210,'Storm_SingleAttack_Level1','enemy1']]){
  const s=createMentorPractice(dataset,{npcId,seed:41});assert.equal(castMentorPractice(s,target),false);assert.equal(s.failed,false);
  cast(s,key,target);assert.equal(s.done,false);assert.equal(s.failed,true);
  const fresh=createMentorPractice(dataset,{npcId,seed:41});assert.equal(fresh.done,false);assert.equal(fresh.failed,false);assert.equal(fresh.selected,null);
 }
 const s=createMentorPractice(dataset,{npcId:36209});selectMentorPractice(s,'Life_SingleHeal_Level0');const before=s.arena.unitsById.companion.hp;
 assert.equal(castMentorPractice(s,'enemy1'),false);assert.equal(s.failed,false);assert.equal(s.arena.unitsById.companion.hp,before);
 assert.equal(castMentorPractice(s,'companion'),true);assert.equal(s.done,true);
});
test('mentor instructions and target names follow all supported target languages',()=>{
 const cues=new Set();for(const language of ['en','ja','ko','zh-CN']){
  const s=createMentorPractice(dataset,{npcId:36208,language});const cue=mentorPracticeCue(s);cues.add(cue);
  assert.ok(cue.length>10);assert.notEqual(mentorPracticeName('enemy2',language),'enemy2');
  assert.equal(mentorPracticeCue(s,'zh-CN'),'后方的治疗者会治疗同伴。先击败治疗者。');
 }assert.equal(cues.size,4);
});
test('mentor completion survives storage failure and rejects stale callbacks',()=>{
 const source=fs.readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
 const paint=source.slice(source.indexOf('function paintMentorPractice('),source.indexOf('function openCompanionPractice('));
 for(const stale of [null,'closed','role','save','language','native','quest']){
  const save={languageLearning:{target:'ja',native:'zh-CN'}},session={save,epoch:1,locale:'ja',native:'zh-CN',lesson:{done:true,npcId:36206}};
  let callbacks,writes=0,tracked=0,fail=true,quest=63010;
  const context=vm.createContext({mentorPractice:session,save,roleEpoch:1,panel:'mentor-practice',stage:'world',roleStorage:{},assets:{content:{}},nodes:{overlay:{}},model:()=>({}),A:{currentQuest:()=>({id:quest})},
   V:{renderMentorPractice:(_r,_m,_l,cb)=>{callbacks=cb;}},safely:fn=>{try{return fn();}catch{return false;}},
   persistReward:()=>{writes++;if(fail)throw Error('storage full');return {save:{languageLearning:save.languageLearning}};},storageWarning:false,
   close:()=>{context.panel=null;context.mentorPractice=null;},queueCloudSave(){},paintHud(){},track:()=>tracked++});
  vm.runInContext(paint,context);context.paintMentorPractice();
  if(stale==='closed')context.panel=null;if(stale==='role')context.roleEpoch++;if(stale==='save')context.save={...save};
  if(stale==='language')save.languageLearning.target='ko';if(stale==='native')save.languageLearning.native='en';if(stale==='quest')quest=63011;
  callbacks.complete();assert.equal(writes,stale?0:1);
  if(!stale){assert.equal(context.mentorPractice,session);fail=false;callbacks.complete();assert.equal(writes,2);assert.equal(tracked,1);callbacks.complete();assert.equal(writes,2);}
 }
});

test('presentation preserves ordered cast snapshots including the ice counterattack',()=>{
 const s=createMentorPractice(dataset,{npcId:36207,seed:42});
 cast(s,'Ice_GlobalShield','companion');
 assert.equal(s.lastCasts.length,2);
 const [shield,attack]=s.lastCasts;
 assert.equal(shield.casterId,'student');assert.equal(shield.targetId,'companion');
 assert.deepEqual(shield.afterHp,attack.beforeHp);assert.equal(attack.casterId,'enemy1');
 assert.ok(attack.afterHp.companion<attack.beforeHp.companion);
 const frozen=JSON.stringify(s.lastCasts);s.arena.unitsById.companion.hp=0;
 assert.equal(JSON.stringify(s.lastCasts),frozen);
 const fire=createMentorPractice(dataset,{npcId:36206});cast(fire,'Fire_AreaAttackWithDOT_Level4','enemy1');
 assert.deepEqual(fire.lastCasts[0].targetIds,['enemy1','enemy2','enemy3']);
});

test('counterattack instructions wait until the current cast presentation finishes',()=>{
 const s=createMentorPractice(dataset,{npcId:36207,language:'ko'});
 const before=mentorPracticeCue(s);cast(s,'Ice_GlobalShield','companion');
 const after=mentorPracticeCue(s);assert.notEqual(after,before);
 s.presentationPhase='start';assert.equal(mentorPracticeCue(s),before);
 delete s.presentationPhase;assert.equal(mentorPracticeCue(s),after);
});
