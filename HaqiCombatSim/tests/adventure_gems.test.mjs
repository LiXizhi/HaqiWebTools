import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import {syncEquipmentInstances} from '../js/adventure_equipment_instances_core.js';
import {gemPreview,gemCompatibility,gemEquipment} from '../js/adventure_gems_core.js';
const read=n=>JSON.parse(fs.readFileSync(new URL(`../data/adventure/${n}.json`,import.meta.url)));
const c=read('chapter');c.gemCatalog=read('gems');Object.assign(c.items,read('shop-candidates'),c.gemCatalog.items);
c.progression.levelCap=50;while(c.progression.xpThresholds.length<50)c.progression.xpThresholds.push(c.progression.xpThresholds.at(-1)+1000);
function hero(){const s=A.createAdventure(c);s.xp=c.progression.xpThresholds[19];A.syncProgression(s,c);Object.assign(s.inventory,{1231:2,26001:10,26002:10,26003:10,26004:10,26005:10,26701:3,26702:3,26703:3,17179:3});syncEquipmentInstances(s,c);return s;}
const guid=s=>s.equipmentInstances.find(x=>x.gsid===1231).guid;
const mount=(s,id=26001,extra={})=>A.applyAction(s,c,{type:'mount-gem',guid:guid(s),gemId:id,runes:[],...extra});
test('original catalogue, odds, runes and level four gate',()=>{
 const s=hero();assert.equal(Object.keys(c.gemCatalog.items).length,104);
 assert.equal(gemPreview(s,c,{guid:guid(s),gemId:26003}).odds,60);
 assert.equal(gemPreview(s,c,{guid:guid(s),gemId:26003,runes:[26701,26701,26701]}).odds,75);
 assert.match(gemPreview(s,c,{guid:guid(s),gemId:26004}).error,/100%/);
 assert.ok(gemEquipment(s,c,1).length===2);
});
test('single-instance socket affects equipped stats and persists through save and removal',()=>{
 const s=hero(),first=guid(s),second=s.equipmentInstances.filter(x=>x.gsid===1231)[1].guid;
 A.applyAction(s,c,{type:'equip',itemId:1231,guid:first});const hp=A.playerSpec(s,c).stats.hpFlat,revision=s.revision;
 assert.ok(mount(s).success);assert.equal(s.revision,revision+1);assert.equal(A.playerSpec(s,c).stats.hpFlat,hp+60);
 assert.equal(s.inventory[26001],9);assert.deepEqual(A.parseSave(s,c).equipmentInstances,s.equipmentInstances);
 A.applyAction(s,c,{type:'equip',itemId:1231,guid:second});assert.equal(A.playerSpec(s,c).stats.hpFlat,hp);
 A.applyAction(s,c,{type:'remove-gems',guid:first,gemIds:[26001]});assert.equal(s.inventory[26001],10);assert.equal(s.inventory[17179],2);
});
test('rejected actions leave inventory, instances, serial and revision intact',()=>{
 const s=hero();mount(s);const before=structuredClone(s);
 for(const action of [{type:'mount-gem',guid:guid(s),gemId:26001},{type:'mount-gem',guid:guid(s),gemId:26004},{type:'mount-gem',guid:'missing',gemId:26001},{type:'mount-gem',guid:guid(s),gemId:26002,runes:[26701,26701,26701,26701]},{type:'remove-gems',guid:guid(s),gemIds:[26001,26001]}]){assert.throws(()=>A.applyAction(s,c,action));assert.deepEqual(s,before);}
});
test('replacement requires confirmation and seeded failures downgrade by original stat 38',()=>{
 const s=hero();mount(s);assert.throws(()=>mount(s,26002),/确认/);
 const clone=structuredClone(s);assert.deepEqual(mount(s,26002,{confirmReplace:true,runes:[26703]}),mount(clone,26002,{confirmReplace:true,runes:[26703]}));assert.deepEqual(s,clone);
 assert.deepEqual(s.equipmentInstances.find(x=>x.guid===guid(s)).serverdata.gem.ins,[26002]);
 const fail=hero();c.balanceParams={gems:{odds:[0,0,0,0,0]}};
 const count=fail.inventory[26001];assert.equal(mount(fail,26002).success,false);assert.equal(fail.inventory[26001],count+1);assert.equal(fail.inventory[26002],9);delete c.balanceParams;
});
test('source restrictions: weapons reject HP, hats reject accuracy and penetration',()=>{
 const gems=Object.values(c.gemCatalog.items),hp=c.items[26001],hit=gems.find(x=>x.stats[103]>0),pen=gems.find(x=>Object.keys(x.stats).some(k=>Number(k)>=212&&Number(k)<=219));
 assert.ok(gemCompatibility({kind:1,slot:11,stats:{36:4}},hp));
 assert.ok(gemCompatibility(c.items[1231],hit));assert.ok(gemCompatibility(c.items[1231],pen));
});
test('forged socket data and depleted removal materials are rejected',()=>{
 const s=hero();mount(s);s.inventory[17179]=0;const before=structuredClone(s);assert.throws(()=>A.applyAction(s,c,{type:'remove-gems',guid:guid(s),gemIds:[26001]}),/不足/);assert.deepEqual(s,before);
 s.equipmentInstances.find(x=>x.guid===guid(s)).serverdata.gem.ins=[26001,26002];assert.throws(()=>A.parseSave(s,c));
});
test('full sockets permit only higher same-type replacement; stack cap blocks removal',()=>{
 const s=hero(),row=s.equipmentInstances.find(x=>x.guid===guid(s));
 row.serverdata.gem={holecnt:0,ins:[26001,26006,26011,26016]};s.inventory[26021]=1;
 assert.match(gemPreview(s,c,{guid:guid(s),gemId:26021}).error,/槽已满/);
 assert.equal(gemPreview(s,c,{guid:guid(s),gemId:26002}).error,null);
 s.inventory[26001]=c.items[26001].maxCopiesInStack;
 const before=structuredClone(s);assert.throws(()=>A.applyAction(s,c,{type:'remove-gems',guid:guid(s),gemIds:[26001]}),/堆叠上限/);assert.deepEqual(s,before);
});
