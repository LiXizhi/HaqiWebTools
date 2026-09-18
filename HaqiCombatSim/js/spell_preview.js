import { loadResources } from './adventure_assets.js';
import { fetchJson } from './runtime_data.js';
import { createSpellEffects } from './spell_effects.js';
import { drawAnimatedActor } from './actor_animation.js';
import { PREVIEW_HIT_DURATION_MS, previewTargetAction } from './actor_animation_core.js';
import { loadSpellArt } from './spell_art.js';
import { createSpellSound } from './spell_sound.js';
import { effectDuration,spellEffect,validateSpellEffects } from './spell_effects_core.js';
const $=id=>document.getElementById(id),canvas=$('preview'),ctx=canvas.getContext('2d');
const names={ice:'寒冰',fire:'烈火',storm:'风暴',life:'生命',death:'死亡',balance:'通用'};
const ranks={normal:'普通',green:'绿卡',blue:'蓝卡',purple:'紫卡',gold:'金卡'};
const sound=createSpellSound();
const soundButton=document.createElement('button');soundButton.type='button';
function soundLabel(){soundButton.textContent=sound.enabled?'音效：开启':'音效：关闭';soundButton.setAttribute('aria-pressed',String(sound.enabled));}
soundLabel();document.querySelector('.controls').append(soundButton);
soundButton.onclick=async()=>{const requested=!sound.enabled,ok=await sound.setEnabled(requested);soundLabel();if(requested&&!ok)$('error').textContent='浏览器暂时无法启用音效，请重试。';};
document.addEventListener('pointerdown',()=>sound.unlock());document.addEventListener('keydown',()=>sound.unlock());
document.addEventListener('visibilitychange',()=>{sound.stop();last=0;});window.addEventListener('pagehide',()=>sound.stop());
let assets,fx,card,cards,families,playing=true,elapsed=0,last=0;
$('reduced').onchange=()=>{elapsed=0;};
$('actor-action').onchange=()=>{elapsed=0;playing=true;$('play').textContent='暂停';};
$('reduced').checked=matchMedia('(prefers-reduced-motion: reduce)').matches;
function previewDuration(){return $('actor-action').value==='auto'?effectDuration(assets.effects,card,$('reduced').checked):$('actor-action').value==='hit'?PREVIEW_HIT_DURATION_MS:900;}
function option(select,value,label){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}
function select(){
    sound.stop();
    card=cards[$('card').value];elapsed=0;const spec=spellEffect(assets.effects,card);
    $('name').textContent=spec.name;$('school').textContent=names[card.spellSchool]+' / 技能演出';
    $('detail').textContent=`${spec.area?'群体 · ':''}${spec.kind==='summon'?'角色召唤':'基础演出'} · ${ranks[spec.variant.rank]}${spec.variant.level?' · '+spec.variant.level+'阶':''}${spec.variant.lowLevel?' · 入门版':''} · ${(spec.duration/1000).toFixed(1)} 秒`;
    const c=$('art').getContext('2d');c.clearRect(0,0,302,460);
    $('error').textContent='';
    assets.ensureSpellArt(spec.base).then(()=>{
        if(assets.effects.cards[card.key].base!==spec.base)return;
        assets.skillArt.drawCard(c,card);
        $('art').setAttribute('aria-label',spec.name+' · 图集重绘卡面');
    }).catch(e=>{if(assets.effects.cards[card.key].base===spec.base)$('error').textContent=e.message;});

}
function selectBase(preferred){
    const list=families.get($('base').value)||[];$('card').replaceChildren();
    list.forEach((c,i)=>{const s=spellEffect(assets.effects,c);option($('card'),c.key,`${s.name} · ${ranks[s.variant.rank]}${s.variant.lowLevel?' · 入门版':''} (${i+1}/${list.length})`);});
    if(preferred&&list.some(c=>c.key===preferred))$('card').value=preferred;
    $('card').disabled=!list.length;if(list.length)select();
}
function filter(preferred){
    const school=$('school-filter').value;$('base').replaceChildren();
    for(const [id,list]of families){const c=list[0];if(school!=='all'&&c.spellSchool!==school)continue;const base=assets.effects.bases[id];const representative=list.find(x=>spellEffect(assets.effects,x).variant.rank==='normal')||c;option($('base'),id,`${names[c.spellSchool]} · ${spellEffect(assets.effects,representative).name} (${list.length})`);}
    if(preferred)$('base').value=assets.effects.cards[preferred].base;
    $('base').disabled=false;selectBase(preferred);
}
$('school-filter').onchange=()=>filter();$('base').onchange=()=>selectBase();$('card').onchange=select;
$('play').onclick=()=>{playing=!playing;if(!playing)sound.stop();$('play').textContent=playing?'暂停':'播放';};
$('restart').onclick=()=>{sound.stop();elapsed=0;playing=true;$('play').textContent='暂停';};
$('seek').oninput=()=>{sound.stop();if(!card)return;elapsed=Number($('seek').value)/1000*previewDuration();playing=false;$('play').textContent='播放';};
function frame(now){
    const dt=Math.min(60,now-(last||now));last=now;const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(2,devicePixelRatio||1);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    if(card){
        const spec=spellEffect(assets.effects,card),duration=previewDuration();
        if(playing&&!document.hidden){elapsed+=dt;if(elapsed>duration+650&&$('loop').checked)elapsed=0;}
        const p=Math.min(1,elapsed/duration),from={x:w*.23,y:h*.64},to={x:w*.76,y:h*.57};
        ctx.save();ctx.strokeStyle='#819d8966';ctx.lineWidth=2;for(const r of [1,.83,.51]){ctx.beginPath();ctx.ellipse(w*.5,h*.62,w*.4*r,h*.22*r,0,0,Math.PI*2);ctx.stroke();}ctx.restore();
        const size=Math.min(90,w*.18),targets=spec.area?[{x:w*.60,y:h*.47},to,{x:w*.82,y:h*.72}]:[spec.friendly?from:to];
        const mode=$('actor-action').value,reduced=$('reduced').checked;
        const reaction=previewTargetAction(spec,assets.effects.timeline,elapsed,duration,mode);
        const drawActor=(at,atlas,index,action,progress,direction)=>drawAnimatedActor(ctx,at,action,progress,direction,reduced,()=>assets.tile(ctx,atlas,index,-size/2,-size,size,size));
        drawActor(from,'sprites',10,mode==='auto'?'cast':'idle',Math.min(1,p/.45),1);
        const drawTargets=()=>{for(const at of spec.area?targets:[to]) {
            const friendly=spec.area&&spec.friendly;
            drawActor(at,friendly?'sprites':'creatures',friendly?10:1,reaction.action,reaction.progress,-1);
        }};
        // Keep the recoiling silhouette visible through dense impact particles.
        if(reaction.action!=='hit')drawTargets();
        if(mode==='auto')fx.draw(ctx,{card,progress:p,from,to:targets[0],targets,center:{x:w*.5,y:h*.62},width:w,height:h,seed:7,reducedMotion:reduced});
        if(reaction.action==='hit')drawTargets();
        sound.track(assets.effects,card,p,{active:mode==='auto'&&playing&&!document.hidden,reducedMotion:reduced});
        $('seek').value=Math.round(p*1000);const timing=assets.effects.timeline,summon=spec.kind==='summon';
        $('phase').textContent=p<.18?'凝聚魔力':p<(summon?timing.summonAttack:timing.attack)?'法术成形':p<(summon?timing.summonImpact:timing.impact)?(spec.friendly?'祝福与守护':'释放法术'):p<1?'命中与消散':'演出结束';
        if(mode!=='auto')$('phase').textContent={cast:'宠物施法 · 蓄力跃动',hit:'宠物受击 · 闪白后仰',death:'宠物死亡 · 下沉消散'}[mode];
    }
    requestAnimationFrame(frame);
}
try{
    assets=await loadResources();const fullCards=await fetchJson('data/kids/cards.json');
    await loadSpellArt(assets);
    cards={...fullCards,...assets.dataset.cards};validateSpellEffects(assets.effects,cards);fx=createSpellEffects(assets);families=new Map();
    for(const c of Object.values(cards)){const id=assets.effects.cards[c.key].base;if(!families.has(id))families.set(id,[]);families.get(id).push(c);}
    filter('Ice_SingleAttack_Level6_low_level');requestAnimationFrame(frame);
}catch(e){$('error').textContent=`特效加载失败：${e.message}。请检查资源后刷新。`;}
