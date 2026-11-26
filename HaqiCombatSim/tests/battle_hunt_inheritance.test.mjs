import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {HUNT_EQUIPMENT,huntInheritanceQuote,salvageQuote} from '../js/adventure_hunt_core.js';
import {syncEquipmentInstances,validateEquipmentInstances} from '../js/adventure_equipment_instances_core.js';
import {persistReward} from '../js/adventure_reward_persistence.js';
import {renderHuntInheritance} from '../js/views/adventure/view_hunt_inheritance.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {content:c}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
function fixture(level=3){
 const save=A.createAdventure(c);save.xp=c.progression.xpThresholds[7];A.syncProgression(save,c);
 for(const id of HUNT_EQUIPMENT)save.inventory[id]=1;
 save.inventory[100]=200;save.inventory[17213]=17;syncEquipmentInstances(save,c);
 const source=save.equipmentInstances.find(r=>r.gsid===HUNT_EQUIPMENT[0]),target=save.equipmentInstances.find(r=>r.gsid===HUNT_EQUIPMENT[1]);
 source.serverdata.addlel=level;source.serverdata.gem={holecnt:1,ins:[]};target.serverdata.gem={holecnt:2,ins:[]};
 save.equipment[2]=target.gsid;save.equipmentGuids[2]=target.guid;syncEquipmentInstances(save,c);
 return {save,source,target,action:{type:'hunt-forge',op:'inherit',sourceGuid:source.guid,targetGuid:target.guid}};
}
test('inheritance transfers +1 and +3 without copying levels, materials or socket layouts',()=>{
 for(const level of [1,3]){
  const {save,source,target,action}=fixture(level),before=structuredClone(save.inventory);
  A.applyAction(save,c,action);const from=save.equipmentInstances.find(r=>r.guid===source.guid),to=save.equipmentInstances.find(r=>r.guid===target.guid);
  assert.equal(from.serverdata.addlel,0);assert.equal(to.serverdata.addlel,level);
  assert.deepEqual(save.inventory,{...before,100:150});assert.deepEqual(from.serverdata.gem,{holecnt:1,ins:[]});assert.deepEqual(to.serverdata.gem,{holecnt:2,ins:[]});
  assert.equal(save.upgrades[source.gsid],0);assert.equal(save.upgrades[target.gsid],level);validateEquipmentInstances(save,c);
  assert.deepEqual(A.parseSave(JSON.stringify(save),c).equipmentInstances,save.equipmentInstances);
  assert.equal(save.economyLedger.totals[100].spent,50);assert.equal(save.hunt.ledger.at(-1).kind,'inherit');
  const once=structuredClone(save);assert.throws(()=>A.applyAction(save,c,action),/没有可以转移/);assert.deepEqual(save,once);
  assert.equal(salvageQuote(save,c,target.guid).allowed,false,'received investment stays protected');
 }
});
test('switching back and recycling cannot refund the transferred investment twice',()=>{
 const {save,source,target,action}=fixture(3);
 for(const row of save.equipmentInstances)if([source.guid,target.guid].includes(row.guid))delete row.serverdata.gem;
 A.applyAction(save,c,action);
 save.equipment[2]=source.gsid;save.equipmentGuids[2]=source.guid;
 A.applyAction(save,c,{...action,sourceGuid:target.guid,targetGuid:source.guid});
 assert.equal(save.inventory[100],100);assert.equal(save.inventory[17213],17);
 assert.equal(save.equipmentInstances.filter(r=>HUNT_EQUIPMENT.includes(r.gsid)).reduce((sum,r)=>sum+r.serverdata.addlel,0),3);
 save.inventory[target.gsid]++;syncEquipmentInstances(save,c);
 A.applyAction(save,c,{type:'hunt-forge',op:'salvage',guid:target.guid});
 assert.equal(save.inventory[919805],3);assert.equal(save.inventory[17213],17);assert.equal(save.inventory[100],100);
 assert.equal(save.inventory[target.gsid],1);assert.equal(save.upgrades[source.gsid],3);
 assert.deepEqual(A.parseSave(JSON.stringify(save),c).hunt.ledger.map(r=>r.kind),['inherit','inherit','salvage']);
});
test('stale and invalid inheritance requests cannot charge fees or overwrite upgrades',()=>{
 const cases=[
  s=>{s.inventory[100]=49;},s=>{s.level=7;},s=>{s.pendingEncounter={};},
  (s,a)=>{s.equipment[2]=HUNT_EQUIPMENT[0];s.equipmentGuids[2]=a.sourceGuid;},
  (s,a)=>{s.equipmentInstances.find(r=>r.guid===a.targetGuid).serverdata.addlel=1;},
  (s,a)=>{a.targetGuid=a.sourceGuid;},(s,a)=>{a.sourceGuid='equipment-999999';},
 ];
 for(const change of cases){const {save,action}=fixture();change(save,action);const before=structuredClone(save);
  assert.equal(huntInheritanceQuote(save,c,action.sourceGuid,action.targetGuid).allowed,false);
  assert.throws(()=>persistReward(save,c,action,undefined,{},()=>{}));assert.deepEqual(save,before);
 }
 const {save,action}=fixture(),different=structuredClone(c);
 const group=different.upgradeGroups.find(g=>g.gsids.includes(HUNT_EQUIPMENT[1]));
 group.gsids=group.gsids.filter(id=>id!==HUNT_EQUIPMENT[0]);group.levels[0].cost[1]++;
 assert.equal(huntInheritanceQuote(save,different,action.sourceGuid,action.targetGuid).allowed,false);
});
test('failed persistence leaves original investment intact, retry commits once',()=>{
 const {save,action}=fixture(),before=structuredClone(save);
 assert.throws(()=>persistReward(save,c,action,undefined,{},()=>{throw Error('quota');}),/quota/);assert.deepEqual(save,before);
 let stored;const committed=persistReward(save,c,action,undefined,{},s=>{stored=structuredClone(s);});
 assert.deepEqual(save,before);assert.deepEqual(committed.save,stored);assert.equal(stored.inventory[100],150);
 assert.equal(stored.economyLedger.entries.filter(e=>e.source==='hunt-forge').length,1);
});
function ui(save){
 const nodes=[],calls=[];
 const el=(tag,className='',...children)=>{const n={tag,className,children,events:{},append(...xs){this.children.push(...xs);},setAttribute(){},addEventListener(k,f){this.events[k]=f;}};nodes.push(n);return n;};
 const button=(text,click,cls)=>Object.assign(el('button',cls,text),{click});
 const before=structuredClone(save);renderHuntInheritance(el('div'),{save,assets:{content:c}},{action:a=>calls.push(a)},{el,button});assert.deepEqual(save,before);
 return {nodes,calls,button:nodes.find(n=>n.tag==='button'),selects:nodes.filter(n=>n.tag==='select')};
}
test('inheritance view previews a single GUID intent and disables battle actions',()=>{
 const {save,action}=fixture(),view=ui(save);assert.equal(view.button.disabled,false);view.button.click();assert.deepEqual(view.calls,[action]);
 view.selects[1].value=action.sourceGuid;view.selects[1].events.change();assert.equal(view.button.disabled,true);
 save.pendingEncounter={};const locked=ui(save);assert.equal(locked.button.disabled,true);assert.ok(locked.selects.every(n=>n.disabled));
 const empty=fixture(0);assert.equal(ui(empty.save).button,undefined);
 const duplicates=fixture();duplicates.save.inventory[HUNT_EQUIPMENT[0]]++;syncEquipmentInstances(duplicates.save,c);
 const sameModel=duplicates.save.equipmentInstances.find(r=>r.gsid===HUNT_EQUIPMENT[0]&&!r.serverdata.addlel);
 duplicates.save.equipmentInstances.sort((a,b)=>Number(b.guid===sameModel.guid)-Number(a.guid===sameModel.guid));
 const ordered=ui(duplicates.save);assert.equal(ordered.button.disabled,false,'a duplicate sorting first must not obscure an available model pair');
 assert.equal(ordered.selects[1].value,duplicates.action.targetGuid);ordered.button.click();assert.deepEqual(ordered.calls,[duplicates.action]);
});
