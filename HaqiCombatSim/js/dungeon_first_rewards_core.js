import {equipmentRequirements} from './adventure_item_rules_core.js';

// New Web journey rewards. Item identities and stats remain the exported Kids data;
// these guaranteed drops are not represented as original Lua loot tables.
const schools=['fire','ice','storm','death','life'];
const rewards={
 'journey:first-watch':{itemId:24002,purpose:'18 格卡包，每种卡最多放入 3 张；为强化、陷阱和攻击留出搭配空间。'},
 'journey:lost-spark':{items:[1430,1431,1432,1433,1434],purpose:'增加生命、对应学派伤害与抗性，并提供一张装备附加卡。'},
 'journey:ember-night':{items:[1829,1825,1842,1854,1850],purpose:'50 级魔石项链，增加 600 生命与 10% 全学派伤害；在背包中比较现有装备后穿戴。'},
 'journey:hanzi:stele-trial':{items:[1272,1273,1274,1276,1275],purpose:'10 级本学派法杖，附带 6 张专属法杖攻击牌；穿戴后可显著提升前期出牌节奏。'},
 'journey:vault-lamp':{itemId:1453,purpose:'8 级全学派通用圣徒衣，增加 60 生命与多系攻防属性；在背包中比较后穿戴。'},
 'journey:frozen-letter':{itemId:1345,purpose:'25 级全学派精锐冠，增加 100 生命、5% 全伤害与 2% 暴击。'},
 'journey:sand-echo':{itemId:1532,purpose:'32 级荒漠牛仔帽，增加 130 生命，帮助稳住中后期高伤回合。'},
 'journey:night-promise':{itemId:1788,purpose:'45 级魔晶法杖，提供 10% 攻击加成与多系魔晶附卡。'},
 'journey:tide:elite-1':{itemId:1906,purpose:'高阶魔晶中级短裤，增加 1500 生命与 7% 攻防，助力潮汐岛后续挑战。'},
 'journey:float:elite-1':{itemId:1907,purpose:'高阶魔晶高级短裤，增加 2000 生命与 9% 伤害、10% 抗性。'},
 'journey:sail:elite-1':{itemId:2223,purpose:'终章大天使之翼，增加 500 生命与高额输出加成，见证完整通关。'}
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
