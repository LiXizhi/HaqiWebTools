// Pure atlas geometry. Map browsing never changes game coordinates or progress.
import {createRng} from './rng_core.js';
export const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function atlasBounds(islands,portals=[]){
    const rows=[...islands.map(i=>({x:i.x-i.w/2,y:i.y-i.h/2,w:i.w,h:i.h})),...portals.map(p=>({x:p.haqi.x-30,y:p.haqi.y-30,w:60,h:60}))];
    if(!rows.length)return {x:-500,y:-350,w:1000,h:700};
    const x=Math.min(...rows.map(r=>r.x)),y=Math.min(...rows.map(r=>r.y));
    return {x:x-24,y:y-24,w:Math.max(...rows.map(r=>r.x+r.w))-x+48,h:Math.max(...rows.map(r=>r.y+r.h))-y+48};
}
export function fitAtlas(rect,width,height,padding=24){
    return {x:rect.x+rect.w/2,y:rect.y+rect.h/2,scale:Math.min(Math.max(1,width-padding*2)/rect.w,Math.max(1,height-padding*2)/rect.h)};
}
export function atlasPoint(camera,point,width,height){return {x:(point.x-camera.x)*camera.scale+width/2,y:(point.y-camera.y)*camera.scale+height/2};}
export function atlasInverse(camera,point,width,height){return {x:(point.x-width/2)/camera.scale+camera.x,y:(point.y-height/2)/camera.scale+camera.y};}
export function zoomAtlas(camera,factor,anchor,width,height,min,max){
    const before=atlasInverse(camera,anchor,width,height),scale=clamp(camera.scale*factor,min,max);
    return {x:before.x-(anchor.x-width/2)/scale,y:before.y-(anchor.y-height/2)/scale,scale};
}
export function constrainAtlas(camera,bounds,width,height){
    const axis=(value,start,length,view)=>view>=length?start+length/2:clamp(value,start+view/2,start+length-view/2);
    // A viewport wider/taller than the island group stays centered on that axis.
    return {...camera,x:axis(camera.x,bounds.x,bounds.w,width/camera.scale),y:axis(camera.y,bounds.y,bounds.h,height/camera.scale)};
}
export function atlasOceanTiles(camera,width,height,tileSize=512){
    const left=camera.x-width/camera.scale/2,top=camera.y-height/camera.scale/2,result=[];
    for(let y=Math.floor(top/tileSize)*tileSize;y<top+height/camera.scale;y+=tileSize)
        for(let x=Math.floor(left/tileSize)*tileSize;x<left+width/camera.scale;x+=tileSize)
            result.push({...atlasPoint(camera,{x,y},width,height),w:tileSize*camera.scale,h:tileSize*camera.scale,worldX:x,worldY:y});
    return result;
}
export function atlasSeaDecorations(islands,portals,config={}){
    const bounds=atlasBounds(islands),rng=createRng(config.seed||20261006),result=[],frames=config.frames||[];
    if(!frames.length)return result;
    const count=config.count??32;
    for(let attempt=0;result.length<count&&attempt<count*100;attempt++){
        const frame=rng.pick(frames),w=rng.int(frame.minWidth||30,frame.maxWidth||55),h=w*(frame.aspect||1);
        const x=bounds.x+w/2+rng.float()*(bounds.w-w),y=bounds.y+h/2+rng.float()*(bounds.h-h);
        if(islands.some(i=>Math.abs(x-i.x)<(i.w+w)/2+12&&Math.abs(y-i.y)<(i.h+h)/2+12))continue;
        if(portals.some(p=>Math.hypot(x-p.haqi.x,y-p.haqi.y)<65))continue;
        if(result.some(p=>Math.hypot(x-p.x,y-p.y)<70))continue;
        result.push({x,y,w,h,frame:frame.id});
    }
    return result;
}
export function islandAtlasPoint(island,layout,point){return {x:island.x-island.w/2+point.x/layout.w*island.w,y:island.y-island.h/2+point.y/layout.h*island.h};}
export function islandLocalPoint(island,layout,point){return {x:(point.x-island.x+island.w/2)/island.w*layout.w,y:(point.y-island.y+island.h/2)/island.h*layout.h};}
export function islandDetailOpacity(island,scale,width,height){
    const fit=Math.min((width-48)/island.w,(height-48)/island.h);
    return clamp((scale/Math.max(.001,fit)-.55)/.25,0,1);
}
export function pickAtlasIsland(islands,point,hit=()=>true){
    return [...islands].reverse().find(i=>Math.abs(point.x-i.x)<=i.w/2&&Math.abs(point.y-i.y)<=i.h/2&&hit(i,point))||null;
}
export function atlasCoastContains(coast,point){
    if(!coast?.length)return true;let inside=false;
    for(let i=0,j=coast.length-1;i<coast.length;j=i++){
        const [x,y]=coast[i],[px,py]=coast[j];
        if((y>point.y)!==(py>point.y)&&point.x<(px-x)*(point.y-y)/(py-y)+x)inside=!inside;
    }
    return inside;
}
export function atlasPortalSize(scale,overviewScale){return clamp(44*Math.sqrt(Math.max(1,scale/Math.max(.001,overviewScale))),44,96);}
export function pickAtlasPortal(portals,point,camera,width,height,overviewScale=camera.scale){
    const radius=Math.max(48,atlasPortalSize(camera.scale,overviewScale)+10)/2;
    return portals.find(p=>{const s=atlasPoint(camera,p.haqi,width,height);return Math.hypot(s.x-point.x,s.y-point.y)<=radius;})||null;
}
export function atlasOverviewCamera(islands,portals,width,height,currentId){
    const bounds=atlasBounds(islands,portals),camera=fitAtlas(bounds,width,height),current=islands.find(i=>i.id===currentId);
    if(!current||current.w*camera.scale>=72)return camera;
    // On narrow screens include the nearest islands while keeping the current one readable.
    let included=[current],best=fitAtlas(atlasBounds(included),width,height);
    for(const island of islands.filter(i=>i!==current).sort((a,b)=>Math.hypot(a.x-current.x,a.y-current.y)-Math.hypot(b.x-current.x,b.y-current.y))){
        const candidate=fitAtlas(atlasBounds([...included,island]),width,height);
        if(current.w*candidate.scale>=72){included.push(island);best=candidate;}
    }
    return best;
}
