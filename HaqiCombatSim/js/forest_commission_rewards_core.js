import {forestCommissionRewards} from './forest_commission_core.js';
import {equipmentBlockReason} from './adventure_core.js';
import {previewEquipment} from './adventure_equipment_core.js';

// Preview an earned item against the player's actual loadout without granting
// it or changing their equipment. Duplicate rewards are beans, not upgrades.
export function forestCommissionRewardPreviews(save,content,step){
 return forestCommissionRewards(save,content,step).map(row=>{
  if(row.owned||!row.item)return {...row,changes:[],reason:''};
  const previewSave=JSON.parse(JSON.stringify(save));previewSave.inventory[row.id]=1;
  const reason=equipmentBlockReason(previewSave,row.item,content);
  if(reason)return {...row,changes:[],reason};
  const preview=previewEquipment(previewSave,content,{type:'equip',itemId:row.id});
  return {...row,changes:preview.rows.filter(change=>change.delta),reason:'',trimmed:preview.trimmed};
 });
}
