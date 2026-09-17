import {validateExperiment,createReport} from './runner.js';
export function startExperiment(experiment,ruleset,{onProgress=()=>{},workers=Math.max(1,Math.min(4,(navigator.hardwareConcurrency??2)-1))}={}) {
  validateExperiment(experiment);
  if(!Number.isInteger(workers)||workers<1||workers>8)throw new Error('Worker 数量须为 1–8');
  let cancelled=false,finished=false,next=0,records=[],resolve,reject;
  const handles=[],promise=new Promise((a,b)=>{resolve=a;reject=b;});
  const close=()=>{for(const w of handles)w.terminate();};
  const finish=()=>{if(finished)return;finished=true;close();resolve(createReport(experiment,ruleset,records));};
  const send=w=>{
    if(cancelled)return;
    if(next>=experiment.count){if(records.length===experiment.count)finish();return;}
    const count=Math.min(40,experiment.count-next),start=next;next+=count;
    w.postMessage({type:'run',job:start,start,count,experiment});
  };
  for(let i=0;i<workers;i++) {
    const worker=new Worker(new URL('../workers/batch-worker.js',import.meta.url),{type:'module'});handles.push(worker);
    worker.onmessage=({data})=>{
      if(finished)return;
      if(data.type==='ready')send(worker);
      if(data.type==='result'){records.push(...data.records);onProgress(records.length,experiment.count);send(worker);}
      if(data.type==='error'){finished=true;close();reject(new Error(data.message));}
    };
    worker.onerror=event=>{if(!finished){finished=true;close();reject(new Error(event.message||'Worker 执行失败'));}};
    worker.postMessage({type:'init',ruleset});
  }
  return {promise,cancel(){cancelled=true;finish();}};
}
