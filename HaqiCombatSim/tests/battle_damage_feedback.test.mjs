import test from 'node:test';
import assert from 'node:assert/strict';
import {battleDamageFeedback} from '../js/battle_damage_feedback_core.js';
import {battleActorAction,actorPose,HIT_DURATION_MS} from '../js/actor_animation_core.js';
import {presentationEventDurationMs} from '../js/battle_presentation_core.js';
test('all confirmed damage has impact and shake regardless of cost, reflection or periodic source',()=>{
 for(const event of [{type:'damage'},{type:'damage',label:'reflection'},{type:'damage',periodic:true},{type:'dot'},{type:'damage',recoilPlayed:true}]){
  const e={...event,target:'foe',amount:20},before=JSON.stringify(e),f=battleDamageFeedback(e,.2);
  assert.equal(f.hits.length,1);assert.notEqual(f.shakeX,0);assert.equal(JSON.stringify(e),before);
  assert.deepEqual(battleDamageFeedback(e,.2),f);
  const quiet=battleDamageFeedback(e,.2,[],true);assert.equal(quiet.shakeX,0);assert.equal(quiet.hits.length,1);
 }
});
test('miss, support and zero damage do not invent a hit; group shake does not stack',()=>{
 for(const e of [{type:'fizzle'},{type:'heal',amount:20},{type:'damage',amount:0},{type:'pass'},{type:'cast'}])assert.equal(battleDamageFeedback(e,.2).hits.length,0);
 const hits=[{target:'a',progress:.2},{target:'b',progress:.2}];
 assert.equal(battleDamageFeedback({type:'cast'},.8,hits).shakeX,battleDamageFeedback({type:'cast'},.8,hits.slice(0,1)).shakeX);
 assert.equal(battleDamageFeedback({type:'damage',amount:20},1).shakeX,0);
});
test('damage lasts 650ms, lethal impact precedes collapse and dot has a hit pose',()=>{
 assert.equal(HIT_DURATION_MS,650);
 assert.equal(presentationEventDurationMs({type:'damage'},{hp:10}),650);
 assert.equal(presentationEventDurationMs({type:'damage'},{hp:0}),900);
 assert.equal(battleActorAction('foe',20,{type:'dot',target:'foe',amount:10},.2).action,'hit');
 const death=actorPose('death',.1);assert.notEqual(death.x,0);assert.equal(death.alpha,1);
 assert.equal(actorPose('death',1).alpha,0);
});
