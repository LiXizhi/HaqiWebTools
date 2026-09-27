import {analyzeDecision} from './inference_core.js';
import {haqiRulesAdapter} from './haqi_adapter_core.js';
self.onmessage=({data})=>{try{const result=analyzeDecision(data.observation,{...data.options,rulesAdapter:haqiRulesAdapter});self.postMessage({id:data.id,result});}catch(error){self.postMessage({id:data.id,error:String(error.message||error)});}};
