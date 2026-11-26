import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {restorePveBattle,playPveRound,runeCardsInHand} from '../js/combat_pve_core.js';
import {selectableCards} from '../js/combat_unit_core.js';
import {tacticalEnemyIntents,tacticalNextIntents,lockTacticalIntents} from '../js/tactical_encounter_core.js';
import {installRuneCatalog} from '../js/adventure_runes_core.js';
import {validTargets} from '../js/combat_arena_core.js';
import {HUNT_ID,HUNT_EQUIPMENT} from '../js/adventure_hunt_core.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {content:c,dataset:d}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
c.monsterArt=read('adventure/monster-art.json');installRuneCatalog(c,read('adventure/runes.json'));
function setup(school='fire'){
 const save=A.createAdventure(c,{school,seed:17});save.xp=c.progression.xpThresholds[7];A.syncProgression(save,c);
 save.deck=A.recommendedDeck(save,c);save.inventory[23439]=3;
 const {checkpoint}=A.beginEncounter(save,c,HUNT_ID);
 const battle=restorePveBattle(d,c,checkpoint);
 return {save,checkpoint,battle,hero:battle.sides.near[0],mob:battle.sides.far[0]};
}
test('all five schools receive two usable encounter shields without changing the saved deck',()=>{
 for(const school of ['fire','ice','storm','life','death']){
  const {save,checkpoint,battle,hero}=setup(school),before=structuredClone(save.deck);
  assert.equal(selectableCards(hero).filter(row=>row.key==='Ice_GlobalShield').length,2,school);
  assert.ok(validTargets(battle,hero,battle.resolved.cards.Ice_GlobalShield).includes(hero));
  const replay=restorePveBattle(d,c,A.parseSave(save,c).pendingEncounter);
  assert.deepEqual(replay.sides.near[0].deckSeq,hero.deckSeq);
  const plain=structuredClone(checkpoint);delete plain.tacticalEncounter;
  const ordinary=restorePveBattle(d,c,plain);
  assert.equal(hero.deckSeq.length,ordinary.sides.near[0].deckSeq.length+2);
  assert.deepEqual(save.deck,before);
 }
});
test('announced heavy follows preparation, consumes an actual shield and opens a counter window',()=>{
 const {battle:a,hero,mob}=setup();a.resolved.fairPlay={...a.resolved.fairPlay,forceAccuracy:100};
 const next=tacticalNextIntents(a)[0];assert.equal(next.effect,'重击');
 const locked=structuredClone(next);hero.hp=hero.maxHp;
 playPveRound(a,{pass:true});assert.deepEqual(tacticalEnemyIntents(a)[0],locked);
 assert.ok(mob.charms.some(id=>a.resolved.charms[id]?.boost_damage===50));
 const shield=selectableCards(hero).find(row=>row.key==='Ice_GlobalShield');
 const before=hero.hp;playPveRound(a,{...shield,targetId:hero.id});
 assert.ok(hero.hp>0);assert.ok(before-hero.hp<370);
 assert.ok(a.events.some(e=>e.type==='tactic_counter_window'&&e.targetId===hero.id&&e.shieldConsumed));
 assert.equal(tacticalEnemyIntents(a)[0].effect,'恢复');
 const hp=hero.hp;playPveRound(a,{pass:true});assert.equal(hero.hp,hp);
});
test('missed and controlled heavy attacks never manufacture a successful counter',()=>{
 for(const mode of ['miss','controlled']){
  const {battle:a,hero,mob}=setup();a.resolved.fairPlay={...a.resolved.fairPlay,forceAccuracy:100};
  playPveRound(a,{pass:true});
  const shield=selectableCards(hero).find(row=>row.key==='Ice_GlobalShield');
  if(mode==='miss'){const key=tacticalEnemyIntents(a)[0].key;a.resolved.cards[key]={...a.resolved.cards[key],accuracy:0};}
  else mob.stunned=1;
  // Force-accuracy is deliberately removed only for the miss probe.
  if(mode==='miss')delete a.resolved.fairPlay.forceAccuracy;
  playPveRound(a,{...shield,targetId:hero.id});
  assert.equal(a.events.some(e=>e.type==='tactic_counter_window'),false,mode);
 }
});
test('half-health phase is announced without extra actions or changing an already locked preview',()=>{
 const {battle:a,mob}=setup(),locked=tacticalNextIntents(a);
 mob.hp=Math.floor(mob.maxHp/2);lockTacticalIntents(a);
 assert.equal(a.tacticalEncounter.phase,2);
 assert.deepEqual(tacticalEnemyIntents(a),locked);
 assert.equal(a.events.filter(e=>e.type==='tactic_phase').length,1);
 assert.equal(a.events.find(e=>e.type==='tactic_phase').extraAction,false);
});
test('formal boss cannot be caught even when monster art and capture runes are fully loaded',()=>{
 const {battle:a,hero,mob}=setup();assert.equal(mob.template.captureDisabled,true);
 assert.equal(mob.template.speciesId,null);
 const runes=runeCardsInHand(a);assert.ok(runes.length>0);
 for(const rune of runes)assert.equal(validTargets(a,hero,a.resolved.cards[rune.key]).includes(mob),false);
});
test('chosen equipment supplies its native fixed card to a real encounter',()=>{
 for(const [itemId,key]of HUNT_EQUIPMENT.map((id,i)=>[id,['Ice_GlobalShield','Life_SingleHeal_Level0','Death_AreaDamageWeakness'][i]])){
  const {save}=setup();delete save.pendingEncounter;save.inventory[itemId]=1;
  A.applyAction(save,c,{type:'equip',itemId});const {checkpoint}=A.beginEncounter(save,c,HUNT_ID);
  const battle=restorePveBattle(d,c,checkpoint),hero=battle.sides.near[0];
  assert.ok(hero.deckSeq.includes(key),String(itemId));assert.ok(hero.maxHp>570);
 }
});
