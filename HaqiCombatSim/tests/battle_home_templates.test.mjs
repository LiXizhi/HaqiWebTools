import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildingTemplateObjects,templateRequirements} from '../js/home_building_templates_core.js';
import {applyHomeAction,homeObjects} from '../js/home_actions_core.js';
import {chunkKey} from '../js/home_core.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/adventure/home/catalog.json',import.meta.url))).items;
for(const style of ['wood','stone'])test(style+' template is an atomic reading-backed collection of editable blocks across chunks',()=>{
 const action={type:'template',templateId:style,x:30,y:30,prefix:'a',receipt:'r'},rows=buildingTemplateObjects(style,30,30,'a');
 const parts={inventory:{},'receipt:r':{}};for(const o of rows)parts['chunk:'+chunkKey(o.x,o.y)]={};
 const before=structuredClone(parts);assert.throws(()=>applyHomeAction(parts,{...action,receipt:undefined},catalog),/阅读/);assert.deepEqual(parts,before);
 Object.assign(parts,structuredClone(before));const wall=rows.find(o=>o.itemId.endsWith('-wall'));parts['chunk:'+chunkKey(wall.x,wall.y)].existing={...wall,id:'existing'};const occupied=structuredClone(parts);
 assert.throws(()=>applyHomeAction(parts,action,catalog),/无法/);assert.deepEqual(parts,occupied);
 Object.assign(parts,structuredClone(before));assert.throws(()=>applyHomeAction(parts,{...action,actors:[{x:wall.x+.1,y:wall.y+.1}]},catalog),/无法/);assert.deepEqual(parts,before);
 applyHomeAction(parts,action,catalog);assert.equal(homeObjects(parts).length,rows.length);assert.ok(Object.values(parts.inventory).every(n=>n===0));
 const door=homeObjects(parts).find(o=>o.itemId.endsWith('-door'));applyHomeAction(parts,{type:'door',id:door.id},catalog);assert.equal(homeObjects(parts).find(o=>o.id===door.id).doorOpen,true);
 applyHomeAction(parts,{type:'recall',id:wall.id},catalog);assert.deepEqual(parts.inventory,{});
});
test('hidden connected roof groups skip drawing and hits before dynamic fallback',()=>{
 const source=fs.readFileSync(new URL('../js/view_home.js',import.meta.url),'utf8');
 assert.match(source,/function drawGroup\(g\)\{\s*if\(g.roof&&hiddenRoofs.has\(g.section\)\)return;/);
 assert.doesNotMatch(source,/hiddenRoofs.has\(g.section\)\?\.2/);
});
