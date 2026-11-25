import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBattleResultViewModel} from '../js/adventure/presenters/battle_view_model.js';
import {applyCombatStamina,previewCombatStamina,localDayKey} from '../js/adventure_stamina_core.js';

const now=new Date(2026,10,25,13).getTime();
const content={encounters:[{id:'test',staminaCost:25}],fishing:{staminaMax:100},dungeons:[]};
function fixture(stamina=0,day=localDayKey(now)){
 return {save:{zone:'camp',school:'fire',stamina,staminaRefillDay:day,pendingEncounter:{encounterId:'test',magicStarExperiencePercent:125},pets:{}},battle:{winner:'near',finished:true,monsterTemplates:[{xp:11,coins:9}],captured:[]},assets:{content},now};
}
test('reward preview follows the exact gate, including low positive stamina and daily refill',()=>{
 for(const [stamina,day,cost] of [[0,localDayKey(now),25],[1,localDayKey(now),25],[0,'2026-11-24',25],[0,undefined,25],[0,localDayKey(now),0]]){
  const save={stamina,staminaRefillDay:day},before=JSON.stringify(save);
  const preview=previewCombatStamina(save,content,cost,now);
  assert.deepEqual(preview,applyCombatStamina({...save},content,cost,now));
  assert.equal(JSON.stringify(save),before);
 }
});
test('result never advertises experience or coins that exhausted stamina will block',()=>{
 const state=fixture(),before=JSON.stringify(state),result=buildBattleResultViewModel(state);
 assert.equal(result.rewardExhausted,true);assert.equal(result.xp,0);assert.equal(result.coins,0);
 assert.equal(JSON.stringify(state),before);
});
test('eligible wins retain the actual experience multiplier and coins',()=>{
 for(const state of [fixture(1),fixture(0,'2026-11-24')]){
  const result=buildBattleResultViewModel(state);
  assert.equal(result.rewardExhausted,false);assert.equal(result.xp,14);assert.equal(result.coins,9);
 }
});
test('a loss has no advertised loot and is not presented as an exhausted victory',()=>{
 const state=fixture();state.battle.winner='far';const result=buildBattleResultViewModel(state);
 assert.equal(result.rewardExhausted,false);assert.equal(result.xp,0);assert.equal(result.coins,0);
});
