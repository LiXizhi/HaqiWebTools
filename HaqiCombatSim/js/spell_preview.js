import { loadResources } from './adventure_assets.js';
import { createSpellEffects } from './spell_effects.js';
import { effectDuration } from './spell_effects_core.js';
const $=id=>document.getElementById(id),canvas=$('preview'),ctx=canvas.getContext('2d');
const names={ice:'寒冰',fire:'烈火',storm:'风暴',life:'生命',death:'死亡'};
let assets,fx,card,playing=true,elapsed=0,last=0;
$('reduced').onchange=()=>{elapsed=0;};
$('reduced').checked=matchMedia('(prefers-reduced-motion: reduce)').matches;
function select(){card=assets.dataset.cards[$('card').value];elapsed=0;$('name').textContent=card.name;$('school').textContent=names[card.spellSchool]+' / 技能演出';const spec=assets.effects.cards[card.key];$('detail').textContent=`${spec.kind==='summon'?'角色召唤 + 特殊攻击':'粒子与特殊效果'} · ${(spec.duration/1000).toFixed(1)} 秒 · ${spec.count} 个粒子`;const c=$('art').getContext('2d');c.clearRect(0,0,302,460);assets.draw(c,card.art,0,0,302,460,false);}
$('card').onchange=select;$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'暂停':'播放';};$('restart').onclick=()=>{elapsed=0;playing=true;$('play').textContent='暂停';};$('seek').oninput=()=>{if(!card)return;elapsed=Number($('seek').value)/1000*effectDuration(assets.effects,card,$('reduced').checked);playing=false;$('play').textContent='播放';};
function frame(now){const dt=Math.min(60,now-(last||now));last=now;const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(2,devicePixelRatio||1);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 if(card){const duration=effectDuration(assets.effects,card,$('reduced').checked);if(playing){elapsed+=dt;if(elapsed>duration+650&&$('loop').checked)elapsed=0;}const p=Math.min(1,elapsed/duration),from={x:w*.25,y:h*.64},to={x:w*.77,y:h*.57};
 ctx.save();ctx.strokeStyle='#819d8966';ctx.lineWidth=2;for(const r of [1,.83,.51]){ctx.beginPath();ctx.ellipse(w*.5,h*.62,w*.4*r,h*.22*r,0,0,Math.PI*2);ctx.stroke();}for(const at of [from,to]){ctx.fillStyle='#96cbb022';ctx.beginPath();ctx.ellipse(at.x,at.y+5,38,13,0,0,Math.PI*2);ctx.fill();}ctx.restore();
 const size=Math.min(90,w*.18);assets.tile(ctx,'sprites',10,from.x-size/2,from.y-size,size,size);assets.tile(ctx,'creatures',1,to.x-size/2,to.y-size,size,size);
 const friendly=['shield','blade','heal'].includes(assets.effects.cards[card.key].kind);
 fx.draw(ctx,{card,progress:p,from,to:friendly?from:to,center:{x:w*.5,y:h*.62},width:w,height:h,seed:7,reducedMotion:$('reduced').checked});$('seek').value=Math.round(p*1000);const timing=assets.effects.timeline,summon=assets.effects.cards[card.key].kind==='summon';$('phase').textContent=p<.18?'凝聚魔力':p<(summon?timing.summonAttack:timing.attack)?'法术成形':p<(summon?timing.summonImpact:timing.impact)?(friendly?'祝福与守护':'释放攻击'):p<1?'命中与消散':'演出结束';}
 requestAnimationFrame(frame);}
try{assets=await loadResources();fx=createSpellEffects(assets);for(const c of Object.values(assets.dataset.cards)){const o=document.createElement('option');o.value=c.key;o.textContent=`${names[c.spellSchool]} · ${c.name}`;$('card').append(o);}$('card').disabled=false;$('card').value='Ice_SingleAttack_Level6_low_level';select();requestAnimationFrame(frame);}catch(e){$('error').textContent=`特效加载失败：${e.message}。请检查资源后刷新。`;}
