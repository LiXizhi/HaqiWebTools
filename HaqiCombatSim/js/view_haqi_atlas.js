import {loadHaqiAtlas} from './haqi_atlas_data.js';
import {assetUrl} from './adventure_media_core.js';
import {ISLANDS,travelStatus} from './adventure_world_map_core.js';
import {createCloseButton,createWorldMapSwitch} from './view_adventure_controls.js';
import {setText,tr} from './locale_runtime.js';
import {atlasBounds,fitAtlas,atlasPoint,atlasInverse,zoomAtlas,constrainAtlas,islandAtlasPoint,islandLocalPoint,islandDetailOpacity,pickAtlasIsland,pickAtlasPortal,atlasOverviewCamera,atlasCoastContains,atlasOceanTiles,atlasSeaDecorations,atlasPortalSize} from './haqi_atlas_core.js';

const el=(tag,className='',text)=>{const node=document.createElement(tag);node.className=className;if(text)setText(node,text);return node;};
const button=(text,callback,className='secondary')=>{const node=el('button',className,text);node.type='button';node.onclick=callback;return node;};
export function renderHaqiAtlas(root,world,{save,assets,socialActors=[],mapArt,focusPortal},cb,initial='world'){
    root.replaceChildren();root.className='overlay visible';
    const modal=el('section','modal atlas-map-modal compact-map-modal haqi-atlas-modal'),header=el('header','modal-header'),heading=el('div','map-heading'),body=el('div','modal-body');
    modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',tr('哈奇世界地图'));
    const locate=button(world.isEarth?'返回当前城市地图':'返回当前岛屿地图',()=>world.isEarth?cb.switchMap('local'):locateCurrent(),'secondary map-view-toggle');
    heading.append(locate);if(cb.switchWorld)heading.append(createWorldMapSwitch('haqi',cb.switchWorld));header.append(heading,createCloseButton(cb.close));
    const stage=el('div','haqi-atlas-stage'),canvas=el('canvas','haqi-atlas-canvas'),labels=el('div','haqi-atlas-labels'),controls=el('div','earth-map-zoom'),status=el('p','earth-map-status'),card=el('div','haqi-atlas-selection');
    canvas.width=900;canvas.height=600;canvas.tabIndex=0;canvas.setAttribute('aria-label',tr('哈奇地图，可拖动和缩放，放大查看岛屿地形'));
    const detail=el('strong'),recommendation=el('small'),enter=button('传送过去',()=>performTravel(),'primary');card.hidden=true;card.append(detail,recommendation,enter);status.setAttribute('role','status');
    stage.append(canvas,labels,controls,status);body.append(stage,card);modal.append(header,body);root.append(modal);canvas.focus?.({preventScroll:true});
    let art=null,islands=[],portals=[],decorations=[],bounds=atlasBounds([]),camera=null,selected=null,disposed=false,pendingFrame=null,gesture=null,initialized=false,width=900,height=600,suppressClick=false,scene=null,dpr=1,gestureRect=null;
    const labelPositions=new WeakMap(),localLabels=new Map(),renderStats={sceneBuilds:0,previewBuilds:0};
    const pointers=new Map(),images=new Map(),masks=new Map(),previews=new Map(),labelNodes=new Map(),portalNodes=new Map(),failed=new Set(),context=canvas.getContext('2d');
    const point=p=>atlasPoint(camera,p,width,height),screen=e=>{const r=gestureRect||canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
    const showStatus=text=>{setText(status,text);status.hidden=!text;};
    function limit(){camera=constrainAtlas(camera,bounds,width,height);}
    function scaleLimits(){
        const min=fitAtlas(bounds,width,height).scale,distance=i=>Math.hypot(i.x-(camera?.x||0),i.y-(camera?.y||0));
        const island=islands.reduce((best,i)=>!best||distance(i)<distance(best)?i:best,null);
        // Keep the nearby island close to its fitted size and never enlarge its 768px preview.
        const max=island?Math.min(Math.min((width-48)/island.w,(height-48)/island.h)*1.15,768/island.w):min;
        return {min,max:Math.max(min,max)};
    }
    function setCamera(next){camera=next;limit();draw();}
    function showAll(){if(!art)return;selected=null;card.hidden=true;setCamera(atlasOverviewCamera(islands,portals,width,height,save.zone));}
    function locateCurrent(){const island=islands.find(i=>i.id===save.zone);if(!island){showAll();return;}selected=null;card.hidden=true;const next=fitAtlas({x:island.x-island.w/2,y:island.y-island.h/2,w:island.w,h:island.h},width,height,width<600?32:64);next.scale=Math.min(next.scale,768/island.w);setCamera(next);}
    function zoom(factor,anchor={x:width/2,y:height/2}){if(!camera)return;const {min,max}=scaleLimits();setCamera(zoomAtlas(camera,factor,anchor,width,height,min,max));}
    controls.append(button('+',()=>zoom(1.4),'earth-map-zoom-button'),button('−',()=>zoom(1/1.4),'earth-map-zoom-button'));
    controls.children[0].setAttribute('aria-label',tr('放大'));controls.children[1].setAttribute('aria-label',tr('缩小'));
    function choose(island,local=null,name=island.name){
        if(disposed)return;
        selected={island,local,name};setText(detail,name);const known=ISLANDS.some(i=>i.id===island.id),state=known?travelStatus(save,assets.content,island.id):{allowed:false};
        setText(recommendation,state.minLevel?'建议 {level} 级':'此岛尚未开放',{level:state.minLevel});
        setText(enter,state.current?(local?'传送过去':'当前位置'):'传送到此岛');enter.disabled=!state.allowed||(state.current&&!local);card.hidden=false;draw();
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
            const image=images.get(island.resource),layout=assets.content.worldMaps?.[island.id],opacity=layout?islandDetailOpacity(island,at.scale,width,height):0,local=opacity>0?preview(island):null;
            if(!local||opacity<1){c.save();c.globalAlpha=local?1-opacity:1;
                if(image)c.drawImage(image,...(island.rect||[0,0,image.naturalWidth,image.naturalHeight]),p.x,p.y,w,h);
                else{c.fillStyle=island.id===save.zone?'#95c777':'#80b797';c.beginPath();c.ellipse(p.x+w/2,p.y+h/2,w*.4,h*.4,0,0,Math.PI*2);c.fill();}c.restore();}
            if(local){c.save();c.globalAlpha=opacity;c.drawImage(local,p.x,p.y,w,h);c.restore();}
        }
    }
    function draw(){
        if(disposed||!camera)return;
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
            positionLabel(node,point({x:island.x,y:island.y+(opacity>.5?-island.h*.38:island.h*.15)}));
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
        if(selected){const layout=assets.content.worldMaps?.[selected.island.id],p=point(selected.local&&layout?islandAtlasPoint(selected.island,layout,selected.local):selected.island);context.beginPath();context.arc(p.x,p.y,13,0,Math.PI*2);context.strokeStyle='#ffe5a2';context.lineWidth=3;context.stroke();}
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
    stage.onpointerdown=e=>{if(disposed||!camera||(e.button!=null&&e.button!==0))return;if(!pointers.size)suppressClick=false;if(controls.contains(e.target)||e.target===status)return;if(!pointers.size)gestureRect=canvas.getBoundingClientRect();e.target.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{...screen(e),target:e.target});rebase();};
    stage.onpointermove=e=>{
        if(!pointers.has(e.pointerId)||!gesture)return;pointers.set(e.pointerId,{...screen(e),target:pointers.get(e.pointerId).target});const values=[...pointers.values()],a=values[0],b=values[1],at=b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2}:a;
        const dx=at.x-gesture.start.x,dy=at.y-gesture.start.y;if(!gesture.moved&&Math.hypot(dx,dy)<8)return;gesture.moved=true;suppressClick=true;
        const {min,max}=scaleLimits(),factor=b&&gesture.distance>0?Math.hypot(a.x-b.x,a.y-b.y)/gesture.distance:1,next=zoomAtlas(gesture.camera,factor,gesture.start,width,height,min,max);
        camera={...next,x:next.x-dx/next.scale,y:next.y-dy/next.scale};limit();canvas.style.cursor='grabbing';schedule();
    };
    const end=(e,cancel=false)=>{if(!pointers.has(e.pointerId))return;const moved=gesture?.moved,target=pointers.get(e.pointerId).target;pointers.delete(e.pointerId);if(cancel||moved)suppressClick=true;if(!pointers.size){gesture=null;canvas.style.cursor='grab';if(!cancel&&!moved&&(target===canvas||target===stage))activate(screen(e));gestureRect=null;}else rebase();};
    stage.onpointerup=e=>end(e);stage.onpointercancel=e=>end(e,true);stage.onlostpointercapture=e=>end(e,true);
    stage.onwheel=e=>{e.preventDefault();zoom(e.deltaY<0?1.2:1/1.2,screen(e));};
    stage.onkeydown=e=>{if(['+','=','-'].includes(e.key)){e.preventDefault();zoom(e.key==='-'?1/1.4:1.4);}else if(camera&&e.key.startsWith('Arrow')){e.preventDefault();setCamera({...camera,x:camera.x+(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0)*width/camera.scale/8,y:camera.y+(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0)*height/camera.scale/8});}};
    function resize(){
        if(disposed)return;
        const rect=canvas.getBoundingClientRect(),oldWidth=width,oldHeight=height;width=Math.max(1,rect.width||900);height=Math.max(1,rect.height||600);
        dpr=Math.min(2,globalThis.devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);context.setTransform(dpr,0,0,dpr,0,0);scene=null;gestureRect=null;
        if(camera&&oldWidth&&oldHeight)camera.scale*=Math.min(width/oldWidth,height/oldHeight);
        if(art&&!initialized){initialized=true;if(focusPortal)setCamera(fitAtlas(bounds,width,height));else if((initial==='local'||(!world.isEarth&&!world.isDungeon))&&islands.some(i=>i.id===save.zone))locateCurrent();else showAll();}
        if(camera){const {min,max}=scaleLimits();camera.scale=Math.max(min,Math.min(max,camera.scale));limit();}draw();
    }
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;observer?.observe(canvas);
    showStatus('地图载入中…');
    Promise.resolve(mapArt||loadHaqiAtlas()).then(data=>{
        if(disposed)return;art=data;islands=data.islands||[];portals=data.portals||[];bounds=atlasBounds(islands);
        decorations=atlasSeaDecorations(islands,portals,data.seaDecor);
        if(!islands.length)throw Error('Missing atlas islands');
        for(const island of islands){
            const node=button(island.name,()=>choose(island),'haqi-atlas-island');node.classList.toggle('current',island.id===save.zone);if(island.id===save.zone)node.setAttribute('aria-current','location');labels.append(node);labelNodes.set(island.id,node);
            const tags=[];localLabels.set(island.id,tags);const layout=assets.content.worldMaps?.[island.id];for(const mark of layout?.landmarks||[]){const tag=button(mark.name,()=>choose(island,{x:mark.x,y:mark.y},mark.name),'island-map-label haqi-atlas-landmark');tag.hidden=true;labels.append(tag);labelNodes.set(`${island.id}:${mark.id}`,tag);tags.push(tag);}
        }
        for(const portal of portals){const node=button('',()=>{if(!disposed)cb.portal?.(portal,'earth');},'map-vortex');node.setAttribute('aria-label',tr('神秘漩涡，查看现实世界地图'));node.title=tr('神秘漩涡，查看现实世界地图');labels.append(node);portalNodes.set(portal.id,node);}
        showStatus('');resize();
        for(const [id,resource]of Object.entries(data.resources||{})){
            const image=new Image();image.crossOrigin='anonymous';image.onload=()=>{if(disposed)return;if(image.naturalWidth!==resource.width||image.naturalHeight!==resource.height){failed.add(id);showStatus('部分地图图片暂不可用，仍可选择目的地。');return;}images.set(id,image);
                for(const island of islands.filter(i=>i.resource===id)){
                    try{const target=el('canvas');target.width=target.height=64;const c=target.getContext('2d',{willReadFrequently:true});c.drawImage(image,...(island.rect||[0,0,image.naturalWidth,image.naturalHeight]),0,0,64,64);masks.set(island.id,c.getImageData(0,0,64,64).data);}catch{/* Labels remain usable if alpha sampling is unavailable. */}
                }
                if(id==='vortex')for(const node of portalNodes.values()){node.style.setProperty('--vortex-image',`url("${image.src}")`);node.classList.add('has-vortex-art');}scene=null;draw();};image.onerror=()=>{if(disposed)return;failed.add(id);showStatus('部分地图图片暂不可用，仍可选择目的地。');};image.src=assetUrl(resource,assets.mode);
        }
    }).catch(()=>{if(disposed)return;showStatus('地图暂不可用，请从列表选择目的地。');const list=el('div','haqi-atlas-fallback');for(const island of ISLANDS){const node=button(island.name,()=>choose(island));list.append(node);}body.append(list);});
    return {dispose(){disposed=true;observer?.disconnect();if(pendingFrame!==null)cancelAnimationFrame(pendingFrame);pointers.clear();previews.clear();images.clear();masks.clear();if(scene)scene.canvas.width=scene.canvas.height=0;scene=null;},locate:locateCurrent,overview:showAll,zoom,draw,getState:()=>({camera:camera&&{...camera},bounds:{...bounds},decorationCount:decorations.length,renderStats:{...renderStats},selected,previewIds:[...previews.keys()],loadedResources:[...images.keys()],failed:[...failed],width,height})};
}
