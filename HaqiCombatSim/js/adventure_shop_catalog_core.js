import {canEquip} from './adventure_core.js';
import {foodInfo,productPrice} from './adventure_pets_core.js';
import {ownedPetRecords} from './adventure_pet_files_core.js';

export function shopOwned(save,item){
 return item.kind==='pet'?Object.values(ownedPetRecords(save)).some(p=>p.speciesId===item.petId):(save.inventory?.[item.itemId]||0)>0;
}
export function shopUse(item,content){
 const food=foodInfo(content,item.itemId);
 if(food)return {panel:'pet',options:{tab:'follow'},label:'去喂伙伴',purpose:`每份恢复 ${food.restore} 饱食（上限 100），补入食槽后会自动喂食`};
 if(item.kind==='pet')return {panel:'pet',options:{tab:'follow'},label:'去安排伙伴',purpose:'加入伙伴队伍，在宠物页安排上阵和卡牌'};
 if(item.kind==='mount')return {panel:'pet',options:{tab:'mount'},label:'去骑乘',purpose:`地图移动速度 +${Math.round(((content.balanceParams?.adventure?.mountSpeed??1.35)-1)*100)}%（所有坐骑相同），价格更高不会更快`};
 if(item.slot===24)return {panel:'equipment',options:{itemId:item.itemId},label:'去装备卡包',purpose:'装备卡包后调整可携带卡牌与同卡张数'};
 if(item.kind==='gear')return {panel:'equipment',options:{itemId:item.itemId},label:'去穿戴装备',purpose:'在背包查看属性并穿戴，购买不会自动穿上'};
 return {panel:'inventory',label:'去背包使用',purpose:'购买后在背包查看用途与使用条件'};
}
export function shopProductPage(rows,productId,pageSize){
 const index=rows.findIndex(item=>item.id===productId);
 return index<0?null:Math.floor(index/pageSize);
}
export function shopUsable(save,item,content){
 if(item.level>save.level)return false;
 if(item.kind!=='gear')return true;
 const gear=content.items?.[item.itemId];
 return !!gear&&canEquip({...save,inventory:{...save.inventory,[item.itemId]:Math.max(1,save.inventory?.[item.itemId]||0)}},gear,content);
}
export function shopOffer(save,item,content,{isVip=false,count=1}={}){
 const currency=item.kind==='mount'?item.currency:100,price=productPrice(item,content),total=price*count;
 const currencyName=currency===984?'魔豆':'奇豆',balance=save.inventory?.[currency]||0,owned=shopOwned(save,item);
 let reason='';
 if(item.retired||item.isInternalTest)reason='商品已下架';
 else if(![100,984].includes(currency)||!Number.isSafeInteger(price)||price<0||!Number.isSafeInteger(total))reason='商品价格暂不可用';
 else if(!Number.isSafeInteger(count)||count<1||count>999||(count!==1&&!foodInfo(content,item.itemId)))reason='购买数量无效';
 else if(owned&&(item.kind==='pet'||item.kind==='mount'))reason='已拥有';
 else if(item.level>save.level)reason=`${item.level}级解锁`;
 else if(item.vipOnly&&!isVip)reason='会员专属';
 else if(balance<total)reason=`还差 ${total-balance} ${currencyName}`;
 return {currency,currencyName,price,total,balance,owned,reason,canBuy:!reason,shortfall:Math.max(0,total-balance)};
}
