import {learningLesson} from './learning_language_core.js';
import {currentQuest,questState,questReady,questProgress} from './adventure_core.js';
import {openingJourneyActive,openingJourneyTarget} from './opening_journey_core.js';
import {STARTERS} from './adventure_pets_core.js';
import {campDetourGoal,campDetourAvailable} from './camp_detour_core.js';
import {wordplayGoal} from './companion_wordplay_core.js';
import {recommendedLanguageQuest} from './language_quest_core.js';
import {nextAvailableIslandPuzzle} from './island_puzzles_core.js';
import {HANZI_STELE_SCROLLS,steleRubbingCount} from './hanzi_stele_scroll_core.js';

// Read-only advice: no rewards, progress writes or invented world targets.
export function guidePet(save,content){
 const pets=Object.values(save.pets||{});
 return pets.map(p=>p.speciesId||p.id).find(id=>STARTERS.includes(id))||STARTERS.find(id=>save.pets?.[id])||STARTERS.find(id=>content.pets?.[id]?.art);
}
export function companionWorldGuide(save,content,{languageTasks=[]}={}){
 const outing=campDetourGoal(save);
 if(outing)return {text:outing.text,label:'带我找找',track:'camp-detour'};
 if(campDetourAvailable(save)&&!wordplayGoal(save).done)return {text:`用${learningLesson(save).name}叫我跳一跳！`,label:'玩口令',track:'companion-wordplay'};
 if(save.zone==='camp'&&openingJourneyActive(save)){
  const goal=openingJourneyTarget(save);
  return {text:goal.objective,label:'带我去',track:'opening-journey'};
 }
 const language=recommendedLanguageQuest(save,content,languageTasks);
 if(save.zone!=='camp'&&language)return {text:'这里还有语言挑战。',label:'去看看',track:language.id};
 const q=currentQuest(save,content);
 if(q&&content.npcs[q.startNpc]?.zone===save.zone){
  const state=questState(save,q.id);
  if(!state.accepted)return {text:'找'+content.npcs[q.startNpc].name+'接任务。',label:'带我去',track:q.id};
  if(questReady(save,q))return {text:'找'+content.npcs[q.endNpc].name+'领奖！',label:'去领奖',track:q.id};
  const goal=questProgress(save,q).find(g=>g.value<g.count);
  const name=goal?.kind==='talk'?content.npcs[goal.id]?.name:null;
  const monster=goal?.kind==='defeat'?Object.values(content.monsters||{}).find(row=>row.goalId===goal.id):null;
  const text=name?'和'+name+'聊聊。':monster?'再击败'+Math.max(0,goal.count-goal.value)+'只'+monster.name+'。':'继续「'+q.name+'」。';
  return {text,label:'带我去',track:q.id};
 }
 if(save.zone!=='camp'){
  const puzzle=nextAvailableIslandPuzzle(save,save.zone);
  if(puzzle){
   return {text:`「${puzzle.landmark}」有现场机关「${puzzle.title}」等你处理。`,label:'带我去看看',track:`island-puzzle:${puzzle.id}`};
  }
  if(save.zone==='hanzi'){
   const left=HANZI_STELE_SCROLLS.length-steleRubbingCount(save);
   if(left>0){
    return {text:`石伯的碑林传拓册还有 ${left} 篇象形故事等你描红！`,label:'翻阅传拓册',panel:'hanzi-stele-scroll'};
   }
  }
 }
 return {text:'挑个任务，一起出发！',label:'看任务',panel:'quests'};
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
