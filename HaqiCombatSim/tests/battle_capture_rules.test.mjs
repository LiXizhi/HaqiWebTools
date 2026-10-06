import {describeCard} from '../js/card_description_core.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {installRuneCatalog,catchProbability} from '../js/adventure_runes_core.js';
import {createAdventure,beginEncounter,recordDecision,parseSave,settleParty} from '../js/adventure_core.js';
import {restorePveBattle,playPveRound,runeCardsInHand} from '../js/combat_pve_core.js';
import {validTargets} from '../js/combat_arena_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
content.monsterArt=read('adventure/monster-art.json');installRuneCatalog(content,read('adventure/runes.json'));
function setup(encounter='wild:dragon_green'){
 const save=createAdventure(content,{seed:22,starter:'dragon_green'});save.inventory[23439]=3;beginEncounter(save,content,encounter);
 const battle=restorePveBattle(dataset,content,save.pendingEncounter),rune=runeCardsInHand(battle)[0];
 return {save,battle,rune,card:battle.resolved.cards[rune.key],mob:battle.unitsById.mob0};
}
test('owned, previously captured, enraged and stealth monsters stay catchable; dead targets do not',()=>{
 const {battle,mob,card,rune}=setup();battle.captured.push(mob.template.speciesId);mob.enragedBy='hero';mob.stealth=true;battle.stealthRulesVersion=1;
 assert.deepEqual(validTargets(battle,battle.unitsById.hero,card),[mob]);
 battle.resolved.adventure.catchMinChance=1;battle.resolved.adventure.catchMaxChance=1;
 playPveRound(battle,{...rune,targetId:mob.id});assert.equal(battle.runeUsed[23439],1);assert.equal(battle.captured.length,2);
 assert.equal(validTargets(battle,battle.unitsById.hero,card).length,0);
});
test('chance is positive at full HP, increases with wounds and rune strength, and falls with level, durability and enrage',()=>{
 const {battle,mob,card}=setup();assert.ok(catchProbability(battle,card,mob)>0);
 mob.hp=mob.maxHp*.9;const baseline=catchProbability(battle,card,mob);
 mob.hp=mob.maxHp*.8;assert.ok(catchProbability(battle,card,mob)>baseline);mob.hp=mob.maxHp*.9;
 assert.ok(catchProbability(battle,{...card,params:{base_weight:5}},mob)>baseline);
 mob.level+=5;assert.ok(catchProbability(battle,card,mob)<baseline);mob.level-=5;
 mob.enragedBy='hero';assert.ok(catchProbability(battle,card,mob)<baseline);delete mob.enragedBy;
 mob.maxHp*=100;mob.hp=mob.maxHp*.9;assert.ok(catchProbability(battle,card,mob)<baseline);
 mob.template={...mob.template,attributes:{...mob.template.attributes,catch_pet_force_chance_percent:-100}};
 assert.equal(catchProbability(battle,card,mob),battle.resolved.adventure.catchMinChance);
});
test('ordinary monster capture consumes a rune and replays deterministically',()=>{
 const {save,battle,rune,mob}=setup('ice-scout');assert.ok(mob.template.speciesId);
 const decision={...rune,targetId:mob.id};playPveRound(battle,decision);recordDecision(save,decision,battle);
 const restored=restorePveBattle(dataset,content,parseSave(save,content).pendingEncounter);
 assert.deepEqual(restored.events,battle.events);assert.deepEqual(restored.captured,battle.captured);assert.equal(restored.runeUsed[23439],1);
});
test('duplicate capture settles as experience and spends exactly one rune',()=>{
 const {save,battle,rune,mob}=setup();battle.resolved.adventure.catchMinChance=1;battle.resolved.adventure.catchMaxChance=1;
 const before=save.pets.dragon_green.xp;playPveRound(battle,{...rune,targetId:mob.id});settleParty(save,content,battle);
 assert.equal(save.inventory[23439],2);assert.ok(save.pets.dragon_green.xp>before);
});
test('legacy saves without new parameters retain their capture rules and replay',()=>{
 const {save}=setup();delete save.pendingEncounter.captureRulesVersion;
 for(const key of ['catchMinChance','catchMaxChance','catchEnragedDifficulty'])delete save.pendingEncounter.adventureParams[key];
 const battle=restorePveBattle(dataset,content,parseSave(save,content).pendingEncounter);
 assert.equal(battle.captureRulesVersion,0);assert.equal(validTargets(battle,battle.unitsById.hero,battle.resolved.cards[runeCardsInHand(battle)[0].key]).length,0);
});

test('cooperative battles award captured pets instead of dropping them during health settlement',()=>{
 const {save,battle,rune,mob}=setup();save.coopRun={members:[]};
 battle.resolved.adventure.catchMinChance=1;battle.resolved.adventure.catchMaxChance=1;
 const before=save.pets.dragon_green.xp;playPveRound(battle,{...rune,targetId:mob.id});settleParty(save,content,battle);
 assert.equal(save.inventory[23439],2);assert.ok(save.pets.dragon_green.xp>before);
});

test('rune details do not present card accuracy as the capture chance',()=>{
 const {card}=setup(),description=describeCard(card);
 assert.doesNotMatch(description.meta,/命中/);assert.match(description.note,/卡牌命中率不代表捕捉成功率/);
});
