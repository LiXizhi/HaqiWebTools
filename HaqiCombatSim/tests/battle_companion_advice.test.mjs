import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import * as P from '../js/combat_pve_core.js';
import {castableCards} from '../js/combat_arena_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {companionBattleAdvice,companionSelectedAdvice} from '../js/companion_battle_advice_core.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
function start(id){const s=A.createAdventure(content,{starter:'dragon_green',school:'ice',seed:1});s.openingJourney={version:1,phase:'offer'};A.beginEncounter(s,content,id);return P.restorePveBattle(dataset,content,s.pendingEncounter);}
test('attack-only hand never recommends unavailable protection, healing or buffs',()=>{
 const b=start('fire-scout'),seqs=castableCards(b,b.sides.near[0]).map(h=>h.seq),before=JSON.stringify(b);
 const advice=companionBattleAdvice(b,seqs,dataset.cards);
 assert.match(advice.text,/攻击牌/);assert.doesNotMatch(advice.text,/准备增益|防御|治疗/);
 assert.ok(advice.seqs.length);assert.equal(JSON.stringify(b),before);
 b.monsterTemplates[0].id='storm-scout';b.turn=3;
 assert.match(companionBattleAdvice(b,seqs).text,/重击/);assert.doesNotMatch(companionBattleAdvice(b,seqs).text,/治疗|防御/);
});
test('hidden pages and exhausted hand do not produce phantom suggestions',()=>{
 const b=start('ice-scout');assert.deepEqual(companionBattleAdvice(b,[]).seqs,[]);
 const one=castableCards(b,b.sides.near[0])[0];assert.deepEqual(companionBattleAdvice(b,[one.seq]).seqs,[one.seq]);
});
test('shield advice points only to a currently legal attack and retains player choice',()=>{
 const b=start('ice-scout'),choices=castableCards(b,b.sides.near[0]);
 const advice=companionBattleAdvice(b,choices.map(h=>h.seq),dataset.cards);
 assert.match(advice.text,/试探/);assert.ok(advice.seqs.every(seq=>choices.some(c=>c.seq===seq)));
 assert.doesNotMatch(advice.text,/Ice_/);
});

test('setup advice matches the school of an available attack',()=>{
 const b=start('storm-scout'),hero=b.sides.near[0];b.turn=2;
 hero.deckSeq=['Ice_SingleAttack_Level0_45','Ice_IceDamageBlade','Fire_FireDamageBlade'];hero.deckMap=[1,1,1];
 hero.wordCards={};hero.pips={normal:7,power:0};
 const advice=companionBattleAdvice(b,[0,1,2],dataset.cards);
 assert.deepEqual(advice.seqs,[1]);assert.match(advice.text,/准备下一击/);
 const wrongSchool=companionBattleAdvice(b,[0,2],dataset.cards);
 assert.deepEqual(wrongSchool.seqs,[0]);assert.doesNotMatch(wrongSchool.text,/准备下一击/);
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
