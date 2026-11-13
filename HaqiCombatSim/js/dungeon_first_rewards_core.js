import {equipmentRequirements} from './adventure_item_rules_core.js';

// New Web journey rewards. Item identities and stats remain the exported Kids data;
// these guaranteed drops are not represented as original Lua loot tables.
const schools=['fire','ice','storm','death','life'];
const rewards={
 'journey:first-watch':{itemId:24002,purpose:'18 格卡包，每种卡最多放入 3 张；为强化、陷阱和攻击留出搭配空间。'},
 'journey:lost-spark':{items:[1430,1431,1432,1433,1434],purpose:'增加生命、对应学派伤害与抗性，并提供一张装备附加卡。'},
 'journey:ember-night':{items:[1829,1825,1842,1854,1850],purpose:'50 级魔石项链，增加 600 生命与 10% 全学派伤害；在背包中比较现有装备后穿戴。'}
};
export function dungeonFirstReward(content,id,school){
 const row=rewards[id];if(!row)return null;
 const itemId=row.itemId??row.items[schools.indexOf(school)],item=content.items[itemId];
 if(!item)return null;
 return {itemId,item,purpose:row.purpose,level:equipmentRequirements(item).level};
}
export function dungeonFirstRewardSources(content,itemId,school){
 return Object.keys(rewards).flatMap(id=>{
  const reward=dungeonFirstReward(content,id,school),dungeon=content.dungeons?.find(d=>d.id===id);
  return reward?.itemId===itemId&&dungeon?[dungeon.name+' · 完整通关奖励']:[];
 });
}
export function grantDungeonFirstReward(save,content,id,{complete=false,rewarded=false}={}){
 const record=save.dungeonChallengeRecords?.[id],reward=dungeonFirstReward(content,id,save.school);
 if(save.coopRun||!complete||!rewarded||!record||record.firstRewarded||!reward)return null;
 save.inventory[reward.itemId]=(save.inventory[reward.itemId]||0)+1;
 record.firstRewarded=true;
 return {itemId:reward.itemId,count:1};
}
