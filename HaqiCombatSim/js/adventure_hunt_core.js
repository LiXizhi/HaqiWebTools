// Bound hunt rewards: fixed difficulty, independent seeded loot and safe duplicate recycling.
import {createRng,hashSeed} from './rng_core.js';
import {equipmentInstances,isUniqueEquipment,syncEquipmentInstances} from './adventure_equipment_instances_core.js';
import {upgradeAt} from './adventure_upgrade_core.js';

export const HUNT_ID='hunt:ember';
export const HUNT_MARK=919804, EQUIPMENT_ESSENCE=919805;
export const HUNT_COMMON_EQUIPMENT=919806;
export const HUNT_EQUIPMENT=[919801,919802,919803];
export const SALVAGE_EQUIPMENT=[HUNT_COMMON_EQUIPMENT,...HUNT_EQUIPMENT];
const ZONES=new Set(['camp','town','fire','ice','desert','dark','tide','float','sail']);
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const count=(save,id)=>save.inventory[id]||0;
export const huntParams=content=>content.balanceParams.hunt;

export function installHuntContent(content){
 const definitions=[
  [919801,'余烬守誓帽',1236,{101:75,119:3,139:22142},'带来一张全体护盾卡。看准蓄力，替队伍扛住重击。'],
  [919802,'余烬复苏帽',1238,{101:55,182:8,139:22167},'带来一张低耗治疗卡。撑过猛攻，在恢复窗口重整队伍。'],
  [919803,'余烬破势帽',1240,{101:45,111:4,139:22195},'带来一张全体虚弱卡。削弱敌人，再抓住反击窗口。'],
 ];
 for(const [id,name,base,stats,description]of definitions){
  content.items[id]={...structuredClone(content.items[base]),id,gsid:id,name,kind:1,slot:2,maxCount:999999,
   stats:{...stats,138:8},description:'讨伐珍品 · 绑定。'+description+' 可用40枚余烬猎印定向兑换。',huntEquipment:true};
  // This is a new member of the existing native hat family, using its exact upgrade table.
  const group=content.upgradeGroups?.find(row=>row.gsids.includes(base));
  if(group&&!group.gsids.includes(id))group.gsids.push(id);
 }
 content.items[HUNT_COMMON_EQUIPMENT]={...structuredClone(content.items[1236]),id:HUNT_COMMON_EQUIPMENT,gsid:HUNT_COMMON_EQUIPMENT,
  name:'巡林备用帽',kind:1,slot:2,maxCount:999999,stats:{101:25,138:8},
  description:'普通装备 · 绑定。余烬讨伐每次胜利获得一件。保留第一件，重复件可回收为1份装备精华。',huntCommonEquipment:true};
 for(const [id,name,description,base]of [
  [HUNT_MARK,'余烬猎印','绑定讨伐凭证。胜利固定获得2枚；40枚定向兑换一件余烬珍品。进度长期保留。',17487],
  [EQUIPMENT_ESSENCE,'装备精华','绑定锻造材料。回收未强化、未镶嵌的重复巡林备用帽或余烬珍品获得。',17213],
 ])content.items[id]={...structuredClone(content.items[base]),id,gsid:id,name,kind:20,slot:0,stats:{},maxCount:999999,description};
}

export function huntStatus(save,content){
 const p=huntParams(content);
 if(save.pendingEncounter)return {allowed:false,reason:'请先完成当前战斗'};
 if(save.level<p.level)return {allowed:false,reason:`达到${p.level}级后解锁讨伐`};
 if(!ZONES.has(save.zone)||save.coopRun)return {allowed:false,reason:'请回到营地或普通岛屿再开始讨伐'};
 return {allowed:true,reason:'固定难度 · 可以重复挑战 · 失败不扣猎印'};
}

export function huntEncounter(save,content,id){
 if(id!==HUNT_ID)return null;
 const p=huntParams(content);
 assert(save.level>=p.level&&ZONES.has(save.zone)&&!save.coopRun,'余烬讨伐尚未解锁');
 const source=content.encounters.find(row=>row.id==='fire-scout');
 const original=content.monsters[source.monsterId];
 return {id,zone:save.zone,monster:{...structuredClone(original),id,name:'余烬守卫',school:'fire',goalId:null,
  level:p.level,hp:p.hp,maxHp:p.hp,captureDisabled:true,speciesId:null,attributes:{startup_pips_normal:1,power_pip_percent:0},
  pool:[{key:'Fire_SingleAttack_Level0_45',weight:1},{key:'Fire_Pet_SingleAttack_FireRockyOgresDominance',weight:1}],
  genes:[],sequences:[],cardsets:{},xp:p.xp,coins:p.coins}};
}

export function huntTactics(content){
 const p=huntParams(content);
 return {id:'boss',version:1,phaseThreshold:p.phaseThreshold,handSize:6,focusFreeAttack:false,loanShields:2,
  preparationBoost:p.preparationBoost,counterBoost:p.counterBoost};
}
export function huntSnapshot(save,content){
 const selected=save.hunt?.selected??HUNT_EQUIPMENT[0];
 return {version:1,selected,tactics:huntTactics(content)};
}
function state(save){return save.hunt??=( {version:1,selected:HUNT_EQUIPMENT[0],wins:0,ledger:[]} );}
function credit(save,id,amount){save.inventory[id]=count(save,id)+amount;}
function record(save,kind,items){
 const h=state(save);
 h.ledger.push({serial:(h.ledger.at(-1)?.serial||0)+1,kind,items});
 h.ledger=h.ledger.slice(-30);
}
export function previewHuntReward(save,content,pending){
 if(!pending||pending.encounterId!==HUNT_ID)return null;
 const snapshot=pending.huntReward;
 assert(snapshot?.version===1&&HUNT_EQUIPMENT.includes(snapshot.selected),'讨伐奖励快照无效');
 const p=huntParams(content),items=[{itemId:HUNT_MARK,count:p.marksPerWin},{itemId:HUNT_COMMON_EQUIPMENT,count:1}];
 const rng=createRng(hashSeed(`${pending.seed}:hunt-reward:v1`));
 const dropped=rng.float()<p.directDropChance;
 if(dropped)items.push({itemId:snapshot.selected,count:1});
 return {items,dropped,selected:snapshot.selected,marks:count(save,HUNT_MARK)+p.marksPerWin,
  exchangeCost:p.exchangeCost,marksPerWin:p.marksPerWin};
}
export function grantHuntReward(save,content,pending){
 if(pending.encounterId!==HUNT_ID)return null;
 const reward=previewHuntReward(save,content,pending),{items,dropped,selected}=reward;
 const p=huntParams(content),h=state(save);
 for(const item of items)credit(save,item.itemId,item.count);
 h.wins++;
 record(save,'victory',items);
 return {...reward,
  message:`讨伐胜利！余烬猎印 +${p.marksPerWin}（现有 ${count(save,HUNT_MARK)} / ${p.exchangeCost}），巡林备用帽 +1`+(dropped?`，额外获得「${content.items[selected].name}」！`:'。可在装备 → 猎印锻造查看进度。')};
}

function quoteSalvageRow(save,content,row){
 if(!row||!SALVAGE_EQUIPMENT.includes(row.gsid)||isUniqueEquipment(content.items[row.gsid]))return {allowed:false,reason:'只回收重复的巡林备用帽或余烬珍品'};
 if(count(save,row.gsid)<2)return {allowed:false,reason:'保留最后一件收藏'};
 if(Object.values(save.equipmentGuids||{}).includes(row.guid))return {allowed:false,reason:'正在穿戴，不能回收'};
 if(row.serverdata.addlel>0)return {allowed:false,reason:'已强化的装备受到保护'};
 if(row.serverdata.gem)return {allowed:false,reason:'已开孔或镶嵌的装备受到保护'};
 return {allowed:true,row,essence:row.gsid===HUNT_COMMON_EQUIPMENT?huntParams(content).normalSalvageEssence:huntParams(content).salvageEssence};
}
export function salvageQuote(save,content,guid){
 return quoteSalvageRow(save,content,equipmentInstances(save,content).rows.find(row=>row.guid===guid));
}
// One projection per paint; quoted rows are never trusted when applying an action.
export function duplicateSalvageQuotes(save,content){
 return equipmentInstances(save,content).rows
  .filter(row=>SALVAGE_EQUIPMENT.includes(row.gsid)&&count(save,row.gsid)>1)
  .map(row=>({row,quote:quoteSalvageRow(save,content,row)}));
}

// Move an investment, never copy it or refund materials. Restrict the first
// version to the three hunt hats with identical native upgrade costs.
export function huntInheritanceQuote(save,content,sourceGuid,targetGuid){
 const fee=huntParams(content).inheritanceFee;
 const deny=reason=>({allowed:false,reason,fee});
 if(save.pendingEncounter)return deny('请先完成当前战斗');
 if(save.level<huntParams(content).level)return deny('达到8级后解锁强化继承');
 const rows=equipmentInstances(save,content).rows;
 const source=rows.find(row=>row.guid===sourceGuid),target=rows.find(row=>row.guid===targetGuid);
 if(!source||!target||!HUNT_EQUIPMENT.includes(source.gsid)||!HUNT_EQUIPMENT.includes(target.gsid)||source.gsid===target.gsid)return deny('请选择两款不同的余烬珍品帽');
 if(Object.values(save.equipmentGuids||{}).includes(source.guid))return deny('先换上新帽，再转出旧帽的强化');
 const level=source.serverdata.addlel;
 if(!level)return deny('旧帽没有可以转移的强化');
 if(target.serverdata.addlel)return deny('新帽必须尚未强化，避免覆盖已有投入');
 for(let n=1;n<=level;n++){
  const from=upgradeAt(content,source.gsid,n),to=upgradeAt(content,target.gsid,n);
  if(!from||!to||JSON.stringify(from.cost)!==JSON.stringify(to.cost))return deny('两件装备的强化路线不兼容');
 }
 if(count(save,100)<fee)return deny(`还缺 ${fee-count(save,100)} 奇豆`);
 return {allowed:true,source,target,level,fee};
}

export function applyHuntAction(save,content,action){
 assert(!save.pendingEncounter,'请先完成当前战斗');
 const p=huntParams(content);
 if(action.op==='select'){
  assert(HUNT_EQUIPMENT.includes(action.itemId),'请选择一件余烬装备');
  state(save).selected=action.itemId;
  return `讨伐目标已选为「${content.items[action.itemId].name}」`;
 }
 assert(save.level>=p.level,'达到8级后解锁锻造');
 if(action.op==='inherit'){
  const q=huntInheritanceQuote(save,content,action.sourceGuid,action.targetGuid);assert(q.allowed,q.reason);
  const projection=equipmentInstances(save,content);
  projection.rows.find(row=>row.guid===q.source.guid).serverdata.addlel=0;
  projection.rows.find(row=>row.guid===q.target.guid).serverdata.addlel=q.level;
  save.equipmentInstances=projection.rows;save.nextEquipmentGuid=projection.serial;
  save.inventory[100]-=q.fee;
  syncEquipmentInstances(save,content);
  record(save,'inherit',[{itemId:100,count:-q.fee}]);
  return `强化已转移：「${content.items[q.source.gsid].name}」归零，「${content.items[q.target.gsid].name}」继承 +${q.level}。花费 ${q.fee} 奇豆，不返还强化材料。`;
 }
 if(action.op==='exchange'){
  assert(HUNT_EQUIPMENT.includes(action.itemId),'兑换装备无效');
  assert(count(save,HUNT_MARK)>=p.exchangeCost,'余烬猎印不足');
  save.inventory[HUNT_MARK]-=p.exchangeCost;credit(save,action.itemId,1);
  record(save,'exchange',[{itemId:HUNT_MARK,count:-p.exchangeCost},{itemId:action.itemId,count:1}]);
  return `已兑换「${content.items[action.itemId].name}」`;
 }
 if(action.op==='salvage'){
  const q=salvageQuote(save,content,action.guid);assert(q.allowed,q.reason);
  const projection=equipmentInstances(save,content);
  save.equipmentInstances=projection.rows.filter(row=>row.guid!==action.guid);
  save.nextEquipmentGuid=projection.serial;
  save.inventory[q.row.gsid]--;credit(save,EQUIPMENT_ESSENCE,q.essence);
  record(save,'salvage',[{itemId:q.row.gsid,count:-1},{itemId:EQUIPMENT_ESSENCE,count:q.essence}]);
  return `重复装备已回收，装备精华 +${q.essence}`;
 }
 if(action.op==='craft'){
  const recipe=p.recipes.find(row=>row.id===action.recipeId);assert(recipe,'锻造配方无效');
  assert(count(save,EQUIPMENT_ESSENCE)>=recipe.essence,'装备精华不足');
  assert(count(save,100)>=recipe.coins,'奇豆不足');
  save.inventory[EQUIPMENT_ESSENCE]-=recipe.essence;save.inventory[100]-=recipe.coins;credit(save,recipe.itemId,recipe.count);
  record(save,'craft',[{itemId:EQUIPMENT_ESSENCE,count:-recipe.essence},{itemId:100,count:-recipe.coins},{itemId:recipe.itemId,count:recipe.count}]);
  return `锻造完成：${content.items[recipe.itemId].name} ×${recipe.count}`;
 }
 throw Error('未知讨伐操作');
}

export function validateHunt(save,content){
 const h=save.hunt;
 if(h!==undefined){
  assert(h?.version===1&&HUNT_EQUIPMENT.includes(h.selected)&&Number.isSafeInteger(h.wins)&&h.wins>=0&&Array.isArray(h.ledger)&&h.ledger.length<=30,'讨伐记录无效');
  let previous=0;
  for(const row of h.ledger){
   assert(Number.isSafeInteger(row.serial)&&row.serial>previous&&['victory','exchange','salvage','craft','inherit'].includes(row.kind)&&Array.isArray(row.items)&&row.items.length<=3,'讨伐账本无效');
   previous=row.serial;
   for(const item of row.items)assert(content.items[item.itemId]&&Number.isSafeInteger(item.count)&&item.count!==0,'讨伐账本物品无效');
  }
 }
 const pending=save.pendingEncounter;
 if(pending?.encounterId===HUNT_ID){
  const expected=huntSnapshot(save,content);
  assert(JSON.stringify(pending.huntReward)===JSON.stringify({version:expected.version,selected:expected.selected}),'讨伐奖励快照无效');
  assert(JSON.stringify(pending.tacticalEncounter)===JSON.stringify(expected.tactics),'讨伐招式快照无效');
 }else assert(!pending?.huntReward,'非讨伐战斗不能领取猎印');
}
