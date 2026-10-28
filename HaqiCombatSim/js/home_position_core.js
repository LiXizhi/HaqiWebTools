import {footprint,canPlace} from './home_core.js';
import {homeRooms,homeRoomContains} from './home_room_core.js';
export const HOME_POSITION_WORDS=['left','right','next to','near','between','on','behind','under','in'];
const overlap=(a,b)=>Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>0;
const gap=(a,b)=>({x:Math.max(0,b.x-a.x-a.w,a.x-b.x-b.w),y:Math.max(0,b.y-a.y-a.h,a.y-b.y-b.h)});
function matches(kind,target,anchors){
 const a=anchors[0],g=gap(target,a),intersects=target.x<a.x+a.w&&target.x+target.w>a.x&&overlap(target,a);
 if(kind==='on'||kind==='under')return intersects;
 if(intersects)return false;
 // Behind is viewer-relative in this top-down home: farther from the viewer,
 // aligned with the reference, on the ground and not merely on its surface.
 if(kind==='behind')return target.y+target.h<=a.y&&target.x<a.x+a.w&&target.x+target.w>a.x&&g.y<=2;
 if(kind==='left')return target.x+target.w<=a.x&&overlap(target,a)&&g.x<=2;
 if(kind==='right')return target.x>=a.x+a.w&&overlap(target,a)&&g.x<=2;
 if(kind==='next to')return overlap(target,a)&&g.x<=1;
 if(kind==='near')return Math.hypot(g.x,g.y)<=2;
 if(kind==='between'){
  const [l,r]=[...anchors].sort((x,y)=>x.x-y.x);
  return target.x>=l.x+l.w&&target.x+target.w<=r.x&&overlap(target,l)&&overlap(target,r);
 }
 return false;
}
function bounds(o,catalog){const b=footprint(o,catalog);return {id:o.id,itemId:o.itemId,x:b.x,y:b.y,w:b.w,h:b.h};}
export function homePositionBinding(spec,objectId,objects,catalog){
 if(!spec||!HOME_POSITION_WORDS.includes(spec.kind))return null;
 const object=objects.find(o=>o.id===objectId);if(!object||!catalog.some(i=>i.id===object.itemId&&!i.building)||(object.parentId&&!['on','under'].includes(spec.kind)))return null;
 if(spec.kind==='under'&&!['book','ball'].includes(object.itemId))return null;
 if(spec.kind==='on'&&!catalog.some(i=>i.id===object.itemId&&i.layer==='top'))return null;
 if(spec.kind==='in'){
  for(const room of homeRooms(objects,catalog)){
   for(let y=room.y+.5;y<room.y+room.h;y+=.5)for(let x=room.x+.5;x<room.x+room.w;x+=.5){
    const moved={...object,x,y},box=footprint(moved,catalog);
    if(homeRoomContains(room,box)&&canPlace(moved,objects,catalog).ok)return {kind:'in',target:{id:object.id,itemId:object.itemId},anchors:[room]};
   }
  }
  return null;
 }
 const target=bounds(object,catalog),anchors=objects.filter(o=>o.id!==objectId&&!o.parentId&&spec.anchorItemIds.includes(o.itemId)&&catalog.some(i=>i.id===o.itemId&&!i.building&&(spec.kind!=='on'||i.slots>0)&&(spec.kind!=='under'||i.id==='table'))).sort((a,b)=>String(a.id).localeCompare(String(b.id))).map(o=>bounds(o,catalog));
 function* groups(){for(let i=0;i<anchors.length;i++){if(spec.kind!=='between')yield [anchors[i]];else for(let j=i+1;j<anchors.length;j++)yield [anchors[i],anchors[j]];}}
 for(const group of groups()){
  const a=group[0],candidates=[];
  for(const distance of [.5,1,0]){
   const y=a.y+(a.h-target.h)/2;
   if(['left','next to','near'].includes(spec.kind))candidates.push({x:a.x-target.w-distance,y});
   if(['right','next to','near'].includes(spec.kind))candidates.push({x:a.x+a.w+distance,y});
   if(spec.kind==='near')candidates.push({x:a.x,y:a.y-target.h-distance},{x:a.x,y:a.y+a.h+distance});
  }
  if(spec.kind==='behind')for(const distance of [.5,1,0])candidates.push({x:a.x+(a.w-target.w)/2,y:a.y-target.h-distance});
  if(spec.kind==='between'){const [l,r]=[...group].sort((x,y)=>x.x-y.x);candidates.push({x:(l.x+l.w+r.x-target.w)/2,y:Math.max(l.y,r.y)});}
  if(spec.kind==='under')candidates.push({x:a.x+(a.w-target.w)/2,y:a.y+(a.h-target.h)/2,parentId:a.id,underTable:true});
  if(spec.kind==='on')candidates.push({x:a.x+(a.w-target.w)/2,y:a.y+(a.h-target.h)/2,parentId:a.id,underTable:false});
  const possible=candidates.find(p=>matches(spec.kind,{...target,...p},group)&&canPlace({...object,...p},objects,catalog).ok);
  if(possible)return {kind:spec.kind,target:{id:object.id,itemId:object.itemId},anchors:group};
 }
 return null;
}
export function homePositionCurrent(binding,objects,catalog){
 if(!binding)return false;
 const target=objects.find(o=>o.id===binding.target.id&&o.itemId===binding.target.itemId);
 if(!target||(!['on','under'].includes(binding.kind)&&target.parentId)||!catalog.some(i=>i.id===target.itemId))return false;
 if(binding.kind==='in'){
  const room=homeRooms(objects,catalog).find(r=>r.signature===binding.anchors[0]?.signature);
  return !!room&&!target.underTable&&target.properties?.surface!=='roof'&&homeRoomContains(room,footprint(target,catalog))&&canPlace(target,objects,catalog).ok;
 }
 const anchors=[];
 for(const saved of binding.anchors){
  const current=objects.find(o=>o.id===saved.id&&o.itemId===saved.itemId);if(!current||current.parentId||!catalog.some(i=>i.id===current.itemId))return false;
  const b=bounds(current,catalog);if(['x','y','w','h'].some(k=>b[k]!==saved[k]))return false;anchors.push(b);
 }
 if(binding.kind==='under'&&(!target.underTable||target.parentId!==anchors[0].id||!canPlace(target,objects,catalog).ok))return false;
 if(binding.kind!=='under'&&target.underTable)return false;
 if(binding.kind==='on'&&(target.parentId!==anchors[0].id||!catalog.some(i=>i.id===target.itemId&&i.layer==='top')||!canPlace(target,objects,catalog).ok))return false;
 return matches(binding.kind,bounds(target,catalog),anchors);
}
