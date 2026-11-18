import {deckLimits,canEquip} from '../../adventure_core.js';
import {equipmentSummary} from '../../adventure_equipment_core.js';
import {equipmentInstances,findEquipmentInstance} from '../../adventure_equipment_instances_core.js';
import {magicStarStatus} from '../../adventure_magic_star_core.js';

export function shopEquipmentComparison(save,itemId,content,{membership,now=Date.now()}={}){
    const item=content.items[itemId];
    if(!item||item.kind!==1||item.slot===24)return null;
    const next=structuredClone(save),owned=(save.inventory[itemId]||0)>0;
    next.inventory[itemId]=Math.max(1,next.inventory[itemId]||0);
    if(!canEquip(next,item,content))return null;
    // Reconcile existing GUIDs before introducing a new base item. Never borrow
    // a stale upgrade projection or another item's socket data for a purchase.
    next.equipmentInstances=equipmentInstances(save,content).rows;
    let instance=owned?findEquipmentInstance(next,content,itemId):null;
    if(!owned){
        let guid='shop-preview-new';
        while(next.equipmentInstances.some(row=>row.guid===guid))guid+='-new';
        instance={guid,gsid:Number(itemId),serverdata:{addlel:0}};
        next.equipmentInstances.push(instance);
        delete next.upgrades[itemId];
    }
    if(!instance)return null;
    next.equipment[item.slot]=Number(itemId);
    next.equipmentGuids={...next.equipmentGuids,[item.slot]:instance.guid};
    const starLevel=membership?.status==='ready'&&Number.isFinite(now)?magicStarStatus(membership,now).level:0;
    const before=new Map(equipmentSummary(save,content,starLevel).map(row=>[row.key,row.value]));
    const primary=new Set(['hp','damagePct','resistPct','accuracyPct','critPct']);
    const rows=equipmentSummary(next,content,starLevel).filter(row=>primary.has(row.key))
        .map(row=>({...row,before:before.get(row.key),delta:row.value-before.get(row.key)}));
    if(rows.some(row=>!Number.isFinite(row.value)||!Number.isFinite(row.before)))return null;
    // Include losses before gains, then unchanged values, within four lines.
    rows.sort((a,b)=>(a.delta<0?0:a.delta>0?1:2)-(b.delta<0?0:b.delta>0?1:2));
    return {label:owned?'已有实例试穿（含该件强化与宝石）· 主要属性节选':'新件试穿（无强化、无宝石）· 主要属性节选',rows:rows.slice(0,4)};
}

export function shopBagComparison(save,itemId,content){
    const current=deckLimits(save,content);
    const target=deckLimits({...save,equipment:{...save.equipment,24:itemId}},content);
    const equipped=String(save.equipment[24])===String(itemId);
    const noGain=target.capacity<=current.capacity&&target.eachCapacity<=current.eachCapacity;
    const status=equipped?'当前使用':noGain?'容量与同卡张数均无增益':'装备后生效，购买不会自动装备';
    return `卡牌容量 ${current.capacity} → ${target.capacity} 张；同张可带 ${current.eachCapacity} → ${target.eachCapacity} 张。${status}。`;
}

// Membership refresh replaces the modal, so the original trigger may be detached.
export function restoreShopPurchaseFocus({root,state,trigger,productId,navigating=false}){
    if(navigating||!root?.isConnected)return;
    const current=root.querySelector('.shop-modal');
    if(!current||current.shopViewState!==state)return;
    const target=trigger?.isConnected&&current.contains(trigger)?trigger:
        [...current.querySelectorAll('[data-shop-product-id]')].find(node=>node.dataset.shopProductId===String(productId)&&!node.disabled);
    target?.focus({preventScroll:true});
}
