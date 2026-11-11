// Browser IO boundary: serializable observations only, never the live arena.
export class BattleAIClient {
    constructor({timeoutMs=3000}={}){this.worker=null;this.pending=new Map();this.nextId=0;this.timeoutMs=timeoutMs;}
    analyze(observation,options={}){
        if(!this.worker){this.worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
            this.worker.onmessage=({data})=>{const task=this.pending.get(data.id);if(!task)return;this.pending.delete(data.id);clearTimeout(task.timer);data.error?task.reject(Error(data.error)):task.resolve(data.result);};
            this.worker.onerror=()=>this.cancelPending('战斗分析暂时不可用');
        }
        const id=++this.nextId;
        return new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>this.cancelPending('战斗分析超时'),this.timeoutMs);
            this.pending.set(id,{resolve,reject,timer});
            try{this.worker.postMessage({id,observation,options});}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}
        });
    }
    cancelPending(message){this.worker?.terminate();this.worker=null;for(const task of this.pending.values()){clearTimeout(task.timer);task.reject(Error(message));}this.pending.clear();}
    dispose(){this.cancelPending('战斗分析已取消');}
}
