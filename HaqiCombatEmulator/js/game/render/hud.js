// DOM overlays: status bar, quest tracker, hint, dialog box, toasts, modal. No game logic here.
import {esc} from '../../views/dom.js';
import {assetURL} from '../assets/cdn.js';
import {SCHOOL_NAMES} from '../../rules/formulas.js';
import {expToNext,playerMaxHP,itemCount} from '../progression.js';
import {CURRENCY,itemName,itemIcon} from '../data.js';
import {activeQuests,goalProgress} from '../quest/quests.js';
import {spriteImage,spriteMeta} from './sprites.js';
import {drawable} from '../assets/cdn.js';
const $=s=>document.querySelector(s);
export const schoolIconPath=school=>`texture/aries/common/themeteen/school_${school}_icon_32bits.png`;
export function iconImg(path,alt=''){const url=path?assetURL(path):null;return url?`<img src="${url}" alt="${esc(alt)}" loading="lazy">`:`<span class="icon"></span>`;}
export function renderStatus(profile,data) {
  $('#status-name').textContent=profile.name;$('#status-level').textContent=`Lv ${profile.level} · ${SCHOOL_NAMES[profile.school]}`;
  const icon=assetURL(schoolIconPath(profile.school));const img=$('#status-school');if(icon&&img.src!==icon)img.src=icon;
  const hp=playerMaxHP(profile);$('#status-hp').style.width='100%';$('#status-hp-text').textContent=`HP ${hp}`;
  const need=expToNext(profile.level);$('#status-exp').style.width=`${need===Infinity?100:Math.min(100,profile.exp/need*100)}%`;$('#status-exp-text').textContent=need===Infinity?'满级':`EXP ${profile.exp} / ${need}`;
  $('#status-money').innerHTML=[CURRENCY.coin,CURRENCY.godBean,CURRENCY.magicBean].filter(g=>g===CURRENCY.coin||itemCount(profile,g)>0).map(g=>`<span title="${esc(itemName(data,g))}">${iconImg(itemIcon(data,g))}${itemCount(profile,g).toLocaleString()} ${esc(itemName(data,g))}</span>`).join('');
}
export function renderTracker(profile,data,outlook=[]) {
  const quests=activeQuests(profile,data);
  if(quests.length){$('#tracker').innerHTML=`<h3>任务追踪 (${quests.length})</h3>`+quests.slice(0,6).map(q=>`<div class="quest"><strong>${esc(q.title)}</strong>${goalProgress(profile,q,data).map(g=>`<div class="goal ${g.have>=g.need?'done':''}"><span>${esc(g.label)}</span><span>${g.have}/${g.need}</span></div>`).join('')}</div>`).join('');return;}
  // Nothing active: say where quests open next so a fresh Lv 1 character in a Lv 30+ town knows what to do.
  const here=outlook.find(o=>o.world===profile.world),elsewhere=outlook.filter(o=>o.world!==profile.world&&(o.available>0||o.nextLevel));
  const lines=[];
  if(here?.available)lines.push(`这里有 ${here.available} 个可接任务，找带 ! 标记的 NPC。`);
  else if(here?.nextLevel)lines.push(`${esc(here.title)}的任务从 Lv ${here.nextLevel} 开始，先打怪练级。`);
  for(const o of elsewhere)lines.push(o.available?`${esc(o.title)}有 ${o.available} 个可接任务${o.minLevel>profile.level?`（乘船需 Lv ${o.minLevel}）`:''}，找船长乘船前往。`:`${esc(o.title)}的任务从 Lv ${o.nextLevel} 开始${o.minLevel>profile.level?`（乘船需 Lv ${o.minLevel}）`:''}。`);
  if(!lines.length)lines.push('与带有 ! 标记的 NPC 交谈接取任务');
  $('#tracker').innerHTML=`<h3>任务追踪</h3>${lines.map(l=>`<div class="muted">${l}</div>`).join('')}`;
}
export function setHint(text){const el=$('#hint');if(text){el.textContent=text;el.hidden=false;}else el.hidden=true;}
export function toast(text){const el=document.createElement('div');el.className='toast';el.textContent=text;$('#toasts').append(el);setTimeout(()=>el.remove(),3600);}
export function notice(message,error=false){const el=$('#notice');el.textContent=message;el.className=error?'notice error':'notice';el.hidden=false;clearTimeout(el._timer);el._timer=setTimeout(()=>{el.hidden=true;},5000);}
export function drawPortrait(canvas,{sprite=null,cdnPath=null}) {
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;
  const cdn=cdnPath?drawable(cdnPath):null;
  if(cdn){ctx.drawImage(cdn,0,0,canvas.width,canvas.height);return true;}
  const img=sprite?spriteImage(sprite):null,meta=sprite?spriteMeta(sprite):null;
  if(!img||!meta){ctx.fillStyle='#1e2a36';ctx.fillRect(0,0,canvas.width,canvas.height);return false;}
  ctx.fillStyle='#1e2a36';ctx.fillRect(0,0,canvas.width,canvas.height);
  const scale=Math.floor(Math.min(canvas.width/meta.frameWidth,canvas.height/meta.frameHeight));
  const w=meta.frameWidth*scale,h=meta.frameHeight*scale;
  ctx.drawImage(img,0,0,meta.frameWidth,meta.frameHeight,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
  return true;
}
export function showDialog({name,text,buttons,portrait},onChoose) {
  const box=$('#dialog');box.hidden=false;$('#dialog-name').textContent=name;$('#dialog-text').textContent=text;
  drawPortrait($('#dialog-portrait'),portrait??{});
  if(portrait?.cdnPath&&!drawable(portrait.cdnPath))setTimeout(()=>{if(!box.hidden)drawPortrait($('#dialog-portrait'),portrait);},600);
  const wrap=$('#dialog-buttons');wrap.innerHTML=buttons.map((b,i)=>`<button data-index="${i}" class="${esc(b.action??'')}">${esc(b.label)}</button>`).join('');
  wrap.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>onChoose(Number(btn.dataset.index))));
  wrap.querySelector('button')?.focus({preventScroll:true});
}
export function hideDialog(){$('#dialog').hidden=true;}
export function openModal(title,html){$('#modal-title').textContent=title;$('#modal-body').innerHTML=html;$('#modal').hidden=false;}
export function closeModal(){$('#modal').hidden=true;$('#modal-body').innerHTML='';}
export const modalOpen=()=>!$('#modal').hidden;
