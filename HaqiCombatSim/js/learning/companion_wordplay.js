import {learningLanguage} from '../learning_language_core.js';
import {createCompanionWordplay} from '../views/adventure/view_companion_wordplay.js';
import {wordplayGoal,wordplayAnswer,wordplayReaction} from '../companion_wordplay_core.js';

// One live interaction session; audio callbacks cannot act on a later round/role.
export function openCompanionWordplay({root,getState,commit,voice,onClose,onDone,drain=()=>{},viewFactory=createCompanionWordplay}){
 let dead=false,phase='ready',message='',messageParts=null,transcript='',inputMode=null,token=0,finishRequested=false,doneRequested=false,reaction=null,reactionId=0;
 let demoController=null,demoState='';
 let controller=new AbortController(),shownStep=wordplayGoal(getState().save)?.step??3;
 const language=learningLanguage(getState().save);
 const current=()=>!dead&&getState().active&&learningLanguage(getState().save)===language;
 const paint=()=>{if(current())view.render({...getState(),step:shownStep,phase,message,messageParts,transcript,inputMode,reaction,reactionId,demoState,completed:shownStep>=3});};
 function stopDemo(){const previous=demoController;demoController=null;demoState='';previous?.abort();}
 function fail(error){if(!current())return;phase='ready';messageParts=null;message=error?.message||'没听清，可以再说一次，也可以输入。';paint();}
 function submit(text,input='text',expectedStep=shownStep){
  if(!current()||phase==='success'||expectedStep!==shownStep)return false;
  stopDemo();
  const answer=wordplayAnswer(expectedStep,text,language);
  transcript=String(text||'').slice(0,200);
  inputMode=input;messageParts=null;
  if(!answer.accepted){
   const response=wordplayReaction(text,language);reaction=response?.action||null;
   if(response){reactionId++;messageParts=[{greet:'它也向你打招呼啦！',jump:'它跳起来了！',come:'它跑过来了！'}[reaction],wordplayGoal(getState().save).prompt+'。'];message=messageParts.join('');}
   else message=answer.message;
   phase='ready';paint();return false;
  }
  try{
   const result=commit({type:'companion-wordplay',step:'answer',expectedStep,language,text:transcript,input,receipt:crypto.randomUUID(),at:Date.now()});
   if(result===false||result?.accepted===false)throw Error(result?.message||'进度还没保存好，点一次发送重试。');
   token++;finishRequested=false;void voice.cancel();reaction=null;phase='success';message='';messageParts=null;paint();void drain();return true;
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
  stopDemo();
  const ticket=++token;finishRequested=false;message='';messageParts=null;transcript='';inputMode=null;phase='connecting';paint();
  try{await voice.start(controller.signal);if(!current()||ticket!==token)return;phase='recording';paint();if(finishRequested)await finishRecording();}
  catch(error){if(current()&&ticket===token)fail(error);}
 }
 function cancelRecording(){if(!['connecting','recording','checking'].includes(phase))return;token++;finishRequested=false;void voice.cancel();if(current()){phase='ready';message='';messageParts=null;paint();}}
 async function listen(){
  if(!current()||phase!=='ready'||demoController)return;
  const goal=wordplayGoal(getState().save);if(!goal)return;
  const ticket=++token,step=shownStep,demo=new AbortController();
  demoController=demo;demoState='preparing';message='';messageParts=null;paint();
  const valid=()=>current()&&ticket===token&&phase==='ready'&&shownStep===step&&demoController===demo;
  try{
   await voice.speak(goal.example,language,demo.signal,undefined,{onPlaying:()=>{
    if(valid()){demoState='playing';paint();}
   }});
  }catch{
   if(valid())message='暂时听不到示范。可以直接说，或用打字告诉它。';
  }finally{
   if(demoController===demo){demoController=null;demoState='';if(current()&&ticket===token&&phase==='ready'&&shownStep===step)paint();}
  }
 }
 function finish(){if(!current()||doneRequested)return;doneRequested=true;onDone();}
 function next(){
  if(!current()||phase!=='success')return;
  if(wordplayGoal(getState().save)?.done){finish();return;}
  shownStep=wordplayGoal(getState().save)?.step??3;
  phase='ready';message='';messageParts=null;transcript='';inputMode=null;reaction=null;paint();
 }
 const view=viewFactory(root,{listen,startRecording,finishRecording,cancelRecording,
  submit:text=>{if(phase==='ready')submit(text);},next,
  close:()=>{if(current())onClose();},done:finish});
 paint();
 return {dispose(){if(dead)return;dead=true;token++;stopDemo();controller.abort();void voice.cancel();view.dispose();}};
}
