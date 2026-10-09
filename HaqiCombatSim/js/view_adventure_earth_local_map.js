import {createCloseButton,createWorldMapSwitch} from './view_adventure_controls.js';
import {earthLocalMapBounds} from './adventure_earth_core.js';
import {layoutEarthMapLabels} from './earth_map_labels_core.js';
import {setText,tr} from './locale_runtime.js';

// The same loaded neighbourhood supplies terrain, roads and city nodes.
export function renderEarthLocalMap(root,world,save,cb){
    const el=(tag,className)=>{const node=document.createElement(tag);node.className=className;return node;};
    root.replaceChildren();root.className='overlay visible';
    const modal=el('section','modal earth-modal atlas-map-modal'),header=el('header','modal-header'),heading=el('div','map-heading'),body=el('div','modal-body');
    modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',world.layout.name);
    heading.append(createWorldMapSwitch('earth',cb.switchWorld));header.append(heading,createCloseButton(cb.close));
    const map=el('div','earth-map-stage earth-local-map'),canvas=el('canvas','earth-atlas'),name=el('h2','island-map-name');
    canvas.width=560;canvas.height=560;canvas.tabIndex=0;canvas.setAttribute('aria-label',tr('当前城市周边地图，可拖动或使用方向键浏览'));setText(name,world.layout.name);
    const ns='http://www.w3.org/2000/svg',lines=document.createElementNS(ns,'svg'),cityLayer=el('div','earth-local-cities'),locate=el('button','earth-local-locate'),status=el('button','earth-local-status');
    lines.setAttribute('class','earth-local-connectors');lines.setAttribute('aria-hidden','true');
    locate.type=status.type='button';setText(locate,'定位');locate.title=tr('回到当前角色位置');locate.setAttribute('aria-label',tr('定位到当前角色位置'));status.hidden=true;
    map.append(canvas,lines,cityLayer,name,status,locate);
    const bounds=earthLocalMapBounds(save.position,world.earthRules);
    let nodes=[],drag=null,suppressClick=false,mapData=null,disposed=false,revision=0,timer=null,travelBusy=false;
    function installCities(cities){
        cityLayer.replaceChildren();nodes=[];
        for(const city of cities){
            const node=el('button','earth-local-city'),dot=el('button','earth-local-dot');node.type=dot.type='button';setText(node,city.name);dot.title=city.name;dot.setAttribute('aria-label',city.name);
            node.onclick=dot.onclick=e=>{if(!suppressClick||e.detail===0)cb.travel(city);};cityLayer.append(dot,node);nodes.push({city,node,dot});
        }
    }
    installCities(world.mapCities||[]);
    function draw(){
        if(disposed)return;
        const rect=canvas.getBoundingClientRect(),width=rect.width||560,height=rect.height||560,points=[];lines.replaceChildren();lines.setAttribute('viewBox',`0 0 ${width} ${height}`);
        for(const [i,{city,node,dot}] of nodes.entries()){
            const x=(city.x-bounds.x)/bounds.w,y=(city.y-bounds.y)/bounds.h,visible=x>=0&&y>=0&&x<=1&&y<=1;
            node.hidden=dot.hidden=!visible;dot.style.left=`${x*100}%`;dot.style.top=`${y*100}%`;
            if(visible){const size=node.getBoundingClientRect();points.push({id:city.id||String(i),index:i,x:x*width,y:y*height,w:Math.min(width-16,size.width||100),h:size.height||30});}
        }
        const reserved=[{x:0,y:0,w:Math.min(260,width),h:52},{x:width-80,y:height-60,w:80,h:60}];
        for(const item of layoutEarthMapLabels(points,width,height,reserved)){
            const {node}=nodes[item.index];node.hidden=!item.box;if(!item.box)continue;
            node.style.left=`${item.box.x}px`;node.style.top=`${item.box.y}px`;
            const line=document.createElementNS(ns,'line');line.setAttribute('x1',item.x);line.setAttribute('y1',item.y);line.setAttribute('x2',Math.max(item.box.x,Math.min(item.box.x+item.box.w,item.x)));line.setAttribute('y2',Math.max(item.box.y,Math.min(item.box.y+item.box.h,item.y)));lines.append(line);
        }
        cb.draw(canvas,{bounds:{...bounds},simple:true,mapData});
    }
    function showStatus(text){status.hidden=!text;setText(status,text||'');}
    async function refresh(ticket=++revision){
        if(!cb.viewport||disposed)return;
        if(!travelBusy)showStatus('正在加载地图…');
        try{const result=await cb.viewport({...bounds});if(disposed||ticket!==revision)return;mapData=result;installCities(result.cities||[]);draw();if(!travelBusy)showStatus(result.error?'地图加载不完整，点击重试':'');}
        catch{if(!disposed&&ticket===revision&&!travelBusy)showStatus('地图加载失败，点击重试');}
    }
    function queueRefresh(){revision++;if(cb.viewport&&timer===null)timer=setTimeout(()=>{timer=null;void refresh(revision);},120);}
    status.onclick=()=>void refresh();
    locate.onclick=()=>{suppressClick=false;Object.assign(bounds,earthLocalMapBounds(save.position,world.earthRules));draw();queueRefresh();};
    map.onpointerdown=e=>{
        if(e.button!==0||drag||e.target===locate||e.target===status)return;
        suppressClick=false;drag={id:e.pointerId,x:e.clientX,y:e.clientY,bounds:{...bounds},moved:false};
        e.target.setPointerCapture(e.pointerId);
    };
    map.onpointermove=e=>{
        if(!drag||e.pointerId!==drag.id)return;
        const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
        if(!drag.moved&&Math.hypot(dx,dy)<6)return;
        drag.moved=true;suppressClick=true;map.classList.add('dragging');
        const rect=canvas.getBoundingClientRect();
        bounds.x=drag.bounds.x-dx/rect.width*bounds.w;bounds.y=drag.bounds.y-dy/rect.height*bounds.h;draw();queueRefresh();
    };
    const endDrag=e=>{if(!drag||e.pointerId!==drag.id)return;const moved=drag.moved;drag=null;map.classList.remove('dragging');if(moved&&cb.viewport){clearTimeout(timer);timer=null;void refresh(++revision);}};
    map.onpointerup=endDrag;map.onpointercancel=endDrag;map.onlostpointercapture=endDrag;
    canvas.onkeydown=e=>{
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
        e.preventDefault();bounds.x+=(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0)*bounds.w/8;bounds.y+=(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0)*bounds.h/8;draw();queueRefresh();
    };
    body.append(map);modal.append(header,body);root.append(modal);draw();void refresh();header.querySelector('.close-button').focus();
    return {dispose(){disposed=true;revision++;clearTimeout(timer);},busy(text){travelBusy=true;showStatus(text);},error(text){travelBusy=false;showStatus(text);}};
}
