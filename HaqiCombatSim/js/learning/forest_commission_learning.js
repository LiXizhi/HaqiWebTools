// A saved receipt survives a reload or failed IndexedDB write. The shared
// vocabulary adapter owns eligibility, canonical words and receipt deduplication.
import {forestCommissionLesson,forestPracticeLanguage} from '../forest_commission_language_core.js';
const vocabulary=(event,word)=>{const language=forestPracticeLanguage(event),lesson=forestCommissionLesson({languageLearning:{target:language}});return {language:language==='zh-CN'?'zh':language,words:[lesson.words[word]]};};
export async function flushForestCommissionPractice(save,{record,valid,persist}){
 let flushed=false;
 const event=save.forestCommission?.practice;
 if(!valid())return false;
 if(event){
  const result=await record({...event,...vocabulary(event,'boots'),input:'read',source:'forest-commission'},valid);
 if(!result?.persisted||!valid()||save.forestCommission?.practice!==event)return false;
 delete save.forestCommission.practice;
 try{
  if(!persist()){save.forestCommission.practice=event;return false;}
 }catch(error){save.forestCommission.practice=event;throw error;}
 flushed=true;
 }
 const noteEvent=save.forestCommission?.notePractice;
 if(noteEvent){
  const result=await record({...noteEvent,...vocabulary(noteEvent,'note'),input:'read',source:'forest-commission'},valid);
  if(!result?.persisted||!valid()||save.forestCommission?.notePractice!==noteEvent)return false;
  delete save.forestCommission.notePractice;
  try{if(!persist()){save.forestCommission.notePractice=noteEvent;return false;}}
  catch(error){save.forestCommission.notePractice=noteEvent;throw error;}
  flushed=true;
 }
 while(valid()&&save.forestCommission?.labelPractice?.length){
  const pending=save.forestCommission.labelPractice,event=pending[0];
  const {word,...receipt}=event;
  const result=await record({...receipt,...vocabulary(event,word),input:'text',source:'forest-commission'},valid);
  if(!result?.persisted||!valid()||save.forestCommission?.labelPractice!==pending)return false;
  pending.shift();
  try{if(!persist()){pending.unshift(event);return false;}}
  catch(error){pending.unshift(event);throw error;}
  flushed=true;
 }
 while(valid()&&save.forestCommission?.exchangePractice?.length){
  const pending=save.forestCommission.exchangePractice,event=pending[0],{word,...receipt}=event;
  const result=await record({...receipt,...vocabulary(event,word),source:'forest-commission'},valid);
  if(!result?.persisted||!valid()||save.forestCommission?.exchangePractice!==pending)return false;
  pending.shift();
  try{if(!persist()){pending.unshift(event);return false;}}catch(error){pending.unshift(event);throw error;}
  flushed=true;
 }
 return flushed;
}
