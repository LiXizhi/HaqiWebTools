// Adventure adaptation; original combat formulae remain in combat_formulas_core.
import { defaultParams, resolveParams } from './combat_params_core.js';
import { baseMaxHp, applyHpStats } from './combat_formulas_core.js';
import { normalizeStats } from './combat_unit_core.js';
export const STARTERS=['dragon_green','dragon_purple','dragon_orange'];
export const STAGE_NAMES=['幼年','青年','成年','隐藏形态'];
export const FOOD_ID=990001, CAPTURE_ID=990002;
const check=(ok,message)=>{if(!ok)throw Error(message);};
export const petParams=content=>resolveParams({cards:{}},content.balanceParams||defaultParams('kids')).adventure;
export function petStage(level,content){return petParams(content).stageLevels.filter(n=>level>=n).length-1;}
export function petCapacity(pet,content){return petParams(content).petCapacities[petStage(pet.level,content)];}
export function petXpLevel(xp,content){const p=petParams(content);return Math.min(p.levelCap,Math.floor((1+Math.sqrt(1+8*xp/p.petXpStep))/2));}
export function petMaxHp(pet,content){return baseMaxHp(content.pets[pet.speciesId].school,pet.level,'kids');}
export function specMaxHp(spec){return applyHpStats(baseMaxHp(spec.school,spec.level,'kids'),spec.stats.hpPct||0,spec.stats.hpFlat||0,'kids');}
export function petLessons(pet,content){return content.pets[pet.speciesId].lessons;}
export function recommendedPetDeck(pet,content){
 const lessons=petLessons(pet,content).filter(x=>x.level<=pet.level),out=[];let left=petCapacity(pet,content);
 for(const row of [...lessons].reverse()){const count=Math.min(petParams(content).petCopies,left);if(count){out.push({key:row.key,count});left-=count;}}
 return out;
}
export function validatePetDeck(pet,content,deck){
 check(Array.isArray(deck)&&deck.length>0,'宠物卡包不能为空');const seen=new Set();let count=0;
 for(const row of deck){check(!seen.has(row.key)&&Number.isInteger(row.count)&&row.count>0&&row.count<=petParams(content).petCopies&&petLessons(pet,content).some(x=>x.key===row.key&&x.level<=pet.level),'宠物卡牌尚未解锁或份数无效');seen.add(row.key);count+=row.count;}
 check(count<=petCapacity(pet,content),'宠物卡包容量不足');
}
export function addPet(save,content,id,xp=0){
 check(Object.hasOwn(content.pets,id),'未知宠物');
 if(save.pets[id]){const pet=save.pets[id];pet.xp+=petParams(content).duplicateXp;pet.level=petXpLevel(pet.xp,content);return pet;}
 const pet={id:`${save.seed}:${id}`,speciesId:id,xp,level:petXpLevel(xp,content),hunger:100,hp:0,deck:[]};
 pet.hp=petMaxHp(pet,content);pet.deck=recommendedPetDeck(pet,content);save.pets[id]=pet;return pet;
}
export function initializePets(save,content,starter=null){
 save.pets={};save.formation=[null,null,null,null];save.heroSlot=0;save.heroHp=null;save.careAt=0;save.careLog=[];save.transactions=[];save.starterChosen=false;
 if(starter){check(STARTERS.includes(starter),'请选择抱抱龙颜色');addPet(save,content,starter);save.formation[0]=starter;save.starterChosen=true;}
}
export function petAction(save,content,action){
 const p=petParams(content),pet=save.pets[action.petId];
 switch(action.type){
 case 'starter':check(!save.starterChosen&&STARTERS.includes(action.petId),'已领取初始伙伴');addPet(save,content,action.petId);save.formation[save.heroSlot]=action.petId;save.starterChosen=true;break;
 case 'formation':{
  check(Array.isArray(action.slots)&&action.slots.length===4&&action.slots.every(id=>id===null||Object.hasOwn(save.pets,id)),'阵容无效');
  const ids=action.slots.filter(Boolean);check(new Set(ids).size===ids.length,'同一宠物不能重复上阵');
  check(Number.isInteger(action.heroSlot)&&action.heroSlot>=0&&action.heroSlot<4,'主角卡位无效');save.formation=[...action.slots];save.heroSlot=action.heroSlot;break;
 }
 case 'pet-deck':check(pet,'尚未拥有宠物');validatePetDeck(pet,content,action.deck);pet.deck=action.deck.map(x=>({...x}));break;
 case 'pet-feed':check(pet&&pet.hunger<100&&(save.inventory[FOOD_ID]||0)>0,'需要食物，且宠物尚未吃饱');save.inventory[FOOD_ID]--;pet.hunger=Math.min(100,pet.hunger+p.foodRestore);break;
 case 'buy':{
  const item=content.shop.find(x=>x.id===action.productId);check(item,'商品不存在');check(save.level>=item.level,'等级尚未解锁');
  check(item.kind!=='pet'||!save.pets[item.petId],'已经拥有这只宠物');const cost=productPrice(item,content);
  check((save.inventory[100]||0)>=cost,'奇豆不足');
  if(item.kind==='pet')addPet(save,content,item.petId);else save.inventory[item.itemId]=(save.inventory[item.itemId]||0)+1;
  save.inventory[100]-=cost;save.transactions.push({id:save.transactions.length+1,productId:item.id,cost});break;
 }
 default:return false;
 }return true;
}
export function productPrice(item,content){const p=petParams(content);return item.kind==='pet'?p.petPriceBase+p.petPriceLevel*item.level:item.kind==='gear'?p.gearPriceBase+p.gearPriceLevel*item.level:item.itemId===FOOD_ID?p.foodPrice:p.capturePrice;}
export function partySpecs(save,content,hero){
 hero={...hero,slot:save.heroSlot,hp:save.heroHp??specMaxHp(hero)};
 const support=save.pets[save.formation[save.heroSlot]];
 if(support)hero.petCards=support.deck.map(x=>({...x}));
 return [hero,...save.formation.flatMap((id,slot)=>{
  if(!id||slot===save.heroSlot)return [];const pet=save.pets[id],definition=content.pets[id];
  return [{id:pet.id,name:definition.name,school:definition.school,level:pet.level,slot,speciesId:id,hp:pet.hp,stats:normalizeStats(),deck:pet.deck.map(x=>({...x})),deckCapacity:petCapacity(pet,content),deckEachCapacity:petParams(content).petCopies,isBot:true}];
 })];
}
// Wall clock is injected by browser IO; never read during combat replay.
export function tickCare(save,content,hero,now,online=false){
 check(Number.isFinite(now)&&now>=0,'时间无效');
 if(!save.careAt){save.careAt=now;return;}
 const elapsed=Math.max(0,now-save.careAt);save.careAt=Math.max(now,save.careAt);if(save.pendingEncounter)return;
 const minutes=Math.min(1440,elapsed/60000),p=petParams(content),maxHp=specMaxHp(hero);
 // Adventure adaptation (2026-09-19): hero recovers 2% of maximum HP per second outside combat.
 save.heroHp=Math.min(maxHp,(save.heroHp??maxHp)+maxHp*p.heroRegenPerSecond*minutes*60);
 for(const id of save.formation.filter(Boolean)){
  const pet=save.pets[id];if(online){pet.hunger=Math.max(0,pet.hunger-minutes*p.hungerPerMinute);
   while(pet.hunger<p.feedThreshold&&(save.inventory[FOOD_ID]||0)>0){save.inventory[FOOD_ID]--;pet.hunger=Math.min(100,pet.hunger+p.foodRestore);save.careLog.push(`${content.pets[id].name}自动进食，饱食 +${p.foodRestore}`);}
  }
 }
 for(const pet of Object.values(save.pets))if(pet.hunger>0)pet.hp=Math.min(petMaxHp(pet,content),pet.hp+petMaxHp(pet,content)*p.regenPerMinute*minutes);
 save.careLog=save.careLog.slice(-20);
}
export function validatePets(save,content){
 check(save.pets&&typeof save.pets==='object'&&!Array.isArray(save.pets),'宠物收藏无效');
 for(const [id,pet] of Object.entries(save.pets)){
  check(Object.hasOwn(content.pets,id)&&pet.speciesId===id&&pet.id===`${save.seed}:${id}`,'宠物身份无效');
  check(Number.isSafeInteger(pet.xp)&&pet.xp>=0&&pet.level===petXpLevel(pet.xp,content),'宠物等级无效');
  check(Number.isFinite(pet.hp)&&pet.hp>=0&&pet.hp<=petMaxHp(pet,content)&&Number.isFinite(pet.hunger)&&pet.hunger>=0&&pet.hunger<=100,'宠物状态无效');validatePetDeck(pet,content,pet.deck);
 }
 check(Number.isFinite(save.careAt)&&save.careAt>=0&&typeof save.starterChosen==='boolean'&&Array.isArray(save.careLog)&&save.careLog.every(x=>typeof x==='string')&&Array.isArray(save.transactions),'养成记录无效');
 for(const [index,row] of save.transactions.entries())check(row?.id===index+1&&content.shop.some(x=>x.id===row.productId)&&Number.isSafeInteger(row.cost)&&row.cost>=0,'购买记录无效');
 check(save.heroHp===null||Number.isFinite(save.heroHp)&&save.heroHp>=0,'角色生命无效');
 petAction(save,content,{type:'formation',slots:save.formation,heroSlot:save.heroSlot});
}
export function exportPetLink(save,content){
 return {version:1,app:'HaqiAdventure',pets:Object.values(save.pets).map(p=>({instanceId:p.id,sourceId:content.pets[p.speciesId].sourceId,appearance:{dna:content.pets[p.speciesId].dna||null,imageSheetUrl:content.pets[p.speciesId].art?.cdn||null},traits:content.pets[p.speciesId].traits,stage:['baby','teen','adult','elder'][petStage(p.level,content)],adventure:{level:p.level,xp:p.xp,deck:p.deck.map(x=>({...x}))}}))};
}
export function validatePetLink(value,content){
 check(value?.version===1&&value.app==='HaqiAdventure'&&Array.isArray(value.pets),'联动协议版本无效');const seen=new Set();
 const pets=value.pets.map(row=>{
  check(typeof row.instanceId==='string'&&!seen.has(row.sourceId)&&Object.hasOwn(content.pets,row.sourceId),'联动宠物身份无效');seen.add(row.sourceId);
  check(Number.isSafeInteger(row.adventure?.xp)&&row.adventure.xp>=0&&row.adventure.level===petXpLevel(row.adventure.xp,content),'联动成长无效');
  check(row.stage===['baby','teen','adult','elder'][petStage(row.adventure.level,content)],'联动阶段无效');
  validatePetDeck({speciesId:row.sourceId,level:row.adventure.level},content,row.adventure.deck);
  const definition=content.pets[row.sourceId];
  return {instanceId:row.instanceId,sourceId:row.sourceId,appearance:{dna:definition.dna||null,imageSheetUrl:definition.art?.cdn||null},traits:definition.traits,stage:row.stage,adventure:{level:row.adventure.level,xp:row.adventure.xp,deck:row.adventure.deck.map(x=>({key:x.key,count:x.count}))}};
 });return {version:1,app:'HaqiAdventure',pets};
}
// Future home adapter consumes this object without replacing MagicHaqi's battle level.
export function petLinkToAdventureRecords(value,content){return validatePetLink(value,content).pets.map(row=>({id:row.instanceId,speciesId:row.sourceId,...row.adventure}));}
