import {applyPatch} from './patch.js';
import {startExperiment} from '../simulation/pool.js';
export async function evaluateCandidates(report,ruleset,candidates,{onProgress=()=>{},signal}={}) {
  if(candidates.length>3)throw new Error('最多三个候选');
  const run=async (e,r,label)=>{
    if(signal?.aborted)throw new DOMException('已取消','AbortError');
    const task=startExperiment(e,r,{onProgress:(n,total)=>onProgress(label,n,total)});
    const cancel=()=>task.cancel();signal?.addEventListener('abort',cancel,{once:true});
    try{const result=await task.promise;if(result.partial)throw new DOMException('已取消','AbortError');return result;}
    finally{signal?.removeEventListener('abort',cancel);}
  };
  const variants=[];
  for(const c of candidates)variants.push({candidate:c,ruleset:await applyPatch(ruleset,c)});
  const heldout={...report.experiment,seed:`${report.experiment.seed}:validation`};
  const baselineValidation=await run(heldout,ruleset,'独立种子基线');
  const results=[];
  for(const v of variants) {
    const paired=await run(report.experiment,v.ruleset,v.candidate.title),validation=await run(heldout,v.ruleset,`${v.candidate.title} · 独立验证`);
    results.push({candidate:v.candidate,configHash:v.ruleset.hash,paired,validation});
  }
  return {baselineHash:ruleset.hash,baselineValidation,results};
}
