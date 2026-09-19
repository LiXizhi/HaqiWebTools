import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import {equipmentInstances,syncEquipmentInstances} from '../js/adventure_equipment_instances_core.js';
import {strengtheningItems,initialStrengtheningSelection,strengtheningPreview} from '../js/adventure_strengthening_core.js';
import {makeCloudSnapshot,parseCloudSnapshot} from '../js/adventure_cloud_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
const c=read('chapter'),d=read('combat');
function hero(){const s=A.createAdventure(c);s.xp=4654;A.syncProgression(s,c);s.inventory={1912:2,1240:1,17213:10000};syncEquipmentInstances(s,c);return s;}
const act=(s,type,props={})=>A.applyAction(s,c,{type,...props});
test('same GSID has independent GUID upgrades, equipped stats and unchanged socket data',()=>{
    const s=hero(),[first,second]=s.equipmentInstances.filter(x=>x.gsid===1912);
    first.serverdata.gem={holecnt:2,ins:[26001]};
    act(s,'equip',{itemId:1912,guid:second.guid});const base=A.playerSpec(s,c).stats.damagePct.all;
    act(s,'upgrade',{itemId:1912,guid:first.guid});
    assert.equal(A.playerSpec(s,c).stats.damagePct.all,base);
    assert.deepEqual(s.equipmentInstances.find(x=>x.guid===first.guid).serverdata,{addlel:1,gem:{holecnt:2,ins:[26001]}});
    act(s,'equip',{itemId:1912,guid:first.guid});assert.equal(A.playerSpec(s,c).stats.damagePct.all,base+1);
    act(s,'upgrade',{guid:second.guid});act(s,'upgrade',{guid:second.guid});
    assert.equal(A.playerSpec(s,c).stats.damagePct.all,base+1);
    act(s,'equip',{itemId:1912,guid:second.guid});assert.equal(A.playerSpec(s,c).stats.damagePct.all,base+2);
    const snapshot=makeCloudSnapshot(s,c,d,'2026-09-19T10:00:00.000Z','12345678-1234-1234-1234-123456789abc');
    assert.deepEqual(parseCloudSnapshot(JSON.stringify(snapshot),c,d).save.equipmentInstances,s.equipmentInstances);
    assert.deepEqual(A.parseSave(s,c),s);
});
test('legacy save migration credits one existing instance, never upgrades every copy',()=>{
    const s=hero();delete s.equipmentInstances;delete s.equipmentGuids;delete s.nextEquipmentGuid;
    s.upgrades[1912]=2;s.equipment[11]=1912;
    const parsed=A.parseSave(s,c),copies=parsed.equipmentInstances.filter(x=>x.gsid===1912);
    assert.deepEqual(copies.map(x=>x.serverdata.addlel),[2,0]);
    assert.equal(parsed.equipmentGuids[11],copies[0].guid);
    assert.deepEqual(A.parseSave(parsed,c),parsed);
});
test('original filters include equipped gear, exclude full upgrades, and default staff only for beginners',()=>{
    const s=hero(),staff=s.equipmentInstances.find(x=>x.gsid===1912);
    act(s,'equip',{itemId:1912,guid:staff.guid});assert.ok(strengtheningItems(s,c,1).some(x=>x.guid===staff.guid));
    for(let n=0;n<3;n++)act(s,'upgrade',{guid:staff.guid});
    assert.ok(!strengtheningItems(s,c,1).some(x=>x.guid===staff.guid));
    assert.equal(strengtheningItems(s,c,1).length,1);assert.equal(strengtheningItems(s,c,2).length,1);
    assert.equal(initialStrengtheningSelection(s,c),staff.guid);
    const grown={...s,level:11};assert.equal(initialStrengtheningSelection(grown,c),null);
    assert.equal(initialStrengtheningSelection(grown,c,1912,staff.guid),staff.guid);
    assert.match(strengtheningPreview(s,c,staff.guid).error,/满级/);
});
test('bad GUID, cross-item selection and forged instance levels are rejected atomically',()=>{
    const s=hero(),staff=s.equipmentInstances.find(x=>x.gsid===1912);
    for(const action of [{type:'upgrade',guid:'missing'},{type:'upgrade',guid:staff.guid,itemId:1240},{type:'equip',itemId:1240,guid:staff.guid}]){
        const old=structuredClone(s);assert.throws(()=>A.applyAction(s,c,action));assert.deepEqual(s,old);
    }
    for(const change of [x=>x.equipmentInstances[0].serverdata.addlel=999,x=>x.equipmentInstances.push(structuredClone(x.equipmentInstances[0])),x=>x.equipmentGuids[11]='missing']){
        const bad=structuredClone(s);change(bad);assert.throws(()=>A.parseSave(bad,c));
    }
});
test('every raw texture is bounded, hashed, and has a verified permanent CDN URL',()=>{
    assert.equal(Object.keys(c.upgradeSkin).length,15);
    for(const row of Object.values(c.upgradeSkin)){assert.ok(row.size<200000);assert.match(row.sha256,/^[a-f0-9]{64}$/);assert.match(row.cdn,/^https:\/\/cdn.keepwork.com\//);assert.match(row.sourceEntry,/,\d+$/);}
    assert.equal(c.items[17487].name,'祝福魔珠');
});
test('full strengthening catalogue retains all 468 IDs including equipment above shop level cap',()=>{
    const files=['adventure/chapter','adventure/combat','adventure/pets','adventure/shop-candidates','kids/cards','kids/charms','kids/card_names'];
    const {content}=installExpansion(...files.map(n=>JSON.parse(fs.readFileSync(new URL('../data/'+n+'.json',import.meta.url)))));
    for(const id of content.upgradeGroups.flatMap(g=>g.gsids))assert.ok(content.items[id],String(id));
    assert.ok(content.items[2075].stats[138]>50);
});
test('Pandora shield uses original alternating bean and pearl costs and cumulative HP/resilience',()=>{
    const content=structuredClone(c);Object.assign(content.items,content.strengtheningCatalog);
    const group=content.upgradeGroups.find(g=>g.levels[1]?.cost[0]===17487),id=group.gsids[0];
    const s=A.createAdventure(content);s.inventory[id]=1;s.inventory[17213]=60000;s.inventory[17487]=1;
    A.applyAction(s,content,{type:'upgrade',itemId:id});assert.equal(s.inventory[17213],30000);
    const guid=equipmentInstances(s,content).rows[0].guid;
    A.applyAction(s,content,{type:'upgrade',guid});assert.equal(s.inventory[17487],0);assert.equal(s.inventory[17213],30000);
    assert.equal(s.equipmentInstances[0].serverdata.addlel,2);
    assert.equal(strengtheningPreview(s,content,guid).next.hp,160);
    A.applyAction(s,content,{type:'upgrade',guid});assert.equal(s.inventory[17213],0);
    const old=structuredClone(s);assert.throws(()=>A.applyAction(s,content,{type:'upgrade',guid}),/不足/);assert.deepEqual(s,old);
    assert.deepEqual(A.parseSave(s,content).equipmentInstances,s.equipmentInstances);
});
