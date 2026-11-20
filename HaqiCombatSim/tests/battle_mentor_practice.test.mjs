import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createMentorPractice,selectMentorPractice,castMentorPractice,mentorPracticeCue,mentorPracticeName} from '../js/mentor_practice_core.js';
import {createOpeningController} from '../js/adventure/opening_controller.js';
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
 for(const stale of [null,'closed','role','save','language','native','quest']){
  let save={languageLearning:{target:'ja',native:'zh-CN',enabled:true}},panel='mentor-practice',roleEpoch=1,quest=63010;
  const session={save,epoch:1,locale:'ja',native:'zh-CN',lesson:{done:true,npcId:36206}};
  let callbacks,writes=0,tracked=0,awards=0,fail=true;
  const ctrl=createOpeningController({
   nodes:{overlay:{}},
   getContext:()=>({save,roleEpoch,panel,stage:'world',roleStorage:{},assets:{content:{}},setSave:next=>{save=next;},setStorageWarning:()=>{},setPanel:next=>{panel=next;}}),
   model:()=>({}),
   currentQuestFn:()=>({id:quest}),
   renderMentorPractice:(_r,_m,_l,cb)=>{callbacks=cb;},
   safely:fn=>{try{return fn();}catch{return false;}},
   persistRewardFn:()=>{writes++;if(fail)throw Error('storage full');return {save:{languageLearning:save.languageLearning}};},
   close:()=>{panel=null;ctrl.setMentorPractice(null);},
   queueCloudSave(){},
   paintHud(){},
   track:()=>tracked++,
   awardLanguageSpeech:id=>{assert.equal(id,'mentor-practice:36206');awards++;},
  });
  ctrl.setMentorPractice(session);
  ctrl.paintMentorPractice();
  if(stale==='closed')panel=null;if(stale==='role')roleEpoch++;if(stale==='save')save={...save};
  if(stale==='language')save.languageLearning.target='ko';if(stale==='native')save.languageLearning.native='en';if(stale==='quest')quest=63011;
  callbacks.complete();assert.equal(writes,stale?0:1);assert.equal(awards,0);
  if(!stale){assert.equal(ctrl.getMentorPractice(),session);fail=false;callbacks.complete();assert.equal(writes,2);assert.equal(tracked,1);assert.equal(awards,1);callbacks.complete();assert.equal(writes,2);assert.equal(awards,1);}
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
