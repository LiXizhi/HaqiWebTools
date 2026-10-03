// Presentation shared by the main thread and the optional OffscreenCanvas worker.
import {earthDecorationIsTree} from './adventure_earth_surface_core.js';
import {drawEarthBiomeDecoration} from './adventure_earth_decoration.js';
import {paintSoftShadow} from './adventure_shadows.js';

export const earthGroundDecoration=o=>Number.isInteger(o.earthDecoFrame)&&o.size>0&&Number.isFinite(o.x)&&Number.isFinite(o.y)&&!earthDecorationIsTree(o.earthDecoFrame);
// Spatial draw indices contain shallow copies of the authored rows.
export const earthSurfaceObjectKey=o=>`${o.x}:${o.y}:${o.size}:${o.earthDecoFrame}:${o.earthDecoVariant||''}`;
export function earthGroundBounds(o){
    return {x:o.x-o.size*.56,y:o.y-o.size*.88,w:o.size*1.12,h:o.size*1.12};
}
export function drawEarthSurfaceObject(ctx,o,art){
    const frame=o.earthDecoFrame;if(frame===undefined)return false;
    const extra=frame>=16,atlas=extra?art?.biomeDecorations:art?.decorations,index=extra?frame-16:frame;
    if(atlas?.image){const cell=atlas.width/4,rect=atlas.frames?.[index]??(!extra?[(index%4)*cell,Math.floor(index/4)*cell,cell,cell]:null);
        if(rect){ctx.drawImage(atlas.image,...rect,o.x-o.size/2,o.y-o.size*.88,o.size,o.size);return true;}}
    return drawEarthBiomeDecoration(ctx,o);
}
export function bakeEarthSurfaceObjects(ctx,objects,art,options){
    if(!objects.length)return [];
    ctx.save();const scale=options.resolution/options.size;
    ctx.scale(scale,scale);ctx.translate(-options.x,-options.y);
    const drawn=[];
    for(const o of objects){
        // Avoid baking invisible placeholders before their atlas arrives.
        const atlas=o.earthDecoFrame>=16?art?.biomeDecorations:art?.decorations;
        if(!atlas?.image&&!['snowMound','wheat'].includes(o.earthDecoVariant))continue;
        paintSoftShadow(ctx,o.x-o.size*.08,o.y+o.size*.025,o.size*.48,o.size*.20,.24);
        if(drawEarthSurfaceObject(ctx,o,art))drawn.push(o);
    }
    ctx.restore();return drawn;
}
