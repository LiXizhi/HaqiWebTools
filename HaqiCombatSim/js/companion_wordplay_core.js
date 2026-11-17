import {LEARNING_LANGUAGES,learningLanguage,learningLesson,normalizeLearningAnswer} from './learning_language_core.js';
const prompts=['跟抱抱龙打个招呼','让抱抱龙跳一下','叫抱抱龙到身边来'];
const actions=['greet','jump','come'];
const rounds=language=>learningLesson(language).rounds.map(([word,example,answers],i)=>({word,example,answers,prompt:prompts[i],action:actions[i]}));
const assert=(ok,message)=>{if(!ok)throw Error(message);};
export function wordplayGoal(save){
 const language=learningLanguage(save),step=save.openingJourney?.wordplay?.step??0,round=rounds(language)[step];
 return round?{language,step,total:3,done:false,word:round.word,prompt:round.prompt,example:round.example,action:round.action}:{step:3,total:3,done:true,word:'',prompt:'抱抱龙听懂你啦',example:'',action:'celebrate'};
}
export function wordplayAnswer(step,text,language='en'){
 const round=rounds(language)[step],raw=typeof text==='string'?text.trim():'';
 // Whole-utterance whitelist permits polite requests, but never negations or unrelated clauses.
 const normalized=normalizeLearningAnswer(raw,language);
 const accepted=!!round&&raw.length<=120&&round.answers.some(line=>normalizeLearningAnswer(line,language)===normalized)&&(!/[?？]/u.test(raw)||/^(can|could) you /u.test(normalized));
 return {accepted,message:accepted?'它听懂啦！':round?`试试说：${round.example}`:'已经完成啦。'};
}
export function wordplayReaction(text,language='en'){
 const step=rounds(language).findIndex((_round,index)=>wordplayAnswer(index,text,language).accepted);
 return step<0?null:{action:actions[step],step};
}
export function validateCompanionWordplay(save){
 const state=save.openingJourney?.wordplay;if(state===undefined)return true;
 assert(state&&Number.isInteger(state.step)&&state.step>=0&&state.step<=3,'伙伴口语进度无效');
 const receipts=state.receipts||[];
 assert(Array.isArray(receipts)&&receipts.length===state.step&&receipts.length<=3&&new Set(receipts).size===receipts.length&&receipts.every(id=>typeof id==='string'&&id.length>0&&id.length<=160),'伙伴口语收据无效');
 const practices=state.practices||[];
 assert(Array.isArray(practices)&&practices.length<=3&&new Set(practices.map(row=>row?.id)).size===practices.length,'伙伴口语练习无效');
 for(const row of practices){
  const index=receipts.indexOf(row?.id);
  assert(index>=0&&row.itemId===`companion-wordplay-${index+1}`&&LEARNING_LANGUAGES.includes(row.language)&&row.word===rounds(row.language)[index].word&&['text','speech'].includes(row.input)&&Number.isSafeInteger(row.at)&&row.at>=0,'伙伴口语练习无效');
 }
 return true;
}
// Controller applies this to its persistence clone. No currency, inventory,
// combat or learning-mastery changes; only accepted independent submissions queue.
export function applyCompanionWordplay(save,content,action){
 assert(save.zone==='camp'&&save.openingJourney?.phase==='done'&&!save.pendingEncounter,'先完成营地的伙伴挑战，再来玩口语游戏');validateCompanionWordplay(save);
 assert(action?.step==='answer','请选择口语互动');
 const state=save.openingJourney.wordplay||{step:0,receipts:[],practices:[]};
 assert(typeof action.receipt==='string'&&action.receipt.length>0&&action.receipt.length<=160,'伙伴口语收据无效');
 if((state.receipts||[]).includes(action.receipt))return {accepted:false,duplicate:true,step:state.step,done:state.step===3,message:'这次互动已经记录了。'};
 if(action.expectedStep!==state.step||state.step===3)return {accepted:false,stale:true,step:state.step,done:state.step===3,message:'这一句已经结束，看看现在的提示。'};
 assert(['text','speech'].includes(action.input),'请自己输入或说一句');
 assert(Number.isSafeInteger(action.at)&&action.at>=0,'伙伴口语时间无效');
 const language=learningLanguage(save);if(action.language!==undefined&&action.language!==language)return {accepted:false,stale:true,message:'学习语言已切换，请按当前提示再说一次。'};
 const answer=wordplayAnswer(state.step,action.text,language);if(!answer.accepted)return {...answer,step:state.step,done:false};
 const index=state.step,round=rounds(language)[index];
 const next={...state,step:index+1,receipts:[...(state.receipts||[]),action.receipt],practices:[...(state.practices||[]),{id:action.receipt,input:action.input,itemId:`companion-wordplay-${index+1}`,language,at:action.at,word:round.word}]};
 save.openingJourney.wordplay=next;
 return {accepted:true,step:next.step,done:next.step===3,action:round.action,message:answer.message};
}
