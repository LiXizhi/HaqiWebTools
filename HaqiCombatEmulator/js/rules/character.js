import {DEFAULT_DECK_CAPACITY,MAX_CARD_COPIES} from './deck.js';
import {SCHOOLS,baseHP,clamp} from './formulas.js';
const offsets={fire:1,ice:2,storm:3,myth:4,life:5,death:6,balance:7};
export const STAT_FIELDS={damage:111,resist:119,accuracy:103,damageAbsolute:151,resistAbsolute:159,critical:196,resilience:204,penetration:212};
export function compileCharacter(build, ruleset) {
  if(!SCHOOLS.includes(build.school)) throw new Error('请选择五系之一');
  const level=build.level ?? 50;
  if(!Number.isInteger(level)||level<1||level>200) throw new Error('等级须为 1–200 的整数');
  const mode=build.mode??'snapshot', stats={}, sources=[];
  if(!['snapshot','equipment'].includes(mode)) throw new Error('未知角色模式');
  const add=(map,source)=>{for(const [id,val] of Object.entries(map)){if(!Number.isFinite(val))throw new Error(`属性 ${id} 非数值`);stats[id]=(stats[id]||0)+val;}sources.push({source,stats:{...map}});};
  const sets={},slots=new Set();
  if(mode==='equipment') {
    for(const equip of build.equipment??[]) {
      const id=typeof equip==='number'?equip:equip.gsid, item=ruleset.items[id];
      if(!item) throw new Error(`缺失物品 ${id}`);
      if(!item.slot || slots.has(item.slot)) throw new Error(`物品 ${id} 的装备槽位无效或重复`);
      slots.add(item.slot);add(item.stats,`装备 ${id} ${item.name}`);
      if(item.itemset) sets[item.itemset]=(sets[item.itemset]||0)+1;
      if(equip.addonLevel) {
        const a=ruleset.addons[id]?.[equip.addonLevel];
        if(!a) throw new Error(`物品 ${id} 缺失强化 ${equip.addonLevel}`);
        const out={};
        for(const [field,stat] of Object.entries({attack_percentage:111,attack_absolute:151,resist_absolute:159,hp:101,criticalstrike:196,resilience:204})) if(a[field]) out[stat]=a[field];
        add(out,`强化 ${id} +${equip.addonLevel}`);
      }
    }
    for(const id of build.gems??[]) {
      if(!ruleset.items[id])throw new Error(`缺失宝石 ${id}`);
      add(ruleset.items[id].stats,`宝石 ${id}`);
    }
    for(const [id,count] of Object.entries(sets)) {
      const set=ruleset.itemsets[id];
      if(!set) throw new Error(`缺失套装 ${id}`);
      for(const group of set.groups)if(count>=group.count)add(group.stats,`套装 ${set.name} ${group.count}件`);
    }
    add(build.extraStats??{},'额外属性（显式输入）');
  }
  const vip=build.vipLevel??-1;
  if(!Number.isInteger(vip)||vip< -1||vip>10)throw new Error('VIP 等级须为 -1–10');
  const activeVip=mode==='equipment'&&ruleset.version==='kids'&&vip>=0;
  const vipDamage=[5,5,6,7,8,9,10,12,14,17,20],vipResist=[4,5,6,6,7,7,7,8,8,8,9],vipHeal=[2,3,4,4,4,5,5,6,6,6,8],vipInputHeal=[2,3,3,3,5,5,6,6,7,7,8],vipAccuracy=[2,2,3,3,4,4,4,5,5,5,6];
  const hp=mode==='snapshot'?(build.attributes?.maxHP??baseHP(ruleset.version,build.school,level)):baseHP(ruleset.version,build.school,level,stats[242]||0,stats[101]||0,vip);
  const a={maxHP:hp,powerPip:stats[102]||0,outputHeal:(stats[182]||0)+(activeVip?vipHeal[vip]:0),inputHeal:(stats[183]||0)+(activeVip?vipInputHeal[vip]:0),initialPips:stats[184]||0,initialPowerPips:stats[185]||0,hit:(stats[243]||0)/10+(stats[244]||0)/(level*50+50),dodge:(stats[188]||0)/10+(stats[245]||0)/(level*50+50)};
  for(const [field,base] of Object.entries(STAT_FIELDS)) {
    a[field]={};
    for(const [school,offset] of Object.entries(offsets)) {
      let value=(stats[base]||0)+(stats[base+offset]||0);
      if(field==='damage'&&activeVip)value+=vipDamage[vip];
      if(field==='accuracy'&&activeVip)value+=vipAccuracy[vip];
      if(field==='resist')value=Math.min(70,value+(activeVip?vipResist[vip]:0));
      if(field==='damageAbsolute'||field==='resistAbsolute') {
        const b=field==='damageAbsolute'?226:234;
        value=Math.ceil(value*(100+(stats[b]||0)+(stats[b+offset]||0))/100)+(ruleset.version==='teen'&&mode==='equipment'?level:0);
      }
      if(field==='critical')value+=(stats[254]||0)+100*(stats[224]||0)/(50+50*level);
      if(field==='resilience')value+=(stats[255]||0)+100*(stats[225]||0)/(50+50*level);
      if(field==='critical'&&ruleset.version==='teen')value=Math.min(30,value);
      a[field][school]=value;
    }
  }
  if(mode==='snapshot') {
    for(const [field,value] of Object.entries(build.attributes??{})) {
      if(!(field in a))throw new Error(`未知面板字段 ${field}`);
      a[field]=typeof a[field]==='object'?Object.fromEntries(Object.keys(offsets).map(s=>[s,typeof value==='number'?value:(value[s]??0)])):value;
    }
  }
  for(const value of Object.values(a))for(const v of typeof value==='object'?Object.values(value):[value])if(!Number.isFinite(v))throw new Error('面板必须是有限数值');
  if(a.maxHP<=0||a.maxHP>1e8)throw new Error('血量须大于 0 且不超过一亿');
  a.powerPip=clamp(a.powerPip,0,100);
  const deck=[...(build.deck??[])];
  const deckCapacity=build.deckCapacity??DEFAULT_DECK_CAPACITY,handSize=build.handSize??8,drawPerRound=build.drawPerRound??handSize;
  for(const [key,value,max] of [['卡包容量',deckCapacity,200],['手牌容量',handSize,20],['每轮补牌',drawPerRound,20]])if(!Number.isInteger(value)||value<1||value>max)throw new Error(`${key}须为 1–${max} 的整数`);
  if(deck.length>deckCapacity)throw new Error('配卡数量超过卡包容量');
  if(drawPerRound>handSize)throw new Error('每轮补牌数量不能超过手牌容量');
  if(!deck.length||deck.length>200)throw new Error('卡组须包含 1–200 张卡');
  const copies=new Map();
  for(const key of deck) {
    copies.set(key,(copies.get(key)??0)+1);if(copies.get(key)>MAX_CARD_COPIES)throw new Error(`每张卡最多 ${MAX_CARD_COPIES} 张：${key}`);
    const card=ruleset.cards[key];
    if(!card)throw new Error(`缺失卡牌 ${key}`);
    if(card.requireLevel>level)throw new Error(`卡牌 ${key} 等级不足`);
  }
  return {schemaVersion:1,name:build.name??build.school,school:build.school,level,mode,attributes:a,stats,sources,deck,deckCapacity,handSize,drawPerRound,runes:[...(build.runes??[])],pet:build.pet??null};
}
