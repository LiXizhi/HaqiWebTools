import test from 'node:test';
import assert from 'node:assert/strict';
import {fishingSpot} from '../js/adventure_fishing_spot_core.js';
import {isOcean} from '../js/adventure_fishing_core.js';
import {walkable,distance,findPath} from '../js/adventure_world_core.js';
const world={w:1500,h:1200,paths:[],layout:{coast:[[0,0],[1000,0],[1000,1000],[0,1000]],bridges:[],rivers:[]}};
test('nearby cast stays by the hero even when distant water is clicked',()=>{
 const hero={x:950,y:500},spot=fishingSpot(world,hero,{x:5000,y:500});
 assert.deepEqual(spot.shore,hero);assert.ok(distance(spot.shore,spot.water)<=175);assert.equal(isOcean(world,spot.water.x,spot.water.y),true);
});
test('inland clicks find a walkable bank and a short cast from that bank',()=>{
 const hero={x:400,y:500},spot=fishingSpot(world,hero,{x:1200,y:500});
 assert.ok(spot.shore.x>900);assert.ok(walkable(world,spot.shore.x,spot.shore.y));
 assert.ok(distance(spot.shore,spot.water)<=175);assert.ok(findPath(world,hero,spot.shore).length);assert.equal(isOcean(world,spot.water.x,spot.water.y),true);
});
test('land and malformed destinations never create a fishing spot',()=>{
 assert.equal(fishingSpot(world,{x:400,y:500},{x:500,y:500}),null);
 assert.equal(fishingSpot(world,{x:400,y:500},{x:NaN,y:500}),null);
});
