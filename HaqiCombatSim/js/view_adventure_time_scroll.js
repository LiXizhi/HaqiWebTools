import {createCloseButton} from './view_adventure_controls.js';
import {timeStationIndex,visibleTimeStations,timeScrollEnd,timeDiscoveries,timeDiscoveryKey} from './adventure_time_scroll_core.js';
import {dailyBuffDescription} from './language_daily_buff_core.js';
import {createTimeScenery} from './view_time_scenery.js';

const el=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls||'';if(text!==undefined)node.textContent=text;return node;};
const button=(text,run,cls='secondary')=>{const node=el('button',cls,text);node.type='button';node.onclick=run;return node;};
export function createTimeScrollView(root,{data,city,assets,getSave,onTarget,onJump,onDirection,onClose,onPractice}){
    const previousFocus=document.activeElement;
    const scenery=createTimeScenery({data,assets});
    const room=el('section','time-scroll');room.setAttribute('role','dialog');room.setAttribute('aria-modal','true');room.setAttribute('aria-label','城市时光长卷');
    const header=el('header','time-scroll-header'),heading=el('div'),title=el('h2','',`${city.name} · 时光长卷`);
    heading.append(title,el('p','','想象中的时光场景 · 旅人为虚构人物'));
    header.append(heading,button('回到城市',onClose),createCloseButton(onClose,'关闭时光长卷并回到城市'));
    const ruler=el('nav','time-scroll-ruler');ruler.setAttribute('aria-label','分段时间轴，向左走向过去');
    const ticks=data.stations.map((s,i)=>{const b=button(s.label,()=>onJump(i*data.spacing));b.dataset.station=s.id;ruler.append(b);return b;});
    const stage=el('div','time-scroll-stage'),canvas=el('canvas');canvas.tabIndex=0;canvas.setAttribute('aria-label','时光道路，左右方向键行走，也可点击地面');
    const targets=el('div','time-scroll-targets');stage.append(canvas,targets);
    const targetButtons=new Map();
    for(const [i,s]of data.stations.entries())if(s.traveler){
        for(const kind of ['talk','clue']){const b=button(kind==='talk'?`${s.traveler.name} · 交谈`:s.clue.name,()=>onTarget(i*data.spacing+(kind==='talk'?-100:160),{kind,index:i}),'time-scroll-target');b.dataset.kind=kind;b.dataset.station=s.id;targets.append(b);targetButtons.set(`${i}:${kind}`,b);}
    }
    const tools=el('div','time-scroll-tools'),left=button('向过去走',()=>onTarget(position-180)),right=button('向现在走',()=>onTarget(position+180));
    const status=el('span','time-scroll-status');status.setAttribute('aria-live','polite');
    tools.append(left,status,right,button('发现记录',()=>showCollection()),button('今日加成',()=>showBuff()));
    const hint=el('p','time-scroll-hint','点击地面行走，靠近旅人或线索可互动。刻度等距排列，不表示相同年数。');
    const detail=el('aside','time-scroll-detail');detail.hidden=true;
    room.append(header,ruler,stage,tools,hint,detail);root.replaceChildren(room);
    const ctx=canvas.getContext('2d'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
    let position=timeScrollEnd(data),lastIndex=-1,width=1,height=1,closed=false,readStation=null;
    function resize(){const r=stage.getBoundingClientRect();width=Math.max(1,r.width);height=Math.max(1,r.height);const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
    const observer=new ResizeObserver(resize);observer.observe(stage);resize();
    const offset=()=>position-width*.42;
    const floor=()=>height*.73;
    let pointer=null;
    canvas.onpointerdown=e=>{pointer={id:e.pointerId,x:e.clientX,y:e.clientY};};
    canvas.onpointerup=e=>{if(pointer?.id===e.pointerId&&Math.hypot(pointer.x-e.clientX,pointer.y-e.clientY)<10){onTarget(e.clientX-canvas.getBoundingClientRect().left+offset());canvas.focus();}pointer=null;};
    canvas.onpointercancel=()=>{pointer=null;};
    room.onkeydown=e=>{if(['INPUT','TEXTAREA'].includes(e.target.tagName))return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!detail.hidden)hideDetail();else onClose();return;}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();onDirection(e.key==='ArrowLeft'?-1:1);}};
    room.onkeyup=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();onDirection(0);}};
    room.addEventListener('focusout',e=>{if(!room.contains(e.relatedTarget))onDirection(0);});
    function hideDetail(){detail.hidden=true;readStation=null;canvas.focus();}
    function showDetail(label,children){onDirection(0);detail.replaceChildren();const h=el('header');h.append(el('h3','',label),createCloseButton(hideDetail,'关闭时光详情'));detail.append(h,...children);detail.hidden=false;detail.querySelector('button')?.focus();}
    function showCollection(){readStation=null;const found=timeDiscoveries(getSave(),city.id);showDetail(`${city.name} · 发现记录`,data.stations.filter(s=>s.clue).map(s=>{const done=found.includes(timeDiscoveryKey(data,s));const row=el('article');row.append(el('h4','',`${s.label} · ${done?s.clue.name:'尚未发现'}`),el('p','',done?s.clue.text['zh-CN']:'沿着时光道路，寻找这一站的线索。'));if(done)row.append(el('p','time-scroll-english',s.clue.text.en));return row;}));}
    function showBuff(){readStation=null;showDetail('今日语言加成',[el('p','time-scroll-buffs',dailyBuffDescription(getSave())),el('p','','有效口语沿用全局每日加成。阅读、发现线索和文字回答不增加口语加成；时光探索不发放货币。')]);}
    function reading(station,kind='talk'){
        const text=kind==='clue'?station.clue.text:station.reading;
        const children=[el('p','',text['zh-CN']),el('p','time-scroll-english',text.en)];
        if(kind==='talk')children.push(button('练习双语对话',()=>onPractice(station),'primary'));
        showDetail(kind==='clue'?`已发现 · ${station.clue.name}`:`${station.traveler.name} · 虚构人物`,children);readStation=station;
    }
    function draw(x,time,moving,facing){
        if(closed)return;position=x;const index=timeStationIndex(data,x),save=getSave(),y=floor(),camera=offset();
        if(lastIndex!==index){lastIndex=index;status.textContent=data.stations[index].label;ticks.forEach((b,i)=>b.setAttribute('aria-current',i===index?'step':'false'));}
        left.disabled=x<=0;right.disabled=x>=timeScrollEnd(data);
        ctx.clearRect(0,0,width,height);
        const gradient=ctx.createLinearGradient(0,0,0,height);gradient.addColorStop(0,'#cfdee0');gradient.addColorStop(1,'#faf0d7');ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
        ctx.fillStyle='#8ba794';ctx.beginPath();ctx.moveTo(0,y);for(let sx=0;sx<=width+20;sx+=20)ctx.lineTo(sx,y-68+Math.sin((sx+camera*.22)/170)*18);ctx.lineTo(width,height);ctx.lineTo(0,height);ctx.fill();
        ctx.fillStyle='#e1cba0';ctx.fillRect(0,y-5,width,55);ctx.fillStyle='#788d70';ctx.fillRect(0,y+50,width,height-y);
        ctx.strokeStyle='#b19670';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,y+18);ctx.lineTo(width,y+18);ctx.stroke();
        const nearby=visibleTimeStations(data,x),visible=new Set(nearby.map(s=>s.index));
        scenery.prepare(x);scenery.draw(ctx,'back',camera,y,width);
        for(const [key,b]of targetButtons){const [i,kind]=key.split(':'),station=data.stations[Number(i)],wx=Number(i)*data.spacing+(kind==='talk'?-100:160),sx=wx-camera;b.hidden=!visible.has(Number(i))||sx<0||sx>width;b.style.left=`${Math.max(70,Math.min(width-70,sx))}px`;b.style.top=`${y+(kind==='talk'?-126:-75)}px`;if(kind==='clue'){const found=timeDiscoveries(save,city.id).includes(timeDiscoveryKey(data,station));b.textContent=found?`已发现 · ${station.clue.name}`:station.clue.name;}}
        for(const station of nearby){
            const sx=station.x-camera;ctx.fillStyle='#8b765c';ctx.fillRect(sx-2,y-154,4,154);ctx.fillStyle='#fff8e6';ctx.fillRect(sx-50,y-184,100,32);ctx.fillStyle='#3d4c40';ctx.font='15px sans-serif';ctx.textAlign='center';ctx.fillText(station.label,sx,y-163);
            if(station.traveler){const npc={appearance:station.traveler.appearance,facing:1};assets.hero.drawSave(ctx,npc,sx-100,y,time,false,.85,{mounted:false,reducedMotion:reduced.matches});ctx.fillStyle='#f3d66a';ctx.fillRect(sx+148,y-32,24,28);ctx.strokeStyle='#795f35';ctx.strokeRect(sx+148,y-32,24,28);ctx.beginPath();ctx.moveTo(sx+152,y-24);ctx.lineTo(sx+168,y-24);ctx.moveTo(sx+152,y-16);ctx.lineTo(sx+164,y-16);ctx.stroke();}
        }
        assets.hero.drawSave(ctx,{...save,facing},width*.42,y,time,moving,.95,{mounted:false,reducedMotion:reduced.matches});
        scenery.draw(ctx,'front',camera,y,width);
        if(index===data.stations.length-1){ctx.fillStyle='#364d49';ctx.textAlign='center';ctx.font='16px sans-serif';ctx.fillText('向左走，遇见时光旅人',width*.5,40);}
    }
    canvas.focus();
    return {draw,reading,message(text){hint.textContent=text;},get blocked(){return !detail.hidden;},hideDetail,close(){closed=true;scenery.close();observer.disconnect();onDirection(0);room.remove();if(previousFocus?.isConnected)previousFocus.focus();},get activeStation(){return readStation;}};
}
