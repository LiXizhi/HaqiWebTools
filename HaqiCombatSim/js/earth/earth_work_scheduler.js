import {performanceDiagnostics as perf} from '../performance_diagnostics.js';

// Short preparation tasks must keep running when an occluded window throttles animation frames.
function createPreparationQueue(){
    let channel=null,sequence=0;const callbacks=new Map();
    function closeIfIdle(){if(callbacks.size||!channel)return;channel.port1.close();channel.port2.close();channel=null;}
    return {schedule(callback){
        if(typeof MessageChannel!=='function')return {timer:setTimeout(callback,0)};
        if(!channel){channel=new MessageChannel();channel.port1.onmessage=({data:id})=>{const callback=callbacks.get(id);callbacks.delete(id);try{callback?.();}finally{closeIfIdle();}};}
        const id=++sequence;callbacks.set(id,callback);channel.port2.postMessage(id);return {id};
    },cancel(ticket){if(ticket.timer!==undefined)clearTimeout(ticket.timer);else{callbacks.delete(ticket.id);closeIfIdle();}}};
}

// One time budget per task, shared by streaming, indexes and surface work.
export function createEarthWorkScheduler({budgetMs=2,clock=()=>performance.now(),schedule,unschedule}={}){
    const tasks=createPreparationQueue();schedule??=tasks.schedule;unschedule??=tasks.cancel;
    const queue=[];let handle=null,disposed=false,maxSliceMs=0;
    function pump(){
        handle=null;if(disposed)return;
        const start=clock(),deadline=start+budgetMs;let phase='';
        do{
            const task=queue[0];if(!task)break;
            phase=task.name;
            if(!task.valid()){queue.shift();try{task.steps.return?.();}catch{}task.reject(Object.assign(Error('已取消地图准备'),{name:'AbortError'}));continue;}
            try{const result=task.steps.next();if(result.done){queue.shift();task.resolve(result.value);}}
            catch(error){queue.shift();task.reject(error);}
        }while(clock()<deadline);
        const duration=clock()-start;maxSliceMs=Math.max(maxSliceMs,duration);perf.record('earth-prepare-slice',duration);
        if(duration>4)perf.event('earth-prepare-phase',{phase,duration});
        if(queue.length)handle=schedule(pump);
    }
    return {run(steps,{valid=()=>true,name='earth-prepare'}={}){
        if(disposed)return Promise.reject(Object.assign(Error('已取消地图准备'),{name:'AbortError'}));
        return new Promise((resolve,reject)=>{queue.push({steps,valid,resolve,reject,name});if(handle===null)handle=schedule(pump);});
    },dispose(){disposed=true;if(handle!==null)unschedule(handle);handle=null;for(const task of queue){try{task.steps.return?.();}catch{}task.reject(Object.assign(Error('已取消地图准备'),{name:'AbortError'}));}queue.length=0;},get stats(){return {queued:queue.length,maxSliceMs};}};
}
