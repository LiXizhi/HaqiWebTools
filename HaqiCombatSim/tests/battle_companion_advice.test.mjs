import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import * as P from '../js/combat_pve_core.js';
import {castableCards} from '../js/combat_arena_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {companionBattleAdvice,companionSelectedAdvice,companionTacticalHint} from '../js/companion_battle_advice_core.js';
import {createBattleAdvisorBridge} from '../js/adventure/battle_advisor_bridge.js';
import {dungeonEnemyIntentInfo} from '../js/dungeon_tactics_core.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
function start(id){const s=A.createAdventure(content,{starter:'dragon_green',school:'ice',seed:1});s.openingJourney={version:1,phase:'offer'};A.beginEncounter(s,content,id);return P.restorePveBattle(dataset,content,s.pendingEncounter);}

function tacticalHand(){
 const b=start('fire-scout'),hero=b.sides.near[0];
 hero.deckSeq=['Fire_SingleAttack_Level0_45','Ice_GlobalShield','Fire_FireDamageBlade'];
 hero.deckMap=[1,1,1];hero.petDeckSeq=[];hero.petDeckMap=[];hero.wordCards={};hero.pips={normal:7,power:0};
 const ally=structuredClone(hero);ally.id='test-ally';ally.name='伙伴';
 b.sides.near.push(ally);b.unitsById[ally.id]=ally;
 b.tacticalEncounter={intents:[],queued:[]};
 return b;
}

test('locked heavy intent overrides shield probing and protects the actual threatened ally',()=>{
 const b=tacticalHand(),ally=b.sides.near[1],foe=b.sides.far[0];assert.ok(ally);
 const shield=Object.entries(b.resolved.wards).find(([,e])=>Number(e.boost_damage)<0&&String(e.school).toLowerCase()==='fire');
 foe.wards=[{id:Number(shield[0])}];
 b.tacticalEncounter.intents=[{kind:'attack',effect:'重击',targetId:ally.id}];
 const before=JSON.stringify(b),advice=companionBattleAdvice(b,[0,1,2]);
 assert.equal(advice.kind,'defend');assert.deepEqual(advice.seqs,[1]);assert.equal(advice.targetId,ally.id);
 assert.doesNotMatch(advice.text,/试探护盾/);
 assert.deepEqual(companionTacticalHint(b).action,{seq:1,key:'Ice_GlobalShield',targetId:ally.id});
 assert.equal(JSON.stringify(b),before);
});

test('locked recovery and charge intents do not reuse opening heavy advice',()=>{
 const b=tacticalHand();b.monsterTemplates[0].id='storm-scout';b.turn=3;
 for(const kind of ['heal','buff']){
  b.tacticalEncounter.intents=[{kind,effect:kind==='heal'?'恢复':'蓄力',targetId:b.sides.far[0].id}];
  const advice=companionBattleAdvice(b,[0,1,2]);
  assert.doesNotMatch(advice.text,/重击/);assert.deepEqual(advice.seqs,[2]);
  assert.equal(companionTacticalHint(b).action.seq,2);
 }
});

test('tactical pet hint respects discarded cards and incapacitation',()=>{
 const b=tacticalHand();b.tacticalEncounter.intents=[{kind:'attack',effect:'重击',targetId:b.sides.near[0].id}];
 assert.equal(companionTacticalHint(b,[1]).action.seq,0);
 assert.equal(companionTacticalHint(b,[0,1,2]),null);
 b.sides.near[0].stunned=true;assert.equal(companionTacticalHint(b),null);
 b.sides.near[0].stunned=false;b.finished=true;assert.equal(companionTacticalHint(b),null);
});

test('bridge uses the same locked plan before analysis and ignores conflicting cached suggestions',()=>{
 const b=tacticalHand(),bridge=createBattleAdvisorBridge({getContext:()=>({battle:b})});
 b.tacticalEncounter.intents=[{kind:'attack',effect:'重击',targetId:b.sides.near[1].id}];
 const advisor=bridge.advisorFor(b);
 advisor.hintAnalysis={candidates:[{action:{seq:0,key:'Fire_SingleAttack_Level0_45',targetId:b.sides.far[0].id}}]};
 assert.equal(bridge.reviewModel(b,{},content).aiHint.action.seq,1);
 advisor.hintState='turn-3';advisor.dismissedHintState='turn-3';
 assert.equal(bridge.reviewModel(b,{},content).aiHint,null);
 advisor.hintState='turn-4';assert.equal(bridge.reviewModel(b,{},content).aiHint.action.seq,1);
});
test('attack-only hand never recommends unavailable protection, healing or buffs',()=>{
 const b=start('fire-scout'),seqs=castableCards(b,b.sides.near[0]).map(h=>h.seq),before=JSON.stringify(b);
 const advice=companionBattleAdvice(b,seqs,dataset.cards);
 assert.match(advice.text,/攻击牌|进攻/);assert.doesNotMatch(advice.text,/准备增益|防御|治疗/);
 assert.ok(advice.seqs.length);assert.equal(JSON.stringify(b),before);
 b.monsterTemplates[0].id='storm-scout';b.turn=3;
 assert.match(companionBattleAdvice(b,seqs).text,/重击/);assert.doesNotMatch(companionBattleAdvice(b,seqs).text,/治疗|防御/);
});
test('hidden pages and exhausted hand do not produce phantom suggestions',()=>{
 const b=start('ice-scout');assert.deepEqual(companionBattleAdvice(b,[]).seqs,[]);
 const one=castableCards(b,b.sides.near[0])[0];assert.deepEqual(companionBattleAdvice(b,[one.seq]).seqs,[one.seq]);
});
test('a planned shield is not described as an already active shield',()=>{
 const b=start('ice-scout'),choices=castableCards(b,b.sides.near[0]);
 const advice=companionBattleAdvice(b,choices.map(h=>h.seq),dataset.cards);
 assert.match(advice.text,/准备加盾/);assert.doesNotMatch(advice.text,/试探/);assert.ok(advice.seqs.every(seq=>choices.some(c=>c.seq===seq)));
 assert.doesNotMatch(advice.text,/Ice_/);
});

test('shield advice uses only active wards matching a legal attack without consuming them',()=>{
 const b=start('fire-scout'),hero=b.sides.near[0],foe=b.sides.far[0];
 hero.deckSeq=['Fire_SingleAttack_Level0_45','Ice_SingleAttack_Level0_45'];hero.deckMap=[1,1];hero.wordCards={};hero.pips={normal:7,power:0};
 const shield=Object.entries(b.resolved.wards).find(([,e])=>Number(e.boost_damage)<0&&String(e.school).toLowerCase()==='fire');assert.ok(shield);
 foe.wards=[{id:Number(shield[0])}];
 const before=JSON.stringify(b),advice=companionBattleAdvice(b,[0,1]);
 assert.match(advice.text,/试探护盾/);assert.deepEqual(advice.seqs,[0]);assert.equal(JSON.stringify(b),before);
 assert.doesNotMatch(companionBattleAdvice(b,[1]).text,/试探护盾/);
 foe.wards=[];assert.doesNotMatch(companionBattleAdvice(b,[0,1]).text,/试探护盾/);
});

test('setup advice matches the school of an available attack',()=>{
 const b=start('storm-scout'),hero=b.sides.near[0];b.turn=2;
 hero.deckSeq=['Ice_SingleAttack_Level0_45','Ice_IceDamageBlade','Fire_FireDamageBlade'];hero.deckMap=[1,1,1];
 hero.wordCards={};hero.pips={normal:7,power:0};
 const advice=companionBattleAdvice(b,[0,1,2],dataset.cards);
 assert.deepEqual(advice.seqs,[1]);assert.match(advice.text,/强化下一击/);
 const wrongSchool=companionBattleAdvice(b,[0,2],dataset.cards);
 assert.deepEqual(wrongSchool.seqs,[0]);assert.doesNotMatch(wrongSchool.text,/强化下一击/);
});

test('cooldown and mana block casts while language activation remains a distinct action',()=>{
 const b=start('fire-scout'),hero=b.sides.near[0];
 hero.deckSeq=['Ice_SingleAttack_Level0_45','Ice_SingleAttack_Level1','Ice_IceDamageBlade'];hero.deckMap=[1,1,1];
 hero.pips={normal:0,power:0};hero.wordCards={2:{activated:false}};
 hero.cooldowns[b.resolved.cards[hero.deckSeq[0]].spellName]=1;
 assert.equal(companionBattleAdvice(b,[0,1,2]).kind,'practice');
 assert.deepEqual(companionBattleAdvice(b,[0,1]).seqs,[]);
});

test('stunned or fallen hero is not told to choose another attack',()=>{
 const b=start('fire-scout'),hero=b.sides.near[0],selected=castableCards(b,hero)[0];
 hero.stunned=true;
 assert.equal(companionBattleAdvice(b,[selected.seq]).kind,'wait');
 assert.equal(companionSelectedAdvice(b,selected).wait,true);
 hero.stunned=false;hero.hp=0;
 assert.deepEqual(companionBattleAdvice(b,[selected.seq]).seqs,[]);
 assert.equal(companionSelectedAdvice(b,selected).wait,true);
});

test('healing guidance highlights an injured legal target and saves healing when everyone is full',()=>{
 const b=start('fire-scout'),hero=b.sides.near[0];
 const key=Object.keys(b.resolved.cards).find(k=>b.resolved.cards[k].type==='SingleHeal');assert.ok(key);
 hero.deckSeq=[key];hero.deckMap=[1];hero.wordCards={0:{activated:false}};hero.pips={normal:7,power:0};
 const selected={seq:0,key};
 assert.equal(companionSelectedAdvice(b,selected).reconsider,true);
 hero.hp-=40;
 const advice=companionSelectedAdvice(b,selected);
 assert.equal(advice.suggestedTargetId,hero.id);assert.equal(advice.practice,true);
});


test('selected cards explain restrictions before pointing to targets',()=>{
 const b=start('fire-scout'),hero=b.sides.near[0];
 hero.deckSeq=['Ice_SingleAttack_Level1'];hero.deckMap=[1];hero.pips={normal:0,power:0};
 const selected={seq:0,key:hero.deckSeq[0]};
 assert.equal(companionSelectedAdvice(b,selected).blocked,true);
 hero.pips.normal=7;assert.equal(companionSelectedAdvice(b,selected).blocked,false);
 hero.wordCards={0:{activated:false}};
 assert.equal(companionSelectedAdvice(b,selected).practice,true);
 assert.equal(companionSelectedAdvice(b,selected,[0]).blocked,true);
 for(const foe of b.sides.far)foe.hp=0;
 assert.equal(companionSelectedAdvice(b,selected).blocked,true);
});

test('runes are suggested from real stock without consuming inventory',()=>{
 const b=start('fire-scout'),hero=b.sides.near[0];hero.pips={normal:7,power:0};
 const key=Object.keys(b.resolved.cards).find(k=>b.resolved.cards[k].type==='CatchPet');assert.ok(key);
 b.runes=[{itemId:12345,key,count:1}];b.runeUsed={};
 b.captureRulesVersion=1;b.sides.far[0].isMob=true;b.sides.far[0].template.speciesId='test';
 const before=JSON.stringify(b),advice=companionBattleAdvice(b,[-12345]);
 assert.equal(advice.kind,'capture');assert.deepEqual(advice.seqs,[-12345]);assert.equal(JSON.stringify(b),before);
 b.runeUsed[12345]=1;assert.deepEqual(companionBattleAdvice(b,[-12345]).seqs,[]);
});


test('an already active blade is not promoted as a new setup advantage',()=>{
 const b=start('storm-scout'),hero=b.sides.near[0];b.turn=2;
 hero.deckSeq=['Ice_SingleAttack_Level0_45','Ice_IceDamageBlade'];hero.deckMap=[1,1];hero.wordCards={};hero.pips={normal:7,power:0};
 const ids=String(b.resolved.cards.Ice_IceDamageBlade.params.charms).split(',').map(Number);
 for(const ally of b.sides.near)ally.charms=ids.slice();
 const advice=companionBattleAdvice(b,[0,1]);
 assert.deepEqual(advice.seqs,[0]);assert.doesNotMatch(advice.text,/准备下一击/);
});


test('selected damage and status cards stay concise and keep legal targets',()=>{
 const b=start('fire-scout'),hero=b.sides.near[0];
 const keys=['Fire_SingleAttack_Level0_45','Fire_FireDamageBlade','Fire_FireDamageTrap','Ice_GlobalShield','Fire_AreaDOTAttack_Level5'];
 hero.deckSeq=keys;hero.deckMap=keys.map(()=>1);hero.wordCards={};hero.pips={normal:7,power:0};hero.cooldowns={};
 const before=JSON.stringify(b);
 for(const [seq,key]of keys.entries()){
  const advice=companionSelectedAdvice(b,{seq,key});
  assert.equal(advice.blocked,false,key);assert.ok(advice.text.length<=32,key);
  assert.doesNotMatch(advice.text,/结算|每段伤害发生|分别触发和消耗/);
 }
 assert.equal(JSON.stringify(b),before);
});


test('scripted patrol advice and pet bubble agree before and after cached analysis',()=>{
 const b=tacticalHand(),hero=b.sides.near[0],foe=b.sides.far[0];
 delete b.tacticalEncounter;
 b.monsterTemplates[0].openingLesson=false;
 foe.template={...foe.template,dungeonTactic:{version:2,role:'charger',cycle:['blade','attack']}};
 const bridge=createBattleAdvisorBridge({getContext:()=>({battle:b})}),advisor=bridge.advisorFor(b);
 advisor.hintAnalysis={candidates:[{action:{seq:1,key:'Ice_GlobalShield',targetId:hero.id}}]};
 const before=JSON.stringify(b),advice=companionBattleAdvice(b,[0,1,2]);
 assert.deepEqual(advice.seqs,[2]);assert.match(advice.text,/强化下一击/);
 assert.equal(companionTacticalHint(b).action.seq,2);
 assert.equal(bridge.reviewModel(b,{},content).aiHint.action.seq,2);
 assert.equal(JSON.stringify(b),before);
 b.turn=2;
 assert.equal(companionBattleAdvice(b,[0,1,2]).kind,'defend');
 assert.equal(bridge.reviewModel(b,{},content).aiHint.action.seq,1);
});

test('patrol shields follow the threatened ally rather than the most injured ally',()=>{
 const b=tacticalHand(),[hero,ally]=b.sides.near,foe=b.sides.far[0];
 delete b.tacticalEncounter;b.monsterTemplates[0].openingLesson=false;
 foe.template={...foe.template,dungeonTactic:{version:2,role:'charger',cycle:['blade','attack']}};
 b.turn=2;b.threatRulesVersion=1;ally.hp-=100;
 const bridge=createBattleAdvisorBridge({getContext:()=>({battle:b})});
 for(const target of [hero,ally]){
  foe.threats={[hero.id]:target===hero?100:0,[ally.id]:target===ally?100:0};
  const before=JSON.stringify(b);
  assert.equal(dungeonEnemyIntentInfo(b).targetId,target.id);
  assert.equal(companionBattleAdvice(b,[0,1,2]).targetId,target.id);
  assert.equal(companionTacticalHint(b).action.targetId,target.id);
  assert.equal(bridge.reviewModel(b,{},content).aiHint.action.targetId,target.id);
  assert.equal(JSON.stringify(b),before);
 }
 ally.hp=0;assert.equal(dungeonEnemyIntentInfo(b).targetId,hero.id);
 ally.hp=hero.maxHp;b.threatRulesVersion=0;
 assert.equal(dungeonEnemyIntentInfo(b).targetId,hero.id);
});


test('announced fire heavy prefers the strongest matching shield and ignores other schools',()=>{
 const b=tacticalHand(),hero=b.sides.near[0],ally=b.sides.near[1],foe=b.sides.far[0];
 const keys=['Ice_IceGreatShield','Ice_GlobalShield','Fire_FireGreatShield','Fire_SingleAttack_Level0_45'];
 hero.deckSeq=keys;hero.deckMap=keys.map(()=>1);
 b.tacticalEncounter.intents=[{kind:'attack',effect:'重击',key:'Fire_SingleAttack_Level0_45',caster:foe.id,targetId:ally.id}];
 const before=JSON.stringify(b),advice=companionBattleAdvice(b,[0,1,2,3]);
 assert.deepEqual(advice.seqs,[2]);assert.equal(advice.targetId,ally.id);
 assert.equal(companionTacticalHint(b).action.seq,2);
 assert.deepEqual(companionBattleAdvice(b,[0,1,3]).seqs,[1]);
 assert.equal(JSON.stringify(b),before);
 hero.deckMap[2]=-1;assert.deepEqual(companionBattleAdvice(b,[0,1,2,3]).seqs,[1]);
 hero.deckMap[1]=-1;
 const attack=companionBattleAdvice(b,[0,1,2,3]);
 assert.equal(attack.kind,'attack');assert.deepEqual(attack.seqs,[3]);
});

test('heavy shield advice avoids adding an identical existing shield',()=>{
 const b=tacticalHand(),hero=b.sides.near[0],ally=b.sides.near[1],foe=b.sides.far[0];
 hero.deckSeq=['Fire_FireGreatShield','Ice_GlobalShield','Fire_SingleAttack_Level0_45'];hero.deckMap=[1,1,1];
 const wardId=Number(b.resolved.cards.Fire_FireGreatShield.params.wards);ally.wards=[{id:wardId}];
 b.tacticalEncounter.intents=[{kind:'attack',effect:'重击',key:'Fire_SingleAttack_Level0_45',caster:foe.id,targetId:ally.id}];
 const before=JSON.stringify(b);
 assert.deepEqual(companionBattleAdvice(b,[0,1,2]).seqs,[1]);
 assert.equal(JSON.stringify(b),before);
});
