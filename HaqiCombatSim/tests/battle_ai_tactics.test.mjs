import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadDataset} from '../js/data_core.js';
import {resolveParams,defaultParams} from '../js/combat_params_core.js';
import {createArena,startCombat} from '../js/combat_arena_core.js';
import {analyzeDecision} from '../js/battle_ai/inference_core.js';
import {observeBattle,haqiRulesAdapter} from '../js/battle_ai/haqi_adapter_core.js';
import {drawChance} from '../js/battle_ai/haqi_tactics_core.js';
const data=await loadDataset('data/kids',p=>JSON.parse(fs.readFileSync(p)));
function arena(hand=['burst','weak','Fire_FireDamageBlade','Fire_FireDamageTrap'],enemies=1){
 const R=resolveParams(data,defaultParams('kids'));
 for(const [key,cost,damage] of [['burst',5,600],['weak',2,80]])R.cards[key]={key,spellName:key,type:'SingleAttack',spellSchool:'fire',pipcost:cost,accuracy:1000,params:{damage_min:damage,damage_max:damage,damage_school:'fire'}};
 R.cards.breaker={key:'breaker',spellName:'breaker',type:'RemovePositiveWard',spellSchool:'fire',pipcost:0,accuracy:1000,params:{remove_count:1}};
 R.wards[9991]={id:9991,school:'fire',boost_damage:-80,positive:true};
 R.cards.wrongShield={key:'wrongShield',spellName:'wrongShield',type:'Wards',spellSchool:'fire',pipcost:0,accuracy:1000,params:{wards:9992}};
 R.wards[9992]={id:9992,school:'storm',boost_damage:-80,positive:true};
 const a=createArena({resolved:R,near:[{id:'hero',school:'fire',level:30,deck:hand.map(key=>({key,count:1}))}],far:Array.from({length:enemies},(_,i)=>({id:`enemy${i}`,school:'ice',level:30,deck:[]})),seed:4,firstSide:'near'});
 startCombat(a);const u=a.sides.near[0];u.deckSeq=[...hand];u.deckMap=hand.map(()=>1);u.pips={normal:2,power:0};
 for(const e of a.sides.far){e.hp=e.maxHp=1500;e.stats.resilience={all:1000};}
 return a;
}
const analyze=a=>analyzeDecision(observeBattle(a,'hero'),{rulesAdapter:haqiRulesAdapter,difficulty:'expert'});
test('focus selection compares actual target shields and finishing potential',()=>{
 const a=arena(undefined,2);a.sides.far[0].wards=[{id:9991}];a.sides.far[1].hp=700;
 const result=analyze(a);assert.equal(result.strategy.targetId,'enemy1');
 assert.equal(result.memory.targetId,'enemy1');assert.ok(result.strategy.steps.some(s=>s.role==='blade'));
});
test('break shield before investing buffs into the shielded target',()=>{
 const a=arena(['burst','breaker','Fire_FireDamageBlade','Fire_FireDamageTrap']);a.sides.far[0].wards=[{id:9991}];
 const result=analyze(a);assert.equal(result.strategy.steps[0].role,'breakShield');
 assert.equal(result.candidates[0].action.key,'breaker');assert.ok(result.strategy.prepared.damage>result.strategy.base.damage);
});
test('full pips and already prepared effects favour releasing burst over waiting',()=>{
 const a=arena();a.sides.near[0].pips={normal:7,power:0};a.sides.near[0].charms=[11];a.sides.far[0].wards=[{id:21}];
 const result=analyze(a);assert.equal(result.candidates[0].action.key,'burst');assert.equal(result.strategy.base.resource.missing,0);
});
test('a small attack can be the shield-breaking tool when no removal card is held',()=>{
 const a=arena(['burst','weak']);a.sides.far[0].wards=[{id:9991}];
 const result=analyze(a);assert.equal(result.candidates[0].action.key,'weak');
 const hit=result.candidates[0];assert.ok(hit.forecast.tactic.after.damage>result.strategy.base.damage);
});
test('discard plan preserves burst and evaluates draws without reading unseen order',()=>{
 const a=arena(['burst','weak','weak','wrongShield']);a.resolved.global.handSize=4;
 const u=a.sides.near[0];u.deckSeq.push('Fire_FireDamageBlade','Fire_FireDamageTrap','Fire_FireDamageBlade');u.deckMap.push(0,0,0);
 const state=JSON.stringify(a.sides),rng=a.rng.state(),first=analyze(a);
 const discard=first.evaluated.filter(r=>r.action.discardSeqs?.length);assert.ok(discard.length);
 assert.ok(discard.every(r=>!r.action.discardSeqs.includes(0)&&r.action.discardSeqs.length<=2));
 assert.ok(discard.some(r=>r.forecast.tactic.draw?.after>r.forecast.tactic.draw?.before));
 assert.equal(JSON.stringify(a.sides),state);assert.equal(a.rng.state(),rng);
 u.deckSeq.splice(4,3,'Fire_FireDamageTrap','Fire_FireDamageBlade','Fire_FireDamageBlade');a.rng.float();
 assert.deepEqual(analyze(a),first);
 assert.equal(drawChance(4,1,2),.5);
});
test('missing burst is explicitly a draw goal, never treated as a playable card',()=>{
 const a=arena(['weak','weak','wrongShield']);a.resolved.global.handSize=3;
 a.sides.near[0].deckSeq.push('burst');a.sides.near[0].deckMap.push(0);
 const result=analyze(a);assert.equal(result.strategy.source,'remaining');assert.equal(result.strategy.attackKey,'burst');
 assert.ok(result.evaluated.every(r=>r.action.key!=='burst'));assert.ok(result.evaluated.some(r=>r.action.discardSeqs?.length));
});
