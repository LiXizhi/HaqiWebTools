import {createTeachingEvaluation} from './dictionary-live-evaluation.js';
import {createDictionary} from '../../js/adventure_dictionary.js';
import {emptyDictionary} from '../../js/dictionary_core.js';
import {loadKeepwork} from '../../js/adventure_cloud.js';
import {createLearningVoice} from '../../js/language_adventure_voice.js';
const status=document.querySelector('#status'),root=document.querySelector('#overlay'),buttons=[...document.querySelectorAll('main button')];
let state=null,dictionary=null,sdk=null,unsubscribe=null,authRevision=0;const rows=new Map();
const evaluation=createTeachingEvaluation(document.querySelector('main'),()=>state);
const audioLog=document.createElement('section'),audioTitle=document.createElement('h2'),audioEvents=document.createElement('ol');audioTitle.textContent='真实朗读事件（刷新清空）';audioLog.append(audioTitle,audioEvents);document.querySelector('main').append(audioLog);
const storage={async update(key,reduce){const row=structuredClone(rows.get(key)||emptyDictionary()),result=reduce(row);rows.set(key,row);return {state:structuredClone(row),result,persisted:true};}};
function close(){dictionary?.close();dictionary=null;}
function controls(ready){evaluation.setReady(ready);document.querySelector('#zh').disabled=!ready;document.querySelector('#en').disabled=!ready;}
function liveVoice(){
    const voice=createLearningVoice({getSettings:()=>state?.save.languageLearning||{}}),judge=voice.judge;
    voice.judge=async(...args)=>{
        try{
            const value=await judge(...args);
            const fields={};for(const key of ['entryId','question','correct','evidence','feedback'])if(['string','boolean'].includes(typeof value?.[key]))fields[key]=typeof value[key]==='string'?value[key].slice(0,500):value[key];
            status.textContent='最近一次模型返回（仅验收，刷新清空）：'+JSON.stringify(fields);
            return value;
        }catch(error){status.textContent='最近一次模型请求未完成；未记录凭据或服务原始错误。';throw error;}
    };
    const speak=voice.speak,cancel=voice.cancel;let current=null;
    voice.speak=async(text,locale,signal,character,options={})=>{
        const row=document.createElement('li'),record={row,started:false,stopped:false},startedAt=performance.now();current=record;
        const prefix=`${locale} · ${options.playbackRate===0.8?'慢速0.8':'正常1.0'} · ${String(text).slice(0,100)}`;
        const show=event=>{row.textContent=prefix+'：'+event;};show('准备中');audioEvents.append(row);while(audioEvents.children.length>10)audioEvents.firstElementChild.remove();
        try{await speak(text,locale,signal,character,{...options,onPlaying:()=>{record.started=true;show(`已开始播放（等待${Math.round(performance.now()-startedAt)}毫秒）`);options.onPlaying?.();}});if(!record.stopped)show(record.started?'播放结束（已收到开始事件）':'请求结束（未收到开始事件）');}
        catch(error){if(!record.stopped)show('播放失败；未记录服务原始错误');throw error;}
        finally{if(current===record)current=null;}
    };
    voice.cancel=async()=>{if(current){current.stopped=true;current.row.textContent+=' → 已停止';}return cancel();};
    return voice;
}
async function connect(interactive){
    evaluation.setReady(false);for(const b of buttons)b.disabled=true;status.textContent='正在连接 Keepwork…';
    try{
        sdk=await loadKeepwork();
        if(!unsubscribe)unsubscribe=sdk.onAuthStateChange(()=>{authRevision++;close();state=null;rows.clear();controls(false);status.textContent='登录状态已变化，请重新检查连接。';});
        if(!sdk.token&&interactive)await sdk.showLoginWindow({title:'登录 Keepwork，验收字典服务',lang:'zhCN'});
        if(!sdk.token){status.textContent='当前浏览器尚未登录。请使用上方登录按钮；不需要提供任何凭据给验收脚本。';return;}
        const revision=authRevision;
        const profile=await sdk.getUserProfile({useCache:true});if(revision!==authRevision||!sdk.token||!profile?.username)throw Error('登录状态尚未就绪');
        state={owner:profile.username,role:'dictionary-live-qa',stage:'world',content:{},save:{seed:3,languageLearning:{}}};
        controls(true);status.textContent='已连接。可以打开字典，开始真实模型与语音体验。';
    }catch{status.textContent='连接未完成。请检查网络或重新登录；未运行模型验收。';}
    finally{document.querySelector('#check').disabled=false;document.querySelector('#login').disabled=false;}
}
function open(language){if(!state)return;close();dictionary=createDictionary({root,getState:()=>state,storage,voice:liveVoice(),onClose:close,onBuff:buff=>{state.save.dailyLanguageBuff=structuredClone(buff);},onRewards:()=>{},onLegacy:()=>{}});dictionary.open(language).catch(()=>{close();status.textContent='字典加载失败，请检查本地服务。';});}
document.querySelector('#check').onclick=()=>connect(false);document.querySelector('#login').onclick=()=>connect(true);document.querySelector('#zh').onclick=()=>open('zh');document.querySelector('#en').onclick=()=>open('en');
document.addEventListener('visibilitychange',()=>{if(document.hidden)dictionary?.suspend();});window.addEventListener('pagehide',()=>{evaluation.cancel();close();unsubscribe?.();});
