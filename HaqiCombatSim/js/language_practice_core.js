import {recordHomeStory} from './home_story_core.js';
import {recordHomeReview,recordHomeComprehensionReview} from './home_review_core.js';
import {canonicalWord} from './word_lexicon_core.js';
export const BASIC_PRACTICE_THRESHOLD=10;
// Listening/reading selection is separate evidence, never speaking/writing or
// an automatic basic mark. The controller validates the real scene choice.
export function recordComprehensionPractice(state,event,index){
 if(!event?.id||!event.valid||!['read','listen'].includes(event.input)||!Number.isFinite(event.at)||event.at<0||!Number.isSafeInteger(event.attempts)||event.attempts<1||typeof event.assisted!=='boolean'||(event.input==='listen'&&event.heard!==true))return false;
 const ids=[...new Set((event.words||[]).map(w=>canonicalWord(index,w)).filter(Boolean))];
 if(!ids.length||ids.some(id=>!state.words?.[id]?.lastPractice?.at))return false;
 state.practiceReceipts??={};if(Object.hasOwn(state.practiceReceipts,event.id))return false;
 state.practiceReceipts[event.id]=true;
 if(['read','listen'].includes(event.review?.mode))recordHomeStory(state,event);
 for(const id of ids){
  const word=state.words[id];word.comprehension??={};
  const evidence=word.comprehension[event.input]??={count:0,unassistedFirstChoice:0};
  evidence.count++;if(!event.assisted&&event.attempts===1)evidence.unassistedFirstChoice++;
  evidence.last={id:event.id,at:event.at,source:event.source,assisted:event.assisted,attempts:event.attempts};
 }
 recordHomeComprehensionReview(state,event,ids);
 return true;
}
// Validated target words only. Encounter counts and verified mastery remain independent.
export function recordEffectivePractice(state,event,index){
 if(!event?.id||!event.valid||!['text','speech'].includes(event.input)||!Number.isFinite(event.at))return false;
 state.practiceReceipts??={};if(Object.hasOwn(state.practiceReceipts,event.id))return false;
 const ids=[...new Set(event.words.map(word=>canonicalWord(index,word)).filter(Boolean))];if(!ids.length)return false;
 state.practiceReceipts[event.id]=true;
 recordHomeReview(state,event,ids);
 for(const id of ids){const w=state.words[id];if(!w)continue;w.practiceCount=(w.practiceCount||0)+1;w.lastPractice={id:event.id,input:event.input,source:event.source||'home',at:event.at};
  if(!['basic','know'].includes(w.mark)&&w.practiceCount-(w.practiceBaseline||0)>=BASIC_PRACTICE_THRESHOLD){w.mark='basic';w.basicSource='effective-practice';w.basicAt=event.at;}
 }
 return true;
}
