import {equipmentInstances,findEquipmentInstance} from './adventure_equipment_instances_core.js';
import {upgradeLevels,upgradeAt,upgradeAttributes} from './adventure_upgrade_core.js';
// Avatar_equip_upgrade.lua L149–157: kids inventory subclass filters, equipped bag 0 and bag 1.
export const STRENGTHENING_FILTERS=[
    {name:'所有装备',types:[2,5,6,7,8,9,10,11,12,14,15,16,17,18,19,70,71]},
    {name:'手持',types:[10,11]},{name:'帽子',types:[2,18]},{name:'背部',types:[8,70]},
    {name:'衣服',types:[5,6,19]},{name:'鞋子',types:[7,71]},{name:'饰品',types:[12,14,15,16,17]},
];
// Avatar_equipment_subpage.lua L176–257: exclude magic books; omit max-level instances.
export function strengtheningItems(save,content,filter=0) {
    const types=STRENGTHENING_FILTERS[filter]?.types||STRENGTHENING_FILTERS[0].types;
    return equipmentInstances(save,content).rows.filter(row=>{
        const item=content.items[row.gsid];
        return !(row.gsid>=17233&&row.gsid<=17248)&&types.includes(item.subtype??item.slot)&&!!upgradeAt(content,row.gsid,row.serverdata.addlel+1);
    });
}
// Avatar_equip_upgrade.lua L160–170: beginners auto-select crystal staff; other levels start empty.
export function initialStrengtheningSelection(save,content,itemId,guid) {
    return findEquipmentInstance(save,content,itemId||(save.level<=10?1912:0),guid)?.guid||null;
}
export function strengtheningPreview(save,content,guid) {
    const instance=findEquipmentInstance(save,content,null,guid);
    if(!instance)return {error:'请先放入你的装备再进行强化。'};
    const item=content.items[instance.gsid],level=instance.serverdata.addlel;
    const next=upgradeAt(content,item.id,level+1),current=upgradeAt(content,item.id,level);
    const max=upgradeLevels(content,item.id).at(-1)?.level||0;
    const material=next?content.items[next.cost[0]]:null,held=next?(save.inventory[next.cost[0]]||0):0;
    return {instance,item,level,max,next,current,material,held,attributes:upgradeAttributes(next||current),
        error:!next?'装备已经满级，不能再强化了。':held<next.cost[1]?'你强化装备需要的材料不足了哦。':save.pendingEncounter?'请先完成当前战斗。':null};
}
