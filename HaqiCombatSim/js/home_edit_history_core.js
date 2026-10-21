import {buildingItem,obstruction,intersects} from './home_building_core.js';
// Session-local object deltas. Receipts, practice, residents and cloud metadata never rewind.
export function homeEditDelta(before,after){
 const changes=[];
 for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
  if(!key.startsWith('chunk:'))continue;
  for(const id of new Set([...Object.keys(before[key]||{}),...Object.keys(after[key]||{})])){
   const a=before[key]?.[id]??null,b=after[key]?.[id]??null;
   if(JSON.stringify(a)!==JSON.stringify(b))changes.push({key,id,before:structuredClone(a),after:structuredClone(b)});
  }
 }
 return changes;
}
export function applyHomeEditDelta(parts,changes,reverse=false,{catalog=[],actors=[]}={}){
 // Validate everything before mutating, including edits made outside this history.
 for(const c of changes){
  if(!Object.hasOwn(parts,c.key))throw Error('土地尚未加载，请稍候');
  if(JSON.stringify(parts[c.key][c.id]??null)!==JSON.stringify(reverse?c.after:c.before))throw Error('物品已变化，无法撤销或重做');
  const next=reverse?c.before:c.after,item=next&&buildingItem(next,catalog),b=item&&obstruction(next,item);
  if(b&&actors.some(p=>intersects(b,{x:p.x-.18,y:p.y-.12,w:.36,h:.24})))throw Error('这里有角色，暂时无法撤销或重做');
 }
 for(const c of changes){const value=reverse?c.before:c.after;if(value===null)delete parts[c.key][c.id];else parts[c.key][c.id]=structuredClone(value);}
}
export function createHomeEditHistory(limit=50){
 let undo=[],redo=[];
 return {
  clear(){undo=[];redo=[];},
  state(){return {canUndo:undo.length>0,canRedo:redo.length>0};},
  peek(reverse){return (reverse?undo:redo).at(-1);},
  finish(reverse){const from=reverse?undo:redo,to=reverse?redo:undo;const row=from.pop();if(row)to.push(row);},
  record(changes,group){
   if(!changes.length)return;
   redo=[];
   const last=undo.at(-1);
   if(group&&last?.group===group){
    const map=new Map(last.changes.map(c=>[c.key+'|'+c.id,c]));
    for(const c of changes){const key=c.key+'|'+c.id,old=map.get(key);map.set(key,old?{...c,before:old.before}:c);}
    last.changes=[...map.values()].filter(c=>JSON.stringify(c.before)!==JSON.stringify(c.after));
    if(!last.changes.length)undo.pop();
   }else undo.push({changes:structuredClone(changes),group});
   if(undo.length>limit)undo.shift();
  }
 };
}
