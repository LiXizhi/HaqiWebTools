import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import * as A from '../js/adventure_core.js';
import {TACTICS_LESSONS,createTacticsTraining,trainingStep,selectTrainingCard,castTrainingCard,recordTacticsTraining,validateTacticsTraining} from '../js/tactics_training_core.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
function finish(state){
 while(!state.done){
  const step=trainingStep(state);
  assert.equal(selectTrainingCard(state,step.card),true);
  assert.equal(castTrainingCard(state,step.target),true,state.message);
 }return state;
}
for(const lesson of TACTICS_LESSONS)test(lesson.title+' uses real effects and isolated resources',()=>{
 const before=JSON.stringify(dataset),state=finish(createTacticsTraining(dataset,{lessonId:lesson.id,seed:23}));
 assert.equal(state.arena.sides.near.length,lesson.size);assert.equal(state.arena.sides.far.length,lesson.size);
 assert.ok(state.result.plain>0);
 if(lesson.id==='guard')assert.ok(state.result.actual<state.result.plain);
 else assert.ok(state.result.actual>state.result.plain);
 assert.equal(JSON.stringify(dataset),before);
 const save=A.createAdventure(content,{school:'fire',seed:23});
 const resources=JSON.stringify([save.inventory,save.hp,save.seed,save.currency]);
 assert.equal(recordTacticsTraining(save,state),true);validateTacticsTraining(save);
 assert.deepEqual(A.parseSave(JSON.stringify(save),content).tacticsTraining,save.tacticsTraining);
 assert.equal(JSON.stringify([save.inventory,save.hp,save.seed,save.currency]),resources);
 assert.deepEqual(finish(createTacticsTraining(dataset,{lessonId:lesson.id,seed:23})).result,state.result);
});
test('an early attack gives real counterexample without spoiling the rehearsal',()=>{
 const state=createTacticsTraining(dataset),before=JSON.stringify(state.arena.unitsById);
 selectTrainingCard(state,'Fire_SingleAttack_Level0_45');
 assert.equal(castTrainingCard(state,'enemy'),false);assert.match(state.message,/造成了.*伤害/);
 assert.equal(JSON.stringify(state.arena.unitsById),before);assert.equal(state.actions.length,0);
 const step=trainingStep(state);selectTrainingCard(state,step.card);
 assert.equal(castTrainingCard(state,'support'),false);assert.equal(state.actions.length,0);
 finish(state);assert.ok(state.done);
});
test('completion records reject malformed or unfinished training',()=>{
 const state=createTacticsTraining(dataset),save={};
 assert.equal(recordTacticsTraining(save,state),false);assert.equal(save.tacticsTraining,undefined);
 for(const bad of [null,[],{version:2,completed:{}},{version:1,completed:{fake:{runs:1,plain:45,actual:60}}},{version:1,completed:{focus:{runs:-1,plain:45,actual:60}}}]){
  assert.throws(()=>validateTacticsTraining({tacticsTraining:bad}));
 }
 assert.doesNotThrow(()=>validateTacticsTraining({}));
 finish(state);recordTacticsTraining(save,state);recordTacticsTraining(save,state);
 assert.equal(save.tacticsTraining.completed.focus.runs,2);
});

test('a mismatched school shows unused effects and restores the accepted setup',()=>{
 const state=createTacticsTraining(dataset,{seed:23});
 for(let i=0;i<2;i++){
  const step=trainingStep(state);selectTrainingCard(state,step.card);assert.equal(castTrainingCard(state,step.target),true);
 }
 const before=JSON.stringify(state.arena),actions=state.actions.length;
 assert.equal(selectTrainingCard(state,'Ice_SingleAttack_Level0_45'),true);
 assert.equal(castTrainingCard(state,'enemy'),false);
 assert.match(state.message,/造成了 45 点伤害/);
 assert.match(state.message,/强化和目标身上的陷阱仍未触发/);
 assert.match(state.message,/演示已还原到本步开始/);
 assert.equal(JSON.stringify(state.arena),before);assert.equal(state.actions.length,actions);
 finish(state);assert.ok(state.result.actual>45);
});

test('counterexamples distinguish wrong recipient from a different role',()=>{
 const state=createTacticsTraining(dataset);
 selectTrainingCard(state,'Fire_FireDamageBlade');castTrainingCard(state,'support');
 assert.match(state.message,/效果交给了辅助；本步需要交给主攻/);
 selectTrainingCard(state,'Ice_GlobalShield');castTrainingCard(state,'striker');
 assert.match(state.message,/目标选对了/);assert.doesNotMatch(state.message,/没有交给/);
 assert.equal(state.actions.length,0);
});

test('shield lesson consumes a real shield before reserving the combo for the striker',()=>{
 const state=createTacticsTraining(dataset,{lessonId:'break-shield',seed:23});
 const target=()=>state.arena.unitsById.enemy;
 assert.ok(target().wards.length>0);
 selectTrainingCard(state,'Fire_FireDamageBlade');
 assert.equal(castTrainingCard(state,'striker'),false);
 assert.ok(target().wards.length>0);
 const step=trainingStep(state);selectTrainingCard(state,step.card);
 assert.equal(castTrainingCard(state,step.target),true);
 assert.equal(target().wards.filter(ward=>ward.id).length,0);assert.match(state.message,/护盾已经/);
 finish(state);assert.ok(state.result.actual>state.result.plain*2);
});

test('group weakness accepts any hostile recipient and preserves actual targeting on replay',()=>{
 const state=createTacticsTraining(dataset,{lessonId:'guard',seed:23});
 const step=trainingStep(state);selectTrainingCard(state,step.card);
 assert.equal(castTrainingCard(state,'enemy-1'),true,state.message);
 assert.equal(state.actions[0].target,'enemy-1');
 assert.ok(state.arena.sides.far.every(unit=>unit.charms.length>0));
 assert.match(state.message,/不需要逐个施放/);
 finish(state);assert.ok(state.result.actual<state.result.plain);
});
