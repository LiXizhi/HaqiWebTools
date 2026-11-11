import {battleSceneFor,battleArtMode,battleDiskRect} from './battle_scenery_core.js';
import {assetUrl} from './adventure_media_core.js';
import {projectBattlePoint} from './battle_camera_core.js';

export function createBattleScenery({hostname=globalThis.location?.hostname||'',search=globalThis.location?.search||''}={}){
 const mode=battleArtMode(hostname,search),loaded=new Map(),battles=new WeakMap();let manifest;
 const read=()=>manifest||=(async()=>{
  const res=await fetch(new URL('../data/adventure/battle-scenery.json',import.meta.url));
  if(!res.ok)throw Error('战斗美术清单加载失败');
  const data=await res.json();if(data.version!==1)throw Error('战斗美术版本无效');return data;
 })();
 function imageFor(id){
  if(loaded.has(id))return loaded.get(id).image;
  const entry={image:null};loaded.set(id,entry);
  void read().then(data=>{
   const row=data.assets[id];if(!row||mode==='cdn'&&!row.cdn)return;
   const image=new Image();image.crossOrigin='anonymous';
   image.onload=()=>{entry.image=image;};image.onerror=()=>console.warn('战斗美术暂不可用：'+id);
   image.src=new URL(assetUrl(row,mode),new URL('../',import.meta.url)).href;
  }).catch(error=>{console.warn(error.message);});
  return null;
 }
 return {get(battle,save,content){
  if(typeof Image==='undefined')return null;
  if(!battles.has(battle))battles.set(battle,battleSceneFor(save,content));
  const scene=battles.get(battle),background=imageFor(scene.id),disk=imageFor(scene.disk);
  return background&&disk?{...scene,background,disk}:null;
 }};
}
export function drawBattleBackground(c,image,w,h){
 const k=Math.max(w/image.width,h/image.height),dw=image.width*k,dh=image.height*k;
 c.drawImage(image,(w-dw)/2,(h-dh)/2,dw,dh);
}
export function drawBattleDisk(c,image,camera,{cx,cy,r}){
 const rect=battleDiskRect(cx,cy,r);
 if(!camera.active){c.drawImage(image,rect.x,rect.y,rect.w,rect.h);return;}
 // Project the same texture with the existing cinematic ground camera. Keeping
 // the old flat disk during a spell would visibly switch the art mid-battle.
 const nx=16,ny=10,point=(u,v)=>projectBattlePoint(camera,{x:rect.x+u*rect.w,y:rect.y+v*rect.h});
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
  const u=x/nx,v=y/ny,U=(x+1)/nx,V=(y+1)/ny;
  const a=point(u,v),b=point(U,v),d=point(u,V),e=point(U,V);
  triangle(c,image,[[u,v],[U,v],[U,V]],[a,b,e]);
  triangle(c,image,[[u,v],[U,V],[u,V]],[a,e,d]);
 }
}
function triangle(c,image,uv,p){
 if(p.some(v=>v.visible===false||!Number.isFinite(v.x)||!Number.isFinite(v.y)))return;
 const [[u,v],[U,V],[s,t]]=uv,[a,b,d]=p;
 const det=(U-u)*(t-v)-(s-u)*(V-v);if(Math.abs(det)<1e-9)return;
 const xx=((b.x-a.x)*(t-v)-(d.x-a.x)*(V-v))/det;
 const xy=((d.x-a.x)*(U-u)-(b.x-a.x)*(s-u))/det;
 const yx=((b.y-a.y)*(t-v)-(d.y-a.y)*(V-v))/det;
 const yy=((d.y-a.y)*(U-u)-(b.y-a.y)*(s-u))/det;
 // Adjacent antialiased clips leave hairline cracks. Expand only the clip by
 // a subpixel margin; keep texture coordinates/projected vertices unchanged.
 const center={x:(a.x+b.x+d.x)/3,y:(a.y+b.y+d.y)/3};
 const edge=[a,b,d].map(v=>{const dx=v.x-center.x,dy=v.y-center.y,k=.65/Math.max(1,Math.hypot(dx,dy));return{x:v.x+dx*k,y:v.y+dy*k};});
 c.save();c.beginPath();c.moveTo(edge[0].x,edge[0].y);c.lineTo(edge[1].x,edge[1].y);c.lineTo(edge[2].x,edge[2].y);c.closePath();c.clip();
 c.transform(xx,yx,xy,yy,a.x-xx*u-xy*v,a.y-yx*u-yy*v);c.drawImage(image,0,0,1,1);c.restore();
}
