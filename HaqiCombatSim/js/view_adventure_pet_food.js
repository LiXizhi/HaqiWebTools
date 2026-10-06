import {fill,tr,setText} from './locale_runtime.js';
import {DetailDialog} from './view_detail_dialog.js';
import {FOOD_ID,foodInfo,hungryPets} from './adventure_pets_core.js';

export function renderPetFood(parent,model,cb,{el,button,art}){
 const {save,assets}=model,c=assets.content;
 const box=el('section','pet-food-station');box.setAttribute('aria-label',tr('宠物自动食槽'));
 const slots=el('div','pet-food-slots');
 let dialog;
 const ids=[FOOD_ID,...Object.keys(c.petFoods||{}).map(Number)];
 function open(index,trigger){
  dialog??=new DetailDialog(parent,{el,title:'放入口粮'});
  const current=save.petFoodSlots?.[index];dialog.body.replaceChildren();dialog.footer.replaceChildren();
  dialog.body.append(el('p','muted','先吃左槽，再吃右槽。只消耗放入食槽的口粮；战斗和离线期间暂停。'));
  if(current){
   dialog.body.append(el('p','',fill(`槽内：{v0} × {v1}`,{v0:String(c.items[current.itemId].name),v1:String(current.count)}).text));
   const hungry=hungryPets(save,c)[0];
   if(hungry)dialog.footer.append(button('喂养'+c.pets[hungry[1].speciesId].name,()=>{dialog.close();cb.action({type:'pet-food-feed',slot:index,petId:hungry[0]});},'primary'));
   dialog.footer.append(button('全部取回背包',()=>{dialog.close();cb.action({type:'pet-food-take',slot:index});},'secondary'));
  }
  for(const id of ids){
   if(current&&current.itemId!==id)continue;
   const item=c.items[id],food=foodInfo(c,id),stock=save.inventory[id]||0;
   const count=el('input','');count.type='number';count.min='1';count.max=String(stock);count.step='1';count.value=String(Math.min(stock,10)||1);count.setAttribute('aria-label',fill(`{v0}放入数量`,{v0:String(item.name)}).text);
   const put=button('放入',()=>{if(!count.reportValidity())return;dialog.close();cb.action({type:'pet-food-put',slot:index,itemId:id,count:Number(count.value)});},'primary');put.disabled=stock<1||!!save.pendingEncounter;count.disabled=put.disabled;
   const info=el('div','pet-food-description',el('strong','',item.name),el('small','',fill(`饱食 +{v0}{v1}`,{v0:String(food.restore),v1:String(food.xp?fill(` · 经验 +{v0}`,{v0:String(food.xp)}).text:'')}).text),el('small','muted',fill(`背包 {v0} 份`,{v0:String(stock)}).text));
   const row=el('div','pet-food-choice',art(assets,item.art,48,48),info,el('label','pet-food-quantity',el('span','','数量'),count),put);
   if(!stock){const buy=button(fill(`买 10 份 · {v0} 奇豆`,{v0:String(food.price*10)}).text,()=>{dialog.close();cb.action({type:'buy',productId:'supply:'+id,count:10});},'secondary pet-food-buy');buy.disabled=!!save.pendingEncounter||(save.inventory[100]||0)<food.price*10;row.append(buy);}
   dialog.body.append(row);
  }
  dialog.body.append(el('p','muted','原版口粮保留经验值；饱食效果与奇豆售价采用网页版规则。满级宠物仍会吃已放入的口粮，但不再获得经验。'));
  dialog.footer.append(button('前往补给商店',()=>{dialog.close();cb.panel('shop',{category:'supply'});},'secondary'));
  dialog.open(trigger);
 }
 const hint=el('small','pet-food-hint');hint.setAttribute('aria-live','polite');
 box.append(slots,hint);
 let signature;
 box.refresh=()=>{
  const hungry=hungryPets(save,c)[0];
  const next=JSON.stringify([save.petFoodSlots,!!save.pendingEncounter,hungry?.[0]]);
  if(signature===next)return;signature=next;
  slots.replaceChildren();
  for(let index=0;index<2;index++){
   const row=save.petFoodSlots?.[index],item=row&&c.items[row.itemId];
   const b=button([item?art(assets,item.art,48,48):el('span','pet-food-empty','+'),...(row?[el('strong','',`× ${row.count}`)]:[])],()=>open(index,b),'secondary pet-food-slot');
   b.dataset.foodSlot=index;b.disabled=!!save.pendingEncounter;
   const label=fill(`食槽 {v0}，{v1}`,{v0:String(index+1),v1:String(item?fill(`{v0}，剩余 {v1} 份`,{v0:String(item.name),v1:String(row.count)}).text:'空槽，点击放入口粮')}).text;
   b.title=label;b.setAttribute('aria-label',label);slots.append(b);
  }
  const needsFood=!!hungry&&!save.pendingEncounter;
  box.classList.toggle('needs-food',needsFood);hint.hidden=!needsFood;
  setText(hint,needsFood?'伙伴饿了，点击喂养':'');
  box.dataset.foodState=JSON.stringify(save.petFoodSlots);
 };
 box.refresh();
 return box;
}
