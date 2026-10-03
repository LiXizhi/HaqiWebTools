import {createCloseButton,createWorldMapSwitch} from './view_adventure_controls.js';
import {earthRules,wrapLongitude} from './adventure_earth_core.js';
import {layoutEarthAtlasMarkers,layoutEarthAtlasNames,pickEarthAtlasMarker} from './earth_atlas_layout_core.js';
const el=(tag,text,className)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(className)e.className=className;return e;};
function shell(root,title,close,switchWorld){root.replaceChildren();root.className='overlay visible';const modal=el('section',null,'modal earth-modal atlas-map-modal'),header=el('header',null,'modal-header'),body=el('div',null,'modal-body');modal.setAttribute('role','dialog');modal.setAttribute('aria-label',title);const heading=el('div',null,'map-heading');if(!switchWorld)heading.append(el('h2',title));if(switchWorld)heading.append(createWorldMapSwitch('earth',switchWorld));header.append(heading,createCloseButton(close));modal.append(header,body);root.append(modal);return body;}
function button(text,fn){const b=el('button',text,'secondary');b.type='button';b.onclick=fn;return b;}
export function renderEarthAtlas(root,model,cb){
    const body=shell(root,'现实世界地图',cb.close,cb.switchWorld),map=el('div',null,'earth-map-stage'),bar=el('div',null,'earth-map-zoom'),status=el('p',null,'earth-map-status'),canvas=el('canvas',null,'earth-atlas');canvas.width=900;canvas.height=470;canvas.tabIndex=0;canvas.setAttribute('aria-label','地球地图，点击地点查看并传送，使用方向键移动，加减号缩放');canvas.title=model.geography?.attribution||'';
    const popup=el('div',null,'earth-map-place'),detail=el('strong',''),enter=button('传送过去',()=>selected&&cb.travel(selected));enter.className='primary';enter.disabled=true;popup.hidden=true;popup.append(detail,enter);status.hidden=true;status.setAttribute('role','status');
    if(cb.localMap)root.querySelector('.map-heading').prepend(button('返回当前城市地图',cb.localMap));
    let center=model.current||{lon:114.0579,lat:22.5431},span=model.focus?1:360,selected=model.focus||null,layers=[],cities=[],disposed=false,drag=null,revision=0;
    const c=canvas.getContext('2d'),height=()=>Math.min(180,span*canvas.height/canvas.width);
    c.imageSmoothingEnabled=false;
    const rules={...earthRules(),...model.rules},pickRadius=rules.mapCityPickRadius;
    let markers=[];
    function constrainLatitude(lat){const bounds=model.geography?.overview.bounds||{south:-60,north:85},half=height()/2;return height()>=bounds.north-bounds.south?(bounds.north+bounds.south)/2:Math.max(bounds.south+half,Math.min(bounds.north-half,lat));}
    center={...center,lat:constrainLatitude(center.lat)};
    const point=(lon,lat)=>({x:(wrapLongitude(lon-center.lon)/span+.5)*canvas.width,y:(.5-(lat-center.lat)/height())*canvas.height});
    function draw(){if(disposed)return;c.fillStyle=model.geography?.overview.ocean||'#798780';c.fillRect(0,0,canvas.width,canvas.height);
        const overview=model.overview,b=model.geography?.overview.bounds;
        if(overview?.image?.width&&b)for(const turn of [-360,0,360]){const west=(b.west-center.lon+turn)/span*canvas.width+canvas.width/2,top=(.5-(b.north-center.lat)/height())*canvas.height;c.drawImage(overview.image,west,top,(b.east-b.west)/span*canvas.width,(b.north-b.south)/height()*canvas.height);}
        // Keep country colors/borders visible at every zoom; terrain tiles remain for city maps and travel safety.
        if(model.geography?.overview.style!=='political')for(const tile of layers){const west=point(tile.west,tile.north);if(tile.image?.width)c.drawImage(tile.image,west.x,west.y,2/span*canvas.width,2/height()*canvas.height);}
        c.strokeStyle='#ffffff22';c.lineWidth=1;for(let i=1;i<6;i++){c.beginPath();c.moveTo(i*150,0);c.lineTo(i*150,470);c.stroke();}
        const rect=canvas.getBoundingClientRect(),width=rect.width||900,screenHeight=rect.height||470,sx=900/width,sy=470/screenHeight;
        c.font=`${13*sy}px sans-serif`;
        markers=layoutEarthAtlasNames(layoutEarthAtlasMarkers([...(model.index?.hotspots||[]),...cities],{width,height:screenHeight,center,span,latSpan:height()},rules,model.index?.regions,selected),width,screenHeight,name=>(c.measureText(name)?.width||name.length*13*sx)/sx,[{x:width-120,y:0,w:120,h:60}]);
        for(const p of markers){c.fillStyle=p.story?'#efbd4b':'#fff3d6';c.beginPath();c.ellipse(p.x*sx,p.y*sy,p.radius*sx,p.radius*sy,0,0,Math.PI*2);c.fill();c.strokeStyle='#5c4524';c.lineWidth=1.5*Math.min(sx,sy);c.stroke();
            if(p.label){const x=(p.label.x+4)*sx,y=(p.label.y+15)*sy;c.strokeStyle='#fff3d6';c.lineWidth=3*sy;c.strokeText(p.city.name,x,y);c.fillStyle='#152c28';c.fillText(p.city.name,x,y);}}
        if(selected){const p=point(selected.lon,selected.lat);c.beginPath();c.ellipse(p.x,p.y,12*sx,12*sy,0,0,Math.PI*2);c.strokeStyle='#5c4524';c.lineWidth=5*Math.min(sx,sy);c.stroke();c.strokeStyle='#fff';c.lineWidth=3*Math.min(sx,sy);c.stroke();popup.hidden=p.x<0||p.y<0||p.x>900||p.y>470;popup.style.left=`${Math.max(22,Math.min(78,p.x/900*100))}%`;popup.style.top=`${Math.max(5,Math.min(95,p.y/470*100))}%`;popup.style.transform=p.y<235?'translate(-50%,18px)':'translate(-50%,calc(-100% - 18px))';}
    }
    function showStatus(text){status.textContent=text;status.hidden=!text;}
    async function refresh(){const ticket=++revision;draw();showStatus('正在读取当前视野…');try{const result=await cb.viewport({center,span,height:height(),atlasOnly:true});if(disposed||ticket!==revision)return;layers=result.tiles||[];cities=result.cities||[];showStatus(result.error||'');draw();}catch(e){if(!disposed&&ticket===revision)showStatus(e.message);}}
    function zoom(f){span=Math.max(.1,Math.min(360,span*f));center={...center,lat:constrainLatitude(center.lat)};void refresh();}
    function choose(p,name=p.name||'目标地点'){selected=p;detail.textContent=name;enter.disabled=false;draw();}
    for(const [text,label,factor] of [['+','放大',.5],['−','缩小',2]]){const control=el('button',text,'earth-map-zoom-button');control.type='button';control.title=label;control.setAttribute('aria-label',label);control.onclick=()=>zoom(factor);bar.append(control);}
    status.onclick=()=>void refresh();status.title='点击重试';status.tabIndex=0;status.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();void refresh();}};
    canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,center:{...center},moved:false};};
    canvas.onpointermove=e=>{const r=canvas.getBoundingClientRect();if(!drag){canvas.style.cursor=pickEarthAtlasMarker(markers,e.clientX-r.left,e.clientY-r.top,pickRadius)?'pointer':'grab';return;}const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!drag.moved&&Math.hypot(dx,dy)<rules.mapDragThreshold)return;drag.moved=true;canvas.style.cursor='grabbing';center={lon:wrapLongitude(drag.center.lon-dx/r.width*span),lat:constrainLatitude(drag.center.lat+dy/r.height*height())};draw();};
    canvas.onpointerup=e=>{if(!drag)return;const moved=drag.moved;drag=null;canvas.style.cursor='grab';if(moved){void refresh();return;}const r=canvas.getBoundingClientRect();
        const nearest=pickEarthAtlasMarker(markers,e.clientX-r.left,e.clientY-r.top,pickRadius);
        if(nearest){showStatus('');choose(nearest);}else{selected=null;popup.hidden=true;enter.disabled=true;showStatus('附近没有可选择的城市，请点击城市附近。');draw();}
    };
    canvas.onpointercancel=()=>{drag=null;};canvas.onwheel=e=>{e.preventDefault();zoom(e.deltaY<0?.7:1.4);};
    canvas.onkeydown=e=>{if(['+','=','-'].includes(e.key)){e.preventDefault();zoom(e.key==='-'?2:.5);}else if(e.key.startsWith('Arrow')){e.preventDefault();center={lon:wrapLongitude(center.lon+(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0)*span/8),lat:constrainLatitude(center.lat+(e.key==='ArrowUp'?1:e.key==='ArrowDown'?-1:0)*height()/8)};void refresh();}};
    map.append(canvas,bar,popup,status);body.append(map);if(model.focus)choose(model.focus,model.focus.name);draw();void refresh();
    const resize=typeof ResizeObserver==='function'?new ResizeObserver(draw):null;resize?.observe(canvas);
    return {dispose(){disposed=true;revision++;resize?.disconnect();},busy(text){showStatus(text);enter.disabled=true;},error(text){showStatus(text);enter.disabled=!selected;}};
}
export function renderEarthLoading(root,{close,retry,switchWorld,localMap,message='正在加载当前地图…'}){const body=shell(root,'现实世界',close,switchWorld);if(localMap)root.querySelector('.map-heading').prepend(button('返回当前城市地图',localMap));body.append(el('p',message));if(retry)body.append(button('重试',retry));}
export function renderEarthStory(root,{assets,city,npc,story,quests,progress,learning,questOffers=[]},{close,choose,advance,practice,go,quest,service,chat}){
    root.replaceChildren();root.className='overlay dialogue-layer rpg-dialogue-layer visible';
    const box=el('section',null,'dialogue-box rpg-dialogue');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',`与${npc.name}交谈`);
    const portrait=el('canvas',null,'art dialogue-portrait');portrait.width=150;portrait.height=190;
    if(assets&&npc.portrait)assets.draw(portrait.getContext('2d'),npc.portrait,0,0,150,190);
    const body=el('div',null,'dialogue-content');body.append(el('p',city?.name||'现实世界','eyebrow'),el('h2',npc.name),el('p',npc.role,'muted'),el('p',story.text,'dialogue-text'));
    const languageNames={'zh-CN':'普通话',en:'英语',yue:'粤语',hak:'客家话'};
    if(npc.languages)body.append(el('p',`常用语言：${npc.languages.map(code=>languageNames[code]||code).join('、')}`,'muted'));
    const step=quests.steps[progress?.step||0];body.append(el('p',step?`当前目标：${step.name}`:'本章完成。继续与伙伴探索世界吧。','muted'));
    const choices=el('div',null,'dialogue-choices');
    for(const offer of questOffers){const label=offer.kind==='accept'?`接取任务 · ${offer.quest.title}`:offer.kind==='complete'?`完成任务 · ${offer.quest.title}`:offer.objective.label;const b=button(label,()=>quest?.(offer));b.className='primary';choices.append(b);}
    if(story.event===step?.event)for(const choice of story.choices||[])choices.append(button(choice.text,()=>choose(choice)));
    if(!story.choices&&story.event===step?.event){const b=button('继续这段经历',advance);b.className='primary';choices.append(b);}
    for(const kind of npc.services||[])if(service)choices.append(button({map:'查看城市地图',inventory:'查看我的背包',pet:'照顾我的宠物'}[kind],()=>service(kind)));
    if(chat)choices.append(button('自由交谈',chat));
    if(go)choices.append(button('在地图上查看下一站',go));
    if(practice&&learning.prompts.length)choices.append(button('一起练习表达',practice));
    choices.append(button('下次再聊',close));body.append(choices);box.append(portrait,body,createCloseButton(close));root.append(box);
}
