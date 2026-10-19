import {observeTranslations} from './locale_runtime.js';
import {recordTreeExposure,wordAliases} from './language_tree_core.js';
import {createLanguageTreeStore} from './language_tree_store.js';
import {loadWordLexicon} from './word_lexicon.js';
import {wordLanguage,wordTreeKey,migrateWordLexicon,seedWordLexicon,WORD_LANGUAGES} from './word_lexicon_core.js';
const storage=createLanguageTreeStore(),listeners=new Map();
export const languageTreeStore={read:key=>storage.read(key),async update(key,reduce){const result=await storage.update(key,reduce);for(const listener of listeners.get(key)||[])listener(result);return result;},subscribe(key,listener){if(!listeners.has(key))listeners.set(key,new Set());listeners.get(key).add(listener);return ()=>{listeners.get(key)?.delete(listener);if(!listeners.get(key)?.size)listeners.delete(key);};}};
let getContext=()=>null,aliases=new Map(),batch=[],flushTimer=null,epoch=0;
const candidates=new Map(),watched=new Set();let observerStop=null,timer=null;
export function languageTreeContext(){const context=getContext();return context?{...context,epoch}:null;}
export function configureLanguageTreeCapture(getter,entries=[]){getContext=getter;aliases=wordAliases(entries);if(!observerStop)observerStop=observeTranslations(row=>{candidates.set(row.text,row);if(candidates.size>256)candidates.delete(candidates.keys().next().value);});}
export function setLanguageTreeVocabulary(entries){aliases=wordAliases(entries);}
export function invalidateLanguageTreeCapture(){epoch++;batch=[];for(const row of [...watched])row.cancel();clearTimeout(flushTimer);flushTimer=null;}
export async function flushLanguageTreeCapture(){clearTimeout(flushTimer);flushTimer=null;const pending=batch;batch=[];const context=getContext();if(!context?.key)return;
    const events=pending.filter(e=>e.key===context.key&&e.epoch===epoch);if(!events.length)return;
    for(const language of WORD_LANGUAGES){const rows=events.filter(e=>wordLanguage(e.locale)===language);if(!rows.length)continue;let index;try{index=await loadWordLexicon(language);}catch{if(getContext()?.key===context.key)context.onWarning?.('词库暂不可用，本次正文尚未记录。');continue;}if(getContext()?.key!==context.key||!rows.some(e=>e.epoch===epoch))continue;const result=await languageTreeStore.update(wordTreeKey(context.key,language),state=>{if(getContext()?.key!==context.key)return;migrateWordLexicon(state,index);seedWordLexicon(state,index);for(const event of rows)if(event.epoch===epoch)recordTreeExposure(state,event,index);});if(!result.persisted&&getContext()?.key===context.key)context.onWarning?.('语言树记录未保存，本次仅保存在内存中。');}
}
export function recordPresentedTreeText(event){const context=getContext();if(!context?.key||!WORD_LANGUAGES.includes(wordLanguage(event.locale)))return;
    let text=String(event.text||''),zh=String(event.zh||'');
    for(const name of context.privateNames||[]){if(!name||String(name).length<2)continue;text=text.split(String(name)).join('…');zh=zh.split(String(name)).join('…');}
    if(!text.trim()||/[{}]|https?:|@/.test(text))return;
    batch.push({...event,text,zh,key:context.key,epoch,at:Date.now()});if(!flushTimer)flushTimer=setTimeout(()=>void flushLanguageTreeCapture(),1000);
}
function visible(node){if(!node?.isConnected||document.hidden||node.closest('[hidden],[inert],[aria-hidden="true"]'))return false;
    const r=node.getBoundingClientRect();if(r.width<=0||r.height<=0||r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth)return false;
    for(let n=node;n instanceof Element;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false;}
    const x=Math.max(0,Math.min(innerWidth-1,(r.left+r.right)/2)),y=Math.max(0,Math.min(innerHeight-1,(r.top+r.bottom)/2)),top=document.elementFromPoint(x,y);
    return !!top&&(node.contains(top)||top.contains(node));
}
function tick(){timer=null;for(const row of [...watched]){
    if(row.key!==getContext()?.key||row.epoch!==epoch||(!row.node.isConnected&&performance.now()-row.created>2000)){row.cancel();continue;}
    if(row.ready()&&visible(row.node)&&row.node.textContent?.includes(row.event.text)){if(row.since===null)row.since=performance.now();if(performance.now()-row.since>=800){recordPresentedTreeText(row.event);row.cancel();}}
    else row.since=null;
}if(watched.size)timer=setTimeout(tick,100);}
// Called only by semantic content renderers, not generic DOM or every tr() call.
export function watchTreeText(node,{source='learning',label='学习正文',text=node?.textContent,zh='',locale,ready=()=>true}={}){
    const context=getContext();if(!context?.key||!node)return ()=>{};
    const translated=candidates.get(text),language=locale||node.lang||translated?.locale||document.documentElement.lang;
    if(!WORD_LANGUAGES.includes(wordLanguage(language))||!text||(wordLanguage(language)==='en'&&/[\u3400-\u9fff]/u.test(text)))return ()=>{};
    const row={node,key:context.key,epoch,created:performance.now(),since:null,ready,event:{source,label,text,zh:zh||translated?.source||'',locale:language},cancel(){watched.delete(row);}};
    watched.add(row);if(!timer)timer=setTimeout(tick,100);return row.cancel;
}
// Canvas callers explicitly confirm actual visible presentation for >=800ms.
export function createTreeCanvasPresentation(){let row=null;return {present(event,{visible:shown=true,complete=true,now=performance.now()}={}){if(!shown||!complete||document.hidden){row=null;return;}const key=JSON.stringify([event.source,event.text,event.locale,getContext()?.key]);if(row?.key!==key)row={key,since:now,done:false};if(!row.done&&now-row.since>=800){recordPresentedTreeText(event);row.done=true;}},clear(){row=null;}};}
