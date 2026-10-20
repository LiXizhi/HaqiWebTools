// Pure geometry shared by editing, walking and rendering. Units are home world cells.
const catalogs=new WeakMap();
export function buildingItem(obj,catalog){let map=catalogs.get(catalog);if(!map){map=new Map(catalog.map(i=>[i.id,i]));catalogs.set(catalog,map);}return map.get(obj?.itemId);}
export const isEdge=item=>['wall','window','door'].includes(item?.building?.type);
export function buildingPlacement(obj,item){
 if(!(obj.properties?.snap??item?.building?.snap??false))return obj;
 return {...obj,x:Math.round(obj.x),y:Math.round(obj.y)};
}
export function buildingBounds(obj,item){
 const s=obj.sizeScale??1,vertical=(obj.rotation||0)%2;
 return isEdge(item)?{x:obj.x,y:obj.y,w:vertical?.18*s:s,h:vertical?s:.18*s}:{x:obj.x,y:obj.y,w:(item.size?.[vertical?1:0]||1)*s,h:(item.size?.[vertical?0:1]||1)*s};
}
export const isRoofDecoration=obj=>obj.properties?.surface==='roof';
export function roofAt(obj,objects,catalog){return objects.find(r=>{if(buildingItem(r,catalog)?.building?.type!=='roof')return false;const b=buildingBounds(r,buildingItem(r,catalog));return obj.x>=b.x&&obj.x<b.x+b.w&&obj.y>=b.y&&obj.y<b.y+b.h;});}
export function obstruction(obj,item){
 if(isRoofDecoration(obj))return null;
 const defaults=item.building?.obstruction||{enabled:item.layer==='solid',width:item.size[0],depth:item.size[1],offsetX:0,offsetY:0};
 const p={...defaults,...obj.properties};
 if(!p.enabled||(item.building?.type==='door'&&obj.doorOpen))return null;
 const s=obj.sizeScale??1;
 const b={x:p.offsetX||0,y:p.offsetY||0,w:p.width,h:p.depth};
 // Rotate local geometry in the same positive-axis convention as legacy footprints.
 if((obj.rotation||0)%2)[b.x,b.y,b.w,b.h]=[b.y,b.x,b.h,b.w];
 return {x:obj.x+b.x*s,y:obj.y+b.y*s,w:b.w*s,h:b.h*s};
}
export const intersects=(a,b)=>a.x<b.x+b.w-1e-7&&a.x+a.w>b.x+1e-7&&a.y<b.y+b.h-1e-7&&a.y+a.h>b.y+1e-7;
export function validBuildingProperties(obj){
 if(obj.rotation!==undefined&&(!Number.isInteger(obj.rotation)||obj.rotation<0||obj.rotation>3))return false;
 if(obj.doorOpen!==undefined&&typeof obj.doorOpen!=='boolean')return false;
 if(obj.properties===undefined)return true;
 const p=obj.properties;if(!p||typeof p!=='object'||Array.isArray(p))return false;
 return Object.entries(p).every(([k,v])=>k==='surface'?['ground','roof'].includes(v):['snap','enabled'].includes(k)?typeof v==='boolean':['width','depth'].includes(k)?Number.isFinite(v)&&v>=.05&&v<=8:['offsetX','offsetY'].includes(k)?Number.isFinite(v)&&Math.abs(v)<=8:false);
}
export function buildingSlot(obj,item){
 const b=buildingBounds(obj,item);return `${isEdge(item)?`edge:${(obj.rotation||0)%2}`:item.building.type}:${b.x}:${b.y}:${obj.sizeScale??1}`;
}
export function buildingConflict(obj,other,catalog){
 const item=buildingItem(obj,catalog),otherItem=buildingItem(other,catalog);
 if(!item?.building&&!otherItem?.building)return null;
 if(!item?.building||!otherItem?.building){
  const modern=item?.building?item:otherItem,legacy=item?.building?otherItem:item;
  if(modern.building.type==='roof')return false;
  if(modern.layer!==legacy.layer)return false;
  const a=buildingBounds(obj,item),b=buildingBounds(other,otherItem);
  return intersects(a,b);
 }
 if(isEdge(item)!==isEdge(otherItem))return false;
 if(!isEdge(item))return item.building.type===otherItem.building.type&&intersects(buildingBounds(obj,item),buildingBounds(other,otherItem));
 // Perpendicular edges meet at corners; collinear edges cannot overlap.
 return (obj.rotation||0)%2===(other.rotation||0)%2&&intersects(buildingBounds(obj,item),buildingBounds(other,otherItem));
}
export function replacementFor(obj,objects,catalog){
 const item=buildingItem(obj,catalog);
 if(!['window','door'].includes(item?.building?.type))return null;
 return objects.find(o=>o.id!==obj.id&&buildingItem(o,catalog)?.building?.type==='wall'&&buildingSlot(o,buildingItem(o,catalog))===buildingSlot(obj,item));
}
export function buildingConnections(objects,catalog){
 const endpoints=new Map(),result=new Map();
 for(const o of objects){const item=buildingItem(o,catalog);if(!isEdge(item))continue;const s=o.sizeScale??1,v=(o.rotation||0)%2,ends=[[o.x,o.y],[o.x+(v?0:s),o.y+(v?s:0)]];result.set(o.id,ends);for(const p of ends){const key=p.join(',');endpoints.set(key,(endpoints.get(key)||0)+1);}}
 return new Map([...result].map(([id,ends])=>[id,ends.map(p=>endpoints.get(p.join(',')))]));
}
export function roofSections(objects,catalog){
 const roofs=objects.filter(o=>buildingItem(o,catalog)?.building?.type==='roof'),cells=new Map(roofs.map(o=>[`${o.x},${o.y},${o.sizeScale??1}`,o])),sections=new Map();
 for(const start of roofs){if(sections.has(start.id))continue;const group=[],queue=[start];sections.set(start.id,group);while(queue.length){const o=queue.pop();group.push(o);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const next=cells.get(`${o.x+dx*(o.sizeScale??1)},${o.y+dy*(o.sizeScale??1)},${o.sizeScale??1}`);if(next&&!sections.has(next.id)){sections.set(next.id,group);queue.push(next);}}}}
 return sections;
}
