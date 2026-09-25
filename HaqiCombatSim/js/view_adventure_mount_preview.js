import { resolveMountDrawPose } from './adventure_mounts_core.js';
import { fill } from './locale_runtime.js';

// Same seat, rider sheet and foreground as the scene. Independent CSS layers
// also allow late image loads without erasing another layer of the preview.
export function createMountPreview(assets,save,{el,tile}) {
 const preview=el('div','pet-mount-preview');
 const row=assets.content.mountByItem?.[save.mountId];
 const mount=row&&assets.content.mountCatalog?.mounts.find(entry=>entry.id===row.mountId);
 preview.dataset.previewMount=mount?.id||'';
 if(!mount){preview.append(tile(assets,'sprites',save.appearance==='girl'?12:8,96,120));return preview;}
 const baseSize=120;
 // Formation slots are zero-based: face inward on either half of the stage.
 const facing=(save.heroSlot??0)<2?2:1;
 preview.dataset.previewFacing=facing===2?'right':'left';
 const pose=resolveMountDrawPose(mount,facing,{size:baseSize,gender:save.appearance==='girl'?'female':'male'});
 function visible(rect,bounds=[0,0,1,1]) {
  return [rect.x+bounds[0]*rect.w,rect.y+bounds[1]*rect.h,rect.x+bounds[2]*rect.w,rect.y+bounds[3]*rect.h];
 }
 const m=visible(pose.mount,mount.layoutBounds?.mount[pose.mount.cell]);
 const r=visible(pose.rider,mount.layoutBounds?.riders[pose.rider.art]?.[pose.rider.cell]);
 const left=Math.min(m[0],r[0]),top=Math.min(m[1],r[1]);
 const width=Math.max(m[2],r[2])-left,height=Math.max(m[3],r[3])-top;
 preview.dataset.overhang=String(Math.max(0,height/baseSize-1));
 const picture=el('div','pet-mount-composite');
 // Preserve scene scale; the slot width must never shrink the rider again.
 picture.style.width=`calc(var(--pet-preview-height, 120px) * ${width/baseSize})`;
 picture.style.height=`calc(var(--pet-preview-height, 120px) * ${height/baseSize})`;
 picture.setAttribute('role','img');picture.setAttribute('aria-label',fill('{name}骑乘{mount}',{name:save.name,mount:assets.content.items[save.mountId]?.name||mount.name}).text);
 function layer(rect,sheet,polygon){
  const node=el('div','pet-mount-layer'),cols=sheet.columns||2,rows=sheet.rows||2;
  Object.assign(node.style,{left:`${(rect.x-left)/width*100}%`,top:`${(rect.y-top)/height*100}%`,width:`${rect.w/width*100}%`,height:`${rect.h/height*100}%`,
   backgroundImage:`url("${assets.mode==='local'?sheet.local:sheet.cdn}")`,backgroundSize:`${cols*100}% ${rows*100}%`,
   backgroundPosition:`${cols>1?(rect.cell%cols)*100/(cols-1):0}% ${rows>1?Math.floor(rect.cell/cols)*100/(rows-1):0}%`});
  if(polygon)node.style.clipPath=`polygon(${polygon.map(([x,y])=>`${x*100}% ${y*100}%`).join(',')})`;
  node.setAttribute('aria-hidden','true');picture.append(node);
 }
 layer(pose.mount,mount.art);
 layer(pose.rider,assets.content.mountCatalog.sheets[pose.rider.art]);
 for(const polygon of pose.foreground)layer(pose.mount,mount.art,polygon);
 preview.append(picture);
 return preview;
}
