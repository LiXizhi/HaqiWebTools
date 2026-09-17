import test from 'node:test';import assert from 'node:assert/strict';import {openingChance} from '../../js/rules/deck.js';
test('opening probability uses equipped count, not bag capacity',()=>{
 assert.ok(Math.abs(openingChance(20,1,8)-.4)<1e-12);assert.ok(Math.abs(openingChance(40,1,8)-.2)<1e-12);
 assert.ok(openingChance(20,6,8)>openingChance(40,6,8));assert.equal(openingChance(6,6,8),1);assert.equal(openingChance(0,0,8),0);assert.equal(openingChance(40,6,0),0);assert.throws(()=>openingChance(4,6,8));
});
