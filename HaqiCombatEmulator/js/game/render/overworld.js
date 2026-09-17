import {drawSprite} from './sprites.js';
import {drawable} from '../assets/cdn.js';
import {SCHOOL_COLORS,SCHOOL_NAMES} from '../../rules/formulas.js';
const LABEL_RANGE=120,MAX_LABELS=5;
const MARK={available:'texture/aries/headon/exclamation.png',completable:'texture/aries/headon/question.png',progress:'texture/aries/headon/question_grey.png',portal:'texture/aries/headon/portal_32bits.png'};
function label(ctx,text,x,y,color='#fff',size=11) {
  ctx.font=`${size}px "PingFang SC","Microsoft YaHei",system-ui,sans-serif`;ctx.textAlign='center';ctx.textBaseline='bottom';
  const w=ctx.measureText(text).width+8;ctx.fillStyle='#0a0f14aa';ctx.fillRect(Math.round(x-w/2),Math.round(y-size-3),Math.round(w),size+4);
  ctx.fillStyle=color;ctx.fillText(text,Math.round(x),Math.round(y));
}
export function drawOverworld(ctx,{camera,worldMap,mapImage,entities,markers,hover,time,debugMask=null}) {
  const {width,height}=camera;
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.fillStyle='#18324a';ctx.fillRect(0,0,width,height);
  ctx.scale(camera.zoom,camera.zoom);ctx.translate(-Math.round(camera.x),-Math.round(camera.y));
  if(mapImage)ctx.drawImage(mapImage,0,0,worldMap.imageWidth,worldMap.imageHeight,0,0,worldMap.width,worldMap.height);
  else{ctx.fillStyle='#3d7a3a';ctx.fillRect(0,0,worldMap.width,worldMap.height);}
  if(debugMask){ctx.globalAlpha=.35;ctx.drawImage(debugMask,0,0,worldMap.width,worldMap.height);ctx.globalAlpha=1;}
  const list=entities.all().filter(e=>camera.visible(e.x,e.y,80)).sort((a,b)=>a.y-b.y);
  // Only the closest few NPCs get name labels; quest markers and hover always do. Keeps dense towns readable.
  const dist=e=>Math.hypot(e.x-entities.player.x,e.y-entities.player.y);
  const labelled=new Set(list.filter(e=>e.type==='npc'&&e.data.hasDialog&&dist(e)<LABEL_RANGE).sort((a,b)=>dist(a)-dist(b)).slice(0,MAX_LABELS));
  for(const e of list) {
    // shadow
    ctx.fillStyle='#00000040';ctx.beginPath();ctx.ellipse(e.x,e.y+1,e.type==='mob'?9:7,3,0,0,Math.PI*2);ctx.fill();
    if(e.type==='portal'){const img=drawable(MARK.portal);ctx.save();ctx.translate(e.x,e.y-14);ctx.rotate(time*1.5);ctx.strokeStyle='#8ff';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,12,12,0,0,Math.PI*2);ctx.stroke();ctx.restore();if(img)ctx.drawImage(img,e.x-12,e.y-40,24,24);label(ctx,e.name,e.x,e.y-42,'#bff');continue;}
    const frame=e.type==='player'?e.frame:e.type==='mob'?e.frame:0;
    const scale=e.type==='mob'?Math.min(2.6,1.7+e.mob.scale*.3):2;
    drawSprite(ctx,e.sprite,e.dir,frame,e.x,e.y,{scale,flash:hover===e&&Math.floor(time*6)%2===0});
    const mark=e.type==='npc'?markers?.get(e.id):null;
    const near=dist(e)<LABEL_RANGE||hover===e||mark;
    if(e.type==='npc'){const name=e.title?`${e.name} ${e.title}`:e.name;if(name&&(labelled.has(e)||hover===e||mark))label(ctx,name,e.x,e.y-(e.data.kind==='object'?34:66),e.data.hasDialog?'#fff':'#c9d3da');
      if(mark){const img=drawable(MARK[mark]);const bob=Math.sin(time*4)*2;if(img)ctx.drawImage(img,e.x-10,e.y-96+bob,20,26);else{ctx.fillStyle=mark==='available'?'#ffd84a':mark==='completable'?'#8dff8a':'#c8c8c8';ctx.font='bold 18px system-ui';ctx.textAlign='center';ctx.fillText(mark==='available'?'!':'?',e.x,e.y-80+bob);}}}
    if(e.type==='mob'&&near){label(ctx,`Lv${e.level} ${e.name}`,e.x,e.y-70,SCHOOL_COLORS[e.school]??'#fff');}
    if(e.type==='player')label(ctx,e.name,e.x,e.y-68,'#ffe9a8');
  }
  ctx.restore();
}
export function drawMinimap(ctx,{mapImage,worldMap,entities,box}) {
  const {x,y,w,h}=box;ctx.save();ctx.imageSmoothingEnabled=false;ctx.fillStyle='#0a0f14cc';ctx.fillRect(x-2,y-2,w+4,h+4);
  if(mapImage)ctx.drawImage(mapImage,0,0,worldMap.imageWidth,worldMap.imageHeight,x,y,w,h);
  const k=w/worldMap.width;
  for(const m of entities.mobs)if(m.alive){ctx.fillStyle='#ff7a5a';ctx.fillRect(x+m.x*k-1,y+m.y*k-1,2,2);}
  for(const n of entities.npcs)if(n.data.hasDialog){ctx.fillStyle='#ffe066';ctx.fillRect(x+n.x*k-1,y+n.y*k-1,2,2);}
  ctx.fillStyle='#4af';ctx.fillRect(x+entities.player.x*k-2,y+entities.player.y*k-2,4,4);ctx.restore();
}
export {SCHOOL_NAMES};
