import { resolveMountDrawPose } from './adventure_mounts_core.js';
import { fill } from './locale_runtime.js';
import {heroPortrait} from './hero_renderer.js';

// Same class as world/battle. Existing alpha bounds retain the UI scale and seat.
export function createMountPreview(assets,save,{el,tile}) {
 const preview=el('div','pet-mount-preview');
 const row=assets.content.mountByItem?.[save.mountId];
 const mount=row&&assets.content.mountCatalog?.mounts.find(entry=>entry.id===row.mountId);
 preview.dataset.previewMount=mount?.id||'';
 if(!mount){preview.append(assets.hero?heroPortrait(assets,save,96,120):tile?.(assets,'sprites',save.appearance==='girl'?12:8,96,120)||el('canvas','art'));return preview;}
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
 const options={width:Math.ceil(width*2),height:Math.ceil(height*2),x:-left*2,y:-top*2,size:baseSize*2,facing,animate:true};
 const view=assets.hero?.createView({gender:save.appearance==='girl'?'female':'male',headId:save.headId,mount},options);
 const canvas=view?.node||el('canvas','pet-mount-canvas');
 canvas.className='pet-mount-canvas';canvas.style.width='100%';canvas.style.height='100%';canvas.style.display='block';
 canvas.setAttribute('aria-hidden','true');picture.append(canvas);view?.ready.catch(()=>{});
 preview.append(picture);
 return preview;
}
