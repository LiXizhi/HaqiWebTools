import {canEquip,deckLimits} from './adventure_core.js';
import {FOOD_ID,foodInfo,petParams,productPrice} from './adventure_pets_core.js';

export function adventureShopSelection(save,content){
 const chapter=content.quests||[];
 const active=save.zone==='camp'&&!save.graduated&&chapter.length>0&&!chapter.every(q=>save.quests?.[q.id]?.claimed);
 if(!active)return {active:false,rows:[]};
 const rows=[],advice=shopGuidance(save,content);
 if(advice.panel==='pet')rows.push(advice);
 else{
  const stock=Object.entries(save.inventory||{}).some(([id,n])=>n>0&&foodInfo(content,Number(id)))||(save.petFoodSlots||[]).some(row=>row?.count>0&&foodInfo(content,row.itemId));
  if(stock)rows.push({text:'已有口粮，暂时不用再买。',panel:'pet',owned:true,shortfall:0});
 }
 const bag=shopGuidance({...save,pets:{}},content);
 if(bag.productId)rows.push(bag);
 return {active:true,rows,message:rows.length?'只准备这次冒险用得上的东西。':'现有卡包够用，先试试已有卡牌的搭配。'};
}

// Read-only shopping advice. Never change prices, grant goods or equip a bag.
export function shopGuidance(save,content){
 const inventory=save.inventory||{},products=(content.shop||[]).filter(p=>!p.retired&&!p.isInternalTest&&!p.vipOnly&&(!p.currency||p.currency===100)&&p.level<=save.level);
 const hungry=Object.values(save.pets||{}).some(p=>(p.hunger??100)<petParams(content).feedThreshold);
 const foodStock=Object.entries(inventory).some(([id,n])=>n>0&&foodInfo(content,Number(id)))||(save.petFoodSlots||[]).some(row=>row?.count>0&&foodInfo(content,row.itemId));
 const offer=(product,text,panel,owned=false)=>({productId:product.id,text,panel,owned,shortfall:owned?0:Math.max(0,productPrice(product,content)-(inventory[100]||0))});
 if(hungry){
  const food=products.find(p=>p.itemId===FOOD_ID);
  if(foodStock)return {text:'伙伴饿了，先用已有口粮。',panel:'pet',owned:true,shortfall:0};
  if(food)return offer(food,'备一份口粮，恢复伙伴饱食。','pet');
 }
 const current=deckLimits(save,content);
 const lessons=content.cardLibrary||content.learn?.[save.school]||[];
 const supported=new Set(lessons.filter(row=>row.supported!==false).map(row=>row.key));
 const learned=Object.entries(save.cards||{}).filter(([key,count])=>count>0&&supported.has(key)).map(([,count])=>content.cardLibrary?Infinity:count);
 const playable=learned.reduce((n,count)=>n+Math.min(count,current.eachCapacity),0);
 const bags=products.filter(p=>p.kind==='gear'&&p.slot===24).filter(p=>{
  const item=content.items[p.itemId];
  if(!item||!canEquip({...save,inventory:{...inventory,[p.itemId]:Math.max(1,inventory[p.itemId]||0)}},item,content))return false;
  const capacity=Number(item.stats?.[167]||10),copies=Number(item.stats?.[170]||2);
  const upgrade=capacity>=current.capacity&&copies>=current.eachCapacity&&(capacity>current.capacity||copies>current.eachCapacity);
  if(!upgrade)return false;
  // Owned upgrades cost nothing to try. For new purchases, require a usable
  // deck-building option now, not just a larger number on an empty pocket.
  if(inventory[p.itemId]>0)return true;
  const capacityBenefit=capacity>current.capacity&&playable>current.capacity;
  const copyBenefit=copies>current.eachCapacity&&learned.some(count=>Math.min(count,copies,capacity)>Math.min(count,current.eachCapacity,current.capacity));
  return capacityBenefit||copyBenefit;
 }).sort((a,b)=>Number(!!inventory[b.itemId])-Number(!!inventory[a.itemId])||productPrice(a,content)-productPrice(b,content)||String(a.id).localeCompare(String(b.id)));
 const bag=bags[0];
 if(bag){const item=content.items[bag.itemId];return offer(bag,`卡包可装 ${item.stats[167]||10} 张，同张可带 ${item.stats[170]||2} 张。`,'deck',!!inventory[bag.itemId]);}
 return {text:'现有卡包够用，先试试已有卡牌的搭配。',panel:'deck',owned:true,shortfall:0};
}

