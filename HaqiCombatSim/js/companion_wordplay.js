import {createCompanionWordplay} from './view_companion_wordplay.js';
import {wordplayGoal,wordplayAnswer,wordplayReaction} from './companion_wordplay_core.js';

// One live interaction session; audio callbacks cannot act on a later round/role.
export function openCompanionWordplay({root,getState,commit,voice,onClose,onDone,drain=()=>{},viewFactory=createCompanionWordplay}){
 let dead=false,phase='ready',message='',transcript='',token=0,finishRequested=false,doneRequested=false,reaction=null,reactionId=0;
 let controller=new AbortController(),shownStep=wordplayGoal(getState().save)?.step??3;
 const current=()=>!dead&&getState().active;
 const paint=()=>{if(current())view.render({...getState(),step:shownStep,phase,message,transcript,reaction,reactionId,completed:shownStep>=3});};
 function fail(error){if(!current())return;phase='ready';message=error?.message||'没听清，可以再说一次，也可以输入。';paint();}
 function submit(text,input='text',expectedStep=shownStep){
  if(!current()||phase==='success'||expectedStep!==shownStep)return false;
  const answer=wordplayAnswer(expectedStep,text);
  transcript=String(text||'').slice(0,200);
  if(!answer.accepted){
   const response=wordplayReaction(text);reaction=response?.action||null;
   if(response){reactionId++;message=({greet:'它也向你打招呼啦！',jump:'它跳起来了！',come:'它跑过来了！'}[reaction])+wordplayGoal(getState().save).prompt+'。';}
   else message=answer.message;
   phase='ready';paint();return false;
  }
  try{
   const result=commit({type:'companion-wordplay',step:'answer',expectedStep,text:transcript,input,receipt:crypto.randomUUID(),at:Date.now()});
   if(result===false||result?.accepted===false)throw Error(result?.message||'进度还没保存好，点一次发送重试。');
   token++;finishRequested=false;void voice.cancel();reaction=null;phase='success';message='';paint();void drain();return true;
  }catch(error){fail(error);return false;}
 }
 async function finishRecording(){
  if(!current())return;
  if(phase==='connecting'){finishRequested=true;return;}
  if(phase!=='recording')return;
  const ticket=token,step=shownStep;phase='checking';paint();
  try{const text=await voice.finish();if(current()&&ticket===token)submit(text,'speech',step);}
  catch(error){if(current()&&ticket===token)fail(error);}
 }
 async function startRecording(){
  if(!current()||phase!=='ready')return;
  const ticket=++token;finishRequested=false;message='';phase='connecting';paint();
  try{await voice.start(controller.signal);if(!current()||ticket!==token)return;phase='recording';paint();if(finishRequested)await finishRecording();}
  catch(error){if(current()&&ticket===token)fail(error);}
 }
 function cancelRecording(){if(!['connecting','recording','checking'].includes(phase))return;token++;finishRequested=false;void voice.cancel();if(current()){phase='ready';message='';paint();}}
 async function listen(){
  if(!current()||phase!=='ready')return;
  const goal=wordplayGoal(getState().save);if(!goal)return;
  const ticket=++token,step=shownStep;message='';
  try{await voice.speak(goal.example,'en',controller.signal);}
  catch(error){if(current()&&ticket===token&&phase==='ready'&&shownStep===step)fail(error);}
 }
 function finish(){if(!current()||doneRequested)return;doneRequested=true;onDone();}
 function next(){
  if(!current()||phase!=='success')return;
  if(wordplayGoal(getState().save)?.done){finish();return;}
  shownStep=wordplayGoal(getState().save)?.step??3;
  phase='ready';message='';transcript='';reaction=null;paint();
 }
 const view=viewFactory(root,{listen,startRecording,finishRecording,cancelRecording,
  submit:text=>{if(phase==='ready')submit(text);},next,
  close:()=>{if(current())onClose();},done:finish});
 paint();
 return {dispose(){if(dead)return;dead=true;token++;controller.abort();void voice.cancel();view.dispose();}};
}
