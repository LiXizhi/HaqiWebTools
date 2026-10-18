import {homeObjectInteractive,canPlace,chunkKey,inventoryKey} from './home_core.js';
export function homeObjects(parts){return Object.entries(parts).filter(([k])=>k.startsWith('chunk:')).flatMap(([,v])=>Object.values(v));}
export function applyHomeAction(parts,action,catalog){
 const objects=homeObjects(parts),inventory=parts.inventory||{},find=id=>objects.find(o=>o.id===id);
 function remove(obj){delete parts[`chunk:${chunkKey(obj.x,obj.y)}`][obj.id];}
 function put(obj){const key=`chunk:${chunkKey(obj.x,obj.y)}`;if(!parts[key])throw Error('土地尚未加载，请稍候');parts[key][obj.id]=obj;}
 function place(obj){const test=canPlace(obj,objects,catalog);if(!test.ok)throw Error(test.reason);put(obj);}
 if(action.type==='summon'){
  const receipt=parts[`receipt:${action.receipt}`];if(!receipt)throw Error('缺少召唤回执事务');if(receipt.completed)return false;
  if(!catalog.some(i=>i.id===action.itemId))throw Error('物品不存在');
  const key=inventoryKey(action.itemId,action.color);inventory[key]=(inventory[key]||0)+1;
  Object.assign(receipt,{completed:true,input:action.input,itemId:action.itemId,color:action.color||''});
  if(action.object&&canPlace(action.object,objects,catalog).ok){put(action.object);inventory[key]--;}
  return true;
 }
 if(action.type==='place'){
  const key=inventoryKey(action.object.itemId,action.object.color);if(!(inventory[key]>0))throw Error('请先说话或打字召唤这件物品');
  place(action.object);inventory[key]--;return true;
 }
 const obj=find(action.id);if(!obj)throw Error('物品已变化，请重新选择');
 const children=objects.filter(o=>o.parentId===obj.id);
 if(action.type==='recall'){for(const row of [obj,...children]){remove(row);const key=inventoryKey(row.itemId,row.color);inventory[key]=(inventory[key]||0)+1;}return true;}
 if(action.type==='toggleInteraction'){put({...obj,interactionEnabled:!homeObjectInteractive(obj,catalog)});return true;}
 if(action.type==='resize'){
  if(action.delta!==.25&&action.delta!==-.25)throw Error('无效的尺寸调整');
  const next={...obj,sizeScale:Math.max(.5,Math.min(2,(obj.sizeScale??1)+action.delta))};
  const test=canPlace(next,objects,catalog);if(!test.ok)throw Error(test.reason);
  const resized=objects.map(o=>o.id===obj.id?next:o);
  for(const child of children){const check=canPlace(child,resized,catalog);if(!check.ok)throw Error('缩小后放不下桌面物品，请先调整它们');}
  put(next);return true;
 }
 if(action.type==='move'){
  const next={...obj,...action.position},test=canPlace(next,objects,catalog);if(!test.ok)throw Error(test.reason);
  remove(obj);put(next);for(const child of children){remove(child);put({...child,x:child.x+next.x-obj.x,y:child.y+next.y-obj.y});}return true;
 }
 throw Error('不支持的家园操作');
}
