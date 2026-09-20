import {loadResources} from '../../js/adventure_assets.js';
import {createAdventure,applyAction,syncProgression} from '../../js/adventure_core.js';
import {createWorld,findPath,followPath,nearestInteraction,movePosition} from '../../js/adventure_world_core.js';
import {regionAt} from '../../js/adventure_island_layout_core.js';
import {createRenderer} from '../../js/adventure_renderer.js';
import {renderHud} from '../../js/view_adventure.js';
import {renderMaps} from '../../js/view_adventure_maps.js';

// An isolated in-memory scene viewer. No role, local-storage or cloud writes.
const $=id=>document.getElementById(id),status=$('preview-status');
try{
    const assets=await loadResources(),save=createAdventure(assets.content,{name:'探索者'});
    save.xp=assets.content.progression.xpThresholds[49];syncProgression(save,assets.content);
    const canvas=$('world'),renderer=createRenderer(canvas,assets),overlay=$('overlay');
    let world,path=[],last=0,destination=null,weatherTime=0,lastStatus=performance.now(),frameCount=0;
    const keys=new Set(),scene=$('scene-select'),regions=$('region-select');
    const option=(value,label)=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o;};
    for(const [id,row] of Object.entries(assets.content.worldMapIndex.islands))scene.append(option(id,row.name));
    const close=()=>{overlay.replaceChildren();overlay.className='overlay';keys.clear();};
    function go(p){path=[];destination=null;keys.clear();save.position={x:p.x,y:p.y};}
    function chooseScene(zone){
        applyAction(save,assets.content,{type:'travel',zone});world=createWorld(zone,assets.content);scene.value=zone;
        close();go(save.position);regions.replaceChildren(option('arrival','旅行入口'));
        for(const p of world.landmarks)regions.append(option(p.id,p.name));
        const url=new URL(location.href);url.searchParams.set('island',zone);history.replaceState(null,'',url);
        scene.disabled=regions.disabled=false;paintHud();
    }
    function openMap(view='local'){
        path=[];destination=null;keys.clear();
        renderMaps(overlay,world,{assets,save},{close,track:close,travel:chooseScene,
            draw:(c,options)=>renderer.minimap(c,world,save,options),switchMap:openMap,
            teleport:id=>{const p=world.landmarks.find(mark=>mark.id===id);if(p){close();go(p);}}},view);
    }
    function interact(){const n=nearestInteraction(world,save.position);if(n?.kind==='portal'||n?.id===36205)openMap('world');}
    function paintHud(){renderHud($('hud'),{assets,save,now:Date.now()},{panel:name=>['map','worldmap','localmap'].includes(name)&&openMap(name==='worldmap'?'world':'local'),membership(){},cloud(){},track(){},interact});}
    scene.onchange=()=>chooseScene(scene.value);
    regions.onchange=()=>go(regions.value==='arrival'?world.layout.spawn:world.landmarks.find(r=>r.id===regions.value));
    $('arrival').onclick=()=>{regions.value='arrival';go(world.layout.spawn);};
    $('preview-map').onclick=()=>openMap();$('show-hud').onchange=e=>$('hud').hidden=!e.target.checked;
    $('zoom-in').onclick=()=>renderer.zoomBy(1.15);$('zoom-out').onclick=()=>renderer.zoomBy(1/1.15);
    canvas.onclick=e=>{
        const r=canvas.getBoundingClientRect(),p=renderer.screenToWorld(e.clientX-r.left,e.clientY-r.top);
        destination=[world.portal,...world.npcs.filter(n=>n.id===36205)].find(n=>Math.abs(n.x-p.x)<48&&p.y>n.y-100&&p.y<n.y+35)||null;
        path=findPath(world,save.position,destination||p);canvas.focus();
    };
    window.addEventListener('keydown',e=>{
        if(/INPUT|SELECT|BUTTON/.test(e.target.tagName))return;
        const key=e.key.toLowerCase();
        if(key==='escape'){close();return;}
        if(overlay.classList.contains('visible'))return;
        if(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright'].includes(key)){e.preventDefault();keys.add(key);path=[];destination=null;}
    });
    window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());
    const requested=new URLSearchParams(location.search).get('island');chooseScene(assets.content.worldMapIndex.islands[requested]?requested:'town');
    function frame(t){
        const dt=Math.min(.055,(t-last)/1000||0);last=t;
        if(!overlay.classList.contains('visible')){
            const dx=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
            const dy=Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup'));
            if(dx||dy){const k=210*dt/Math.hypot(dx,dy);save.position=movePosition(world,save.position,dx*k,dy*k);}
            else{const result=followPath(world,save.position,path,210*dt);save.position=result.position;path=result.path;}
            if(destination&&Math.hypot(save.position.x-destination.x,save.position.y-destination.y)<82)openMap('world');
        }
        if(!$('pause-weather').checked)weatherTime+=dt*1000;
        const kind=$('weather-select').value;
        const weather=kind==='auto'?null:kind==='none'?{kind:'none'}:Object.values(world.layout.rules.biomes).find(b=>b.weather.kind===kind)?.weather;
        renderer.render(world,save,t,{moving:!!path.length||keys.size>0,path,weatherOverride:weather,weatherTime});
        frameCount++;
        if(t-lastStatus>700){status.textContent=`${world.layout.name} · ${regionAt(world,save.position)?.name||''} · ${world.w}×${world.h} · ${Math.round(frameCount*1000/(t-lastStatus))} 帧/秒 · ${assets.environmentArt?'新场景素材已加载':'基础素材'} · 点击地面或方向键行走，不读写存档`;lastStatus=t;frameCount=0;}
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    window.explorationQA={get world(){return world;},save,renderer,canvas,assets,guide:()=>openMap(),openMap,chooseScene,nearestInteraction,go,ready:true};
}catch(error){status.textContent='场景加载失败：'+error.message;console.error(error);}
