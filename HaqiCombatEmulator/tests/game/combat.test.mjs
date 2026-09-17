import test from 'node:test';
import assert from 'node:assert/strict';
import {game} from '../fixtures/game.mjs';
import {mobBuild,mobDeck,mobCardPool,MOB_DECK_SIZE} from '../../js/game/combat/mob-build.js';
import {createEncounter,describeEvent} from '../../js/game/combat/encounter.js';
import {describeCard} from '../../js/game/combat/card-text.js';
import {chooseMobAction,activeGenes} from '../../js/bots/genes.js';
import {createBattle,getObservation} from '../../js/engine/battle.js';
import {compileCharacter} from '../../js/rules/character.js';
import {createProfile,playerBuild,addExp,expToNext,knownCards,defaultDeck,validateDeck,deckCapacity,maxCopies,unlockLevel,MAX_LEVEL} from '../../js/game/progression.js';
import {chooseAction} from '../../js/bots/strategy.js';
const r=game.ruleset;
const profile=(level=1,school='fire')=>{const p=createProfile({name:'测试',school,gender:'girl'});p.level=level;return p;};
const townMobs=[...new Set(game.arenas['61HaqiTown'].flatMap(a=>a.mobs))].map(t=>game.mobByTemplate[t]);
test('mob build: every Haqi Town template compiles into a battle-ready snapshot',()=>{
  assert.ok(townMobs.length>=14,`${townMobs.length} town templates`);
  for(const mob of townMobs){
    const b=mobBuild(mob,r,game.gsidToCard);
    assert.equal(b.kind,'mob');assert.equal(b.attributes.maxHP,mob.hp);assert.ok(b.deck.length>0&&b.deck.length<=MOB_DECK_SIZE);
    const c=compileCharacter(b,r);assert.equal(c.attributes.maxHP,mob.hp);
    for(const k of b.deck)assert.ok(r.cards[k],`${mob.name}: ${k}`);
    assert.deepEqual(mobDeck(mob,r,game.gsidToCard),b.deck,'deck derivation is deterministic');
  }
});
test('mob build: placed templates across all worlds compile or fail with a named reason',()=>{
  const failures=[];let ok=0;
  for(const t of game.placedTemplates){try{createBattle({schemaVersion:1,size:1,pve:true,teams:[[playerBuild(profile(),r)],[mobBuild(game.mobByTemplate[t],r,game.gsidToCard)]]},r,1);ok++;}catch(e){failures.push(`${t.split('/').pop()}: ${e.message}`);}}
  assert.ok(ok>200,`${ok} placed mobs battle-ready`);
  assert.ok(failures.length<=5,failures.join('\n'));
  for(const f of failures)assert.match(f,/学派|卡牌/);
});
test('mob build: weighted card pool honours available_cards weights and card sets',()=>{
  const mob=townMobs.find(m=>m.availableCards?.length>1)??townMobs[0];
  const pool=mobCardPool(mob,r,game.gsidToCard);
  assert.ok(pool.length>0);
  for(const {key,weight} of pool){assert.ok(r.cards[key]);assert.ok(weight>0);}
  const heaviest=pool.reduce((a,b)=>b.weight>a.weight?b:a);
  const deck=mobDeck(mob,r,game.gsidToCard);
  const count=k=>deck.filter(x=>x===k).length;
  for(const c of pool)assert.ok(count(heaviest.key)>=count(c.key),'heaviest card has the most copies');
  assert.throws(()=>mobDeck({...mob,availableCards:[],cardsets:{},genes:[]},r,game.gsidToCard),/没有可用卡牌/);
});
test('genes: hp_range / hp_drop selection, one-shot memory and seeded determinism',()=>{
  const mob={genes:[{priority:1,hp_drop:50,card:'X'},{priority:2,hp_range:'0,30',card:'Y'},{priority:3,card:'Z'}],cardsets:{}};
  const memory={};
  assert.deepEqual(activeGenes(mob,80,memory).map(g=>g.gene.card),['Z']);
  assert.deepEqual(activeGenes(mob,40,memory).map(g=>g.gene.card),['X','Z']);
  memory['drop:0']=true;
  assert.deepEqual(activeGenes(mob,20,memory).map(g=>g.gene.card),['Y','Z']);
  const withGenes=townMobs.find(m=>m.genes?.length)??townMobs[0];
  const scenario={schemaVersion:1,size:1,pve:true,firstSide:1,teams:[[playerBuild(profile(5),r)],[mobBuild(withGenes,r,game.gsidToCard)]]};
  const pick=seed=>{const b=createBattle(scenario,r,seed);const o=getObservation(b,'1-0');return chooseMobAction(o,r,withGenes,{},seed,game.gsidToCard);};
  assert.deepEqual(pick(3),pick(3));
  const a=pick(3);assert.ok(['pass','cast'].includes(a.kind));
});
test('encounter: player versus town mobs runs to a result with rewards only on victory',()=>{
  let wins=0;
  for(const [i,mob] of townMobs.slice(0,8).entries()){
    const p=profile(Math.max(1,mob.level),'storm');
    const enc=createEncounter(p,game,[mob],100+i,{random:()=>0});
    assert.equal(enc.observation().units.filter(u=>u.kind==='mob').length,1);
    let guard=0;
    while(!enc.finished&&guard++<200){const action=chooseAction(enc.observation(),r,'tactical',i);const groups=enc.playerTurn(action);assert.ok(groups.length>=1&&groups.length<=2);for(const g of groups)for(const e of g.events)describeEvent(e,enc.state,r);}
    assert.ok(enc.finished,'battle ended');
    const rewards=enc.rewards();
    if(enc.result.winner===0){wins++;assert.equal(rewards.exp,mob.exp*2,"kids global_exp_bonus");assert.equal(rewards.joybeans,mob.joybeans);assert.equal(rewards.loot.length,mob.loot.length,'random 0 drops every loot row');}
    else assert.deepEqual(rewards,{exp:0,joybeans:0,loot:[]});
    assert.throws(()=>enc.playerTurn({unitId:'0-0',kind:'pass'}),/结束/);
  }
  assert.ok(wins>=6,`won ${wins}/8 level-matched town fights`);
});
test('encounter: up to four mobs and identical seeds replay identically',()=>{
  const party=townMobs.slice(0,4);const p=profile(10,'ice');
  const run=()=>{const enc=createEncounter(p,game,party,77,{random:()=>0.5});const log=[];while(!enc.finished){for(const g of enc.playerTurn(chooseAction(enc.observation(),r,'tactical',77)))log.push(...g.events.map(e=>e.type));}return {log,result:enc.result};};
  assert.deepEqual(run(),run());
});
test('progression: exp curve, level ups, deck limits and level-gated cards',()=>{
  const p=profile(1,'life');
  assert.equal(expToNext(1),30);assert.ok(expToNext(10)>expToNext(9));assert.equal(expToNext(MAX_LEVEL),Infinity);
  const out=addExp(p,expToNext(1)+expToNext(2)+5);
  assert.equal(out.levels,2);assert.equal(p.level,3);assert.equal(p.exp,5);
  assert.equal(deckCapacity(profile(1)),14);assert.equal(deckCapacity(profile(9)),18);assert.equal(maxCopies(profile(1)),3);assert.equal(maxCopies(profile(11)),4);
  for(const school of ['fire','ice','storm','life','death']){
    const low=knownCards(profile(1,school),r),high=knownCards(profile(30,school),r);
    assert.ok(low.length>=1,`${school} level 1 knows a card`);assert.ok(high.length>low.length,`${school} unlocks cards by level`);
    for(const c of high)assert.equal(c.school,school);
    const deck=defaultDeck(profile(30,school),r);assert.equal(validateDeck(profile(30,school),r,deck),null);assert.ok(deck.length<=deckCapacity(profile(30,school)));
  }
  assert.equal(unlockLevel({key:'Fire_SingleAttackWithDOT_Level3',pipcost:3}),11);assert.equal(unlockLevel({key:'Fire_SingleAttack_Level0_55',pipcost:0}),3);
  assert.match(validateDeck(profile(1),r,['Fire_SingleAttackWithDOT_Level6']),/未掌握/);
  assert.match(validateDeck(profile(1),r,[]),/为空/);
});
test('card text: numeric params become readable Chinese',()=>{
  assert.match(describeCard(r.cards.Fire_SingleAttackWithDOT_Level1,r),/烈火伤害 84~92/);
  assert.match(describeCard(r.cards.Fire_FireDamageBlade,r),/造成伤害\+/);
  for(const c of Object.values(r.cards).slice(0,300))assert.equal(typeof describeCard(c,r),'string');
});
