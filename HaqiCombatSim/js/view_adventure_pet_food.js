import {DetailDialog} from './view_detail_dialog.js';
import {FOOD_ID,foodInfo,petParams} from './adventure_pets_core.js';

export function renderPetFood(parent,model,cb,{el,button,art}){
 const {save,assets}=model,c=assets.content,p=petParams(c);
 const box=el('section','pet-food-station');box.setAttribute('aria-label','宠物自动食槽');
 const label=el('div','pet-food-heading',el('strong','','自动食槽'),el('small','muted',`上阵伙伴共享 · 饱食低于 ${p.feedThreshold} 时进食`));
 const slots=el('div','pet-food-slots');
 let dialog;
 const ids=[FOOD_ID,...Object.keys(c.petFoods||{}).map(Number)];
 function open(index,trigger){
  dialog??=new DetailDialog(parent,{el,title:'放入口粮'});
  const current=save.petFoodSlots?.[index];dialog.body.replaceChildren();dialog.footer.replaceChildren();
  dialog.body.append(el('p','muted','先吃左槽，再吃右槽。只消耗放入食槽的口粮；战斗和离线期间暂停。'));
  if(current){
   dialog.body.append(el('p','',`槽内：${c.items[current.itemId].name} × ${current.count}`));
   dialog.footer.append(button('全部取回背包',()=>{dialog.close();cb.action({type:'pet-food-take',slot:index});},'secondary'));
  }
  for(const id of ids){
   if(current&&current.itemId!==id)continue;
   const item=c.items[id],food=foodInfo(c,id),stock=save.inventory[id]||0;
   const count=el('input','');count.type='number';count.min='1';count.max=String(stock);count.step='1';count.value=String(Math.min(stock,10)||1);count.setAttribute('aria-label',`${item.name}放入数量`);
   const put=button('放入',()=>{if(!count.reportValidity())return;dialog.close();cb.action({type:'pet-food-put',slot:index,itemId:id,count:Number(count.value)});},'primary');put.disabled=stock<1||!!save.pendingEncounter;count.disabled=put.disabled;
   const info=el('div','pet-food-description',el('strong','',item.name),el('small','',`饱食 +${food.restore}${food.xp?` · 经验 +${food.xp}`:''}`),el('small','muted',`背包 ${stock} 份`));
   const row=el('div','pet-food-choice',art(assets,item.art,48,48),info,el('label','pet-food-quantity',el('span','','数量'),count),put);
   if(!stock){const buy=button(`买 10 份 · ${food.price*10} 奇豆`,()=>{dialog.close();cb.action({type:'buy',productId:'supply:'+id,count:10});},'secondary pet-food-buy');buy.disabled=!!save.pendingEncounter||(save.inventory[100]||0)<food.price*10;row.append(buy);}
   dialog.body.append(row);
  }
  dialog.body.append(el('p','muted','原版口粮保留经验值；饱食效果与奇豆售价采用网页版规则。满级宠物仍会吃已放入的口粮，但不再获得经验。'));
  dialog.footer.append(button('前往补给商店',()=>{dialog.close();cb.panel('shop',{category:'supply'});},'secondary'));
  dialog.open(trigger);
 }
 for(let index=0;index<2;index++){
  const row=save.petFoodSlots?.[index],item=row&&c.items[row.itemId];
  const b=button([item?art(assets,item.art,48,48):el('span','pet-food-empty','+'),el('small','',item?item.name:'放入口粮'),el('strong','',row?`× ${row.count}`:'空槽')],()=>open(index,b),'secondary pet-food-slot');
  b.dataset.foodSlot=index;b.disabled=!!save.pendingEncounter;b.setAttribute('aria-label',`食槽 ${index+1}，${item?`${item.name}，剩余 ${row.count} 份`:'空槽，点击放入口粮'}`);slots.append(b);
 }
 const total=(save.petFoodSlots||[]).reduce((sum,row)=>sum+(row?.count||0),0);
 box.append(label,slots,el('small','muted',save.pendingEncounter?'战斗中暂停进食':total?'口粮已备好，可随时取回':'食槽空了，放入口粮后自动进食'));
 box.dataset.foodState=JSON.stringify(save.petFoodSlots);
 return box;
}
