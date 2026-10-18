import {createDictionaryStore} from './dictionary_store.js';
import {recordSpeakingPractice,learningReportMarkdown} from './learning_report_core.js';

let currentKey=()=>null,last=null;
const store=createDictionaryStore();
export function configureLearningReport(getKey){currentKey=getKey;}
export function captureLearningReportKey(){return currentKey();}
export function reportSpeakingPractice(key){
    if(!key||key!==currentKey())return;
    void store.update(key,state=>recordSpeakingPractice(state)).catch(()=>{});
}
function publish(key,state){
    if(key!==currentKey())return;
    last={key,state};
    const params=new URLSearchParams(location.search),origin=params.get('parentOrigin');
    if(params.get('host')!=='family-pad'||window.parent===window||!origin)return;
    try{
        const target=new URL(origin);if(!['http:','https:'].includes(target.protocol)||target.origin!==origin)return;
        window.parent.postMessage({type:'updateDesktopUI',content:Array.from(learningReportMarkdown(state)).slice(0,200).join('')},origin);
    }catch{}
}
if(typeof window!=='undefined'&&typeof document!=='undefined'){
    window.addEventListener('haqi:learning-progress',event=>{if(event.detail?.persisted)publish(event.detail.key,event.detail.state);});
    // Returning from a hidden tab refreshes week/month labels without any cloud request.
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&last)publish(last.key,last.state);});
}
