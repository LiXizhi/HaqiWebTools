import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadDataset} from '../js/data_core.js';
import {defaultParams,resolveParams} from '../js/combat_params_core.js';
import {createArena,startCombat} from '../js/combat_arena_core.js';
import {unitSpec} from '../js/combat_presets_core.js';
import {observeBattle,haqiRulesAdapter,auditCards} from '../js/battle_ai/haqi_adapter_core.js';
import {integrateOutcomes} from '../js/battle_ai/inference_core.js';
import {analyzeDecision,chooseDecision,compareDecision,reviewBattle,explainResult,optimizeDeck,recommendProgression,evaluateEncounter} from '../js/battle_ai/index_core.js';
import {rollFizzle,tryCriticalStrike,generatePip} from '../js/combat_formulas_core.js';
import {ReasoningBot} from '../js/battle_ai/policy_core.js';
import {runHaqiEncounter} from '../js/battle_ai/encounter_core.js';
import {coordinateTeam} from '../js/battle_ai/policy_core.js';
import {isSupportedType,useCard} from '../js/combat_cards_core.js';
import {createPveBattle,playPveRound,restorePveBattle} from '../js/combat_pve_core.js';
import {playerSpec,createAdventure} from '../js/adventure_core.js';
const dataset=await loadDataset('data/kids',p=>JSON.parse(fs.readFileSync(p)));
function arena(){const a=createArena({resolved:resolveParams(dataset,defaultParams('kids')),near:[unitSpec(dataset,'fire',{level:20})],far:[unitSpec(dataset,'ice',{level:20})],seed:17,firstSide:'near'});startCombat(a);return a;}
test('analysis is deterministic, side effect free and cannot observe enemy cards',()=>{
 const a=arena(),id=a.sides.near[0].id,state=a.rng.state(),before=JSON.stringify(a.sides);
 const observation=observeBattle(a,id),first=analyzeDecision(observation,{rulesAdapter:haqiRulesAdapter});
 assert.equal(a.rng.state(),state);assert.equal(JSON.stringify(a.sides),before);
 a.sides.far[0].deckSeq=['secret'];a.sides.far[0].deckMap=[1];a.rng.float();
 assert.deepEqual(observeBattle(a,id),observation);
 assert.deepEqual(analyzeDecision(observeBattle(a,id),{rulesAdapter:haqiRulesAdapter}),first);
 assert.deepEqual(chooseDecision(first,{seed:4}),chooseDecision(first,{seed:4}));
 assert.throws(()=>chooseDecision(first,{stateId:'stale'}));
});
test('discrete chance integration matches inclusive Lua boundaries',()=>{
 const f=integrateOutcomes(rng=>rollFizzle(rng,80),{branches:12});
 assert.ok(Math.abs(f.leaves.filter(x=>!x.value).reduce((s,x)=>s+x.probability,0)-81/101)<1e-12);
 const c=integrateOutcomes(rng=>tryCriticalStrike(rng,0,0),{branches:12});
 assert.ok(Math.abs(c.leaves.filter(x=>x.value).reduce((s,x)=>s+x.probability,0)-1/1001)<1e-12);
 const p=integrateOutcomes(rng=>generatePip(rng,{normal:0,power:0},30,7,'kids'),{branches:12});
 assert.ok(Math.abs(p.leaves.filter(x=>x.value==='power').reduce((s,x)=>s+x.probability,0)-0.3)<1e-12);
});
test('bounded outcomes retain probability mass and flag approximations',()=>{
 const r=integrateOutcomes(rng=>[rng.int(10,500),rng.probability(.1),rng.probability(.7)],{branches:2});
 assert.ok(Math.abs(r.leaves.reduce((s,x)=>s+x.probability,0)-1)<1e-12);assert.ok(r.approximateMass>0);
});
test('guaranteed attack prefers lethal target and rejects clearly ineffective heal',()=>{
 const a=arena(),u=a.sides.near[0],enemy=a.sides.far[0];
 a.resolved.cards.hit={key:'hit',name:'攻击',type:'SingleAttack',target:'hostile',spellSchool:'fire',accuracy:1000,hitchance:1000,pipcost:0,params:{damage_min:100,damage_max:100,damage_school:'fire'}};
 a.resolved.cards.heal={key:'heal',name:'治疗',type:'SingleHeal',target:'friendly',spellSchool:'fire',accuracy:1000,pipcost:0,params:{heal_min:50,heal_max:50}};
 u.deckSeq=['hit','heal'];u.deckMap=[1,1];enemy.hp=1;enemy.stats.resilience={all:1000};
 const analysis=new ReasoningBot({difficulty:'easy'}).analyze(a,u);
 assert.equal(analysis.candidates[0].action.key,'hit');
 assert.ok(analysis.candidates[0].forecast.lethalProbability>=.99);
 assert.equal(compareDecision(analysis,analysis.candidates[0].action).shouldPrompt,false);
});
test('all kids cards appear in coverage audit, unsupported types remain explicit',()=>{
 const a=arena(),rows=auditCards(a.resolved);assert.equal(rows.length,Object.keys(a.resolved.cards).length);assert.ok(rows.some(r=>r.support==='unsupported'));
});
test('coaching gate held-out cases suppress close or uncertain choices without hiding major errors',()=>{
 // Hand-labelled decision-contract fixtures, not a population false-positive estimate.
 const fixtures=[
  {score:100,confidence:1,prompt:false},
  {score:99,confidence:1,prompt:false},
  {score:93,confidence:1,prompt:false},
  {score:76,confidence:1,prompt:false},
  {score:0,confidence:.89,prompt:false},
  {score:0,confidence:1,prompt:true},
  {score:-100,confidence:.95,prompt:true},
 ];
 for(const f of fixtures){
  const best={action:{key:'attack',targetId:'enemy'},score:100,confidence:1,label:'进攻',evidence:[{text:'可以结束战斗'}]};
  const selected={action:{key:'alternative',targetId:'enemy'},score:f.score,confidence:f.confidence,evidence:[]};
  const analysis={candidates:[best],evaluated:[best,selected],settings:{severeGap:.25,confidenceThreshold:.9,nearTie:.08}};
  assert.equal(compareDecision(analysis,selected.action).shouldPrompt,f.prompt,JSON.stringify(f));
 }
});
test('all castable supported kids templates produce finite, mass-preserving previews',()=>{
 const resolved=resolveParams(dataset,defaultParams('kids'));
 for(const card of Object.values(resolved.cards)){
  if(!isSupportedType(card.type))continue;
  const a=createArena({resolved,near:[{school:card.spellSchool,level:50,deck:[{key:card.key,count:1}]}],far:[{school:'ice',level:50,deck:[]}],seed:1,firstSide:'near'});startCombat(a);a.sides.near[0].pips={normal:0,power:7};
  const o=observeBattle(a,a.sides.near[0].id);
  for(const action of haqiRulesAdapter.actions(o).filter(x=>!x.pass))assert.ok(Number.isFinite(haqiRulesAdapter.evaluate(o,action,{...resolved.battleAI,branches:3,difficulty:'easy'}).score),card.key);
 }
});
test('four positions on either side can coordinate without changing live state',()=>{
 const a=createArena({resolved:resolveParams(dataset,defaultParams('kids')),near:Array.from({length:4},()=>unitSpec(dataset,'fire',{level:20})),far:Array.from({length:4},()=>unitSpec(dataset,'ice',{level:20})),seed:19,firstSide:'near'});startCombat(a);
 const before=JSON.stringify(a.sides),rng=a.rng.state();
 for(const side of ['near','far']){a.currentSide=side;const policies=Object.fromEntries(a.sides[side].map(u=>[u.id,new ReasoningBot({difficulty:'easy'})]));const picks=coordinateTeam(a,policies);assert.equal(Object.keys(picks).length,4);}
 assert.equal(JSON.stringify(a.sides),before);assert.equal(a.rng.state(),rng);
});
test('shield, trap, dispel and cross-school power pips use live handlers in a copied arena',()=>{
 const a=arena(),u=a.sides.near[0],enemy=a.sides.far[0];a.mode='pve';a.dispelRulesVersion=1;
 const card={key:'probe',name:'机制检查',type:'SingleAttack',target:'hostile',spellSchool:'ice',accuracy:1000,hitchance:1000,pipcost:2,params:{damage_min:100,damage_max:100,damage_school:'ice'}};
 a.resolved.cards.probe=card;u.deckSeq=['probe'];u.deckMap=[1];u.pips={normal:0,power:3};enemy.hp=enemy.maxHp=10000;
 a.resolved.wards[99001]={id:99001,school:'ice',boost_damage:-50,positive:true};a.resolved.wards[99002]={id:99002,school:'ice',boost_damage:30,positive:false};enemy.wards=[{id:99001},{id:99002}];
 u.stats.crit={};enemy.stats.resilience={all:1000};
 const before=JSON.stringify(a.sides),o=observeBattle(a,u.id),pick={key:'probe',seq:0,targetId:enemy.id};
 const predicted=haqiRulesAdapter.evaluate(o,pick,{...a.resolved.battleAI,difficulty:'easy'});assert.equal(JSON.stringify(a.sides),before);
 a.rng={int:(lo,hi)=>hi};useCard(a,u,card,enemy,0);const actual=a.events.filter(e=>e.type==='damage').at(-1).amount;
 assert.ok(Math.abs(predicted.forecast.damage-actual)<1);assert.equal(u.pips.power,1);assert.equal(enemy.wards.filter(w=>w.id).length,0);
});
test('close loss encourages without automatic upgrade suggestions; crushing defeat is not close',()=>{
 const frames=[0,1,2,3].map(i=>({nearStrength:100-i*20,farStrength:110-i*20,nearPressure:i*10,farPressure:i*12}));
 const review=reviewBattle({winner:'far',frames});assert.equal(review.close,true);assert.deepEqual(review.suggestions,[]);assert.match(explainResult(review).headline,/差一点|惜败/);
 const crush=reviewBattle({winner:'far',frames:frames.map((f,i)=>({...f,nearStrength:Math.max(1,100-i*33),farStrength:100}))});
 assert.equal(crush.close,false);assert.doesNotMatch(explainResult(crush).headline,/差一点|惜败|幸运/);
});
test('a critical event alone never proves luck caused victory',()=>{
 const r=reviewBattle({winner:'near',events:[{type:'damage',mark:'c'}],evidence:[{kind:'luck',verified:true,eventIndices:[0],direction:'favorable'}]});
 assert.equal(r.luck,null);assert.doesNotMatch(explainResult(r).headline,/幸运/);
});
test('deck optimizer enforces copies, locks and access probability',()=>{
 const cards=[{key:'a',maxCopies:2},{key:'b',maxCopies:3}];
 const r=optimizeDeck({cards,limits:{capacity:4,eachCapacity:3},locked:[{key:'a',count:1}]},{scoreCard:()=>10,semantics:()=>({roles:['attack']})});
 assert.equal(r.deck.find(x=>x.key==='a').count,1);assert.ok(r.total<=4);assert.ok(r.openingAccess.every(x=>x.probability===1));
 assert.throws(()=>optimizeDeck({cards,limits:{capacity:4},locked:[{key:'a',count:3}]},{scoreCard:()=>1,semantics:()=>({roles:[]})}));
});
test('progression only exposes available routes matching an evidenced diagnosis',()=>{
 const review={close:false,mistakes:[],diagnoses:[{kind:'diagnosis',category:'capacity',text:'已验证容量限制'}]};
 const r=recommendProgression(review,{routes:[{id:'yes',available:true,addresses:'capacity',title:'查看口袋'},{id:'no',available:false,addresses:'capacity'},{id:'unrelated',available:true,addresses:'attributes'}]});assert.deepEqual(r.map(x=>x.id),['yes']);
});
test('encounter evaluation uses supplied seeds and reports draw and uncertainty',()=>{
 const r=evaluateEncounter({scenarios:[{id:'test'}],seeds:[1,2,3],run:(_,s)=>({winner:s===1?'near':s===2?'far':'draw',turns:4})})[0];
 assert.equal(r.wins,1);assert.equal(r.draws,1);assert.ok(r.winInterval[0]<r.winRate&&r.winInterval[1]>r.winRate);
});
test('new PvE AI logs actual ally decisions; legacy replay still uses legacy policy',()=>{
 const read=name=>JSON.parse(fs.readFileSync(`data/adventure/${name}.json`));const content=read('chapter'),d=read('combat'),player=playerSpec(createAdventure(content),content);
 player.slot=0;const checkpoint={player,party:[player,{...player,id:'ally',slot:1}],seed:11,monster:content.monsters['fire-scout'],decisions:[]};
 const a=createPveBattle({dataset:d,player,party:checkpoint.party,monsters:[checkpoint.monster],seed:11});
 playPveRound(a,{pass:true,aiVersion:1});checkpoint.decisions.push(a.lastDecision);assert.ok(a.lastDecision.aiPicks.ally);
 const restored=restorePveBattle(d,content,checkpoint);assert.deepEqual(restored.events,a.events);assert.equal(restored.rng.state(),a.rng.state());
 const broken=structuredClone(checkpoint);delete broken.decisions[0].aiPicks.ally;assert.throws(()=>restorePveBattle(d,content,broken),/缺少伙伴行动/);
 const old=createPveBattle({dataset:d,player,monsters:[checkpoint.monster],seed:11});playPveRound(old,{pass:true});assert.equal(old.lastDecision.aiVersion,undefined);
});
test('designer runner works without a page, save or account and preserves its specification',()=>{
 const scenario={id:'standalone',near:[unitSpec(dataset,'fire',{level:1})],far:[unitSpec(dataset,'ice',{level:1})]};
 const before=JSON.stringify(scenario),result=runHaqiEncounter(dataset,scenario,37,{policy:'reasoning_easy',review:false});
 assert.ok(['near','far','draw'].includes(result.winner));assert.ok(result.turns>0);assert.equal(JSON.stringify(scenario),before);
});
