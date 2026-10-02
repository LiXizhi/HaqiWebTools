import {createCloseButton,createWorldMapSwitch} from './view_adventure_controls.js';
import {earthGeo,wrapLongitude} from './adventure_earth_core.js';
const el=(tag,text,className)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(className)e.className=className;return e;};
function shell(root,title,close,switchWorld){root.replaceChildren();root.className='overlay visible';const modal=el('section',null,'modal earth-modal'),header=el('header',null,'modal-header'),body=el('div',null,'modal-body');modal.setAttribute('role','dialog');modal.setAttribute('aria-label',title);const heading=el('div',null,'map-heading');heading.append(el('h2',title));if(switchWorld)heading.append(createWorldMapSwitch('earth',switchWorld));header.append(heading,createCloseButton(close));modal.append(header,body);root.append(modal);return body;}
function button(text,fn){const b=el('button',text,'secondary');b.type='button';b.onclick=fn;return b;}
export function renderEarthAtlas(root,model,cb){
    const body=shell(root,'现实世界地图',cb.close,cb.switchWorld),bar=el('div',null,'earth-map-tools'),status=el('p','拖动浏览，滚轮或按钮缩放。点击陆地选择目的地。'),canvas=el('canvas',null,'earth-atlas');canvas.width=900;canvas.height=470;canvas.tabIndex=0;canvas.setAttribute('aria-label','地球地图，使用方向键移动，加减号缩放');
    const detail=el('p',''),enter=button('传送到选中地点',()=>selected&&cb.travel(selected));enter.disabled=true;
    let center=model.current||{lon:114.0579,lat:22.5431},span=model.focus?1:360,selected=model.focus||null,layers=[],cities=[],disposed=false,drag=null,revision=0;
    const c=canvas.getContext('2d'),height=()=>Math.min(180,span*canvas.height/canvas.width);
    const point=(lon,lat)=>({x:(wrapLongitude(lon-center.lon)/span+.5)*canvas.width,y:(.5-(lat-center.lat)/height())*canvas.height});
    const geo=(x,y)=>({lon:wrapLongitude(center.lon+(x/canvas.width-.5)*span),lat:Math.max(-89.99,Math.min(89.99,center.lat+(.5-y/canvas.height)*height()))});
    function draw(){if(disposed)return;c.fillStyle='#798780';c.fillRect(0,0,canvas.width,canvas.height);
        const overview=model.overview,b=model.geography?.overview.bounds;
        if(overview?.image?.width&&b)for(const turn of [-360,0,360]){const west=(b.west-center.lon+turn)/span*canvas.width+canvas.width/2,top=(.5-(b.north-center.lat)/height())*canvas.height;c.drawImage(overview.image,west,top,(b.east-b.west)/span*canvas.width,(b.north-b.south)/height()*canvas.height);}
        for(const tile of layers){const west=point(tile.west,tile.north);if(tile.image?.width)c.drawImage(tile.image,west.x,west.y,2/span*canvas.width,2/height()*canvas.height);}
        c.strokeStyle='#ffffff22';c.lineWidth=1;for(let i=1;i<6;i++){c.beginPath();c.moveTo(i*150,0);c.lineTo(i*150,470);c.stroke();}
        const labels=[...(model.index?.hotspots||[]),...cities];for(const city of labels){const p=point(city.lon,city.lat);if(p.x<0||p.y<0||p.x>900||p.y>470)continue;c.fillStyle=city.id==='shenzhen'?'#ffe6a1':'#fff3d6';c.beginPath();c.arc(p.x,p.y,city.id==='shenzhen'?7:3,0,Math.PI*2);c.fill();if(city.id==='shenzhen'||span<10){c.font='14px sans-serif';c.fillStyle='#152c28';c.fillText(city.name,p.x+9,p.y+5);}}
        if(selected){const p=point(selected.lon,selected.lat);c.strokeStyle='#fff';c.lineWidth=3;c.beginPath();c.arc(p.x,p.y,12,0,Math.PI*2);c.stroke();}
    }
    async function refresh(){const ticket=++revision;draw();status.textContent='正在读取当前视野…';try{const result=await cb.viewport({center,span,height:height()});if(disposed||ticket!==revision)return;layers=result.tiles||[];cities=result.cities||[];status.textContent=result.error||'点击陆地选择目的地；海洋可通过地图跨越。';draw();}catch(e){if(!disposed&&ticket===revision)status.textContent=e.message;}}
    function zoom(f){span=Math.max(.1,Math.min(360,span*f));void refresh();}
    function choose(p,name='选中的陆地'){selected=p;detail.textContent=`${name} · ${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`;enter.disabled=false;draw();}
    bar.append(button('放大',()=>zoom(.5)),button('缩小',()=>zoom(2)),button('深圳',()=>{center={lon:114.0579,lat:22.5431};span=1;choose(center,'深圳');void refresh();}),button('重试',()=>void refresh()));
    const coords=el('form',null,'earth-map-tools'),lon=el('input'),lat=el('input');lon.type=lat.type='number';lon.step=lat.step='any';lon.value=String(center.lon);lat.value=String(center.lat);lon.setAttribute('aria-label','经度');lat.setAttribute('aria-label','纬度');const locate=el('button','定位');locate.type='submit';coords.append(lon,lat,locate);coords.onsubmit=e=>{e.preventDefault();const x=Number(lon.value),y=Number(lat.value);if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(y)>90){status.textContent='请输入有效经纬度';return;}center={lon:wrapLongitude(x),lat:y};span=1;choose(center);void refresh();};
    canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,center:{...center},moved:false};};
    canvas.onpointermove=e=>{if(!drag)return;const r=canvas.getBoundingClientRect(),dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved ||=Math.abs(dx)+Math.abs(dy)>5;center={lon:wrapLongitude(drag.center.lon-dx/r.width*span),lat:Math.max(-89,Math.min(89,drag.center.lat+dy/r.height*height()))};draw();};
    canvas.onpointerup=e=>{if(!drag)return;const moved=drag.moved;drag=null;if(moved){void refresh();return;}const r=canvas.getBoundingClientRect(),p=geo((e.clientX-r.left)/r.width*900,(e.clientY-r.top)/r.height*470);const hotspot=[...(model.index?.hotspots||[]),...cities].find(h=>Math.hypot(wrapLongitude(h.lon-p.lon)/span*900,(h.lat-p.lat)/height()*470)<18);choose(hotspot||p,hotspot?.name);};
    canvas.onpointercancel=()=>{drag=null;};canvas.onwheel=e=>{e.preventDefault();zoom(e.deltaY<0?.7:1.4);};
    canvas.onkeydown=e=>{if(['+','=','-'].includes(e.key)){e.preventDefault();zoom(e.key==='-'?2:.5);}else if(e.key.startsWith('Arrow')){e.preventDefault();center={lon:wrapLongitude(center.lon+(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0)*span/8),lat:Math.max(-89,Math.min(89,center.lat+(e.key==='ArrowUp'?1:e.key==='ArrowDown'?-1:0)*height()/8))};void refresh();}};
    body.append(bar,canvas,status,coords,detail,enter,el('small',model.geography?.attribution||''));if(model.focus)choose(model.focus,model.focus.name);draw();void refresh();
    return {dispose(){disposed=true;revision++;},busy(text){status.textContent=text;enter.disabled=true;},error(text){status.textContent=text;enter.disabled=!selected;}};
}
export function renderEarthLoading(root,{close,retry,switchWorld,message='正在加载当前地图…'}){const body=shell(root,'现实世界',close,switchWorld);body.append(el('p',message));if(retry)body.append(button('重试',retry));}
export function renderEarthStory(root,{npc,story,quests,progress,learning},{close,choose,advance,practice,go}){
    const body=shell(root,npc.name,close);body.append(el('p',npc.role),el('p',story.text,'earth-story-text'));
    const step=quests.steps[progress?.step||0];body.append(el('p',step?`当前目标：${step.name}`:'本章完成。继续与伙伴探索世界吧。'));
    for(const choice of story.choices||[])body.append(button(choice.text,()=>choose(choice)));
    if(!story.choices)body.append(button(story.event?'记住这段经历':'明白了',advance));
    if(go)body.append(button('在地图上查看下一站',go));
    const details=el('details'),summary=el('summary','可选：一起练习表达');details.append(summary);for(const row of learning.prompts)details.append(button(`${row.zh} / ${row.en}`,()=>practice(row)));body.append(details);
}
