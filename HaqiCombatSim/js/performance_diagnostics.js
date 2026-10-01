// Opt-in, bounded, device-local measurements; never uploaded or attached to saves.
export function createPerformanceDiagnostics(enabled=false){
    const rows=new Map(),starts=new Map();let previous=null,observer;
    const record=(name,value)=>{if(!enabled||!Number.isFinite(value))return;let row=rows.get(name);if(!row){row=[];rows.set(name,row);}row.push(value);if(row.length>1200)row.shift();};
    if(enabled&&typeof PerformanceObserver!=='undefined')try{observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())record('long-task',entry.duration);});observer.observe({type:'longtask',buffered:true});}catch{}
    return {record,start(name){if(enabled)starts.set(name,performance.now());},end(name){if(starts.has(name)){record(name,performance.now()-starts.get(name));starts.delete(name);}},frame(time,active){if(active&&previous!==null)record('frame',time-previous);previous=active?time:null;},
        summary(){return Object.fromEntries([...rows].map(([name,values])=>{const sorted=[...values].sort((a,b)=>a-b);return [name,{count:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length,p95:sorted[Math.floor((sorted.length-1)*.95)],max:sorted.at(-1)}];}));},dispose(){observer?.disconnect();}}
}
export const performanceDiagnostics=createPerformanceDiagnostics(typeof location!=='undefined'&&new URLSearchParams(location.search).get('profile')==='1');
