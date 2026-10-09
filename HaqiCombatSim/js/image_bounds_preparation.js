import {createEarthWorkScheduler} from './earth_work_scheduler.js';

export function createImageBoundsPreparation({budgetMs,timeoutMs}){
    const scheduler=createEarthWorkScheduler({budgetMs}),pending=new Map();let worker=null,failed=false,sequence=0,idle=null;
    function stop(){clearTimeout(idle);worker?.terminate();worker=null;for(const row of pending.values()){clearTimeout(row.timer);row.resolve(null);}pending.clear();}
    function start(){
        clearTimeout(idle);if(failed)return null;if(worker)return worker;
        try{
            worker=new Worker(new URL('./image_bounds_worker.js',import.meta.url),{type:'module'});
            worker.onmessage=({data})=>{const row=pending.get(data.id);if(!row)return;pending.delete(data.id);clearTimeout(row.timer);row.resolve(data.bounds);
                if(!pending.size)idle=setTimeout(stop,timeoutMs);
            };
            worker.onerror=()=>{failed=true;stop();};return worker;
        }catch{failed=true;stop();return null;}
    }
    return {scheduler,async prepare(image,rect){
        if(typeof Worker==='undefined'||typeof createImageBitmap==='undefined'||typeof OffscreenCanvas==='undefined')return null;
        let bitmap;
        try{
            bitmap=await createImageBitmap(image);const active=start();if(!active)return null;const id=++sequence;
            return await new Promise(resolve=>{
                const timer=setTimeout(()=>{failed=true;stop();},timeoutMs);pending.set(id,{resolve,timer});
                try{active.postMessage({id,image:bitmap,rect},[bitmap]);}catch{failed=true;stop();}
            });
        }catch{return null;}finally{bitmap?.close();}
    },dispose(){stop();scheduler.dispose();}};
}
