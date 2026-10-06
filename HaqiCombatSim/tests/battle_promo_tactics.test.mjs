import test from 'node:test';
import {cardsInHand} from '../js/combat_unit_core.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPromoTactics} from '../js/promo_tactics_core.js';
import {defaultParams} from '../js/combat_params_core.js';
const dataset=JSON.parse(fs.readFileSync(new URL('../data/adventure/combat.json',import.meta.url)));
dataset.cards=JSON.parse(fs.readFileSync(new URL('../data/kids/cards.json',import.meta.url)));
test('2对2教学真实施加盾与陷阱、夺盾、受伤、有效回血并触发陷阱',()=>{
 const result=createPromoTactics(dataset,defaultParams('kids'),531),g=result.groups;
 for(const group of g)if(group.picks.hero){const hand=cardsInHand(group.before.unitsById.hero);assert.equal(hand.length,8);assert.ok(hand.some(c=>c.key===group.picks.hero.key&&c.seq===group.picks.hero.seq));}
 assert.equal(result.arena.sides.near.length,2);assert.equal(result.arena.sides.far.length,2);
 assert.notEqual(result.arena.unitsById.hero.arenaProfile.bodyId,result.arena.unitsById.ally.arenaProfile.bodyId);
 assert.equal(result.arena.redMushroom,true);
 for(const unit of result.arena.sides.far){assert.ok(unit.speciesId);assert.equal(unit.arenaProfile,undefined);}
 assert.notEqual(result.arena.unitsById.rival.speciesId,result.arena.unitsById.guard.speciesId);
 assert.ok(g[0].after.unitsById.hero.wards.some(w=>w.id===27));
 assert.ok(g[1].after.unitsById.hero.wards.some(w=>w.id===21));
 assert.ok(g[1].after.unitsById.rival.wards.some(w=>w.id===27));
 assert.equal(g[2].after.unitsById.rival.wards.some(w=>w.id===27),false);
 assert.ok(g[3].after.unitsById.hero.hp<g[3].before.unitsById.hero.hp);
 assert.ok(g[4].after.unitsById.hero.hp>g[4].before.unitsById.hero.hp);
 assert.ok(g[4].after.unitsById.rival.wards.some(w=>w.id===21));
 assert.equal(g[5].after.unitsById.rival.wards.some(w=>w.id===21),false);
 assert.deepEqual(createPromoTactics(dataset,defaultParams('kids'),531).arena.events,result.arena.events);
 assert.ok(!Object.keys(result.arena.unsupported).length);
});
