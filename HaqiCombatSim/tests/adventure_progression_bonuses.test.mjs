import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import {createPveBattle,playPveRound,restorePveBattle} from '../js/combat_pve_core.js';
import {useCard} from '../js/combat_cards_core.js';
test('new growth stats survive complete round checkpoint replay',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),save=A.createAdventure(content);
 save.inventory[1240]=1;A.applyAction(save,content,{type:'equip',itemId:1240});
 content.progressionBonuses={components:{1240:1},sets:{1:[{items:1,stats:{151:20,159:10,188:5,376:84}}]}};
 A.beginEncounter(save,content,'fire-scout');
 const checkpoint=A.parseSave(JSON.stringify(save),content).pendingEncounter;
 const battle=restorePveBattle(dataset,content,checkpoint);
 playPveRound(battle,{pass:true});checkpoint.decisions.push({pass:true});
 const replay=restorePveBattle(dataset,content,checkpoint);
 assert.deepEqual(replay.events,battle.events);assert.equal(replay.rng.state(),battle.rng.state());
 assert.deepEqual(replay.sides.near[0].stats,battle.sides.near[0].stats);
 assert.equal(replay.sides.near[0].hp,battle.sides.near[0].hp);
});
test('growth critical ratio and dodge affect attacks while double attack stays disabled',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),save=A.createAdventure(content);
 save.inventory[1240]=1;A.applyAction(save,content,{type:'equip',itemId:1240});
 const attack=(stats,incoming=false)=>{
  content.progressionBonuses={components:{1240:1},sets:{1:[{items:1,stats}]}};
  const arena=createPveBattle({dataset,player:A.playerSpec(save,content),monsters:[content.monsters['fire-scout']],seed:12});
  const caster=arena.sides[incoming?'far':'near'][0],target=arena.sides[incoming?'near':'far'][0];
  const base=Object.values(arena.resolved.cards).find(card=>card.type==='SingleAttack');
  useCard(arena,caster,{...base,pipcost:0,hitchance:100,params:{damage_min:100,damage_max:100,damage_school:'fire',base_criticalstrike:1000}},target);
  return {event:arena.events.find(event=>event.type==='damage'),rng:arena.rng.state()};
 };
 const baseline=attack({});assert.equal(baseline.event.mark,'c');
 assert.ok(attack({376:1000}).event.amount>baseline.event.amount);
 const dodged=attack({188:1000},true);assert.equal(dodged.event.mark,'d');
 assert.ok(dodged.event.amount<attack({},true).event.amount);
 assert.deepEqual(attack({256:100}),baseline);
 content.progressionBonuses={components:{1240:1},sets:{1:[{items:1,stats:{376:84,188:9}}]}};
 const stats=A.playerSpec(save,content).stats;assert.equal(stats.critRatioBonus,0.084);assert.equal(stats.dodgePct,9);
 A.beginEncounter(save,content,'fire-scout');assert.deepEqual(A.parseSave(JSON.stringify(save),content).pendingEncounter.player.stats,stats);
 save.pendingEncounter.progressionRulesVersion=2;save.pendingEncounter.player=A.playerSpec(save,content);
 assert.equal(save.pendingEncounter.player.stats.critRatioBonus,0);assert.equal(save.pendingEncounter.player.stats.dodgePct,0);
 assert.doesNotThrow(()=>A.parseSave(JSON.stringify(save),content));
});
test('absolute growth attack increases damage and defense reduces incoming damage',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),save=A.createAdventure(content);
 save.inventory[1240]=1;A.applyAction(save,content,{type:'equip',itemId:1240});
 const measure=(stats,incoming)=>{
  content.progressionBonuses={components:{1240:1},sets:{1:[{items:1,stats}]}};
  const arena=createPveBattle({dataset,player:A.playerSpec(save,content),monsters:[content.monsters['fire-scout']],seed:12});
  const caster=arena.sides[incoming?'far':'near'][0],target=arena.sides[incoming?'near':'far'][0];caster.pips={normal:7,power:0};
  const base=Object.values(arena.resolved.cards).find(card=>card.type==='SingleAttack');
  useCard(arena,caster,{...base,pipcost:0,accuracy:1000,params:{damage_min:100,damage_max:100,damage_school:'fire'}},target);
  return arena.events.find(event=>event.type==='damage').amount;
 };
 assert.ok(measure({151:20},false)>measure({},false));
 assert.ok(measure({159:20},true)<measure({},true));
});
test('absolute set and totem stats activate only in new progression snapshots',()=>{
 const content=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url)));
 const save=A.createAdventure(content);save.inventory[1240]=1;A.applyAction(save,content,{type:'equip',itemId:1240});
 content.progressionBonuses={components:{1240:1},sets:{1:[{items:1,stats:{151:10,160:7}}]},professions:{50351:[{exp:0,expId:50359,stats:{151:3,159:4}}]}};
 content.items[50351]={id:50351,kind:0,stats:{}};save.inventory[50351]=1;
 const stats=A.playerSpec(save,content).stats;assert.equal(stats.damageAbs.all,13);assert.deepEqual(stats.resistAbs,{fire:7,all:4});
 A.beginEncounter(save,content,'fire-scout');assert.deepEqual(A.parseSave(JSON.stringify(save),content).pendingEncounter.player.stats,stats);
 save.pendingEncounter.progressionRulesVersion=2;save.pendingEncounter.player=A.playerSpec(save,content);
 assert.deepEqual(A.parseSave(JSON.stringify(save),content).pendingEncounter.player.stats.damageAbs,{});
});
test('real fire set mapping activates cumulative tiers and preserves pre-mapping checkpoints',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),catalog=read('shop-candidates'),config=read('progression-bonuses');
 assert.equal(Object.keys(config.components).length,391);assert.equal(new Set(Object.values(config.components)).size,83);
 const ids=[1370,1385,1400,1415,1430];for(const id of ids){assert.equal(config.components[id],1);content.items[id]=catalog[id];}
 const save=A.createAdventure(content);save.xp=4654;A.syncProgression(save,content);
 for(const id of ids){save.inventory[id]=1;A.applyAction(save,content,{type:'equip',itemId:id});}
 const base=A.playerSpec(save,content).stats;
 content.progressionBonuses=config;
 const stats=A.playerSpec(save,content).stats;
 assert.equal(stats.hpFlat,base.hpFlat+20);assert.equal(stats.damagePct.all,(base.damagePct.all||0)+5);assert.equal(stats.powerPipPct,base.powerPipPct+3);
 A.beginEncounter(save,content,'fire-scout');assert.equal(A.parseSave(JSON.stringify(save),content).pendingEncounter.progressionRulesVersion,3);
 save.pendingEncounter.progressionRulesVersion=1;save.pendingEncounter.player=A.playerSpec(save,content);
 assert.equal(A.parseSave(JSON.stringify(save),content).pendingEncounter.player.stats.hpFlat,base.hpFlat);
 save.pendingEncounter=null;delete save.equipment[15];
 assert.equal(equipmentSetStats(Object.values(save.equipment),config).stats[102],undefined);
});
test('equipped set and owned totem enter player stats and survive encounter reload',()=>{
 const content=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url)));
 const save=A.createAdventure(content);save.inventory[1240]=1;A.applyAction(save,content,{type:'equip',itemId:1240});
 const base=A.playerSpec(save,content).stats.hpFlat;
 content.progressionBonuses={components:{1240:1},sets:{1:[{items:1,stats:{101:20}}]},professions:{50351:[{exp:0,expId:50359,stats:{101:10}}]}};
 content.items[50351]={id:50351,kind:0,stats:{}};save.inventory[50351]=1;
 assert.equal(A.playerSpec(save,content).stats.hpFlat,base+30);
 A.beginEncounter(save,content,'fire-scout');
 assert.equal(A.parseSave(JSON.stringify(save),content).pendingEncounter.player.stats.hpFlat,base+30);
});
import {equipmentSetStats,dragonTotemStage,progressionStatEntry} from '../js/adventure_progression_bonuses_core.js';
test('all exported set and totem effects are mapped except source-disabled double attack',()=>{
 const config=JSON.parse(fs.readFileSync(new URL('../data/adventure/progression-bonuses.json',import.meta.url)));
 const missing=new Set();
 for(const groups of [...Object.values(config.sets),...Object.values(config.professions)])for(const group of groups){
  for(const [id,value] of Object.entries(group.stats)){
   assert.ok(Number.isFinite(value),`invalid progression stat ${id}`);
   if(!progressionStatEntry(id))missing.add(Number(id));
  }
 }
 assert.deepEqual([...missing],[256]);
 for(const setId of new Set(Object.values(config.components)))assert.ok(config.sets[setId]?.length,`missing set ${setId}`);
});
test('progression absolute attack and defense preserve source school order',()=>{
 for(const [index,school] of ['all','fire','ice','storm','myth','life','death','balance'].entries()){
  assert.deepEqual(progressionStatEntry(151+index),{stat:'damageAbs',school});
  assert.deepEqual(progressionStatEntry(159+index),{stat:'resistAbs',school});
 }
 assert.deepEqual(progressionStatEntry(376),{stat:'critRatioBonus',scale:0.001});
 assert.deepEqual(progressionStatEntry(188),{stat:'dodgePct'});
 assert.equal(progressionStatEntry(256),null);
});
test('totem selects highest reached tier, matches experience item and rejects malformed experience',()=>{
 const first={exp:0,expId:50359,level:1,stats:{101:5}},second={exp:100,expId:50359,level:2,stats:{101:10}};
 const config={professions:{50351:[first,second]}};
 assert.deepEqual(dragonTotemStage(config,50351,50359,99),first);
 assert.deepEqual(dragonTotemStage(config,50351,50359,100),second);
 assert.equal(dragonTotemStage(config,50351,1,100),null);
 assert.equal(dragonTotemStage(config,50352),null);
 assert.throws(()=>dragonTotemStage(config,50351,50359,-1),/经验/);
});
test('set thresholds accumulate, duplicate items do not count twice and removal disables tiers',()=>{
 const config={components:{1001:1,1002:1,1003:1},sets:{1:[{items:2,stats:{101:20}},{items:3,stats:{101:30,111:5}}]}};
 assert.deepEqual(equipmentSetStats([1001,1002,1003],config).stats,{101:50,111:5});
 assert.deepEqual(equipmentSetStats([1001,1002,1002],config).stats,{101:20});
 assert.deepEqual(equipmentSetStats([1001],config).stats,{});
});