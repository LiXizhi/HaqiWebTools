import {currentQuest,questState,questReady,questProgress} from './adventure_core.js';
import {openingJourneyActive,openingJourneyTarget} from './opening_journey_core.js';
import {STARTERS} from './adventure_pets_core.js';
import {campDetourGoal,campDetourAvailable} from './camp_detour_core.js';
import {recommendedLanguageQuest} from './language_quest_core.js';

// Read-only advice: no rewards, progress writes or invented world targets.
export function guidePet(save,content){
 const pets=Object.values(save.pets||{});
 return pets.map(p=>p.speciesId||p.id).find(id=>STARTERS.includes(id))||STARTERS.find(id=>save.pets?.[id])||STARTERS.find(id=>content.pets?.[id]?.art);
}
export function companionWorldGuide(save,content,{languageTasks=[]}={}){
 const outing=campDetourGoal(save);
 if(outing)return {text:outing.text,label:'带我找找',track:'camp-detour'};
 if(campDetourAvailable(save)&&(save.openingJourney.wordplay?.step??0)<3)return {text:'换个玩法！用英语指挥我跳一跳、跑过来。',label:'和伙伴玩口令',track:'companion-wordplay'};
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

// Same authoritative objective as the tracker; no nearest-NPC guess and no progress writes.
export function companionWorldTarget(save,content,world){
 if(save.zone!=='camp'||world.zone!=='camp')return null;
 const outing=campDetourGoal(save);
 if(outing)return world.campToyTargets?.find(row=>row.id===outing.id)||null;
 let goal=openingJourneyActive(save)?openingJourneyTarget(save):null;
 if(!goal){
  const q=currentQuest(save,content);if(!q)return null;
  const state=questState(save,q.id);
  if(!state.accepted||questReady(save,q))goal={kind:'npc',id:state.accepted?q.endNpc:q.startNpc};
  else{
   const item=questProgress(save,q).find(g=>g.value<g.count);
   if(item?.kind==='talk')goal={kind:'npc',id:item.id};
   if(item?.kind==='defeat'){
    const encounter=world.encounters.find(e=>!e.hidden&&(content.monsters[e.monsterId]?.goalId===item.id));
    if(encounter)return {...encounter,kind:'encounter'};
   }
  }
 }
 if(!goal)return null;
 const list=goal.kind==='npc'?world.npcs:world.encounters;
 const target=list.find(row=>!row.hidden&&String(row.id)===String(goal.id));
 return target?{...target,kind:goal.kind}:null;
}
