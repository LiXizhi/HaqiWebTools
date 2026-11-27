import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {equipmentSummary,previewNewEquipment} from '../js/adventure_equipment_core.js';
import {HUNT_EQUIPMENT,HUNT_MARK} from '../js/adventure_hunt_core.js';
import {syncEquipmentInstances} from '../js/adventure_equipment_instances_core.js';
import {renderHuntEquipmentPreview} from '../js/views/adventure/view_hunt_equipment_preview.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {content:c}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
c.gemCatalog=read('adventure/gems.json');Object.assign(c.items,c.gemCatalog.items);
function fixture(school='fire'){
 const save=A.createAdventure(c);save.school=school;save.xp=c.progression.xpThresholds[7];A.syncProgression(save,c);
 save.inventory[919802]=1;save.inventory[HUNT_MARK]=40;syncEquipmentInstances(save,c);
 A.applyAction(save,c,{type:'equip',itemId:919802});
 const worn=save.equipmentInstances.find(row=>row.guid===save.equipmentGuids[2]);worn.serverdata.addlel=3;
 // A real socket bonus must be removed when the new copy replaces the worn instance.
 const gem=Object.values(c.gemCatalog.items).find(item=>item.stats[101]>0&&c.items[item.id]);
 assert.ok(gem);worn.serverdata.gem={holecnt:1,ins:[gem.id]};syncEquipmentInstances(save,c);
 return save;
}
test('unowned and same-model fresh-copy forecasts equal real exchange then equip in every school',()=>{
 for(const school of Object.keys(c.schools))for(const itemId of HUNT_EQUIPMENT){
  const save=fixture(school),original=JSON.stringify(save),preview=previewNewEquipment(save,c,itemId);
  assert.equal(preview.reason,'');assert.equal(JSON.stringify(save),original,'forecast never grants, spends or saves');
  const actual=structuredClone(save),known=new Set(actual.equipmentInstances.map(row=>row.guid));
  A.applyAction(actual,c,{type:'hunt-forge',op:'exchange',itemId});
  const fresh=actual.equipmentInstances.find(row=>row.gsid===itemId&&!known.has(row.guid));
  assert.equal(fresh.serverdata.addlel,0);assert.equal(fresh.serverdata.gem,undefined);
  A.applyAction(actual,c,{type:'equip',itemId,guid:fresh.guid});
  assert.deepEqual(preview.rows.map(({before,delta,...row})=>row),equipmentSummary(actual,c));
  if(itemId===919802)assert.ok(preview.rows.some(row=>row.key==='hp'&&row.delta<0),'fresh same-model copy loses current upgrade/socket bonuses');
 }
});
test('legacy inventory projections remain read-only and match the next real fresh copy',()=>{
 const save=fixture();delete save.equipmentInstances;delete save.equipmentGuids;delete save.nextEquipmentGuid;
 const before=JSON.stringify(save),preview=previewNewEquipment(save,c,919802);
 assert.equal(preview.reason,'');assert.equal(JSON.stringify(save),before);
 assert.ok(preview.rows.some(row=>row.delta<0));
 const actual=structuredClone(save);syncEquipmentInstances(actual,c);
 const known=new Set(actual.equipmentInstances.map(row=>row.guid));
 A.applyAction(actual,c,{type:'hunt-forge',op:'exchange',itemId:919802});
 const fresh=actual.equipmentInstances.find(row=>row.gsid===919802&&!known.has(row.guid));
 A.applyAction(actual,c,{type:'equip',itemId:919802,guid:fresh.guid});
 assert.deepEqual(preview.rows.map(({before,delta,...row})=>row),equipmentSummary(actual,c));
});
test('locked or pending equipment forecasts explain the gate without changing progression',()=>{
 const save=A.createAdventure(c),before=JSON.stringify(save);
 assert.match(previewNewEquipment(save,c,919801).reason,/等级 8/);assert.equal(JSON.stringify(save),before);
 save.pendingEncounter={id:'frozen'};const frozen=JSON.stringify(save);
 assert.match(previewNewEquipment(save,c,919801).reason,/战斗结束/);assert.equal(JSON.stringify(save),frozen);
});
test('the comparison identifies a fresh +0 copy and separates obtaining from equipping',()=>{
 const save=fixture(),before=JSON.stringify(save),nodes=[];
 const el=(tag,cls='',...children)=>{const n={tag,className:cls,children,append(...items){this.children.push(...items);}};nodes.push(n);return n;};
 const view=renderHuntEquipmentPreview(save,c,919802,{el}),text=nodes.flatMap(n=>n.children.filter(v=>typeof v==='string')).join('\n');
 assert.equal(view.tag,'details');assert.match(text,/新件 \+0.*复苏帽.*\+3/);
 assert.match(text,/不会自动穿戴/);assert.match(text,/宝石不会自动转移/);
 assert.ok(nodes.some(n=>n.tag==='strong'&&n.className==='equipment-loss'));assert.equal(JSON.stringify(save),before);
});
