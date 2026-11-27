import {previewNewEquipment,signedAttribute} from '../../adventure_equipment_core.js';
import {findEquipmentInstance} from '../../adventure_equipment_instances_core.js';

// Read-only comparison: exchange itself neither equips a hat nor transfers upgrades.
export function renderHuntEquipmentPreview(save,content,itemId,{el}){
 const preview=previewNewEquipment(save,content,itemId);
 const root=el('details','hunt-equipment-preview',el('summary','','兑换前 · 查看新件穿戴对比'));
 if(preview.reason){root.append(el('p','muted',preview.reason));return root;}
 const previous=content.items[save.equipment[content.items[itemId].slot]];
 const level=previous?findEquipmentInstance(save,content,previous.id)?.serverdata.addlel||0:0;
 root.append(el('p','muted',previous?`以新件 +0 替换当前「${previous.name}」+${level}：`:'新件 +0 穿戴后的变化：'));
 const changes=preview.rows.filter(row=>row.delta);
 const list=el('dl','hunt-equipment-changes');
 for(const row of changes){
  const term=el('dt','',row.label),value=el('dd','',el('span','',`${row.before}${row.unit} → ${row.value}${row.unit}`),el('strong',row.delta>0?'equipment-gain':'equipment-loss',`${signedAttribute(row.delta)}${row.unit}`));
  list.append(el('div','',term,value));
 }
 if(changes.length)root.append(list);
 else root.append(el('p','','数值属性不变，附加卡仍随装备替换。'));
 root.append(el('p','muted','附加卡见上方介绍。兑换只获得新件，不会自动穿戴；强化和宝石不会自动转移。'));
 if(preview.trimmed)root.append(el('p','equipment-warning',`换装后卡包需移出 ${preview.trimmed} 张配卡，卡牌仍保留。`));
 return root;
}
