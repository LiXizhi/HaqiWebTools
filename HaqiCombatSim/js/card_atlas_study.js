import {assetMode,assetUrl} from './adventure_media_core.js';
import {loadSkillArt} from './skill_art.js';
import {createSpellEffects} from './spell_effects.js';
import {skillFrame} from './skill_art_core.js';
const $=id=>document.getElementById(id),mode=assetMode(location.hostname,location.search);
const names={ice:'寒冰',fire:'烈火',storm:'风暴',life:'生命',death:'死亡',balance:'通用'};
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let effects,cards,art,fx,representatives=[],selected,progress=.35,playing=false,last=0,frame=0,page=0,revision=0,selectionRevision=0;
const ctx=$('atlas-effect').getContext('2d');
async function read(url){const r=await fetch(url);if(!r.ok)throw new Error('卡库加载失败');return r.json();}
function drawEffect(){
 if(!selected)return;
 const c=selected.card,base=selected.base,spec=effects.bases[base];
 ctx.clearRect(0,0,1000,440);ctx.fillStyle='#122d3c';ctx.fillRect(0,0,1000,440);
 ctx.strokeStyle='#729da088';ctx.lineWidth=2;
 for(const x of [180,800]){ctx.beginPath();ctx.ellipse(x,326,70,22,0,0,Math.PI*2);ctx.stroke();}
 ctx.font='18px sans-serif';ctx.fillStyle='#bddbd8';ctx.textAlign='center';ctx.fillText('施法位置',180,400);ctx.fillText('目标位置',800,400);
 const from={x:180,y:300},to=spec.friendly?from:{x:800,y:300};
 const targets=spec.area?[{x:690,y:230},to,{x:850,y:340}]:[to];
 if(spec.area&&spec.friendly)targets.splice(0,targets.length,{x:140,y:250},from,{x:300,y:340});
 fx.draw(ctx,{card:c,progress,from,to,targets,center:{x:490,y:300},width:1000,height:440,seed:7,reducedMotion:reduced.matches});
}
function updatePlay(){$('effect-play').textContent=playing?'暂停演出':'播放演出';}
function tick(now){if(!playing||document.hidden){frame=0;return;}if(last)progress=(progress+Math.min(now-last,100)/3000)%1;last=now;$('effect-progress').value=Math.round(progress*1000);drawEffect();frame=requestAnimationFrame(tick);}
function run(){last=0;if(!frame&&playing&&!document.hidden)frame=requestAnimationFrame(tick);updatePlay();}
async function choose(item){
 const token=++selectionRevision;await art.ensure(item.base);if(token!==selectionRevision)return;
 selected=item;progress=.35;$('effect-progress').value=350;
 document.querySelectorAll('.atlas-select').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.base===item.base)));
 const row=art.manifest.bases[item.base],ref=skillFrame(art.manifest,item.base),sheet=art.manifest.sheets[ref.atlas];
 $('effect-name').textContent=row.name;$('effect-kind').textContent=row.effectAtlas?'专属九帧演出':'共享主体演出';
 $('atlas-size').textContent=`${sheet.columns} × ${sheet.rows} · ${(sheet.size/1000).toFixed(1)}KB`;
 $('atlas-sheet').src=assetUrl(sheet,mode);
 $('atlas-source-info').textContent=`${sheet.width} × ${sheet.height} 像素；${ref.hero?'该技能独立动作图集':'多个技能共享图集'}；${mode==='cdn'?'Keepwork CDN':'本地 WebP'}。`;
 drawEffect();
}
async function render(){
 const token=++revision,school=$('atlas-filter').value,query=$('atlas-search').value.trim().toLowerCase();
 const filtered=representatives.filter(r=>(school==='all'||r.card.spellSchool===school)&&(!query||(r.name+' '+r.base).toLowerCase().includes(query)));
 const pages=Math.max(1,Math.ceil(filtered.length/24));page=Math.min(page,pages-1);const current=filtered.slice(page*24,page*24+24);
 $('atlas-cards').replaceChildren();$('atlas-status').textContent=`${filtered.length} 个基础技能 · ${Object.keys(cards).length} 条卡牌定义 · 第 ${page+1}/${pages} 页`;
 $('atlas-prev').disabled=page===0;$('atlas-next').disabled=page>=pages-1;
 for(const item of current){
  const row=art.manifest.bases[item.base],article=document.createElement('article');article.className='atlas-card';
  const button=document.createElement('button');button.className='atlas-select';button.dataset.base=item.base;button.setAttribute('aria-label','预览'+row.name+'施法演出');button.setAttribute('aria-pressed',String(selected?.base===item.base));
  const canvas=document.createElement('canvas');canvas.width=604;canvas.height=920;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',row.name+'卡面');button.append(canvas);
  button.onclick=()=>choose(item).catch(showError);article.append(button);
  const meta=document.createElement('p');meta.className='meta';meta.textContent=names[item.card.spellSchool]+' · '+(row.effectAtlas?'专属九帧':row.source.system?'系统演出':'共享图集');article.append(meta);
  if(row.source.local){const details=document.createElement('details');details.className='original-card';const summary=document.createElement('summary');summary.textContent=row.source.adaptation?'对照旧版补绘':'对照原版卡面';const image=document.createElement('img');image.alt=row.name+'来源卡面';image.loading='lazy';image.crossOrigin='anonymous';image.src=assetUrl(row.source,mode);details.append(summary,image);article.append(details);}
  $('atlas-cards').append(article);
  art.ensure(item.base).then(()=>{if(token===revision)art.drawCard(canvas.getContext('2d'),item.card,{name:row.name,width:604,height:920});}).catch(showError);
 }
 if(current.length&&!selected)await choose(current[0]);
}
function showError(e){$('atlas-status').textContent=e.message;}
$('effect-play').onclick=()=>{playing=!playing;run();};$('effect-replay').onclick=()=>{progress=0;playing=true;run();};
$('effect-progress').oninput=e=>{playing=false;progress=Number(e.target.value)/1000;updatePlay();drawEffect();};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)run();});reduced.addEventListener('change',()=>{playing=false;updatePlay();drawEffect();});
$('atlas-filter').onchange=()=>{page=0;render().catch(showError);};$('atlas-search').oninput=()=>{page=0;render().catch(showError);};
$('atlas-prev').onclick=()=>{page--;render().catch(showError);};$('atlas-next').onclick=()=>{page++;render().catch(showError);};
try{
 [effects,cards]=await Promise.all([read('data/adventure/spell-effects.json'),read('data/kids/cards.json')]);
 art=await loadSkillArt(effects,mode);fx=createSpellEffects({effects,skillArt:art});
 const families=new Map();for(const card of Object.values(cards)){const ref=effects.cards[card.key];if(!families.has(ref.base)||ref.variant.rank==='normal'&&!ref.variant.lowLevel&&families.get(ref.base).rank!=='normal')families.set(ref.base,{card,base:ref.base,name:art.manifest.bases[ref.base].name,rank:ref.variant.rank});}
 representatives=[...families.values()];await render();$('effect-play').disabled=false;$('effect-replay').disabled=false;playing=!reduced.matches;run();
}catch(e){showError(e);}
