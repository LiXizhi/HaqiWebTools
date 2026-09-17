import {runBatch} from '../simulation/runner.js';
let ruleset;
self.onmessage=({data})=>{
  try {
    if(data.type==='init'){ruleset=data.ruleset;self.postMessage({type:'ready'});return;}
    if(data.type==='run')self.postMessage({type:'result',job:data.job,records:runBatch(data.experiment,ruleset,{start:data.start,count:data.count})});
  }catch(e){self.postMessage({type:'error',job:data.job,message:e.message});}
};
