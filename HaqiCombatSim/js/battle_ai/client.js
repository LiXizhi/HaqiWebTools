// Browser IO boundary: serializable observations only, never the live arena.
export class BattleAIClient {
    constructor(){this.worker=null;this.pending=new Map();this.nextId=0;}
    analyze(observation,options={}){
        if(!this.worker){this.worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
            this.worker.onmessage=({data})=>{const task=this.pending.get(data.id);if(!task)return;this.pending.delete(data.id);data.error?task.reject(Error(data.error)):task.resolve(data.result);};
            this.worker.onerror=()=>{for(const task of this.pending.values())task.reject(Error('战斗分析暂时不可用'));this.pending.clear();this.worker?.terminate();this.worker=null;};
        }
        const id=++this.nextId;
        return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.worker.postMessage({id,observation,options});});
    }
    dispose(){this.worker?.terminate();this.worker=null;for(const task of this.pending.values())task.reject(Error('战斗分析已取消'));this.pending.clear();}
}
