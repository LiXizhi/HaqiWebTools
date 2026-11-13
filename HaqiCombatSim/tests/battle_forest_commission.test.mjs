import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import {createPveBattle} from '../js/combat_pve_core.js';
import {checkedProgress} from '../js/adventure_cloud_core.js';
import {persistReward} from '../js/adventure_reward_persistence.js';
import {createWorld,walkable,findPath} from '../js/adventure_world_core.js';
import {equipmentSummary} from '../js/adventure_equipment_core.js';
import {forestCommissionRewardPreviews} from '../js/forest_commission_rewards_core.js';
import {forestCommissionPhase,forestCommissionPouch,forestCommissionGoal,forestCommissionScene,FOREST_NPCS,FOREST_SITES,FOREST_PATROL_DUNGEON} from '../js/forest_commission_core.js';
const read=file=>JSON.parse(fs.readFileSync(new URL('../data/'+file,import.meta.url)));
const content=read('adventure/chapter.json'),dataset=read('adventure/combat.json');
// Production installs these original exported items through installExpansion.
const candidates=read('adventure/shop-candidates.json');
for(const id of [1415,1416,1417,1418,1419])content.items[id]=candidates[id];
content.worldMaps={camp:read('adventure/maps/camp.json')};
const fresh=school=>A.createAdventure(content,{school:school||'fire',seed:231});
function act(save,step,props={}){
 const id=step==='accept'?FOREST_NPCS.giver:['deliver','brief','report'].includes(step)?FOREST_NPCS.receiver:step==='take-boots'?FOREST_SITES.boots:FOREST_SITES.note;
 const forestTarget={id,kind:typeof id==='number'?'npc':'landmark',...save.position};
 return A.applyAction(save,content,{type:'forest-commission',step,...props},{forestTarget});
}
function toBriefing(save){act(save,'accept');act(save,'take-boots',{object:'boots'});act(save,'deliver');act(save,'take-note',{revealed:true});}
const record=clears=>({version:1,clears,bestTurns:8,bestDefeats:0,lastTurns:8,lastDefeats:0});

test('world props and NPC responses follow carried objects and persisted progress',()=>{
 const save=fresh(),before=JSON.stringify(save);
 const offer=forestCommissionScene(save);
 assert.equal(offer.sites[FOREST_SITES.boots].boots,true);
 assert.match(offer.npcs[FOREST_NPCS.giver],/补给单/);
 assert.equal(JSON.stringify(save),before);
 act(save,'accept');assert.equal(forestCommissionScene(save).sites[FOREST_SITES.boots].active,true);
 act(save,'take-boots',{object:'boots'});
 const carrying=forestCommissionScene(save);
 assert.equal(carrying.sites[FOREST_SITES.boots].boots,false);
 assert.match(carrying.npcs[FOREST_NPCS.receiver],/补给到了/);
 act(save,'deliver');assert.equal(forestCommissionScene(save).sites[FOREST_SITES.note].active,true);
 act(save,'take-note',{revealed:true});assert.match(forestCommissionScene(save).sites[FOREST_SITES.note].label,/已带走/);
 save.openingJourney={phase:'greeting'};assert.equal(forestCommissionScene(save),null);
});

test('reward previews explain actual equipment changes without granting or equipping anything',()=>{
 const save=fresh(),before=JSON.stringify(save);
 const [boots]=forestCommissionRewardPreviews(save,content,'deliver');
 assert.equal(boots.owned,false);assert.equal(boots.reason,'');
 assert.equal(boots.changes.find(row=>row.key==='hp').delta,20);
 assert.equal(JSON.stringify(save),before);
 save.inventory[boots.id]=1;
 const [duplicate]=forestCommissionRewardPreviews(save,content,'deliver');
 assert.equal(duplicate.owned,true);assert.deepEqual(duplicate.changes,[]);assert.equal(duplicate.coins,200);
});

test('commission carries quest objects separately and requires a new full patrol before its final reward',()=>{
 const save=fresh();save.dungeonChallengeRecords={[FOREST_PATROL_DUNGEON]:record(2)};
 assert.equal(forestCommissionPhase(save),'offer');act(save,'accept');
 const before=structuredClone(save.inventory);
 assert.equal(act(save,'take-boots',{object:'hat'}).changed,false);assert.deepEqual(save.inventory,before);
 assert.equal(forestCommissionPhase(save),'boots');act(save,'take-boots',{object:'boots'});
 assert.equal(forestCommissionPouch(save)[0].id,'patrol-boots');assert.deepEqual(save.inventory,before);
 act(save,'deliver');assert.equal(save.inventory[1260],1);assert.deepEqual(forestCommissionPouch(save),[]);
 assert.throws(()=>act(save,'take-note'),/挪开石头/);act(save,'take-note',{revealed:true});
 assert.equal(forestCommissionPouch(save)[0].id,'patrol-note');act(save,'brief');
 assert.equal(save.forestCommission.clearBaseline,2);assert.throws(()=>act(save,'report'),/完整完成/);
 save.dungeonChallengeRecords[FOREST_PATROL_DUNGEON]=record(3);
 assert.equal(forestCommissionPhase(save),'report');act(save,'report');
 assert.equal(save.inventory[1415],1);assert.equal(save.inventory[1240]||0,0);assert.equal(save.inventory[1250]||0,0);
 assert.deepEqual(forestCommissionPouch(save),[]);assert.equal(forestCommissionPhase(save),'done');
 const reward=structuredClone(save.inventory);assert.throws(()=>act(save,'report'));assert.deepEqual(save.inventory,reward);
 assert.ok(A.parseSave(save,content));assert.ok(checkedProgress(save,content,dataset));
});

test('commission checks physical access, onboarding and live battle before changing progress',()=>{
 const save=fresh(),before=JSON.stringify(save);
 assert.throws(()=>A.applyAction(save,content,{type:'forest-commission',step:'accept'},{forestTarget:{id:FOREST_NPCS.giver,kind:'npc',x:save.position.x+111,y:save.position.y}}),/靠近/);
 assert.equal(JSON.stringify(save),before);
 save.openingJourney={version:1,phase:'offer'};assert.throws(()=>act(save,'accept'),/第一次冒险/);
 delete save.openingJourney;save.pendingEncounter={};assert.throws(()=>act(save,'accept'),/战斗/);
 delete save.pendingEncounter;save.zone='earth';assert.throws(()=>act(save,'accept'),/回到营地/);
});

for(const [school,boots]of Object.entries({ice:1256,death:1257,life:1258,storm:1259,fire:1260}))test(school+' delivery boots change actual next-battle maximum HP when worn',()=>{
 const save=fresh(school),initial=A.playerSpec(save,content);toBriefing(save);
 const initialHp=equipmentSummary(save,content).find(row=>row.key==='hp').value;
 assert.equal(save.inventory[boots],1);assert.deepEqual(A.playerSpec(save,content),initial,'delivery does not silently equip');
 A.applyAction(save,content,{type:'equip',itemId:boots});
 const equipped=A.playerSpec(save,content),equippedHp=equipmentSummary(save,content).find(row=>row.key==='hp').value;assert.ok(equippedHp>initialHp);
 const battle=createPveBattle({dataset,player:equipped,monsters:[content.monsters['fire-scout']],seed:231});
 assert.equal(battle.sides.near[0].maxHp,equippedHp);
 assert.ok(A.parseSave(save,content));
});

test('owned reward equipment converts once and a failed local write cannot consume delivery',()=>{
 const save=fresh();save.inventory[1260]=1;act(save,'accept');act(save,'take-boots',{object:'boots'});
 const before=JSON.stringify(save),coins=save.inventory[100]||0;
 const action={type:'forest-commission',step:'deliver'},access={forestTarget:{id:FOREST_NPCS.receiver,kind:'npc',...save.position}};
 assert.throws(()=>persistReward(save,content,action,access,{getItem(){return null;},setItem(){throw Error('quota');}}),/quota/);
 assert.equal(JSON.stringify(save),before);
 let written;const result=persistReward(save,content,action,access,{getItem(){return null;},setItem(key,value){if(!key.endsWith('.updated'))written=value;}});
 assert.equal(result.save.inventory[100],coins+200);assert.equal(result.save.inventory[1260],1);
 assert.equal(JSON.parse(written).forestCommission.phase,'note');assert.equal(save.forestCommission.phase,'delivery');
 assert.throws(()=>act(result.save,'deliver'));assert.equal(result.save.inventory[100],coins+200);
});

for(const [school,[hat,robe,cloak,hp]]of Object.entries({fire:[1240,1250,1415,40],ice:[1236,1246,1416,54],storm:[1239,1249,1417,32],death:[1237,1247,1418,45],life:[1238,1248,1419,48]}))test(school+' patrol cloak adds actual combat stats beyond the mainline hat and robe',()=>{
 const save=fresh(school);save.xp=content.progression.xpThresholds[4];A.syncProgression(save,content);
 for(const id of [hat,robe]){save.inventory[id]=1;A.applyAction(save,content,{type:'equip',itemId:id});}
 toBriefing(save);act(save,'brief');save.dungeonChallengeRecords={[FOREST_PATROL_DUNGEON]:record(1)};
 const before=structuredClone(A.playerSpec(save,content));
 const [preview]=forestCommissionRewardPreviews(save,content,'report');
 assert.equal(preview.id,cloak);assert.equal(preview.reason,'');assert.equal(preview.owned,false);
 assert.equal(preview.changes.find(row=>row.key==='hp').delta,hp);
 assert.equal(preview.changes.find(row=>row.key==='damagePct').delta,4);
 act(save,'report');assert.equal(save.inventory[cloak],1);assert.deepEqual(A.playerSpec(save,content),before,'claiming never silently equips');
 A.applyAction(save,content,{type:'equip',itemId:cloak});
 const after=A.playerSpec(save,content),battle=createPveBattle({dataset,player:after,monsters:[content.monsters['fire-scout']],seed:231});
 assert.equal(after.stats.hpFlat-before.stats.hpFlat,hp);
 assert.equal((after.stats.damagePct[school]||0)-(before.stats.damagePct[school]||0),4);
 assert.equal(battle.sides.near[0].stats.damagePct[school],after.stats.damagePct[school]);
 assert.equal(battle.sides.near[0].maxHp,equipmentSummary(save,content).find(row=>row.key==='hp').value);
 assert.equal(save.equipment[2],hat);assert.equal(save.equipment[5],robe);assert.equal(save.equipment[8],cloak);
 assert.ok(A.parseSave(save,content));
});

test('a pre-owned patrol cloak converts once, and missing reward data cannot consume a completed patrol',()=>{
 const save=fresh();toBriefing(save);act(save,'brief');save.dungeonChallengeRecords={[FOREST_PATROL_DUNGEON]:record(1)};
 const unavailable={...content,items:{...content.items}};delete unavailable.items[1415];
 const before=JSON.stringify(save),access={forestTarget:{id:FOREST_NPCS.receiver,kind:'npc',...save.position}};
 assert.throws(()=>A.applyAction(save,unavailable,{type:'forest-commission',step:'report'},access),/尚未准备好/);
 assert.equal(JSON.stringify(save),before);
 save.inventory[1415]=1;const coins=save.inventory[100]||0;
 act(save,'report');assert.equal(save.inventory[1415],1);assert.equal(save.inventory[100],coins+200);
 assert.throws(()=>act(save,'report'));assert.equal(save.inventory[100],coins+200);
});

test('invalid optional commission progress is rejected while untouched legacy saves remain readable',()=>{
 assert.ok(A.parseSave(fresh(),content));
 for(const state of [{version:2,phase:'boots'},{version:1,phase:'report'},{version:1,phase:'patrol',clearBaseline:-1},{version:1,phase:'done',clearBaseline:0},{version:1,phase:'boots',rewarded:true}]){
  const save=fresh();save.forestCommission=state;assert.throws(()=>A.parseSave(save,content));
 }
 const save=fresh();toBriefing(save);act(save,'brief');save.dungeonChallengeRecords={[FOREST_PATROL_DUNGEON]:record(1)};
 act(save,'report');save.forestCommission.clearBaseline=2;assert.throws(()=>A.parseSave(save,content));
});

test('a real boots choice retains a bounded reading receipt and previous wrong attempts across saves',()=>{
 const save=fresh();act(save,'accept');
 const revision=save.revision;
 assert.equal(act(save,'take-boots',{object:'hat',learning:{at:10,attempts:1}}).changed,true);
 assert.equal(save.revision,revision+1,'a persisted wrong attempt also advances the cloud conflict revision');
 assert.equal(save.forestCommission.findAttempts,1);assert.equal(save.forestCommission.practice,undefined);
 const restored=checkedProgress(A.parseSave(save,content),content).save;
 act(restored,'take-boots',{object:'boots',learning:{at:20,attempts:1}});
 assert.deepEqual(restored.forestCommission.practice,{id:'forest:camp-patrol-supplies:boots:1',at:20,attempts:2,assisted:true});
 assert.equal(restored.forestCommission.findAttempts,undefined);
 assert.deepEqual(checkedProgress(restored,content).save.forestCommission.practice,restored.forestCommission.practice);
 for(const patch of [{at:-1},{attempts:0},{attempts:1000},{assisted:false},{id:'untrusted'},{words:['anything']}]){
  const bad=structuredClone(restored);Object.assign(bad.forestCommission.practice,patch);assert.throws(()=>A.parseSave(bad,content));
 }
 const invalid=fresh();act(invalid,'accept');assert.throws(()=>act(invalid,'take-boots',{object:'boots',learning:{at:NaN,attempts:1}}));
 assert.equal(invalid.forestCommission.phase,'boots');
});

test('both English search sites exist beside real camp structures and can be reached from spawn',()=>{
 const save=fresh(),world=createWorld('camp',content,save);
 for(const id of Object.values(FOREST_SITES)){
  const site=world.landmarks.find(row=>row.id===id);assert.ok(site,id);
  assert.equal(walkable(world,site.x,site.y),true,id);
  assert.ok(findPath(world,save.position,site).length,id+' route');
 }
 assert.ok(world.buildings.some(row=>row.frame==='tent'),'boots have an actual tent');
 assert.ok(world.buildings.some(row=>row.frame==='academy'),'route desk has an actual academy');
 act(save,'accept');assert.equal(forestCommissionGoal(save).id,FOREST_SITES.boots);
});
