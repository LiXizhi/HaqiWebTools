import {DIRECTIONS, validateCatalog, patchDirection} from './mount_core.js';
import {loadArt, drawMount} from './mount_renderer.js';

const $ = s => document.querySelector(s);
const names = ['朝前', '朝左', '朝右', '朝后'];
const state = {id:'dragon', direction:'down', mode:'mounted', gender:'male', x:.5, y:.7, target:null, keys:new Set()};
const previews = [], buttons = [];
let catalog, original, manifest, images;
const scene = $('#scene'), ctx = scene.getContext('2d');
const form = $('#calibration');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
$('#motion').checked = !reduced.matches;
const mount = () => catalog.mounts.find(m => m.id === state.id);
const mountCode = m => m.source?.items?.length ? String(m.source.items[0]) : m.id;
function artsFor(m, direction, mode, gender) {
  const arts = [];
  if (mode !== 'unmounted') arts.push(m.id);
  if (mode !== 'transformed') arts.push((gender === 'female' ? 'female-' : '') + (mode === 'unmounted' ? 'standing' : m.directions[direction].riderArt));
  return arts;
}
const canDraw = (m, direction = state.direction, mode = state.mode, gender = state.gender) => !!images && artsFor(m, direction, mode, gender).every(id => images.has(id));
function noteMissing(context, canvas) {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#6f7768';
  context.font = '13px "Microsoft YaHei", sans-serif';
  context.textAlign = 'center';
  context.fillText('图集未就绪', canvas.width / 2, canvas.height / 2);
}

function sync() {
  const source = mount().directions[state.direction];
  const p = {...source, ...source.characters?.[state.gender]};
  const values = {seatX:p.seat[0], seatY:p.seat[1], scale:p.scale, anchorX:p.anchor[0], anchorY:p.anchor[1]};
  for (const [key, value] of Object.entries(values)) form.elements[key].value = value;
  $('#mount-title').textContent = `${mount().name} · 四向对照`;
  $('#config').textContent = JSON.stringify({id:state.id, gender:state.gender, source:mount().source, direction:state.direction, ...p}, null, 2);
  for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.id === state.id));
  for (const button of document.querySelectorAll('[data-direction]')) button.setAttribute('aria-pressed', String(button.dataset.direction === state.direction));
}

function selectDirection(direction) { state.direction = direction; sync(); }

function artCard(id, label) {
  const figure = document.createElement('div'), img = document.createElement('img'), caption = document.createElement('p');
  img.src = images.get(id).src; img.alt = label + '四向原画图集';
  caption.textContent = `${label} · ${Math.round(manifest[id].bytes / 1000)} KB · WebP`;
  figure.append(img, caption); return figure;
}

function showAtlases() {
  const riderId = (state.gender==='female'?'female-':'')+mount().directions[state.direction].riderArt;
  $('#atlases').replaceChildren(...[images?.has(state.id) && artCard(state.id, mount().name), images?.has(riderId) && artCard(riderId, '角色')].filter(Boolean));
}

function options(time, moving = false) {
  return {mode:state.mode, gender:state.gender, time:$('#motion').checked ? time : 0, moving,
    debug:$('#debug').checked, occlusion:$('#occlusion').checked};
}

function pillar(x,y) {
  ctx.save();ctx.translate(x,y);
  ctx.fillStyle='#36594524';ctx.beginPath();ctx.ellipse(0,4,30,9,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#849783';ctx.fillRect(-16,-65,32,65);
  ctx.fillStyle='#aab7a0';ctx.fillRect(-23,-76,46,15);ctx.fillRect(-24,-8,48,10);
  ctx.fillStyle='#becbb1';ctx.beginPath();ctx.ellipse(0,-76,23,7,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#6d8574';ctx.fillRect(6,-60,5,45);ctx.restore();
}

let last = 0;
function render(ms) {
  const dt = Math.min((ms-last)/1000,.05);last=ms;
  const t = ms/1000;
  for (const {canvas, context, direction} of previews) {
    context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,canvas.width,canvas.height);
    if (!canDraw(mount(), direction)) { noteMissing(context, canvas); continue; }
    context.save();context.translate(180,350);
    drawMount(context,images,mount(),direction,{...options(t),size:290});
    context.restore();
  }
  const w = scene.clientWidth, h = scene.clientHeight, ratio = Math.min(devicePixelRatio || 1,2);
  if (scene.width !== Math.round(w*ratio) || scene.height !== Math.round(h*ratio)) {scene.width=Math.round(w*ratio);scene.height=Math.round(h*ratio);}
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
  const gradient=ctx.createLinearGradient(0,0,0,h);gradient.addColorStop(0,'#cedcbf');gradient.addColorStop(1,'#eaf0d7');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#9bae9340';ctx.lineWidth=1;
  for(let y=30;y<h;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  for(let x=-h;x<w;x+=65){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+h,h);ctx.stroke();}
  let dx=0,dy=0;
  if(state.keys.has('left'))dx--;if(state.keys.has('right'))dx++;
  if(state.keys.has('up'))dy--;if(state.keys.has('down'))dy++;
  if(!dx&&!dy&&state.target){dx=state.target.x*w-state.x*w;dy=state.target.y*h-state.y*h;if(Math.hypot(dx,dy)<4){state.target=null;dx=dy=0;}}
  const moving=dx!==0||dy!==0;
  if(moving){
    const direction = Math.abs(dx)>Math.abs(dy) ? dx>0?'right':'left' : dy>0?'down':'up';
    if(direction!==state.direction)selectDirection(direction);
    const distance=Math.hypot(dx,dy),step=Math.min(125*dt,state.target?distance:Infinity);
    state.x=Math.max(.1,Math.min(.9,state.x+dx/distance*step/w));
    state.y=Math.max(.40,Math.min(.94,state.y+dy/distance*step/h));
  }
  if(state.target){ctx.strokeStyle='#6b936d';ctx.beginPath();ctx.ellipse(state.target.x*w,state.target.y*h,13,5,0,0,Math.PI*2);ctx.stroke();}
  const objects=[{y:h*.62,draw:()=>pillar(w*.28,h*.62)},{y:h*.62,draw:()=>pillar(w*.73,h*.62)},
    {y:state.y*h,draw:()=>{if(!canDraw(mount()))return;ctx.save();ctx.translate(state.x*w,state.y*h);drawMount(ctx,images,mount(),state.direction,{...options(t,moving),size:Math.min(220,w*.47)});ctx.restore();}}];
  objects.sort((a,b)=>a.y-b.y).forEach(o=>o.draw());
  ctx.fillStyle='#546c51';ctx.font='12px "Microsoft YaHei", sans-serif';ctx.fillText(`${mount().name} / ${names[DIRECTIONS.indexOf(state.direction)]}`,16,24);
  requestAnimationFrame(render);
}

async function init(){
  const read=async path=>{const response=await fetch(new URL(path,import.meta.url));if(!response.ok)throw new Error(`配置加载失败：${path}`);return response.json();};
  [catalog,manifest]=await Promise.all([read('catalog.json'),read('assets.json')]);
  validateCatalog(catalog);original=structuredClone(catalog);
  state.id=catalog.mounts.find(m=>m.id==='original-16071')?.id || catalog.mounts[0].id;
  for(const m of catalog.mounts){
    const button=document.createElement('button'),name=document.createElement('span'),code=document.createElement('small');
    button.type='button';button.dataset.id=m.id;button.title=m.source?.model || m.description || m.name;
    name.textContent=m.name;code.textContent=mountCode(m);
    button.append(name,code);button.onclick=()=>{state.id=m.id;sync();showAtlases();};buttons.push(button);$('#mounts').append(button);
  }
  const local=new URLSearchParams(location.search).get('assets')==='local';
  const ready=Object.fromEntries(Object.entries(manifest).filter(([,asset])=>local?asset.local:asset.cdn));
  const skipped=Object.keys(manifest).length-Object.keys(ready).length;
  images=await loadArt(ready,{local});$('#source-badge').textContent=local?'本地 WebP':'Keepwork CDN';
  if(!canDraw(mount())){const fallback=catalog.mounts.find(m=>canDraw(m));if(fallback)state.id=fallback.id;}
  for(const button of buttons){
    const m=catalog.mounts.find(item=>item.id===button.dataset.id);
    if(!images.has(m.id))continue;
    const canvas=document.createElement('canvas');canvas.width=88;canvas.height=66;
    const c=canvas.getContext('2d');c.translate(44,62);drawMount(c,images,m,'left',{size:64,mode:'transformed',shadow:false});
    button.prepend(canvas);
  }
  $('#status').textContent=`已打开 catalog.json，列出 ${catalog.mounts.length} 种坐骑。${skipped?skipped+' 张图集没有 CDN，仍可从列表选择。':''}`;
  DIRECTIONS.forEach((direction,i)=>{
    const button=document.createElement('button');button.type='button';button.textContent=names[i];button.dataset.direction=direction;button.onclick=()=>selectDirection(direction);$('#directions').append(button);
    const card=document.createElement('button'),canvas=document.createElement('canvas'),label=document.createElement('span');
    canvas.width=360;canvas.height=420;label.textContent=names[i];card.type='button';card.className='view';card.dataset.direction=direction;card.setAttribute('aria-label',`选择${names[i]}并校准`);card.append(canvas,label);card.onclick=()=>selectDirection(direction);$('#views').append(card);
    previews.push({canvas,context:canvas.getContext('2d'),direction});
  });
  form.onsubmit=e=>e.preventDefault();
  form.oninput=()=>{
    if(!form.checkValidity())return;
    const n=name=>Number(form.elements[name].value);
    try{
      const p=mount().directions[state.direction];
      catalog=patchDirection(catalog,state.id,state.direction,{characters:{...p.characters,[state.gender]:{seat:[n('seatX'),n('seatY')],anchor:[n('anchorX'),n('anchorY')],scale:n('scale')}}});
      $('#config').textContent=JSON.stringify(mount().directions[state.direction],null,2);
    }
    catch(error){$('#status').textContent=error.message;}
  };
  $('#mode').onchange=e=>{state.mode=e.target.value;};
  $('#gender').onchange=e=>{state.gender=e.target.value;sync();showAtlases();};
  const filter=()=>{
    const term=$('#search').value.trim().toLowerCase(), collection=$('#collection').value;
    let count=0;
    for(const b of buttons){const m=catalog.mounts.find(m=>m.id===b.dataset.id);const original=!!m.source;
      const visible=(collection==='all'||(collection==='original')===original)&&(!term||[m.name,...(m.source?.aliases||[]),...(m.source?.items||[])].join(' ').toLowerCase().includes(term));
      b.hidden=!visible;if(visible)count++;
    }
    $('#count').textContent=`显示 ${count} / ${catalog.mounts.length} 种外观`;
  };
  $('#search').oninput=filter;$('#collection').onchange=filter;filter();
  $('#reset').onclick=()=>{catalog.mounts[catalog.mounts.findIndex(m=>m.id===state.id)]=structuredClone(original.mounts.find(m=>m.id===state.id));sync();$('#status').textContent='已重置当前坐骑的四个方向。';};
  $('#export').onclick=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(catalog,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='mount-catalog.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    $('#status').textContent='已导出全部坐骑和四向配置。';
  };
  $('#import').onchange=async e=>{
    try{
      const file=e.target.files[0];if(!file)return;if(file.size>1000000)throw new Error('配置文件不能超过 1 MB');
      const next=validateCatalog(JSON.parse(await file.text()));
      if(next.mounts.length!==original.mounts.length||next.mounts.some(m=>!original.mounts.some(o=>o.id===m.id)))throw new Error('配置必须包含本页已加载的全部坐骑');
      catalog=next;sync();showAtlases();$('#status').textContent='配置导入成功。';
    }catch(error){$('#status').textContent=`导入失败：${error.message}`;}finally{e.target.value='';}
  };
  $('#center').onclick=()=>{state.x=.5;state.y=.7;state.target=null;};
  const keyMap={ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',s:'down',a:'left',d:'right',w:'up'};
  scene.onkeydown=e=>{const direction=keyMap[e.key];if(!direction)return;e.preventDefault();state.target=null;state.keys.add(direction);selectDirection(direction);};
  window.addEventListener('keyup',e=>state.keys.delete(keyMap[e.key]));
  const stop=()=>{state.keys.clear();state.target=null;};window.addEventListener('blur',stop);scene.addEventListener('blur',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  scene.onpointerdown=e=>{const r=scene.getBoundingClientRect();scene.focus();state.target={x:Math.max(.1,Math.min(.9,(e.clientX-r.left)/r.width)),y:Math.max(.4,Math.min(.94,(e.clientY-r.top)/r.height))};};
  sync();showAtlases();$('#status').textContent=`已从 catalog.json 列出 ${catalog.mounts.length} 种坐骑。${skipped ? skipped + ' 张图集没有 CDN，仍可从列表选择。' : '点击四向卡片可单独校准。'}`;requestAnimationFrame(render);
}
init().catch(error=>{$('#status').textContent=`${error.message}。请通过 HTTP 服务打开页面并刷新重试。`;console.error(error);});
