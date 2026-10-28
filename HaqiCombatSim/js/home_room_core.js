import {buildingItem} from './home_building_core.js';
// Initial supported rooms: complete rectangular floor grids with structural
// perimeter cells. Irregular/open/multi-room structures remain unsupported.
export function homeRooms(objects,catalog){
 const grid=new Map(),edges=new Set();
 for(const o of objects){
  if(!Number.isInteger(o.x)||!Number.isInteger(o.y)||(o.sizeScale??1)!==1||o.properties?.snap===false||o.parentId)continue;
  const type=buildingItem(o,catalog)?.building?.type,key=`${o.x},${o.y}`;
  if(type==='floor')grid.set(key,o);
  if(['wall','window','door'].includes(type))edges.add(key);
 }
 const visited=new Set(),rooms=[];
 for(const [key,first] of grid){
  if(visited.has(key))continue;
  const cells=[],queue=[first];visited.add(key);
  for(let i=0;i<queue.length;i++){
   const o=queue[i];cells.push(o);
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const k=`${o.x+dx},${o.y+dy}`;if(grid.has(k)&&!visited.has(k)){visited.add(k);queue.push(grid.get(k));}}
  }
  const x=Math.min(...cells.map(o=>o.x)),y=Math.min(...cells.map(o=>o.y)),w=Math.max(...cells.map(o=>o.x))-x+1,h=Math.max(...cells.map(o=>o.y))-y+1;
  if(w<3||h<3||w>16||h>16||cells.length!==w*h)continue;
  if(cells.some(o=>{const perimeter=o.x===x||o.y===y||o.x===x+w-1||o.y===y+h-1;return perimeter!==edges.has(`${o.x},${o.y}`);}))continue;
  const anchor=cells.slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)))[0];
  // Capture physical structure identities too: a replacement requires reselection.
  const structure=objects.filter(o=>o.x>=x&&o.x<x+w&&o.y>=y&&o.y<y+h&&['floor','wall','window','door'].includes(buildingItem(o,catalog)?.building?.type));
  const signature=JSON.stringify(structure.map(o=>[o.id,o.itemId,o.x,o.y,o.sizeScale??1,o.rotation||0,o.properties?.snap!==false]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
  rooms.push({id:anchor.id,itemId:anchor.itemId,x,y,w,h,signature});
 }
 return rooms.sort((a,b)=>String(a.id).localeCompare(String(b.id)));
}
export function homeRoomContains(room,box){
 return box.x>=room.x+.25&&box.y>=room.y+.25&&box.x+box.w<=room.x+room.w-.25&&box.y+box.h<=room.y+room.h-.25;
}
