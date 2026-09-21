import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPveBattle} from '../js/combat_pve_core.js';
import {useCard} from '../js/combat_cards_core.js';
import {playerSpec,createAdventure} from '../js/adventure_core.js';
test('new PvE damage hook records direct and splash threat while legacy battles keep no hook',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player=playerSpec(createAdventure(content),content),monsters=[content.monsters['fire-scout'],content.monsters['fire-scout']];
 const arena=createPveBattle({dataset,player,monsters,threatRulesVersion:1});
 arena.onDamageThreat(arena.sides.near[0],arena.sides.far[0],101);
 assert.equal(arena.sides.far[0].threats.hero,101);assert.equal(arena.sides.far[1].threats.hero,6);
 const hero=arena.sides.near[0];hero.pips={normal:7,power:0};
 const card=Object.values(arena.resolved.cards).find(card=>card.type==='SingleAttack');assert.ok(card);
 useCard(arena,hero,{...card,accuracy:1000},arena.sides.far[0]);
 assert.ok(arena.sides.far[0].threats.hero>101);
 assert.equal(createPveBattle({dataset,player,monsters}).onDamageThreat,undefined);
});
import {appendThreat,tauntThreat,advanceThreat,threatTarget} from '../js/combat_threat_core.js';
test('threat ordering, ties, weighted pending queues, taunt and death cleanup',()=>{
 const mob={},hero={id:'hero',slot:0,hp:100},ally={id:'ally',slot:1,hp:100};
 assert.equal(threatTarget(mob,[ally,hero]),hero);
 appendThreat(mob,ally,10,[3,5],2);
 assert.equal(threatTarget(mob,[hero,ally]),ally);
 assert.equal(threatTarget(mob,[hero,ally],true),hero);
 advanceThreat(mob,[hero,ally]);assert.equal(mob.threats.ally,30);
 tauntThreat(mob,hero,7);assert.equal(mob.threats.hero,37);
 ally.hp=0;advanceThreat(mob,[hero,ally]);assert.equal(mob.threats.ally,undefined);
});