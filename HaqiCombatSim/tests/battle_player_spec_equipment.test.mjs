import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAdventure,playerSpec,catalogStatSnapshot} from '../js/adventure_core.js';
import {syncEquipmentInstances} from '../js/adventure_equipment_instances_core.js';

function fixture(){
    const content=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url)));
    content.items[1912].maxCount=99;
    const save=createAdventure(content,{school:'fire'});save.level=10;
    Object.assign(save.inventory,{1912:2,1240:1,1250:1});
    Object.assign(save.equipment,{11:1912,2:1240,5:1250});
    syncEquipmentInstances(save,content);
    return {content,save};
}

test('NPC attribute checks scan the equipment catalogue at most once per calculation',()=>{
    const {content,save}=fixture();let scans=0;
    content.items=new Proxy(content.items,{ownKeys(target){scans++;return Reflect.ownKeys(target);}});
    const before=structuredClone(save);
    catalogStatSnapshot(save,content);
    assert.equal(scans,1,'the number of worn items must not multiply full inventory reconciliation');
    assert.deepEqual(save,before,'render-time attribute reads must not migrate or mutate the save');
});

test('fresh specs reflect selected GUID, upgrades, gems and reduced inventory without stale caching',()=>{
    const {content,save}=fixture();const [first,second]=save.equipmentInstances.filter(row=>row.gsid===1912);
    const base=playerSpec(save,content);
    second.serverdata.addlel=2;save.equipmentGuids[11]=second.guid;
    const upgraded=playerSpec(save,content);
    assert.equal(upgraded.stats.damagePct.all,base.stats.damagePct.all+2);
    content.items[999001]={id:999001,stats:{101:77}};
    second.serverdata.gem={holecnt:1,ins:[999001]};
    assert.equal(playerSpec(save,content).stats.hpFlat,upgraded.stats.hpFlat+77);
    save.inventory[1912]=1;
    assert.equal(playerSpec(save,content).stats.hpFlat,upgraded.stats.hpFlat+77,'selected copy survives count reconciliation');
    save.equipmentGuids[11]=first.guid;
    assert.deepEqual(playerSpec(save,content),base);
    save.inventory[1912]=0;
    const removed=playerSpec(save,content);assert.ok(removed.stats.hpFlat<base.stats.hpFlat);
});

test('legacy equipment projection keeps strengthening and fixed cards identical after migration',()=>{
    const {content,save}=fixture();delete save.equipmentInstances;delete save.equipmentGuids;delete save.nextEquipmentGuid;
    save.upgrades[1912]=2;
    const legacy=playerSpec(save,content),before=structuredClone(save);
    assert.deepEqual(playerSpec(save,content),legacy);assert.deepEqual(save,before);
    syncEquipmentInstances(save,content);
    assert.deepEqual(playerSpec(save,content),legacy);
});
