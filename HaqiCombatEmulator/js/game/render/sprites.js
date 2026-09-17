// Loads the generated sheets under assets/sprites and draws frames with nearest-neighbour scaling.
let manifest=null;const images=new Map();
export async function loadSprites(base=new URL('../../../assets/sprites/',import.meta.url)) {
  if(manifest)return manifest;
  const response=await fetch(new URL('manifest.json',base));
  if(!response.ok)throw new Error('精灵表清单加载失败');
  manifest=await response.json();
  await Promise.all(Object.entries(manifest.sprites).map(([name,s])=>new Promise(resolve=>{const img=new Image();img.onload=()=>{images.set(name,img);resolve();};img.onerror=()=>{console.warn('sprite missing',name);resolve();};img.src=new URL(s.file,base);})));
  return manifest;
}
export function spriteNames(){return new Set(Object.keys(manifest?.sprites??{}));}
export function spriteSize(name){const s=manifest?.sprites[name];return s?[s.frameWidth,s.frameHeight]:[24,32];}
export function drawSprite(ctx,name,dir,frame,x,y,{scale=2,alpha=1,flash=false}={}) {
  const s=manifest?.sprites[name],img=images.get(name);
  if(!s||!img){ctx.fillStyle='#c0392b';ctx.fillRect(Math.round(x-8),Math.round(y-24),16,24);return;}
  const row=s.rows[dir]??0,col=s.frames>1?Math.floor(frame)%s.frames:0;
  const w=s.frameWidth*scale,h=s.frameHeight*scale;
  const dx=Math.round(x-s.anchor[0]*scale),dy=Math.round(y-s.anchor[1]*scale);
  ctx.save();ctx.globalAlpha=alpha;ctx.imageSmoothingEnabled=false;
  ctx.drawImage(img,col*s.frameWidth,row*s.frameHeight,s.frameWidth,s.frameHeight,dx,dy,w,h);
  if(flash){ctx.globalCompositeOperation='source-atop';ctx.fillStyle='#ffffffb0';ctx.fillRect(dx,dy,w,h);}
  ctx.restore();
  return {x:dx,y:dy,w,h};
}
export function spriteImage(name){return images.get(name)??null;}
export function spriteMeta(name){return manifest?.sprites[name]??null;}
