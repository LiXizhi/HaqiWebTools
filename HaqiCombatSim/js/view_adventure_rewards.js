// DockTip.lua L630–687: bottom bag notification, equip apparel / inspect cards.
export function createRewardFeedback(root,{describe,activate}) {
    const queue=[];let active=null,started=0,lastTick=null;
    const banner=document.createElement('div');banner.className='reward-banner';banner.setAttribute('role','status');
    const popup=document.createElement('section');popup.className='reward-popup';popup.hidden=true;popup.setAttribute('aria-label','新获得的物品');
    root.append(banner,popup);root.hidden=true;
    function dismiss(){active=null;popup.replaceChildren();popup.hidden=true;}
    function paint(){
        popup.replaceChildren();
        const reward=active.items[0];if(!reward){popup.hidden=true;return;}popup.hidden=false;
        const info=describe(reward),heading=document.createElement('strong'),name=document.createElement('p'),hint=document.createElement('small');
        heading.textContent=reward.kind==='card'?'获得新卡牌':reward.gear?'获得新装备':'获得新物品';
        name.textContent=`${info.name||reward.name} ×${reward.count}`;hint.textContent=info.reason||'已放入背包';
        if(info.art)popup.append(info.art);
        const use=document.createElement('button');use.type='button';use.className='primary';use.textContent=info.label;use.disabled=!!info.reason;
        use.onclick=()=>{if(activate(reward)!==false)next();};
        const skip=document.createElement('button');skip.type='button';skip.className='secondary';skip.textContent=active.items.length>1?`稍后处理 · 下一件（${active.items.length-1}）`:'稍后处理';skip.onclick=next;
        popup.append(heading,name,hint,use,skip);
    }
    function next(){active.items.shift();paint();}
    return {
        push(event){if(event.xp||event.level||event.items.length)queue.push({...event,items:[...event.items]});},
        reset(){queue.length=0;dismiss();root.hidden=true;banner.textContent='';lastTick=null;},
        tick(now,visible){
            if(!visible&&active&&lastTick!==null)started+=now-lastTick;
            lastTick=now;root.hidden=!visible;if(!visible)return null;
            if(queue.length&&(!active||now-started>4800)){
                const pending=active?.items||[];active=queue.shift();started=now;
                const summary=active.items.slice(0,2).map(item=>`${item.name} ×${item.count}`);
                if(active.items.length>2)summary.push(`另获 ${active.items.length-2} 种奖励`);
                banner.textContent=[active.level?`升级了！ ${active.fromLevel} → ${active.level} 级`:'',active.xp?`获得经验 +${active.xp}`:'',...summary].filter(Boolean).join('　');
                active.items=[...pending,...active.items.filter(item=>item.gear||item.kind==='card'||item.kind==='pet')];
                banner.classList.remove('reward-enter');void banner.offsetWidth;banner.classList.add('reward-enter');paint();
            }
            const elapsed=now-started;
            banner.hidden=!active||elapsed>4800;
            if(!active)return null;
            const effect=elapsed<4800?{...active,elapsed}:null;
            if(!active.items.length&&elapsed>4800)dismiss();
            return effect;
        },
    };
}

export function drawRewardEffect(c,x,y,event,reduced=false) {
    if(!event)return;
    const t=event.elapsed/1000,level=!!event.level,color=level?'#ffe498':'#94ffdf';
    c.save();c.translate(x,y);c.globalAlpha=Math.min(1,(4.8-t)*1.4);c.shadowColor=color;c.shadowBlur=level?22:12;
    if(level){
        const beam=c.createLinearGradient(0,-210,0,0);beam.addColorStop(0,'#ffe99900');beam.addColorStop(1,'#ffe99999');c.fillStyle=beam;c.fillRect(-42,-210,84,210);
    }
    c.strokeStyle=color;c.lineWidth=3;
    for(let i=0;i<3;i++){const r=30+i*17+(reduced?0:Math.sin(t*3-i)*6);c.beginPath();c.ellipse(0,-4-i*7,r,r*.32,0,0,Math.PI*2);c.stroke();}
    if(!reduced)for(let i=0;i<24;i++){const a=i*2.399+t*.8,r=28+(i%5)*10,h=(t*65+i*17)%190;c.fillStyle=color;c.beginPath();c.arc(Math.cos(a)*r,-h,2+i%3,0,Math.PI*2);c.fill();}
    c.shadowBlur=5;c.font='bold 24px "Microsoft YaHei", sans-serif';c.textAlign='center';c.lineWidth=5;c.strokeStyle='#3e3921';c.fillStyle=level?'#fff0a4':'#b8ffed';
    const label=level?`升到 ${event.level} 级！`:event.xp?`经验 +${event.xp}`:'获得物品！',dy=-112-(reduced?0:Math.min(t*10,25));
    c.strokeText(label,0,dy);c.fillText(label,0,dy);c.restore();
}
