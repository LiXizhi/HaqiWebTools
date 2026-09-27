import { HeroRenderer } from './hero_renderer.js?v=head-turn-drop-v1';
import { BODY_TO_HEAD, clampHead } from './hero_pose_core.js';

const $=id=>document.getElementById(id),local=new URLSearchParams(location.search).get('assets')==='local';
const status=$('status'),keys=new Set(),reduced=matchMedia('(prefers-reduced-motion: reduce)');
const state={x:0,y:0,actor:null,frontActor:null,appearance:null,ready:false,time:0,head:0,moving:false,pointer:null};
let renderer,revision=0,last=0,lastOptions;
let bodyVariants={};
function selectBodyRenderer(gender,mode){$('body-style').disabled=mode!=='walk';return renderer;}
const names=['前','左偏前','左前','左前偏侧','左','左后偏侧','左后','左偏后','后','右偏后','右后','右后偏侧','右','右前偏侧','右前','右偏前'];
for(let i=0;i<16;i++){const option=document.createElement('option');option.value=String(i);option.textContent=`${names[i]} · ${i*22.5}°`;$('head').append(option);}

function canvasSize(canvas){const d=Math.min(devicePixelRatio||1,2),w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==Math.round(w*d)||canvas.height!==Math.round(h*d)){canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);}const ctx=canvas.getContext('2d');ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);return {ctx,w,h};}
function reset(){state.x=state.y=0;state.pointer=null;keys.clear();if(renderer){state.frontActor=renderer.createActor();state.actor=renderer.createActor();state.actor.facing=Number($('facing').value);state.actor.head=BODY_TO_HEAD[state.actor.facing];}}
function ground(ctx,w,h,zoom){
 const gradient=ctx.createLinearGradient(0,0,0,h);gradient.addColorStop(0,'#192c24');gradient.addColorStop(1,'#304735');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
 ctx.save();ctx.translate(w/2,h*.78);ctx.scale(zoom,zoom);ctx.strokeStyle='#819a6830';ctx.lineWidth=.5;
 for(let y=-160;y<90;y+=24){ctx.beginPath();ctx.moveTo(-500,y);ctx.lineTo(500,y);ctx.stroke();}for(let x=-480;x<500;x+=24){ctx.beginPath();ctx.moveTo(x,-200);ctx.lineTo(x,100);ctx.stroke();}
 if($('npc').checked){ctx.fillStyle='#83986b';ctx.beginPath();ctx.arc(65,-35,5,0,Math.PI*2);ctx.fill();ctx.font='7px sans-serif';ctx.textAlign='center';ctx.fillStyle='#d9dfa5';ctx.fillText('测试 NPC',65,-45);ctx.setLineDash([3,3]);ctx.beginPath();ctx.arc(65,-35,90,0,Math.PI*2);ctx.stroke();}
 ctx.restore();
}
async function select(){
 const rev=++revision;state.ready=false;status.textContent='正在准备当前外观…';
 const gender=$('gender').value,mode=$('mode').value,mount=mode==='mounted'?renderer.catalog.mounts.find(m=>m.id===$('mount').value):null;
 renderer=selectBodyRenderer(gender,mode);
 $('mount').disabled=mode!=='mounted';state.appearance={gender,mount,bodyId:$('body-style').value,headId:$('head-style').value|| (gender==='female'?'elf-girl':'elf-boy')};reset();
 try{
  const result=await renderer.prepare({...state.appearance,standing:mode==='standing'});if(rev!==revision)return;
  state.ready=true;status.textContent=result.fallback?'角色资源加载失败：'+result.errors.join('；'):`${local?'本地':'Keepwork CDN'}资源已就绪 · 使用合并身体图集`;
  status.textContent+=` · 头颈校准 ${renderer.manifest.headCalibration||'未标记'}`;
  const variant=mode==='walk'?bodyVariants[$('body-style').value]:null;
  if(variant)status.textContent+=` · 试装：${variant.name}`;
  if(variant?.id?.endsWith('-ref'))status.textContent+=' · 独立动作参考';
  const body=variant||renderer.manifest.bodies[gender+'-walk'];
  $('body-atlas').src=local?`${body.local}?v=${body.sha256}`:body.cdn;
  $('body-atlas-label').textContent=variant?variant.name+' · 复用原连接点':'原配色';
  const art=renderer.manifest.heads[state.appearance.headId];
  $('atlas').src=local?art.local:art.cdn;$('asset-info').textContent=`${art.name} · ${(art.bytes/1000).toFixed(1)} KB · 16 个方向 · 步行与骑乘共用`;
 }catch(error){if(rev===revision)status.textContent=error.message;}
}
function tick(now){
 const dt=last?Math.min((now-last)/1000,.05):0;last=now;
 if(state.ready&&!document.hidden){
  state.time+=dt;const speed=70;let dx=0,dy=0;
  if(keys.has('a')||keys.has('arrowleft'))dx--;if(keys.has('d')||keys.has('arrowright'))dx++;if(keys.has('w')||keys.has('arrowup'))dy--;if(keys.has('s')||keys.has('arrowdown'))dy++;
  if(state.pointer){const p=state.pointer;dx=(p.x-p.startX)/40;dy=(p.y-p.startY)/40;if(Math.hypot(dx,dy)<.15)dx=dy=0;}
  const norm=Math.max(1,Math.hypot(dx,dy)),prev={x:state.x,y:state.y};state.x=Math.max(-75,Math.min(75,state.x+dx/norm*speed*dt));state.y=Math.max(-25,Math.min(20,state.y+dy/norm*speed*dt));
  const animation=$('motion').checked&&!reduced.matches;
  const loop=$('walk-loop').checked&&$('mode').value==='walk'&&animation;
  const loopFacing=Number($('facing').value),vector=[[0,1],[-1,0],[1,0],[0,-1]][loopFacing];
  const pose=renderer.updateActor(state.actor,{dx:loop?vector[0]*speed*dt:state.x-prev.x,dy:loop?vector[1]*speed*dt:state.y-prev.y,x:state.x,y:state.y,time:state.time,npcs:$('npc').checked?[{id:'preview-npc',x:65,y:-35}]:[],reducedMotion:!animation});
  if(pose.moving)$('facing').value=String(pose.facing);
  const facing=Number($('facing').value),control=$('control').value;
  const frontPose=renderer.updateActor(state.frontActor,{time:state.time,reducedMotion:!animation});
  const frontHead=control==='auto'?frontPose.head:control==='inspect'?Number($('head').value):clampHead(Number($('head').value),0);
  state.head=control==='auto'?pose.head:control==='inspect'?Number($('head').value):clampHead(Number($('head').value),facing);
  $('head').disabled=control==='auto';if(control==='auto')$('head').value=String(state.head);
  const cycle=renderer.manifest.bodies[state.appearance.gender+'-walk'].walk;
  const frame=pose.moving&&animation?Math.floor(pose.walkTime*cycle.fps)%cycle.framesPerDirection:null;
  $('pose-label').textContent=`头朝${names[state.head]}${pose.targetId?' · 注视 NPC':''}${frame===null?' · 静止':` · 行走 ${frame+1}/${cycle.framesPerDirection}`}`;
  const options={facing,head:state.head,size:78,time:animation?state.time:0,moving:pose.moving&&animation,standing:$('mode').value==='standing',debug:$('debug').checked,bodyOnly:$('body-only').checked,breath:pose.breath,reducedMotion:!animation};lastOptions=options;
  options.walkTime=pose.walkTime;
  for(const id of ['front','after']){
   const fixed=id==='front',x=fixed?0:state.x,y=fixed?0:state.y;
   const drawOptions=fixed?{...options,facing:0,head:frontHead,moving:false,walkTime:0,breath:frontPose.breath}:options;
   const {ctx,w,h}=canvasSize($(id)),zoom=Number($('zoom').value)*(w<380?.82:1);ground(ctx,w,h,zoom);
   ctx.save();ctx.translate(w/2,h*.78);ctx.scale(zoom,zoom);ctx.fillStyle='#06150c55';ctx.beginPath();ctx.ellipse(x,y+2,23,7,0,0,Math.PI*2);ctx.fill();
   renderer.draw(ctx,state.appearance,{...drawOptions,x,y});ctx.restore();
  }
 }
 requestAnimationFrame(tick);
}
for(const id of ['mode','mount','body-style'])$(id).addEventListener('change',()=>select());
$('facing').addEventListener('change',()=>{if(state.actor){state.actor.facing=Number($('facing').value);state.actor.head=BODY_TO_HEAD[state.actor.facing];state.actor.stoppedAt=state.time;}});
$('reset').addEventListener('click',reset);
const canvas=$('after');canvas.addEventListener('pointerdown',e=>{canvas.focus();canvas.setPointerCapture(e.pointerId);state.pointer={id:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY};});
canvas.addEventListener('pointermove',e=>{if(state.pointer?.id===e.pointerId){state.pointer.x=e.clientX;state.pointer.y=e.clientY;}});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>state.pointer=null);
window.addEventListener('keydown',e=>{if(e.target.matches('input,select,button'))return;const key=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){e.preventDefault();keys.add(key);}});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();state.pointer=null;});
document.addEventListener('visibilitychange',()=>{last=0;if(!document.hidden)reset();else{keys.clear();state.pointer=null;}});
try{
 // This art calibration page must see current metadata even through a caching preview proxy.
 const refresh=Date.now();
 const get=async url=>{const response=await fetch(`${url}?preview=${refresh}`,{cache:'no-store'});if(!response.ok)throw new Error(`清单加载失败：${url}`);return response.json();};
 const [manifest,catalog]=await Promise.all([get('data/hero-preview.json'),get('data/adventure/mount-catalog.json')]);
 bodyVariants=manifest.bodyVariants||{};
 renderer=new HeroRenderer(manifest,catalog,{local});
 function bodyStyles(){const gender=$('gender').value;$('body-style').replaceChildren();for(const variant of [{id:gender,name:'经典蓝金'},...Object.values(bodyVariants).filter(v=>v.gender===gender)]){const o=document.createElement('option');o.value=variant.id;o.textContent=variant.name;$('body-style').append(o);}}
 const selected=new URLSearchParams(location.search).get('body')||'male2';if(selected.startsWith('female'))$('gender').value='female';bodyStyles();$('body-style').value=bodyVariants[selected]?selected:$('gender').value;
 function styles(){const select=$('head-style');select.replaceChildren();for(const [id,h] of Object.entries(manifest.heads).filter(([,h])=>h.gender===$('gender').value)){const o=document.createElement('option');o.value=id;o.textContent=h.name;select.append(o);}}
 styles();$('gender').onchange=()=>{styles();bodyStyles();select();};$('head-style').onchange=select;
 for(const mount of catalog.mounts.filter(m=>m.rideable)){const option=document.createElement('option');option.value=mount.id;option.textContent=mount.name;$('mount').append(option);}
 $('asset-mode').href=local?'?':'?assets=local';$('asset-mode').textContent=local?'切换 CDN 资源模式':'切换本地资源模式';
 $('motion').checked=!reduced.matches;await select();requestAnimationFrame(tick);
 // Read-only diagnostics for the preview acceptance harness, never a game hook.
 window.heroPreview={get renderer(){return renderer;},get appearance(){return state.appearance;},get options(){return lastOptions;}};
}catch(error){status.textContent=error.message;}
