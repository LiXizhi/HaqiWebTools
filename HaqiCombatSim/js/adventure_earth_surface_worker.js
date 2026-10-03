// One native module worker; pixel buffers transfer back without copying.
import {createEarthSurfaceRaster} from './adventure_earth_surface_core.js';
import {bakeEarthSurfaceObjects} from './adventure_earth_surface_objects.js';
let atlas=null,cityGround=null,art={},composite=false;
self.onmessage=({data})=>{
    if(data.type==='atlas'){atlas=data.atlas;cityGround=data.cityGround;art=data.art||{};composite=!!data.composite;return;}
    const {id,options,grid,objects=[]}=data;
    try{
        const sample=(x,y)=>grid[`${Math.floor(x/options.cellSize)}:${Math.floor(y/options.cellSize)}`]??null;
        const job=createEarthSurfaceRaster({...options,sample,atlas,cityGround});while(!job.rows(16)){}
        if(composite&&typeof OffscreenCanvas!=='undefined')try{
            const canvas=new OffscreenCanvas(options.resolution,options.resolution),ctx=canvas.getContext('2d');
            if(ctx&&canvas.transferToImageBitmap){
                const pixels=ctx.createImageData(options.resolution,options.resolution);pixels.data.set(job.pixels);ctx.putImageData(pixels,0,0);
                const drawn=new Set(bakeEarthSurfaceObjects(ctx,objects,art,options)),baked=objects.flatMap((o,i)=>drawn.has(o)?[i]:[]);
                const bitmap=canvas.transferToImageBitmap();self.postMessage({id,bitmap,baked},[bitmap]);return;
            }
        }catch{/* Keep raster work off the main thread when bitmap compositing is unavailable. */}
        self.postMessage({id,pixels:job.pixels},[job.pixels.buffer]);
    }catch{self.postMessage({id,error:true});}
};
