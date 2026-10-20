import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {requiresReading,chunkKey,matchHomeSpell} from '../js/home_core.js';
import {applyHomeAction,homeObjects} from '../js/home_actions_core.js';
import {buildingTemplateObjects,TEMPLATE_PRACTICE} from '../js/home_building_templates_core.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/adventure/home/catalog.json',import.meta.url))).items;
test('reading is required by default; explicit false allows repeat creation without inventory or practice',()=>{
 assert.equal(requiresReading({}),true);assert.equal(requiresReading({requiresReading:true}),true);assert.equal(requiresReading({requiresReading:false}),false);
 const parts={inventory:{},'chunk:0,0':{}};
 for(let x=0;x<3;x++)applyHomeAction(parts,{type:'create',object:{id:'floor'+x,itemId:'build-wood-floor',x,y:0}},catalog);
 assert.equal(homeObjects(parts).length,3);assert.deepEqual(parts.inventory,{});
 assert.throws(()=>applyHomeAction(parts,{type:'create',object:{id:'chair',itemId:'chair',x:5,y:0}},catalog),/阅读/);
});
test('template reading grants exactly one complete structure per receipt, with one practice event and no material charge',()=>{
 for(const template of TEMPLATE_PRACTICE){
  assert.equal(requiresReading(template),true);assert.equal(matchHomeSpell('wrong',TEMPLATE_PRACTICE,'en',{itemId:template.id}).candidates.length,0);
  assert.equal(matchHomeSpell(`I want a ${template.en}.`,TEMPLATE_PRACTICE,'en',{itemId:template.id}).candidates[0].itemId,template.id);
  const rows=buildingTemplateObjects(template.templateId),parts={inventory:{},'receipt:r':{},'local:practice':{}};
  for(const o of rows)parts['chunk:'+chunkKey(o.x,o.y)]={};
  const action={type:'template',templateId:template.templateId,x:0,y:0,prefix:'one',receipt:'r',practice:{id:'r',itemId:template.id}};
  applyHomeAction(parts,action,catalog);const once=structuredClone(parts);assert.equal(applyHomeAction(parts,action,catalog),false);assert.deepEqual(parts,once);
  assert.equal(homeObjects(parts).length,rows.length);assert.deepEqual(parts.inventory,{});assert.equal(Object.keys(parts['local:practice']).length,1);
 }
});
