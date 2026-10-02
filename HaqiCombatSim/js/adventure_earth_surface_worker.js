// One native module worker; pixel buffers transfer back without copying.
import {createEarthSurfaceRaster} from './adventure_earth_surface_core.js';
let atlas=null,cityGround=null;
self.onmessage=({data})=>{
    if(data.type==='atlas'){atlas=data.atlas;cityGround=data.cityGround;return;}
    const {id,options,grid}=data;
    try{
        const sample=(x,y)=>grid[`${Math.floor(x/options.cellSize)}:${Math.floor(y/options.cellSize)}`]??null;
        const job=createEarthSurfaceRaster({...options,sample,atlas,cityGround});while(!job.rows(16)){}
        self.postMessage({id,pixels:job.pixels},[job.pixels.buffer]);
    }catch{self.postMessage({id,error:true});}
};
