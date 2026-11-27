import {forgeLesson} from '../forge_commission_language_core.js';

// Clear only after both vocabulary storage and the adventure save acknowledge it.
// Stable per-role receipt ids make a retry after a crash safe.
export async function flushForgeCommissionPractice(save,{record,valid,persist}){
 let flushed=false;
 while(valid()&&save.forgeCommission?.practice?.length){
  const pending=save.forgeCommission.practice,event=pending[0];
  const lesson=forgeLesson({languageLearning:{target:event.language}});
  const result=await record({...event,language:event.language==='zh-CN'?'zh':event.language,words:[lesson.tea],input:'text',source:'forge-commission'},valid);
  if(!result?.persisted||!valid()||save.forgeCommission?.practice!==pending)return false;
  pending.shift();
  try{if(!persist()){pending.unshift(event);return false;}}
  catch(error){pending.unshift(event);throw error;}
  flushed=true;
 }
 return flushed;
}
