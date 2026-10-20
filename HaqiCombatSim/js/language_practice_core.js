import {canonicalWord} from './word_lexicon_core.js';
export const BASIC_PRACTICE_THRESHOLD=10;
// Validated target words only. Encounter counts and verified mastery remain independent.
export function recordEffectivePractice(state,event,index){
 if(!event?.id||!event.valid||!['text','speech'].includes(event.input)||!Number.isFinite(event.at))return false;
 state.practiceReceipts??={};if(Object.hasOwn(state.practiceReceipts,event.id))return false;
 const ids=[...new Set(event.words.map(word=>canonicalWord(index,word)).filter(Boolean))];if(!ids.length)return false;
 state.practiceReceipts[event.id]=true;
 for(const id of ids){const w=state.words[id];if(!w)continue;w.practiceCount=(w.practiceCount||0)+1;w.lastPractice={id:event.id,input:event.input,source:event.source||'home',at:event.at};
  if(!['basic','know'].includes(w.mark)&&w.practiceCount-(w.practiceBaseline||0)>=BASIC_PRACTICE_THRESHOLD){w.mark='basic';w.basicSource='effective-practice';w.basicAt=event.at;}
 }
 return true;
}
