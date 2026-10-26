import {loadHaqiAtlas} from './haqi_atlas_data.js';
import {assetUrl} from './adventure_media_core.js';
import {ISLANDS,travelStatus} from './adventure_world_map_core.js';
import {createCloseButton,createWorldMapSwitch} from './view_adventure_controls.js';
import {setText,tr,fill} from './locale_runtime.js';
import {atlasStripLimits,constrainAtlasStrip,atlasBounds,fitAtlas,atlasPoint,atlasInverse,zoomAtlas,islandAtlasPoint,islandLocalPoint,islandDetailOpacity,pickAtlasIsland,pickAtlasPortal,atlasCoastContains,atlasOceanTiles,atlasSeaDecorations,atlasPortalSize} from './haqi_atlas_core.js';

const el=(tag,className='',text)=>{const node=document.createElement(tag);node.className=className;if(text)setText(node,text);return node;};
const button=(text,callback,className='secondary')=>{const node=el('button',className,text);node.type='button';node.onclick=callback;return node;};
export function renderHaqiAtlas(root,world,{save,assets,socialActors=[],mapArt,focusPortal},cb,initial='world'){
    root.replaceChildren();root.className='overlay visible';
    const modal=el('section','modal atlas-map-modal compact-map-modal haqi-atlas-modal'),header=el('header','modal-header'),heading=el('div','map-heading'),body=el('div','modal-body');
    modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',tr('哈奇世界地图'));
    const locate=button(world.isEarth?'返回当前城市地图':'返回当前岛屿地图',()=>world.isEarth?cb.switchMap('local'):locateCurrent(),'secondary map-view-toggle');
    heading.append(locate);if(cb.switchWorld)heading.append(createWorldMapSwitch('haqi',cb.switchWorld));header.append(heading,createCloseButton(cb.close));
    const stage=el('div','haqi-atlas-stage'),canvas=el('canvas','haqi-atlas-canvas'),labels=el('div','haqi-atlas-labels'),controls=el('div','earth-map-zoom'),status=el('p','earth-map-status'),card=el('div','haqi-atlas-selection');
    canvas.width=900;canvas.height=600;canvas.tabIndex=0;canvas.setAttribute('aria-label',tr('哈奇地图，左右拖动浏览岛屿，滚轮、双指或加减按钮缩放'));
    const enter=button('传送过去',()=>performTravel(),'primary');card.hidden=true;card.append(enter);status.setAttribute('role','status');
    stage.append(canvas,labels,controls,status,card);body.append(stage);modal.append(header,body);root.append(modal);canvas.focus?.({preventScroll:true});
    let art=null,islands=[],portals=[],decorations=[],bounds=atlasBounds([]),camera=null,selected=null,disposed=false,pendingFrame=null,gesture=null,initialized=false,width=900,height=600,suppressClick=false,scene=null,dpr=1,gestureRect=null;
    const labelPositions=new WeakMap(),localLabels=new Map(),renderStats={sceneBuilds:0,previewBuilds:0};
    const pointers=new Map(),images=new Map(),masks=new Map(),previews=new Map(),labelNodes=new Map(),portalNodes=new Map(),failed=new Set(),context=canvas.getContext('2d');
    const point=p=>atlasPoint(camera,p,width,height),screen=e=>{const r=gestureRect||canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
    const showStatus=text=>{setText(status,text);status.hidden=!text;};
    function limit(){camera=constrainAtlasStrip(camera,bounds,width,height);}
    function scaleLimits(){return atlasStripLimits(islands,width,height);}
    let motionFrame=null,motionTarget=null;
    function stopMotion(){if(motionFrame!==null)cancelAnimationFrame(motionFrame);motionFrame=null;motionTarget=null;}
    function setCamera(next){stopMotion();camera=next;limit();draw();}
    function animateTo(x){
        if(!camera||disposed)return;
        const target=constrainAtlasStrip({...camera,x},bounds,width,height).x;
        stopMotion();selected=null;card.hidden=true;
        if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){setCamera({...camera,x:target});return;}
        const start=camera.x,started=performance.now();motionTarget=target;
        const tick=now=>{if(disposed)return;const t=Math.min(1,Math.max(0,(now-started)/320)),ease=1-(1-t)**3;
            camera={...camera,x:start+(target-start)*ease};limit();draw();
            if(t<1)motionFrame=requestAnimationFrame(tick);else{motionFrame=null;motionTarget=null;}
        };motionFrame=requestAnimationFrame(tick);
    }
    function showAll(){if(!art)return;selected=null;card.hidden=true;setCamera({x:camera?.x??islands[0].x,y:0,scale:scaleLimits().min});}
    function focusIslandId(){return [save.zone,world.isDungeon?save.dungeonReturn?.zone:save.earthReturn?.zone,'camp'].find(id=>islands.some(i=>i.id===id));}
    function focusIsland(island){if(!island)return;selected=null;card.hidden=true;setCamera({x:island.x,y:0,scale:Math.max(scaleLimits().min,scaleLimits().max*(width<600?.98:.9))});}
    function locateCurrent(){focusIsland(islands.find(i=>i.id===focusIslandId())||islands[0]);}
    function panBy(pixels){if(camera)animateTo((motionTarget??camera.x)+pixels/camera.scale);}
    function arrow(direction){
        const node=button('',()=>panBy(direction*width*.7),'haqi-atlas-arrow');
        const name=direction<0?'向左浏览':'向右浏览';node.title=tr(name);node.setAttribute('aria-label',tr(name));
        const icon=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');
        icon.setAttribute('viewBox','0 0 32 32');icon.setAttribute('aria-hidden','true');
        path.setAttribute('d',direction<0?'M20 6 10 16 20 26':'M12 6 22 16 12 26');icon.append(path);node.append(icon);return node;
    }
    const navigation=el('div','haqi-atlas-navigation'),previous=arrow(-1),next=arrow(1),journey=el('div','haqi-atlas-journey'),progress=el('input','haqi-atlas-progress'),stops=el('div','haqi-atlas-stops');
    const stopNodes=[];let activeStop=null;
    const journeyPosition=el('div','haqi-atlas-position');journeyPosition.hidden=true;
    function revealStop(node){
        if(!node||!stops.clientWidth)return;
        const left=node.offsetLeft,right=left+node.offsetWidth;
        if(left<stops.scrollLeft||right>stops.scrollLeft+stops.clientWidth)stops.scrollLeft=Math.max(0,left-(stops.clientWidth-node.offsetWidth)/2);
    }
    stops.setAttribute('aria-label',tr('全部岛屿，可横向滚动'));
    stops.onwheel=e=>{if(stops.scrollWidth<=stops.clientWidth)return;const delta=Math.abs(e.deltaX||0)>Math.abs(e.deltaY||0)?e.deltaX:e.deltaY;if(!delta)return;e.preventDefault();stops.scrollLeft+=delta*(e.deltaMode===1?16:e.deltaMode===2?stops.clientWidth:1);};
    progress.type='range';progress.min='0';progress.step='0.001';progress.value='0';progress.disabled=true;progress.setAttribute('aria-label',tr('拖动浏览全部岛屿'));
    progress.oninput=()=>{if(!camera||!islands.length)return;const value=Number(progress.value),index=Math.min(islands.length-1,Math.floor(value)),a=islands[index],b=islands[index+1]||a;selected=null;card.hidden=true;setCamera({...camera,x:a.x+(b.x-a.x)*(value-index)});};
    progress.onpointerdown=()=>stopMotion();
    progress.onkeydown=e=>{const direction={ArrowLeft:-1,ArrowDown:-1,ArrowRight:1,ArrowUp:1,PageDown:-10,PageUp:10}[e.key];
        if(direction===undefined&&e.key!=='Home'&&e.key!=='End')return;e.preventDefault();
        progress.value=String(e.key==='Home'?0:e.key==='End'?islands.length-1:Math.max(0,Math.min(islands.length-1,Math.round(Number(progress.value))+direction)));progress.oninput();
    };
    journey.append(journeyPosition,progress,stops);navigation.append(previous,journey,next);body.append(navigation);
    function zoom(factor,anchor={x:width/2,y:height/2}){if(!camera)return;const {min,max}=scaleLimits();setCamera(zoomAtlas(camera,factor,anchor,width,height,min,max));}
    controls.append(button('+',()=>zoom(1.4),'earth-map-zoom-button'),button('−',()=>zoom(1/1.4),'earth-map-zoom-button'));
    controls.children[0].setAttribute('aria-label',tr('放大'));controls.children[1].setAttribute('aria-label',tr('缩小'));
    function choose(island,local=null,name=island.name){
        if(disposed)return;
        selected={island,local,name};const known=ISLANDS.some(i=>i.id===island.id),state=known?travelStatus(save,assets.content,island.id):{allowed:false};
        enter.title=`${tr(name)} · ${fill(state.minLevel?'建议 {level} 级':'此岛尚未开放',{level:state.minLevel}).text}`;
        setText(enter,state.current?(local?'传送过去':'当前位置'):'传送到此岛');enter.disabled=!state.allowed||(state.current&&!local);card.hidden=false;positionSelection({x:width/2,y:height/2});draw();
    }
    function positionSelection(p){
        card.hidden=p.x<0||p.y<0||p.x>width||p.y>height;
        if(card.hidden)return;
        const w=card.offsetWidth,h=card.offsetHeight,gap=18,margin=8;
        const x=p.x+gap+w<=width-margin?p.x+gap:p.x-gap-w;
        card.style.left=`${Math.max(margin,Math.min(width-w-margin,x))}px`;
        card.style.top=`${Math.max(margin,Math.min(height-h-margin,p.y-h/2))}px`;
    }
    function performTravel(){
        if(disposed||!selected||enter.disabled)return;const {island,local}=selected;
        if(island.id===save.zone&&local)cb.teleportToPosition?.(local.x,local.y);else cb.travel(island.id);
    }
    function preview(island){
        if(previews.has(island.id))return previews.get(island.id);
        if(!cb.drawIsland||failed.has(island.id))return null;
        const layout=assets.content.worldMaps?.[island.id];if(!layout)return null;
        const target=el('canvas');target.width=768;target.height=Math.round(768*layout.h/layout.w);
        try{renderStats.previewBuilds++;cb.drawIsland(target,island.id,{labels:false,showPlayer:false,atlasPreview:true});previews.set(island.id,target);if(previews.size>islands.length)previews.delete([...previews.keys()].find(id=>id!==save.zone&&id!==island.id));return target;}
        catch{failed.add(island.id);return null;}
    }
    function positionLabel(node,p){const hidden=p.x<0||p.y<0||p.x>width||p.y>height;
        if(node.hidden!==hidden)node.hidden=hidden;if(hidden)return;
        const previous=labelPositions.get(node);if(previous?.x===p.x&&previous?.y===p.y)return;
        node.style.left='0';node.style.top='0';node.style.transform=`translate3d(${p.x}px,${p.y}px,0) translate(-50%,-${node.className.includes('haqi-atlas-landmark')?100:50}%)`;labelPositions.set(node,p);
    }
    function paintScene(c,at,sw,sh){
        const project=p=>atlasPoint(at,p,sw,sh);
        c.fillStyle=art.ocean||'#168fba';c.fillRect(0,0,sw,sh);
        const ocean=images.get('ocean');
        if(ocean)for(const tile of atlasOceanTiles(at,sw,sh,art.oceanTile?.size||512))c.drawImage(ocean,tile.x,tile.y,tile.w+.5,tile.h+.5);
        const decoration=images.get('seaDecor'),frames=art.resources?.seaDecor?.frames;
        if(decoration&&frames)for(const item of decorations){const rect=frames[item.frame]?.rect;if(!rect)continue;const p=project({x:item.x-item.w/2,y:item.y-item.h/2}),w=item.w*at.scale,h=item.h*at.scale;if(p.x+w>=0&&p.y+h>=0&&p.x<=sw&&p.y<=sh)c.drawImage(decoration,...rect,p.x,p.y,w,h);}
        for(const island of islands){
            const p=project({x:island.x-island.w/2,y:island.y-island.h/2}),w=island.w*at.scale,h=island.h*at.scale;
            if(p.x+w<0||p.y+h<0||p.x>sw||p.y>sh)continue;
            // Registered illustrations use the same full-canvas coordinates as the
            // layout. Never generate terrain while their artwork loads or fails.
            const image=images.get(island.resource);
            if(island.detailStyle==='illustration'){
                if(image)c.drawImage(image,...(island.rect||[0,0,image.naturalWidth,image.naturalHeight]),p.x,p.y,w,h);
                continue;
            }
            const layout=assets.content.worldMaps?.[island.id],opacity=layout?islandDetailOpacity(island,at.scale,width,height):0,local=opacity>0?preview(island):null;
            if(!local||opacity<1){c.save();c.globalAlpha=local?1-opacity:1;
                if(image)c.drawImage(image,...(island.rect||[0,0,image.naturalWidth,image.naturalHeight]),p.x,p.y,w,h);
                else{c.fillStyle=island.id===save.zone?'#95c777':'#80b797';c.beginPath();c.ellipse(p.x+w/2,p.y+h/2,w*.4,h*.4,0,0,Math.PI*2);c.fill();}c.restore();}
            if(local){c.save();c.globalAlpha=opacity;c.drawImage(local,p.x,p.y,w,h);c.restore();}
        }
    }
    function draw(){
        if(disposed||!camera)return;
        previous.disabled=camera.x-width/camera.scale/2<=bounds.x;next.disabled=camera.x+width/camera.scale/2>=bounds.x+bounds.w;
        const nearest=islands.reduce((best,i)=>!best||Math.abs(i.x-camera.x)<Math.abs(best.x-camera.x)?i:best,null);
        let index=islands.findIndex(i=>i.x>=camera.x);if(index<0)index=islands.length-1;
        const left=islands[Math.max(0,index-1)],right=islands[index],value=right&&left&&right.x!==left.x?Math.max(0,index-1+(camera.x-left.x)/(right.x-left.x)):index;
        progress.value=String(value);progress.style.setProperty('--journey-progress',`${value/Math.max(1,islands.length-1)*100}%`);
        if(nearest)progress.setAttribute('aria-valuetext',tr(nearest.name));
        const active=stopNodes.find(row=>row.island===nearest)?.node;
        if(active!==activeStop){
            activeStop?.setAttribute('aria-current','false');activeStop=active;activeStop?.setAttribute('aria-current','location');revealStop(activeStop);
            if(nearest)setText(journeyPosition,`${tr(nearest.name)} · ${islands.indexOf(nearest)+1} / ${islands.length}`);
        }
        const padding=256,dx=scene?(scene.camera.x-camera.x)*camera.scale:0,dy=scene?(scene.camera.y-camera.y)*camera.scale:0;
        if(!scene||scene.camera.scale!==camera.scale||Math.abs(dx)>padding-8||Math.abs(dy)>padding-8){
            const sw=width+padding*2,sh=height+padding*2,target=scene?.canvas||el('canvas');
            // Bound the overscan buffer to 8 million pixels (32 MB), retaining HiDPI where possible.
            const ratio=Math.min(dpr,Math.sqrt(8000000/(sw*sh)));target.width=Math.ceil(sw*ratio);target.height=Math.ceil(sh*ratio);
            const c=target.getContext('2d');c.setTransform(ratio,0,0,ratio,0,0);paintScene(c,camera,sw,sh);renderStats.sceneBuilds++;
            scene={canvas:target,camera:{...camera},w:sw,h:sh};
        }
        const offsetX=(scene.camera.x-camera.x)*camera.scale,offsetY=(scene.camera.y-camera.y)*camera.scale;
        context.clearRect(0,0,width,height);context.drawImage(scene.canvas,offsetX-padding,offsetY-padding,scene.w,scene.h);
        for(const island of islands){
            const p=point({x:island.x-island.w/2,y:island.y-island.h/2}),w=island.w*camera.scale,h=island.h*camera.scale,node=labelNodes.get(island.id);
            const tags=localLabels.get(island.id)||[];
            if(p.x+w<0||p.y+h<0||p.x>width||p.y>height){node.hidden=true;for(const tag of tags)if(!tag.hidden)tag.hidden=true;continue;}
            const layout=assets.content.worldMaps?.[island.id],opacity=layout?islandDetailOpacity(island,camera.scale,width,height):0;
            positionLabel(node,point({x:island.x,y:island.y+island.h/2+24/camera.scale}));
            if(opacity>.5&&layout){
                for(const mark of layout.landmarks||[]){const tag=labelNodes.get(`${island.id}:${mark.id}`);if(tag)positionLabel(tag,point(islandAtlasPoint(island,layout,mark)));}
            }else for(const tag of tags)if(!tag.hidden)tag.hidden=true;
            if(layout&&island.id===save.zone){
                const hero=point(islandAtlasPoint(island,layout,save.position));context.beginPath();context.arc(hero.x,hero.y,6,0,Math.PI*2);context.fillStyle='#fff';context.fill();context.strokeStyle='#164f73';context.lineWidth=3;context.stroke();
                if(opacity>.5)for(const actor of socialActors){const at=point(islandAtlasPoint(island,layout,actor.position));context.beginPath();context.arc(at.x,at.y,4,0,Math.PI*2);context.fillStyle='#d89af0';context.fill();}
            }
        }
        const portalSize=atlasPortalSize(camera.scale,fitAtlas(bounds,width,height).scale);
        for(const portal of portals){const node=portalNodes.get(portal.id);if(node.dataset.size!==String(portalSize)){node.dataset.size=String(portalSize);node.style.setProperty('--vortex-size',`${portalSize}px`);node.style.setProperty('--vortex-target-size',`${portalSize+10}px`);}positionLabel(node,point(portal.haqi));}
        if(selected){const layout=assets.content.worldMaps?.[selected.island.id],p=point(selected.local&&layout?islandAtlasPoint(selected.island,layout,selected.local):selected.island);context.beginPath();context.arc(p.x,p.y,13,0,Math.PI*2);context.strokeStyle='#ffe5a2';context.lineWidth=3;context.stroke();positionSelection(p);}
    }
    function schedule(){if(pendingFrame===null)pendingFrame=requestAnimationFrame(()=>{pendingFrame=null;draw();});}
    function activate(at){
        if(disposed)return;
        const portal=pickAtlasPortal(portals,at,camera,width,height,fitAtlas(bounds,width,height).scale);if(portal){cb.portal?.(portal,'earth');return;}
        const coordinate=atlasInverse(camera,at,width,height),island=pickAtlasIsland(islands,coordinate,(i,p)=>{
            const layout=assets.content.worldMaps?.[i.id];if(layout&&islandDetailOpacity(i,camera.scale,width,height)>.5)return atlasCoastContains(layout.coast,islandLocalPoint(i,layout,p));
            const mask=masks.get(i.id);if(mask){const x=Math.min(63,Math.floor((p.x-i.x+i.w/2)/i.w*64)),y=Math.min(63,Math.floor((p.y-i.y+i.h/2)/i.h*64));return mask[(y*64+x)*4+3]>24;}
            return ((p.x-i.x)/(i.w*.4))**2+((p.y-i.y)/(i.h*.4))**2<=1;
        });
        if(!island){selected=null;card.hidden=true;draw();return;}
        const layout=assets.content.worldMaps?.[island.id],local=layout&&islandDetailOpacity(island,camera.scale,width,height)>.5?islandLocalPoint(island,layout,coordinate):null;
        choose(island,local,island.name);
    }
    function rebase(){
        const entries=[...pointers.values()];if(!entries.length){gesture=null;return;}
        const a=entries[0],b=entries[1];gesture={camera:{...camera},start:b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2}:{...a},distance:b?Math.hypot(a.x-b.x,a.y-b.y):0,moved:b!=null||gesture?.moved||false,pinch:!!b};
    }
    stage.addEventListener('click',e=>{if(suppressClick&&e.detail!==0){e.preventDefault();e.stopImmediatePropagation();}},true);
    stage.onpointerdown=e=>{if(disposed||!camera||(e.button!=null&&e.button!==0))return;if(!pointers.size){suppressClick=false;stopMotion();}if(controls.contains(e.target)||card.contains(e.target)||e.target===status)return;if(!pointers.size)gestureRect=canvas.getBoundingClientRect();e.target.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{...screen(e),target:e.target});rebase();};
    stage.onpointermove=e=>{
        if(!pointers.has(e.pointerId)||!gesture)return;pointers.set(e.pointerId,{...screen(e),target:pointers.get(e.pointerId).target});const values=[...pointers.values()],a=values[0],b=values[1],at=b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2}:a;
        const dx=at.x-gesture.start.x,dy=at.y-gesture.start.y;if(!gesture.moved&&Math.hypot(dx,dy)<8)return;gesture.moved=true;suppressClick=true;
        const {min,max}=scaleLimits(),factor=b&&gesture.distance>0?Math.hypot(a.x-b.x,a.y-b.y)/gesture.distance:1,next=zoomAtlas(gesture.camera,factor,gesture.start,width,height,min,max);
        camera={...next,x:next.x-dx/next.scale,y:0};limit();canvas.style.cursor='grabbing';schedule();
    };
    const end=(e,cancel=false)=>{if(!pointers.has(e.pointerId))return;const moved=gesture?.moved,target=pointers.get(e.pointerId).target;pointers.delete(e.pointerId);if(cancel||moved)suppressClick=true;if(!pointers.size){gesture=null;canvas.style.cursor='grab';if(!cancel&&!moved&&(target===canvas||target===stage))activate(screen(e));gestureRect=null;}else rebase();};
    stage.onpointerup=e=>end(e);stage.onpointercancel=e=>end(e,true);stage.onlostpointercapture=e=>end(e,true);
    stage.onwheel=e=>{e.preventDefault();if(e.deltaY)zoom(e.deltaY<0?1.2:1/1.2,screen(e));};
    stage.onkeydown=e=>{if(['+','=','-'].includes(e.key)){e.preventDefault();zoom(e.key==='-'?1/1.4:1.4);}else if(camera&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();panBy((e.key==='ArrowRight'?1:-1)*width/8);}};
    function resize(){
        if(disposed)return;stopMotion();revealStop(activeStop);
        const rect=canvas.getBoundingClientRect(),oldWidth=width,oldHeight=height;width=Math.max(1,rect.width||900);height=Math.max(1,rect.height||600);
        dpr=Math.min(2,globalThis.devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);context.setTransform(dpr,0,0,dpr,0,0);scene=null;gestureRect=null;
        if(camera&&oldWidth&&oldHeight)camera.scale*=Math.min(width/oldWidth,height/oldHeight);
        if(art&&!initialized){initialized=true;locateCurrent();}
        if(camera){const {min,max}=scaleLimits();camera.scale=Math.max(min,Math.min(max,camera.scale));limit();}draw();
    }
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;observer?.observe(canvas);
    showStatus('地图载入中…');
    Promise.resolve(mapArt||loadHaqiAtlas()).then(data=>{
        if(disposed)return;art=data;islands=data.islands||[];portals=data.portals||[];bounds=atlasBounds(islands,portals);
        decorations=atlasSeaDecorations(islands,portals,data.seaDecor);
        if(!islands.length)throw Error('Missing atlas islands');
        for(const island of islands){
            const node=button(island.name,()=>choose(island),'haqi-atlas-island');node.classList.toggle('current',island.id===focusIslandId());if(island.id===save.zone)node.setAttribute('aria-current','location');const level=travelStatus(save,assets.content,island.id).minLevel||island.minLevel||1;node.dataset.level=fill('建议 {level} 级',{level}).text;node.setAttribute('aria-label',`${tr(island.name)}，${node.dataset.level}`);labels.append(node);labelNodes.set(island.id,node);const stop=button(island.name,()=>animateTo(island.x),'haqi-atlas-stop');stop.setAttribute('aria-label',`${tr('定位岛屿')}：${tr(island.name)}`);stop.setAttribute('aria-current','false');stops.append(stop);stopNodes.push({island,node:stop});
            const tags=[];localLabels.set(island.id,tags);const layout=assets.content.worldMaps?.[island.id];for(const mark of layout?.landmarks||[]){const tag=button(mark.name,()=>choose(island,{x:mark.x,y:mark.y},mark.name),'island-map-label haqi-atlas-landmark');tag.hidden=true;labels.append(tag);labelNodes.set(`${island.id}:${mark.id}`,tag);tags.push(tag);}
        }
        for(const portal of portals){const node=button('',()=>{if(!disposed)cb.portal?.(portal,'earth');},'map-vortex');const title=portal.travel?`传送到${portal.earth.name}`:tr('神秘漩涡，查看现实世界地图');node.setAttribute('aria-label',title);node.title=title;node.dataset.destination=portal.earth.name||tr('现实世界');labels.append(node);portalNodes.set(portal.id,node);}
        journeyPosition.hidden=islands.length<=12;progress.max=String(islands.length-1);progress.disabled=islands.length<2;journey.style.setProperty('--island-count',String(islands.length));
        showStatus('');resize();
        for(const [id,resource]of Object.entries(data.resources||{})){
            const image=new Image();image.crossOrigin='anonymous';image.onload=()=>{if(disposed)return;if(image.naturalWidth!==resource.width||image.naturalHeight!==resource.height){failed.add(id);showStatus('部分地图图片暂不可用，仍可选择目的地。');return;}images.set(id,image);
                for(const island of islands.filter(i=>i.resource===id)){
                    try{const target=el('canvas');target.width=target.height=64;const c=target.getContext('2d',{willReadFrequently:true});c.drawImage(image,...(island.rect||[0,0,image.naturalWidth,image.naturalHeight]),0,0,64,64);masks.set(island.id,c.getImageData(0,0,64,64).data);}catch{/* Labels remain usable if alpha sampling is unavailable. */}
                }
                if(id==='vortex')for(const node of portalNodes.values()){node.style.setProperty('--vortex-image',`url("${image.src}")`);node.classList.add('has-vortex-art');}scene=null;draw();};image.onerror=()=>{if(disposed)return;failed.add(id);showStatus('部分地图图片暂不可用，仍可选择目的地。');};image.src=assetUrl(resource,assets.mode);
        }
    }).catch(()=>{if(disposed)return;showStatus('地图暂不可用，请从列表选择目的地。');const list=el('div','haqi-atlas-fallback');for(const island of ISLANDS){const node=button(island.name,()=>choose(island));list.append(node);}body.append(list);});
    return {dispose(){disposed=true;stopMotion();observer?.disconnect();if(pendingFrame!==null)cancelAnimationFrame(pendingFrame);pointers.clear();previews.clear();images.clear();masks.clear();if(scene)scene.canvas.width=scene.canvas.height=0;scene=null;},locate:locateCurrent,overview:showAll,zoom,draw,getState:()=>({camera:camera&&{...camera},bounds:{...bounds},decorationCount:decorations.length,renderStats:{...renderStats},selected,previewIds:[...previews.keys()],illustrationIds:islands.filter(i=>i.detailStyle==='illustration'&&images.has(i.resource)).map(i=>i.id),loadedResources:[...images.keys()],failed:[...failed],width,height})};
}
