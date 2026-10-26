import {homeComprehensionChoices} from './home_comprehension_core.js';
import {homeStoryProgress} from './home_story_core.js';
import {selectAuthoredHomeGame} from './home_authored_game_core.js';
import {homeGameActions,homeStoryPetEligible} from './home_language_game_core.js';
import {homeNewWordBudget} from './home_review_core.js';
import {canonicalWord} from './word_lexicon_core.js';

// Read-only projection of the same author selection rules used at play time.
// No inventory, learning, story progress or rewards are changed by a preview.
export function homeStoryReadiness(data,arc,args){
 const {state,homeId,index,objects,pets,catalog,now}=args;
 const progress=homeStoryProgress(state,homeId,arc.id),step=arc.steps[progress.next];
 const result={next:progress.next,total:arc.steps.length,futureItems:[]};
 if(!step)return {...result,status:'complete'};
 for(const remaining of arc.steps.slice(progress.next)){
  const g=data.games.find(g=>g.id===remaining.storyId);
  for(const ids of [g.action.itemIds,g.position?.anchorItemIds].filter(ids=>ids?.length)){
   if(!objects.some(o=>ids.includes(o.itemId))&&!result.futureItems.some(group=>JSON.stringify(group)===JSON.stringify(ids)))result.futureItems.push(ids);
  }
 }
 const lesson=data.games.find(g=>g.id===step.storyId),savedIds=step.useObjects.map(n=>progress.objects[n]);
 if(savedIds.some(id=>!id||!objects.some(o=>o.id===id)))return {...result,status:'saved-object'};
 const savedPet=step.usePet===undefined?null:progress.pets?.[step.usePet];
 if(step.usePet!==undefined&&!pets.some(p=>p.id===savedPet))return {...result,status:'saved-pet'};
 const availablePets=savedPet?pets.filter(p=>p.id===savedPet):pets;
 if(!availablePets.length)return {...result,status:'pet'};
 if(lesson.action.petSpeciesIds&&!availablePets.some(p=>homeStoryPetEligible(lesson.action,p)))return {...result,status:availablePets.some(p=>lesson.action.petSpeciesIds.includes(p.speciesId))?'pet-stage':'pet',speciesIds:lesson.action.petSpeciesIds};
 const known=w=>!!state.words?.[canonicalWord(index,w)]?.lastPractice?.at;
 const missing=[...new Set([...(lesson.requires||[]),...lesson.words.filter(w=>!lesson.introduces?.some(i=>i.word===w))].filter(w=>!known(w)))];
 if(missing.length)return {...result,status:'words',words:missing};
 const budget=homeNewWordBudget(state,now,data.policy?.maxNewWordsPerVisit||0);
 if(lesson.words.filter(w=>!known(w)).length>budget)return {...result,status:'budget'};
 const selectedObjects=objects.filter(o=>!savedIds.some(id=>objects.find(a=>a.id===id)?.itemId===o.itemId)||savedIds.includes(o.id));
 if(lesson.action.itemIds.length&&!selectedObjects.some(o=>lesson.action.itemIds.includes(o.itemId)))return {...result,status:'items',items:lesson.action.itemIds};
 const actions=homeGameActions(lesson.mode,selectedObjects,availablePets,catalog);
 if(['read','listen'].includes(lesson.mode)&&!homeComprehensionChoices(lesson.action.itemIds,selectedObjects,actions))return {...result,status:'choices'};
 const game=selectAuthoredHomeGame({...data,games:[lesson]},{...args,mode:lesson.mode,arcId:arc.id,objects:selectedObjects,pets:availablePets,actions,newWordBudget:budget});
 return {...result,status:game?'ready':'layout',needsDrawing:!!lesson.requiresDrawing,drawingObjectId:lesson.requiresDrawing?selectedObjects.find(o=>lesson.action.itemIds.includes(o.itemId))?.id:undefined};
}

export function homePrerequisiteLesson(data,word,args){
 const {objects,pets,catalog,state,now}=args;
 for(const story of data.games){
  if(story.arcOnly||!story.introduces?.some(i=>i.word===word))continue;
  const game=selectAuthoredHomeGame({...data,games:[story]},{...args,mode:story.mode,actions:homeGameActions(story.mode,objects,pets,catalog),newWordBudget:homeNewWordBudget(state,now,data.policy?.maxNewWordsPerVisit||0)});
  if(game)return story;
 }
 return null;
}
