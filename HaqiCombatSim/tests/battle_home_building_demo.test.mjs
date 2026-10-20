import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createBuildingDemo} from '../js/home_building_demo_core.js';
import {homeObjects,applyHomeAction} from '../js/home_actions_core.js';
import {validateHomePart,homeWaterAt,canPlace} from '../js/home_core.js';
import {isHomePassable} from '../js/home_walk_core.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/adventure/home/catalog.json',import.meta.url))).items;
test('demo has two furnished connected houses, valid save parts and isolated block category',()=>{
 const {home,parts}=createBuildingDemo(catalog),objects=homeObjects(parts);
 for(const [key,data] of Object.entries(parts))validateHomePart(key.startsWith('chunk:')?'chunk':key,data,catalog);
 for(const o of objects){assert.equal(canPlace(o,objects,catalog).ok,true,o.id);assert.equal(homeWaterAt(home.seed,o.x+.5,o.y+.5).water,false,o.id);}
 assert.equal(objects.filter(o=>o.itemId.endsWith('-door')).length,2);
 for(const style of ['wood','stone'])assert.equal(objects.filter(o=>o.itemId===`build-${style}-floor`).length,objects.filter(o=>o.itemId===`build-${style}-roof`).length);
 assert.ok(catalog.filter(i=>i.building).every(i=>i.category==='blocks'));
 assert.ok(catalog.filter(i=>i.category==='building').every(i=>!i.building));
});
test('both demo doors block closed and permit passage when open',()=>{
 const {parts}=createBuildingDemo(catalog);
 for(const door of homeObjects(parts).filter(o=>o.itemId.endsWith('-door'))){
  assert.equal(isHomePassable(door.x+.5,door.y,homeObjects(parts),catalog),false);
  applyHomeAction(parts,{type:'door',id:door.id},catalog);
  assert.equal(isHomePassable(door.x+.5,door.y,homeObjects(parts),catalog),true);
 }
});
