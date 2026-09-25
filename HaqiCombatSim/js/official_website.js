import {createRng,hashSeed} from './rng_core.js';
import {createCompanionShowcase} from './official_companions.js';
import {english,schools} from './official_website_i18n.js';
import {loadSkillArt} from './skill_art.js';
import {createSpellEffects} from './spell_effects.js';
import {effectDuration} from './spell_effects_core.js';
const $=id=>document.getElementById(id);
const sourceText=new Map([...document.querySelectorAll('[data-t]')].map(el=>[el,el.innerHTML]));
const query=new URLSearchParams(location.search),local=query.get('assets')==='local';
const cardRng=createRng(hashSeed(query.get('seed')||Date.now())),schoolIds=['fire','ice','storm','life','death'];
let hand=[],activeSlot=1,dealing=false;
let lang=query.get('lang')==='en'?'en':'zh-CN',data,art,fx,selected=0,companions,animation=0,loadVersion=0;
const text=(zh,en)=>lang==='en'?en:zh;
const url=entry=>local?entry.local:entry.cdn;
const node=(tag,content,className)=>{const el=document.createElement(tag);if(content!==undefined)el.textContent=content;if(className)el.className=className;return el;};
function setLanguage(){
 document.documentElement.lang=lang;$('language').value=lang;
 document.title=text('魔法哈奇 · 让冒险，再次发生','Magic Haqi · Find your magic again');
 document.querySelector('meta[name=description]').content=text('导入老玩家装备与卡包，探索六座岛屿，体验五系卡牌，在冒险中一起学习外语。','Bring back your gear and cards, explore six islands, master five schools and practise languages together.');
 for(const [el,original]of sourceText)el.innerHTML=lang==='en'?(english[el.dataset.t]??original):original;
 document.querySelector('nav').setAttribute('aria-label',text('主导航','Main navigation'));
 document.querySelector('.stats').setAttribute('aria-label',text('游戏内容统计','Game catalogue statistics'));

 document.querySelectorAll('[data-game]').forEach(a=>{a.href=`Haqi.html?lang=${lang}${local?'&assets=local':''}`;});
 if(data){renderStats();companions?.setLanguage(lang);renderSchools();renderCard();}
}
function renderStats(){
 const values=['cards','items','quests','pets','effects','courses'];
 const labels=text(['卡牌定义','物品目录','任务收录','宠物目录','基础技能演出','营地语言课程'],['Card definitions','Item entries','Archived quests','Pet entries','Base spell effects','Camp courses']);
 $('stats').replaceChildren(...values.map((key,i)=>{const el=node('div',undefined,'stat');el.append(node('strong',data.stats[key].toLocaleString(lang)),node('span',labels[i]));return el;}));
 $('course-count').textContent=data.stats.courses;
}
function renderSchools(){
 $('school-tabs').replaceChildren(...schools[lang].map(([name],i)=>{const b=node('button',name);b.type='button';b.setAttribute('aria-pressed',String(i===selected));b.onclick=()=>{selected=i;[...$('school-tabs').children].forEach((el,j)=>el.setAttribute('aria-pressed',String(j===i)));dealHand();renderCard(true);};return b;}));
}
function pool(){return Object.values(data.cards).filter(c=>c.spellSchool===schoolIds[selected]);}
function dealHand(){const list=pool(),sides=cardRng.shuffle(list.slice(1)).slice(0,2);hand=[sides[0],list[0],sides[1]];activeSlot=1;}
function current(){return hand[activeSlot];}
function cardName(c){return data.cardNames[c.key][lang==='en'?'en':'zh'];}
function strategy(c){
 if(/Heal/.test(c.type))return text('把治疗安排在需要的回合，兼顾恢复与魔力储备。','Time your healing carefully and keep enough pips for the next turn.');
 if(/DOT/.test(c.type))return text('直接攻击与持续伤害交织，观察护盾，安排后续回合的进攻。','Combine immediate pressure with damage over time. Read the shields and plan ahead.');
 if(/Attack|LifeTap/.test(c.type))return text('观察对手防御，积蓄魔力，选择合适的时机出手。','Read your opponent’s defences, gather pips and choose your moment to strike.');
 return text('把增益、防御与控制编入卡组，让辅助魔法为下一步创造机会。','Use buffs, defences and control to create an opening for your next move.');
}
async function exchangeCard(index,button){
 if(dealing||!art)return;
 const choices=pool().filter(next=>!hand.includes(next));if(!choices.length)return;
 const version=loadVersion,next=cardRng.pick(choices),canvas=button.querySelector('canvas'),reduced=$('reduced').checked;
 dealing=true;cancelAnimationFrame(animation);$('replay').disabled=true;
 $('card-hand').setAttribute('aria-busy','true');
 $('effect-status').textContent=text('丢出旧牌，抽取新牌…','Discarding… Drawing a new card…');
 const outgoing=canvas.animate(reduced?[{opacity:1},{opacity:0}]:[
  {transform:'translateY(0) rotate(0deg)',opacity:1},
  {transform:'translateY(-45px) rotate(-6deg)',opacity:1,offset:.3},
  {transform:'translateY(-210px) rotate(12deg) scale(.88)',opacity:0}
 ],{duration:reduced?120:360,easing:'cubic-bezier(.4,0,.8,.3)',fill:'forwards'});
 // Start fetching while the old card leaves; never flash a placeholder as the new card.
 try{await Promise.all([outgoing.finished,art.ensure(data.effects.cards[next.key].base)]);}
 catch{if(version!==loadVersion)return;outgoing.cancel();dealing=false;$('card-hand').removeAttribute('aria-busy');$('replay').disabled=false;$('effect-status').textContent=text('新卡美术暂不可用，请再试一次。','New card artwork unavailable. Please try again.');return;}
 if(version!==loadVersion)return;
 hand[index]=next;activeSlot=index;renderCard(true,index,true);
}
function renderCard(autoPlay=false,focusSlot=null,dealIn=false){
 dealing=dealIn;$('card-hand').setAttribute('aria-busy',String(dealIn));
 cancelAnimationFrame(animation);const version=++loadVersion,c=current();if(!c)return;
 const name=cardName(c),school=schools[lang][selected][0];
 $('card-school').textContent=school+' / '+text('策略笔记','TACTICAL NOTES');$('card-title').textContent=name;$('card-strategy').textContent=strategy(c);$('spell-counter').textContent=text(`本系 ${pool().length} 种技能`,`${pool().length} spells in this school`);
 $('effect-canvas').setAttribute('aria-label',name+text('技能演出',' spell preview'));
 const p=c.params,facts=[[text('魔力消耗','Pip cost'),c.pipcost],[text('基础命中','Base accuracy'),c.accuracy+'%']];
 if(p.damage_min!==undefined)facts.push([text('直接伤害','Direct damage'),`${p.damage_min}–${p.damage_max??p.damage_min}`]);
 if(p.heal_min!==undefined)facts.push([text('基础治疗','Base healing'),`${p.heal_min}–${p.heal_max??p.heal_min}`]);
 $('card-facts').replaceChildren(...facts.map(([k,v])=>{const row=node('div');row.append(node('dt',k),node('dd',v));return row;}));
 $('effect-status').textContent=text('正在准备卡牌美术…','Preparing card artwork…');$('replay').disabled=true;
 const jobs=hand.map((card,index)=>{
  const button=node('button',undefined,'flip-card'+(index===activeSlot?' is-active':''));button.type='button';button.dataset.cardKey=card.key;button.setAttribute('aria-label',text('翻换卡牌：','Turn card: ')+cardName(card));button.setAttribute('aria-pressed',String(index===activeSlot));
  const canvas=node('canvas');canvas.width=302;canvas.height=460;canvas.setAttribute('aria-hidden','true');button.append(canvas);
  button.onclick=()=>exchangeCard(index,button);
  if(dealIn&&index===activeSlot)canvas.style.opacity='0';
  const ctx=canvas.getContext('2d');ctx.fillStyle='#21493e';ctx.fillRect(0,0,302,460);ctx.fillStyle='#f5edcf';ctx.font='22px sans-serif';ctx.textAlign='center';ctx.fillText(cardName(card),151,80,260);
  return {button,card,ctx,index};
 });
 $('card-hand').replaceChildren(...jobs.map(j=>j.button));if(Number.isInteger(focusSlot))jobs[focusSlot].button.focus({preventScroll:true});
 drawEffect(0);
 if(!art)return;
 for(const {card,ctx,index} of jobs)art.ensure(data.effects.cards[card.key].base).then(async()=>{
  if(version!==loadVersion)return;
  try{art.drawCard(ctx,card,{name:cardName(card),description:text(`命中 ${card.accuracy}% · ${card.pipcost} 魔力`,`${card.accuracy}% accuracy · ${card.pipcost} pips`)});}catch{}
  if(index!==activeSlot)return;
  if(dealIn){
   const canvas=ctx.canvas,reduced=$('reduced').checked;
   const incoming=canvas.animate(reduced?[{opacity:0},{opacity:1}]:[
    {transform:'translateY(100px) rotate(-10deg) scale(.82)',opacity:0},
    {transform:'translateY(-12px) rotate(2deg) scale(1.03)',opacity:1,offset:.78},
    {transform:'translateY(0) rotate(0deg) scale(1)',opacity:1}
   ],{duration:reduced?140:460,easing:'cubic-bezier(.16,1,.3,1)',fill:'forwards'});
   await incoming.finished;if(version!==loadVersion)return;
   canvas.style.opacity='1';incoming.cancel();dealing=false;$('card-hand').setAttribute('aria-busy','false');
  }
  $('replay').disabled=false;
  if(autoPlay)play();else{$('effect-status').textContent=text('点击卡牌即可翻换并播放。','Turn a card to reveal and play its spell.');drawEffect(.48);}
 }).catch(()=>{if(version!==loadVersion||index!==activeSlot)return;$('effect-status').textContent=text('美术暂不可用；点击播放可重试。','Artwork unavailable. Press play to retry.');$('replay').disabled=false;});
}
function drawEffect(progress){
 const canvas=$('effect-canvas'),ctx=canvas.getContext('2d'),w=800,h=400;ctx.clearRect(0,0,w,h);
 const from={x:150,y:285},to={x:640,y:250};
 ctx.strokeStyle='#79937955';ctx.lineWidth=2;for(const r of [1,.78,.45]){ctx.beginPath();ctx.ellipse(400,285,330*r,85*r,0,0,Math.PI*2);ctx.stroke();}
 for(const point of [from,to]){ctx.fillStyle='#405e4966';ctx.beginPath();ctx.ellipse(point.x,point.y+6,26,10,0,0,Math.PI*2);ctx.fill();}
 if(fx)fx.draw(ctx,{card:current(),progress,from,to,targets:[to],center:{x:400,y:270},width:w,height:h,seed:7,reducedMotion:$('reduced').checked});
}
async function play(){
 if(!art)return;const version=loadVersion,c=current();$('replay').disabled=true;
 try{await art.ensure(data.effects.cards[c.key].base);if(version!==loadVersion)return;
 cancelAnimationFrame(animation);const duration=effectDuration(data.effects,c,$('reduced').checked);let elapsed=0,last=0;
 function frame(now){if(version!==loadVersion)return;elapsed+=last?Math.min(50,now-last):0;last=now;const p=Math.min(1,elapsed/duration);drawEffect(p);$('effect-status').textContent=p<1?text('凝聚 · 释放 · 命中','Gather · Cast · Impact'):text('演出结束，再看一次？','Spell complete. Watch it again?');if(p<1)animation=requestAnimationFrame(frame);else $('replay').disabled=false;}
 animation=requestAnimationFrame(frame);
 }catch{$('effect-status').textContent=text('图片加载失败，请再次点击重试。','Artwork failed to load. Please try again.');$('replay').disabled=false;}
}
$('language').onchange=()=>{lang=$('language').value;const next=new URL(location.href);next.searchParams.set('lang',lang);history.replaceState(null,'',next);setLanguage();};
$('replay').onclick=play;$('reduced').checked=matchMedia('(prefers-reduced-motion: reduce)').matches;$('reduced').onchange=()=>{cancelAnimationFrame(animation);if(data){drawEffect(.48);$('replay').disabled=false;}};
// A tab switch ends a preview rather than running animation in the background.
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(animation);$('replay').disabled=!art;}});
setLanguage();
try{
 const response=await fetch('data/official-website.json');if(!response.ok)throw new Error('catalog');data=await response.json();
 document.querySelector('.hero-art').style.backgroundImage=`url("${url(data.map)}")`;document.querySelector('.pet-art').style.backgroundImage=`url("${url(data.pet)}")`;
 companions=createCompanionShowcase(data.companions,{local,seed:query.get('seed')||Date.now()});
 dealHand();
 setLanguage();
 art=await loadSkillArt(data.effects,local?'local':'cdn',async path=>path.endsWith('skill-art.json')?data.art:data.frames);
 fx=createSpellEffects({effects:data.effects,skillArt:art,images:new Map()});renderCard();
}catch{const el=$('load-error');el.hidden=false;el.textContent=text('展示资源暂时无法加载，请刷新重试。你仍可通过「开始冒险」进入游戏。','Showcase resources could not load. Refresh to retry, or use Play now to enter the game.');}
