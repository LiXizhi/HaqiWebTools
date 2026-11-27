import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {restorePveBattle,playPveRound} from '../js/combat_pve_core.js';
import {HUNT_ID,HUNT_MARK,HUNT_EQUIPMENT,EQUIPMENT_ESSENCE,grantHuntReward,salvageQuote,huntStatus,bulkSalvageQuote,HUNT_COMMON_EQUIPMENT} from '../js/adventure_hunt_core.js';
import {equipmentInstances,syncEquipmentInstances} from '../js/adventure_equipment_instances_core.js';
import {persistReward} from '../js/adventure_reward_persistence.js';
import {tacticalEnemyIntents} from '../js/tactical_encounter_core.js';
import {huntResultFeedback} from '../js/adventure_hunt_feedback_core.js';
import {upgradeLevels} from '../js/adventure_upgrade_core.js';
import {checkedRoleProgress,validateRoles,emptyRoles,addRole} from '../js/adventure_roles_core.js';
import {makeCloudSnapshot,parseCloudSnapshot} from '../js/adventure_cloud_core.js';
import {splitRoleSave,joinRoleSave} from '../js/adventure_storage_core.js';
import {equipmentAttributes} from '../js/adventure_equipment_core.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {content:c,dataset:d}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
function hero(){const s=A.createAdventure(c);s.xp=c.progression.xpThresholds[7];A.syncProgression(s,c);return s;}
const act=(s,props)=>A.applyAction(s,c,{type:'hunt-forge',...props});

test('bulk recycle reviews exact instances, protects investments and retains a copy per item',()=>{
 const s=hero(),id=HUNT_EQUIPMENT[0],other=HUNT_EQUIPMENT[1];
 s.inventory[id]=6;s.inventory[other]=3;s.inventory[HUNT_COMMON_EQUIPMENT]=20;syncEquipmentInstances(s,c);
 const rows=s.equipmentInstances.filter(row=>row.gsid===id);
 A.applyAction(s,c,{type:'equip',itemId:id,guid:rows[0].guid});
 rows[1].serverdata.addlel=1;rows[2].serverdata.gem={holecnt:1,ins:[]};
 s.equipmentInstances=equipmentInstances(s,c).rows.map(row=>rows.find(candidate=>candidate.guid===row.guid)||row);
 const before=structuredClone(s),q=bulkSalvageQuote(s,c);
 assert.deepEqual(s,before);assert.equal(q.guids.length,24);assert.equal(q.essence,34);
 assert.ok(rows.slice(0,3).every(row=>!q.guids.includes(row.guid)));
 assert.throws(()=>act(s,{op:'salvage-bulk',guids:q.guids.slice(1)}),/重新核对/);assert.deepEqual(s,before);
 assert.throws(()=>persistReward(s,c,{type:'hunt-forge',op:'salvage-bulk',guids:q.guids},{},{},()=>{throw Error('disk full');}),/disk full/);
 assert.deepEqual(s,before);
 act(s,{op:'salvage-bulk',guids:q.guids});
 assert.equal(s.inventory[id],3);assert.equal(s.inventory[other],1);assert.equal(s.inventory[HUNT_COMMON_EQUIPMENT],1);
 assert.equal(s.inventory[EQUIPMENT_ESSENCE],34);assert.equal(bulkSalvageQuote(s,c).guids.length,0);
 assert.deepEqual(A.parseSave(s,c).equipmentInstances,s.equipmentInstances);
 assert.equal(s.hunt.ledger.filter(row=>row.kind==='salvage').length,3);
 assert.throws(()=>act(s,{op:'salvage-bulk',guids:q.guids}),/没有可回收/);
});

test('bulk recycle refuses a stale review after an instance is equipped or added',()=>{
 const s=hero(),id=HUNT_EQUIPMENT[0];s.inventory[id]=4;syncEquipmentInstances(s,c);
 let q=bulkSalvageQuote(s,c);
 A.applyAction(s,c,{type:'equip',itemId:id,guid:q.guids[0]});
 let before=structuredClone(s);assert.throws(()=>act(s,{op:'salvage-bulk',guids:q.guids}),/重新核对/);assert.deepEqual(s,before);
 q=bulkSalvageQuote(s,c);s.inventory[id]++;syncEquipmentInstances(s,c);before=structuredClone(s);
 assert.throws(()=>act(s,{op:'salvage-bulk',guids:q.guids}),/重新核对/);assert.deepEqual(s,before);
 s.pendingEncounter={};assert.throws(()=>act(s,{op:'salvage-bulk',guids:bulkSalvageQuote(s,c).guids}),/当前战斗/);
});
function victory(s){const {checkpoint}=A.beginEncounter(s,c,HUNT_ID);const b=restorePveBattle(d,c,checkpoint);b.finished=true;b.winner='near';return A.settleEncounter(s,c,b);}

test('hunt result previews exact settlement without mutating or rerolling the reward',()=>{
 const observed=new Set();
 for(let seed=1;seed<=80;seed++){
  const s=hero();s.seed=seed;s.inventory[HUNT_MARK]=38;
  const {checkpoint}=A.beginEncounter(s,c,HUNT_ID),b=restorePveBattle(d,c,checkpoint);b.finished=true;b.winner='near';
  const before=structuredClone(s),feedback=huntResultFeedback(s,c,b);
  assert.deepEqual(s,before);assert.deepEqual(huntResultFeedback(s,c,b),feedback);
  assert.equal(feedback.reward.marks,40);observed.add(feedback.reward.dropped);
  const result=A.settleEncounter(s,c,b);assert.deepEqual(result.huntReward.items,feedback.reward.items);
  assert.equal(s.inventory[HUNT_MARK],feedback.reward.marks);
 }
 assert.equal(observed.size,2,'test covers both direct drop and marks-only outcomes');
});

test('defeat feedback distinguishes exposed hits, successful defence and unresolved attacks',()=>{
 const s=hero(),{checkpoint}=A.beginEncounter(s,c,HUNT_ID),b=restorePveBattle(d,c,checkpoint);
 b.finished=true;b.winner='far';const heroId=b.sides.near[0].id;
 const before=structuredClone(s);
 b.tacticalEncounter.history=[{effect:'重击',outcome:'resolved',damage:[{target:heroId,amount:200}]}];
 assert.match(huntResultFeedback(s,c,b).body,/直接命中/);
 b.tacticalEncounter.history=[{effect:'重击',outcome:'resolved',shieldConsumed:true}];
 assert.match(huntResultFeedback(s,c,b).body,/已经挡住/);
 b.tacticalEncounter.history=[{effect:'重击',outcome:'fizzled',damage:[{target:heroId,amount:200}]}];
 assert.match(huntResultFeedback(s,c,b).body,/留意当前/);
 assert.deepEqual(s,before);assert.equal(huntResultFeedback(s,c,b).reward,undefined);
 delete s.pendingEncounter;assert.equal(huntResultFeedback(s,c,b),null);
});

test('review includes a fallen companion heavy hit and companion counter consumption',()=>{
 const s=hero(),{checkpoint}=A.beginEncounter(s,c,HUNT_ID),b=restorePveBattle(d,c,checkpoint);
 const ally={...structuredClone(b.sides.near[0]),id:'fallen-ally',school:'life',hp:0};
 b.sides.near.push(ally);b.unitsById[ally.id]=ally;b.finished=true;b.winner='far';
 const statusId=b.resolved.tacticalEncounter.counterCharms.life;
 b.tacticalEncounter.history=[{effect:'重击',outcome:'resolved',damage:[{target:ally.id,amount:200}]}];
 b.events=[{type:'tactic_counter_window',targetId:ally.id},{type:'tactic_charge',action:'consumed',targetId:ally.id,statusId}];
 const before=JSON.stringify(b),{review}=huntResultFeedback(s,c,b);
 assert.equal(review.exposed,1);assert.equal(review.counters,1);assert.equal(review.used,1);
 assert.match(review.lesson,/直接命中/);assert.equal(JSON.stringify(b),before);
 b.events[1].statusId=-1;assert.equal(huntResultFeedback(s,c,b).review.used,0);
 b.tacticalEncounter.history[0].damage[0].target=b.sides.far[0].id;
 assert.equal(huntResultFeedback(s,c,b).review.exposed,0);
});

test('formal hunt is gated, selected before battle, frozen and replayable',()=>{
 const low=A.createAdventure(c);assert.equal(huntStatus(low,c).allowed,false);assert.throws(()=>A.beginEncounter(low,c,HUNT_ID),/解锁/);
 const s=hero();act(s,{op:'select',itemId:HUNT_EQUIPMENT[2]});
 const {checkpoint:p}=A.beginEncounter(s,c,HUNT_ID);
 assert.equal(p.huntReward.selected,HUNT_EQUIPMENT[2]);assert.deepEqual(p.monsterTraits,[{}]);
 const parsed=A.parseSave(s,c);assert.deepEqual(parsed.pendingEncounter,p);
 const b=restorePveBattle(d,c,p);assert.equal(b.sides.far[0].maxHp,900);assert.equal(tacticalEnemyIntents(b)[0].effect,'蓄力');
 playPveRound(b,{pass:true});p.decisions.push({pass:true});
 const replay=restorePveBattle(d,c,A.parseSave(s,c).pendingEncounter);
 assert.deepEqual(tacticalEnemyIntents(replay),tacticalEnemyIntents(b));assert.deepEqual(replay.sides.near.map(u=>u.hp),b.sides.near.map(u=>u.hp));
 assert.throws(()=>act(s,{op:'select',itemId:HUNT_EQUIPMENT[0]}),/完成当前战斗/);
 const corrupt=structuredClone(s);corrupt.pendingEncounter.tacticalEncounter.preparationBoost=0;
 assert.throws(()=>A.parseSave(corrupt,c),/招式快照/);
});

test('victory grants marks once; loss grants none; repeated hunt has no respawn tax',()=>{
 const s=hero(),result=victory(s);assert.equal(s.inventory[HUNT_MARK],2);assert.equal(s.hunt.wins,1);assert.equal(result.huntReward.items[0].count,2);
 assert.equal(s.encounterRespawns?.[HUNT_ID],undefined);assert.equal(huntStatus(s,c).allowed,true);
 const {checkpoint}=A.beginEncounter(s,c,HUNT_ID),b=restorePveBattle(d,c,checkpoint);b.finished=true;b.winner='far';
 A.settleEncounter(s,c,b);assert.equal(s.inventory[HUNT_MARK],2);assert.equal(s.hunt.wins,1);
 assert.throws(()=>A.settleEncounter(s,c,b),/战斗/);assert.deepEqual(A.parseSave(s,c).hunt,s.hunt);
});


test('hunt victory, selected reward and ledger survive role reload, record storage and cloud roundtrip',()=>{
 const s=hero();act(s,{op:'select',itemId:HUNT_EQUIPMENT[1]});victory(s);
 const id='12345678-1234-1234-1234-123456789abc';
 const catalog=addRole(emptyRoles(),id,s,1),split=splitRoleSave(s);
 assert.deepEqual(split.records.hunt,s.hunt);assert.equal(split.state.hunt,undefined);
 const cloud=makeCloudSnapshot(s,c,d,'2026-11-27T04:40:00.000Z',id);
 const reloads=[checkedRoleProgress(s,c,d).save,validateRoles(catalog,c,d).roles[0].save,
  joinRoleSave(split.state,split,c),parseCloudSnapshot(JSON.stringify(cloud),c,d).save];
 for(const save of reloads){
  assert.deepEqual(save.hunt,s.hunt);assert.deepEqual(save.economyLedger,s.economyLedger);
  assert.deepEqual(save.inventory,s.inventory);assert.equal(save.hunt.wins,1);
  act(save,{op:'select',itemId:HUNT_EQUIPMENT[2]});victory(save);
  assert.equal(save.hunt.wins,2);assert.equal(save.inventory[HUNT_MARK],4);
 }
});

test('hunt art reuse never grants native story or catalog kills; native encounter still does',()=>{
 const local=structuredClone(c),source=local.monsters['fire-scout'].source.toLowerCase();
 local.catalogQuests={paths:{[source]:40250},quests:[{id:999901,groups:[{kind:'kill',mode:2,items:[{id:40250,count:3}]}]}]};
 const s=hero();
 for(const quest of local.quests){if(quest.id===63002)break;s.quests[quest.id]={accepted:true,claimed:true,progress:{}};}
 s.quests[63002]={accepted:true,claimed:false,progress:{}};
 s.quests[999901]={accepted:true,claimed:false,progress:{}};
 const before=structuredClone(s.quests);
 function win(id){const {checkpoint}=A.beginEncounter(s,local,id);const b=restorePveBattle(d,local,checkpoint);b.finished=true;b.winner='near';return A.settleEncounter(s,local,b);}
 win(HUNT_ID);assert.deepEqual(s.quests,before);assert.equal(s.inventory[HUNT_MARK],2);
 win('fire-scout');assert.equal(s.quests[63002].progress['defeat:40250'],1);
 assert.equal(s.quests[999901].progress['kill:40250'],1);
});

test('20 eligible victories guarantee chosen equipment; extra drops never reset marks',()=>{
 const s=hero();for(let i=0;i<20;i++)victory(s);
 assert.equal(s.inventory[HUNT_MARK],40);assert.equal(s.hunt.wins,20);
 const before=s.inventory[HUNT_EQUIPMENT[1]]||0;
 act(s,{op:'exchange',itemId:HUNT_EQUIPMENT[1]});assert.equal(s.inventory[HUNT_MARK],0);assert.equal(s.inventory[HUNT_EQUIPMENT[1]],before+1);
 assert.throws(()=>act(s,{op:'exchange',itemId:HUNT_EQUIPMENT[1]}),/不足/);
 const a=hero(),b=hero(),pending={encounterId:HUNT_ID,seed:812,huntReward:{version:1,selected:HUNT_EQUIPMENT[2]}};
 assert.deepEqual(grantHuntReward(a,c,pending),grantHuntReward(b,c,pending));
 assert.deepEqual(A.parseSave(s,c).inventory,s.inventory);
});

test('salvage protects last copy, equipped GUID, upgrades and sockets',()=>{
 const s=hero(),id=HUNT_EQUIPMENT[0];s.inventory[id]=5;syncEquipmentInstances(s,c);
 const rows=equipmentInstances(s,c).rows.filter(r=>r.gsid===id);
 act(s,{op:'select',itemId:id});A.applyAction(s,c,{type:'equip',itemId:id,guid:rows[0].guid});
 rows[1].serverdata.addlel=1;rows[2].serverdata.gem={holecnt:1,ins:[]};
 s.equipmentInstances=equipmentInstances(s,c).rows.map(r=>rows.find(x=>x.guid===r.guid)||r);
 for(const row of rows.slice(0,3)){assert.equal(salvageQuote(s,c,row.guid).allowed,false);assert.throws(()=>act(s,{op:'salvage',guid:row.guid}));}
 act(s,{op:'salvage',guid:rows[3].guid});assert.equal(s.inventory[id],4);assert.equal(s.inventory[EQUIPMENT_ESSENCE],3);
 assert.equal(s.equipmentInstances.some(r=>r.guid===rows[3].guid),false);
 assert.throws(()=>act(s,{op:'salvage',guid:rows[3].guid}));
 const last=hero();last.inventory[id]=1;syncEquipmentInstances(last,c);assert.match(salvageQuote(last,c,last.equipmentInstances.find(r=>r.gsid===id).guid).reason,/最后一件/);
 assert.deepEqual(A.parseSave(s,c).equipmentInstances,s.equipmentInstances);
});

test('exchange, salvage and recipes persist atomically and log exact costs',()=>{
 let s=hero();s.inventory[HUNT_MARK]=40;const original=structuredClone(s);
 assert.throws(()=>persistReward(s,c,{type:'hunt-forge',op:'exchange',itemId:HUNT_EQUIPMENT[0]}, {},{},()=>{throw Error('disk full');}),/disk full/);
 assert.deepEqual(s,original);
 const committed=persistReward(s,c,{type:'hunt-forge',op:'exchange',itemId:HUNT_EQUIPMENT[0]}, {},{},()=>{});
 assert.deepEqual(s,original);s=committed.save;
 assert.equal(s.inventory[HUNT_MARK],0);assert.equal(s.inventory[HUNT_EQUIPMENT[0]],1);
 s.inventory[EQUIPMENT_ESSENCE]=9;s.inventory[100]=1000;
 act(s,{op:'craft',recipeId:'beans'});act(s,{op:'craft',recipeId:'pearl'});
 assert.equal(s.inventory[EQUIPMENT_ESSENCE],0);assert.equal(s.inventory[100],650);
 assert.equal(s.hunt.ledger.at(-1).items[0].count,-6);
 const after=structuredClone(s);assert.throws(()=>act(s,{op:'craft',recipeId:'beans'}),/不足/);assert.deepEqual(s,after);
 assert.deepEqual(A.parseSave(s,c).hunt,s.hunt);
});

test('each chosen treasure equips its native card and upgrades through the real material sink',()=>{
 for(const id of HUNT_EQUIPMENT){
  let s=hero();s.inventory[HUNT_MARK]=40;
  act(s,{op:'exchange',itemId:id});syncEquipmentInstances(s,c);
  const row=equipmentInstances(s,c).rows.find(r=>r.gsid===id);
  A.applyAction(s,c,{type:'equip',itemId:id,guid:row.guid});
  const base=A.playerSpec(s,c);
  const cardKey=c.cardItems[c.items[id].stats[139]];
  assert.ok(base.fixedCards.some(card=>card.key===cardKey&&card.count===1));
  assert.ok(d.cards[cardKey]);
  const levels=upgradeLevels(c,id);assert.equal(levels.length,3);
  for(const level of levels){
   const [currency,cost]=level.cost;
   s.inventory[currency]=cost-1;const before=structuredClone(s);
   assert.throws(()=>A.applyAction(s,c,{type:'upgrade',itemId:id,guid:row.guid}),/不足/);
   assert.deepEqual(s,before,'failed upgrade must not spend or alter the instance');
   s.inventory[currency]++;
   A.applyAction(s,c,{type:'upgrade',itemId:id,guid:row.guid});
   assert.equal(s.inventory[currency],0);
   s=A.parseSave(JSON.stringify(s),c);
   assert.equal(equipmentInstances(s,c).rows.find(r=>r.guid===row.guid).serverdata.addlel,level.level);
   assert.equal(s.equipmentGuids[2],row.guid);
   assert.equal(A.playerSpec(s,c).stats.damagePct.all,(base.stats.damagePct.all||0)+level.attack_percentage);
   assert.ok(equipmentAttributes(c.items[id],s,c,row.guid).some(a=>a.stat==='damagePct'&&a.value===level.attack_percentage));
  }
  const capped=structuredClone(s);
  assert.throws(()=>A.applyAction(s,c,{type:'upgrade',itemId:id,guid:row.guid}),/上限/);
  assert.deepEqual(s,capped);
 }
});
