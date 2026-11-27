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
import {huntResultFeedback} from '../js/adventure_hunt_feedback_core.js';
import {companionBattleAdvice,companionTacticalHint} from '../js/companion_battle_advice_core.js';
import {huntTurnGuidance} from '../js/adventure_hunt_turn_guidance_core.js';
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
function guidance(ctx, extra={}){
 return huntTurnGuidance({...ctx,visibleHand:selectableCards(ctx.hero),...extra});
}
test('hunt guidance follows actual preparation, heavy defense and earned counter for every school',()=>{
 for(const school of ['fire','ice','storm','life','death']){
  const ctx=setup(school),{battle,hero,mob}=ctx;
  battle.resolved.fairPlay={...battle.resolved.fairPlay,forceAccuracy:100};
  assert.match(guidance(ctx).text,/留到重击当回合/);
  playPveRound(battle,{pass:true});
  const before=JSON.stringify(ctx),hint=guidance(ctx);
  assert.equal(hint.badge,'挡重击');assert.match(hint.text,/给自己加盾/);
  assert.equal(hint.text.includes('undefined'),false);
  assert.equal(JSON.stringify(ctx),before,'guidance leaves state, locked intents and RNG untouched');
  const shield=selectableCards(hero).find(row=>row.seq===hint.seq);
  assert.equal(shield.key,'Ice_GlobalShield');
  playPveRound(battle,{...shield,targetId:hero.id});
  const key=Object.keys(battle.resolved.cards).find(key=>key.toLowerCase().startsWith(school+'_singleattack_level0_'));
  assert.ok(key,school+' has a native free attack');
  const seq=hero.deckSeq.length;hero.deckSeq.push(key);hero.deckMap.push(1);
  const counter=guidance(ctx,{visibleHand:[{seq,key}]});
  assert.equal(counter.badge,'用反击');assert.equal(counter.seq,seq);
  const full=guidance(ctx),beforeHint=JSON.stringify(battle);
  assert.equal(companionBattleAdvice(battle,selectableCards(hero).map(row=>row.seq)).seqs[0],full.seq,'pet and hand badge recommend the same strongest native attack');
  assert.equal(companionTacticalHint(battle).action.seq,full.seq);
  assert.equal(JSON.stringify(battle),beforeHint,'counter recommendations remain read-only');
  playPveRound(battle,{seq,key,targetId:mob.id});
  assert.notEqual(guidance(ctx)?.badge,'用反击','spent counter no longer recommended');
 }
});
test('hunt hand badge and companion agree on the strongest legal matching heavy shield',()=>{
 const ctx=setup(),{battle,hero}=ctx;playPveRound(battle,{pass:true});
 hero.pips={normal:7,power:0};
 hero.deckSeq=['Ice_IceGreatShield','Ice_GlobalShield','Fire_FireGreatShield'];hero.deckMap=[1,1,1];
 const before=JSON.stringify(battle),hint=guidance(ctx);
 assert.equal(hint.badge,'挡重击');assert.equal(hint.seq,2);
 assert.equal(companionBattleAdvice(battle,[0,1,2]).seqs[0],hint.seq);
 assert.equal(JSON.stringify(battle),before,'shield comparisons preserve locked intents, wards and RNG');
 assert.equal(guidance(ctx,{visibleHand:selectableCards(hero).slice(0,2)}).seq,1,'only visible matching protection is recommended');
 assert.equal(guidance(ctx,{discarded:[2]}).seq,1,'discarded strong protection falls back to the available shield');
 hero.deckMap[2]=-1;hero.deckMap[1]=-1;
 assert.equal(guidance(ctx).seq,undefined,'wrong-school shield does not claim to protect against the heavy');
});

test('hunt recommendations honor visible hand, discard, cooldown, control and selection',()=>{
 const ctx=setup(),{battle,hero}=ctx;playPveRound(battle,{pass:true});
 const shield=selectableCards(hero).find(row=>row.key==='Ice_GlobalShield');
 const only={visibleHand:[shield]};
 assert.equal(guidance(ctx,only).seq,shield.seq);
 assert.equal(guidance(ctx,{...only,discarded:[shield.seq]}).seq,undefined);
 assert.equal(guidance(ctx,{visibleHand:[]}).seq,undefined);
 assert.equal(guidance(ctx,{...only,selected:shield}),null);
 assert.equal(guidance(ctx,{...only,animating:true}),null);
 const card=battle.resolved.cards[shield.key];hero.cooldowns[card.spellName]=2;
 assert.equal(guidance(ctx,only).seq,undefined);delete hero.cooldowns[card.spellName];
 battle.resolved.cards[shield.key]={...card,pipcost:1000};
 assert.equal(guidance(ctx,only).seq,undefined);battle.resolved.cards[shield.key]=card;
 hero.stunned=1;assert.match(guidance(ctx,only).text,/无法行动/);hero.stunned=0;
 battle.finished=true;assert.equal(guidance(ctx,only),null);battle.finished=false;
 assert.equal(guidance({...ctx,save:{}}),null);
});
test('existing matching defense avoids suggesting another shield, wrong-school defense does not',()=>{
 const ctx=setup(),{battle,hero}=ctx;playPveRound(battle,{pass:true});
 const ward=Object.values(battle.resolved.wards).find(row=>Number(row.boost_damage)<0&&row.school==='all');
 assert.ok(ward);hero.wards.push({id:ward.id});
 assert.match(guidance(ctx).text,/已就位/);assert.equal(guidance(ctx).seq,undefined);
 const wrong=Object.values(battle.resolved.wards).find(row=>Number(row.boost_damage)<0&&row.school==='ice');
 assert.ok(wrong);hero.wards=[{id:wrong.id}];assert.equal(guidance(ctx).badge,'挡重击');
});
test('earned counter supports native damage over time and ignores foreign attacks and healing',()=>{
 const ctx=setup(),{battle,hero}=ctx;
 hero.charms.push(battle.resolved.tacticalEncounter.counterCharms[hero.school]);
 const cards=Object.values(battle.resolved.cards),dot=cards.find(card=>card.spellSchool==='fire'&&card.type==='DOTAttack');
 assert.ok(dot,'native fire damage-over-time spell exists');
 const row={seq:hero.deckSeq.length,key:dot.key};hero.deckSeq.push(dot.key);hero.deckMap.push(1);
 // Test public availability at a generous pip budget; guidance never spends it.
 hero.pips={normal:7,power:0};
 assert.equal(guidance(ctx,{visibleHand:[row]}).badge,'用反击');
 for(const card of cards.filter(card=>card.type==='SingleAttack'&&card.spellSchool==='ice'||card.type==='SingleHeal').slice(0,4)){
  const seq=hero.deckSeq.length;hero.deckSeq.push(card.key);hero.deckMap.push(1);
  assert.equal(guidance(ctx,{visibleHand:[{seq,key:card.key}]}).seq,undefined);
 }
 assert.equal(guidance(ctx,{visibleHand:[row],discarded:[row.seq]}).seq,undefined);
});
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

test('hunt results report the same actual defense on victory and defeat without settling loot',()=>{
 const {save,battle:a,hero}=setup();a.resolved.fairPlay={...a.resolved.fairPlay,forceAccuracy:100};
 playPveRound(a,{pass:true});
 const shield=selectableCards(hero).find(row=>row.key==='Ice_GlobalShield');
 playPveRound(a,{...shield,targetId:hero.id});
 for(const winner of ['near','far']){
  a.winner=winner;
  const before=JSON.stringify({save,battle:a});
  const feedback=huntResultFeedback(save,c,a);
  assert.deepEqual(feedback.review,{defended:1,exposed:0,counters:1,used:0,
   summary:'重击应对 1 次 · 重击直击 0 次 · 反击加成使用 0 次',
   lesson:'你已经争取到反击加成。这次还有加成未用上；下次可在恢复回合接本系攻击，含持续伤害。'});
  assert.match([feedback.body,...feedback.steps].join(' '),/加成未用上/);
  assert.equal(JSON.stringify({save,battle:a}),before);
 }
});

test('hunt review recognizes a native attack consuming the earned counter',()=>{
 const {save,battle:a,hero,mob}=setup();a.resolved.fairPlay={...a.resolved.fairPlay,forceAccuracy:100};
 playPveRound(a,{pass:true});
 const shield=selectableCards(hero).find(row=>row.key==='Ice_GlobalShield');
 playPveRound(a,{...shield,targetId:hero.id});
 const seq=hero.deckSeq.length,key='Fire_SingleAttack_Level0_45';
 hero.deckSeq.push(key);hero.deckMap.push(1);
 playPveRound(a,{seq,key,targetId:mob.id});
 const {review}=huntResultFeedback(save,c,a);
 assert.equal(review.counters,1);assert.equal(review.used,1);
 assert.match(review.lesson,/反击接上了/);
});

test('unmitigated heavy hits give a different next-attempt lesson from missed attacks',()=>{
 for(const miss of [false,true]){
  const {save,battle:a}=setup();a.resolved.fairPlay={...a.resolved.fairPlay,forceAccuracy:100};
  playPveRound(a,{pass:true});
  if(miss){const key=tacticalEnemyIntents(a)[0].key;a.resolved.cards[key]={...a.resolved.cards[key],accuracy:0};delete a.resolved.fairPlay.forceAccuracy;}
  playPveRound(a,{pass:true});
  const {review}=huntResultFeedback(save,c,a);
  assert.equal(review.exposed,miss?0:1);assert.equal(review.defended,0);assert.equal(review.counters,0);
  assert.equal(review.lesson.includes('直接命中'),!miss);
 }
});
