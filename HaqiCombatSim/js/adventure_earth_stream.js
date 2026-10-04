import {performanceDiagnostics as perf} from './performance_diagnostics.js';

// Lazy browser IO. An injected null factory exercises the cooperative fallback.
export function createEarthStreamWorker({workerFactory=()=>typeof Worker==='undefined'?null:new Worker(new URL('./adventure_earth_stream_worker.js',import.meta.url),{type:'module'}),scheduler,timeoutMs=20000}={}){
    let worker=null,failed=false,sequence=0,generation=0,sceneObjects=new Map(),sceneTerrain=new Map();const pending=new Map();
    const abort=()=>Object.assign(Error('已取消地球后台任务'),{name:'AbortError'});
    function stop(error){worker?.terminate();worker=null;sceneObjects.clear();sceneTerrain.clear();for(const task of pending.values()){clearTimeout(task.timer);task.reject(error);}pending.clear();}
    function start(){
        if(failed)return null;if(worker)return worker;
        try{worker=workerFactory();if(!worker){failed=true;return null;}
            worker.onmessage=({data})=>{
                const task=pending.get(data.id);
                if(!task||data.epoch!==task.epoch||data.version!==task.version){data.result?.image?.close?.();return;}
                if(data.part){
                    const steps=(function*(){let rows=task.parts[data.part];if(!rows)rows=task.parts[data.part]=[];for(const [i,value] of data.rows.entries()){
                        const ref=data.refs?.[i],row=value??sceneObjects.get(ref);if(!row)throw Error('地球增量对象引用已失效');
                        if(data.signatures?.[i])Object.defineProperty(row,'earthSignature',{value:data.signatures[i]});rows.push(row);if(ref)task.nextObjects.set(ref,row);yield;
                    }})();
                    scheduler.run(steps,{valid:()=>pending.get(data.id)===task}).then(()=>worker?.postMessage({ack:data.id,serial:data.serial}),error=>{if(error.name!=='AbortError'){failed=true;stop(error);}});return;
                }
                pending.delete(data.id);clearTimeout(task.timer);
                if(data.error){task.reject(Error(data.error));return;}
                if(task.type==='scene'){Object.assign(data.result,task.parts);sceneObjects=task.nextObjects;sceneTerrain=task.nextTerrain;}
                perf.record('earth-worker-'+task.type,data.duration||0);task.resolve(data.result);
            };
            worker.onerror=()=>{failed=true;stop(Error('地球后台准备失败'));};return worker;
        }catch{failed=true;stop(Error('地球后台不可用'));return null;}
    }
    return {run(type,payload,{epoch=generation,version='',transfer=[]}={}){
        const current=start();if(!current)return null;
        const id=++sequence;return new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>{failed=true;stop(Error('地球后台准备超时'));},timeoutMs);
            const nextTerrain=new Map(type==='scene'?payload.terrain.map(t=>[t.key,t.indices]):[]);
            if(type==='scene')payload={...payload,terrainKeys:payload.terrain.map(t=>t.key),terrain:payload.terrain.filter(t=>sceneTerrain.get(t.key)!==t.indices)};
            pending.set(id,{resolve,reject,timer,type,epoch,version,parts:{},nextObjects:new Map(),nextTerrain});
            try{current.postMessage({id,type,payload,epoch,version},transfer);}catch(error){failed=true;stop(error);}
        });
    },cancel(){generation++;stop(abort());},get stats(){return {worker:!!worker,failed,pending:pending.size,generation};}};
}
