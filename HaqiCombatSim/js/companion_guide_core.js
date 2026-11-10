import {currentQuest,questState,questReady,questProgress} from './adventure_core.js';
import {openingJourneyActive,openingJourneyTarget} from './opening_journey_core.js';
import {STARTERS} from './adventure_pets_core.js';
import {recommendedLanguageQuest} from './language_quest_core.js';

// Read-only advice: no rewards, progress writes or invented world targets.
export function guidePet(save,content){
 const pets=Object.values(save.pets||{});
 return pets.map(p=>p.speciesId||p.id).find(id=>STARTERS.includes(id))||STARTERS.find(id=>save.pets?.[id])||STARTERS.find(id=>content.pets?.[id]?.art);
}
export function companionWorldGuide(save,content,{languageTasks=[]}={}){
 if(save.zone==='camp'&&openingJourneyActive(save)){
  const goal=openingJourneyTarget(save);
  return {text:goal.objective,label:'带我去',track:'opening-journey'};
 }
 const language=recommendedLanguageQuest(save,content,languageTasks);
 if(save.zone!=='camp'&&language)return {text:language.title||language.name||'我们继续这里的语言冒险。',label:'继续这件事',track:language.id};
 const q=currentQuest(save,content);
 if(q&&content.npcs[q.startNpc]?.zone===save.zone){
  const state=questState(save,q.id);
  if(!state.accepted)return {text:'去找'+content.npcs[q.startNpc].name+'，看看下一件事。',label:'带我去',track:q.id};
  if(questReady(save,q))return {text:'做到了！找'+content.npcs[q.endNpc].name+'领这次的奖励。',label:'带我领奖',track:q.id};
  const goal=questProgress(save,q).find(g=>g.value<g.count);
  const name=goal?.kind==='talk'?content.npcs[goal.id]?.name:null;
  return {text:name?'下一步，和'+name+'说说话。':q.description,label:'带我做下一步',track:q.id};
 }
 return {text:'我陪你看看这里。先选一件你感兴趣的任务吧。',label:'看看这里的任务',panel:'quests'};
}
