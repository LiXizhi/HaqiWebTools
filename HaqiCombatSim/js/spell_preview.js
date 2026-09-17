import { loadResources } from './adventure_assets.js';
import { createSpellEffects } from './spell_effects.js';
import { drawAnimatedActor } from './actor_animation.js';
import { HIT_DURATION_MS } from './actor_animation_core.js';
import { loadSpellArt } from './spell_art.js';
import { effectDuration,spellEffect,validateSpellEffects } from './spell_effects_core.js';
const $=id=>document.getElementById(id),canvas=$('preview'),ctx=canvas.getContext('2d');
const names={ice:'寒冰',fire:'烈火',storm:'风暴',life:'生命',death:'死亡',balance:'通用'};
const ranks={normal:'普通',green:'绿卡',blue:'蓝卡',purple:'紫卡',gold:'金卡'};
let assets,fx,card,cards,families,playing=true,elapsed=0,last=0;
$('reduced').onchange=()=>{elapsed=0;};
$('actor-action').onchange=()=>{elapsed=0;playing=true;$('play').textContent='暂停';};
$('reduced').checked=matchMedia('(prefers-reduced-motion: reduce)').matches;
function previewDuration(){return $('actor-action').value==='auto'?effectDuration(assets.effects,card,$('reduced').checked):$('actor-action').value==='hit'?HIT_DURATION_MS:900;}
function option(select,value,label){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}
function select(){
    card=cards[$('card').value];elapsed=0;const spec=spellEffect(assets.effects,card);
    $('name').textContent=spec.name;$('school').textContent=names[card.spellSchool]+' / 技能演出';
    $('detail').textContent=`${spec.area?'群体 · ':''}${spec.kind==='summon'?'角色召唤':'基础演出'} · ${ranks[spec.variant.rank]}${spec.variant.level?' · '+spec.variant.level+'阶':''}${spec.variant.lowLevel?' · 入门版':''} · ${(spec.duration/1000).toFixed(1)} 秒`;
    const c=$('art').getContext('2d');c.clearRect(0,0,302,460);
    $('error').textContent='';
    assets.ensureSpellArt(spec.base).then(image=>{
        if(!image||assets.effects.cards[card.key].base!==spec.base)return;
        c.clearRect(0,0,302,460);c.drawImage(image,0,0,302,460);
        const row=assets.spellArt[spec.base];
        $('art').setAttribute('aria-label',row.adaptation?'补绘基础卡面':'原版基础卡面（变体共用）');
        if(row.adaptation){c.fillStyle='#fff4cc';c.textAlign='center';c.font='bold 25px sans-serif';c.fillText(row.name,151,60,260);c.font='16px sans-serif';c.fillText('原图缺失 · 符文补绘',151,418);}
    }).catch(e=>{if(assets.effects.cards[card.key].base===spec.base)$('error').textContent=e.message;});
    const art=card.art||Object.values(assets.dataset.cards).find(x=>assets.effects.cards[x.key].base===spec.base)?.art;
    if(art){assets.draw(c,art,0,0,302,460,false);$('art').setAttribute('aria-label','原版基础卡面（变体共用）');}
    else {
        $('art').setAttribute('aria-label','技能演出示意');const col=spec.palette;
        c.fillStyle='#193441';c.fillRect(0,0,302,460);c.strokeStyle=col[0];c.lineWidth=4;c.strokeRect(10,10,282,440);
        c.textAlign='center';c.fillStyle=col[1];c.font='bold 30px sans-serif';c.fillText(names[card.spellSchool],151,70);
        c.beginPath();c.arc(151,190,72,0,Math.PI*2);c.stroke();c.font='60px sans-serif';c.fillText('✧',151,210);
        c.font='24px sans-serif';c.fillText(spec.name,151,320,260);c.font='18px sans-serif';c.fillText('演出示意 · 非原版卡面',151,410);
    }
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
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'暂停':'播放';};
$('restart').onclick=()=>{elapsed=0;playing=true;$('play').textContent='暂停';};
$('seek').oninput=()=>{if(!card)return;elapsed=Number($('seek').value)/1000*previewDuration();playing=false;$('play').textContent='播放';};
function frame(now){
    const dt=Math.min(60,now-(last||now));last=now;const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(2,devicePixelRatio||1);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    if(card){
        const spec=spellEffect(assets.effects,card),duration=previewDuration();
        if(playing){elapsed+=dt;if(elapsed>duration+650&&$('loop').checked)elapsed=0;}
        const p=Math.min(1,elapsed/duration),from={x:w*.23,y:h*.64},to={x:w*.76,y:h*.57};
        ctx.save();ctx.strokeStyle='#819d8966';ctx.lineWidth=2;for(const r of [1,.83,.51]){ctx.beginPath();ctx.ellipse(w*.5,h*.62,w*.4*r,h*.22*r,0,0,Math.PI*2);ctx.stroke();}ctx.restore();
        const size=Math.min(90,w*.18),targets=spec.area?[{x:w*.60,y:h*.47},to,{x:w*.82,y:h*.72}]:[spec.friendly?from:to];
        const mode=$('actor-action').value,reduced=$('reduced').checked,impact=spec.kind==='summon'?assets.effects.timeline.summonImpact:assets.effects.timeline.impact;
        const drawActor=(at,atlas,index,action,progress,direction)=>drawAnimatedActor(ctx,at,action,progress,direction,reduced,()=>assets.tile(ctx,atlas,index,-size/2,-size,size,size));
        drawActor(from,'sprites',10,mode==='auto'?'cast':'idle',Math.min(1,p/.45),1);
        for(const at of spec.area?targets:[to]) {
            const friendly=spec.area&&spec.friendly;
            const action=mode==='auto'?(p>=impact&&!spec.friendly?'hit':'idle'):mode;
            drawActor(at,friendly?'sprites':'creatures',friendly?10:1,action,mode==='auto'?Math.max(0,(elapsed-impact*duration)/HIT_DURATION_MS):p,-1);
        }
        if(mode==='auto')fx.draw(ctx,{card,progress:p,from,to:targets[0],targets,center:{x:w*.5,y:h*.62},width:w,height:h,seed:7,reducedMotion:reduced});
        $('seek').value=Math.round(p*1000);const timing=assets.effects.timeline,summon=spec.kind==='summon';
        $('phase').textContent=p<.18?'凝聚魔力':p<(summon?timing.summonAttack:timing.attack)?'法术成形':p<(summon?timing.summonImpact:timing.impact)?(spec.friendly?'祝福与守护':'释放法术'):p<1?'命中与消散':'演出结束';
        if(mode!=='auto')$('phase').textContent={cast:'宠物施法 · 蓄力跃动',hit:'宠物受击 · 闪白后仰',death:'宠物死亡 · 下沉消散'}[mode];
    }
    requestAnimationFrame(frame);
}
try{
    assets=await loadResources();const response=await fetch('data/kids/cards.json');if(!response.ok)throw new Error('无法读取完整卡库');
    await loadSpellArt(assets);
    cards={...await response.json(),...assets.dataset.cards};validateSpellEffects(assets.effects,cards);fx=createSpellEffects(assets);families=new Map();
    for(const c of Object.values(cards)){const id=assets.effects.cards[c.key].base;if(!families.has(id))families.set(id,[]);families.get(id).push(c);}
    filter('Ice_SingleAttack_Level6_low_level');requestAnimationFrame(frame);
}catch(e){$('error').textContent=`特效加载失败：${e.message}。请检查资源后刷新。`;}
