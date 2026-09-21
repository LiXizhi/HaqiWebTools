import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
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
import {equipmentSetStats,dragonTotemStage} from '../js/adventure_progression_bonuses_core.js';
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