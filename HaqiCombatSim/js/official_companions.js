import {createRng,hashSeed} from './rng_core.js';
import {resolveMountDrawPose} from './adventure_mounts_core.js';

// Website-only showcase. Never reads or changes character saves.
export function createCompanionShowcase(catalog,{local=false,seed=1}={}) {
 const $=id=>document.getElementById(id),rng=createRng(hashSeed(seed)),images=new Map();
 const el=(tag,cls,...children)=>{const n=document.createElement(tag);n.className=cls||'';n.append(...children);return n;};
 let lang='zh-CN',mount=catalog.mounts.find(m=>m.id==='original-16059')||catalog.mounts[0],chosen=rng.shuffle([...catalog.pets]).slice(0,3);
 const text=(zh,en)=>lang==='en'?en:zh,name=row=>lang==='en'?row.nameEn:row.name;
 function load(sheet){const url=local?sheet.local:sheet.cdn;if(!images.has(url))images.set(url,new Promise((resolve,reject)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>resolve(i);i.onerror=()=>{images.delete(url);reject(new Error('art'));};i.src=url;}));return images.get(url);}
 async function mountPortrait(canvas,entry){
  try{
   const pose=resolveMountDrawPose(entry,2,{size:400,gender:'male'}),sheet=catalog.sheets[pose.rider.art];
   const [mountImage,riderImage]=await Promise.all([load(entry.art),load(sheet)]);
   // Include both complete sprite rectangles: tall riders can extend above the mount.
   const rects=[pose.mount,pose.rider],padding=8;
   const originX=Math.floor(Math.min(...rects.map(r=>r.x)))-padding,originY=Math.floor(Math.min(...rects.map(r=>r.y)))-padding;
   const buffer=document.createElement('canvas');
   buffer.width=Math.ceil(Math.max(...rects.map(r=>r.x+r.w)))-originX+padding;
   buffer.height=Math.ceil(Math.max(...rects.map(r=>r.y+r.h)))-originY+padding;
   const c=buffer.getContext('2d',{willReadFrequently:true});c.translate(-originX,-originY);
   function layer(image,art,rect){const cols=art.columns||2,rows=art.rows||2,w=image.width/cols,h=image.height/rows;c.drawImage(image,(rect.cell%cols)*w,Math.floor(rect.cell/cols)*h,w,h,rect.x,rect.y,rect.w,rect.h);}
   layer(mountImage,entry.art,pose.mount);layer(riderImage,sheet,pose.rider);
   for(const polygon of pose.foreground){c.save();c.beginPath();polygon.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](pose.mount.x+x*pose.mount.w,pose.mount.y+y*pose.mount.h));c.closePath();c.clip();layer(mountImage,entry.art,pose.mount);c.restore();}
   // Remove transparent margins only. Keep the scene scale instead of fitting wide mounts into a square.
   const pixels=c.getImageData(0,0,buffer.width,buffer.height).data;let left=buffer.width,top=buffer.height,right=0,bottom=0;
   for(let y=0;y<buffer.height;y++)for(let x=0;x<buffer.width;x++)if(pixels[(y*buffer.width+x)*4+3]>20){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
   if(right<=left||bottom<=top)throw new Error('empty');
   const w=right-left+1,h=bottom-top+1;
   canvas.width=w;canvas.height=h;
   canvas.style.width=`calc(var(--rider-size) * ${w/400})`;canvas.style.height=`calc(var(--rider-size) * ${h/400})`;
   canvas.getContext('2d').drawImage(buffer,left,top,w,h,0,0,w,h);
  }catch{canvas.replaceWith(el('span','companion-art-error',text('图片暂不可用，点击换一位','Artwork unavailable. Select to try another.')));}
 }
 function render(focusSlot){
  const slots=[];
  const hero=el('button','companion-stand hero-stand'),canvas=el('canvas','mount-portrait');canvas.width=canvas.height=480;canvas.setAttribute('aria-hidden','true');
  hero.type='button';hero.dataset.companionId=mount.id;hero.setAttribute('aria-label',text('换一款坐骑：','Change mount: ')+name(mount));
  hero.append(el('span','companion-art mount-artwork',canvas),el('strong','',name(mount)),el('small','',text('点击换坐骑 ↻','Change mount ↻')+(mount.rideable?'':text(' · 展示样式',' · Display style'))));
  const currentMount=mount;mountPortrait(canvas,currentMount);hero.onclick=()=>{mount=rng.pick(catalog.mounts.filter(m=>m!==mount));render(0);};slots.push(hero);
  chosen.forEach((pet,index)=>{const b=el('button','companion-stand pet-stand'),picture=el('span','companion-art pet-artwork');
   picture.style.backgroundImage=`url("${local?pet.art.local:pet.art.cdn}")`;picture.style.backgroundSize=`${(pet.art.cols||4)*100}% ${(pet.art.rows||4)*100}%`;picture.setAttribute('aria-hidden','true');
   b.type='button';b.dataset.companionId=pet.id;b.setAttribute('aria-label',text('换一位伙伴：','Change companion: ')+name(pet));
   b.append(picture,el('strong','',name(pet)),el('small','',text('点击换伙伴 ↻','Change companion ↻')));b.onclick=()=>{chosen[index]=rng.pick(catalog.pets.filter(p=>!chosen.includes(p)));render(index+1);};slots.push(b);
  });
  $('companion-formation').replaceChildren(...slots);if(Number.isInteger(focusSlot))slots[focusSlot].focus({preventScroll:true});
 }
 function setLanguage(value){lang=value;const all=catalog.mounts.length;
  $('companion-counts').replaceChildren(el('span','',el('b','',String(all)),text(' 款坐骑',' mounts')),el('span','',el('b','',String(catalog.pets.length)),text(' 种战宠',' battle pets')));render();}
 $('shuffle-companions').onclick=()=>{mount=rng.pick(catalog.mounts.filter(m=>m!==mount));chosen=rng.shuffle(catalog.pets.filter(p=>!chosen.includes(p))).slice(0,3);render();};
 setLanguage(lang);return {setLanguage};
}
