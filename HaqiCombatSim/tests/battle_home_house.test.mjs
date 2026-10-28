import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
import {selectAuthoredHomeGame} from '../js/home_authored_game_core.js';
import {homeGameActions,homeGameActionMatches} from '../js/home_language_game_core.js';
import {homeStoryReadiness} from '../js/home_story_readiness_core.js';
import {homePositionCurrent} from '../js/home_position_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read('data/adventure/curriculum/english-home-practice.json'),catalog=read('data/adventure/home/catalog.json').items;
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const objects=[{id:'house',itemId:'dollhouse',x:0,y:1},{id:'book',itemId:'book',x:3,y:0}],pets=[{id:'pet'}];
const state={words:{house:{lastPractice:{at:1}},book:{lastPractice:{at:1}}}};
test('house introductions use the visible dollhouse; independent comprehension needs a real alternative',()=>{
 for(const mode of ['find','read','listen','write']){
  const subset={...data,games:data.games.filter(g=>g.id.startsWith('en-l1-house-')&&g.mode===mode)};
  const args={mode,index,state,objects,pets,catalog,newWordBudget:1,actions:homeGameActions(mode,objects,pets,catalog)};
  const game=selectAuthoredHomeGame(subset,args);assert.ok(game);assert.equal(game.action.objectId,'house');
  assert.equal(homeGameActionMatches(game,{...game.action,objectId:'book',text:game.answer}),false);
  if(['read','listen'].includes(mode))assert.equal(selectAuthoredHomeGame(subset,{...args,objects:objects.slice(0,1),actions:args.actions.filter(a=>a.objectId==='house')}),null);
  assert.equal(selectAuthoredHomeGame(subset,{...args,objects:objects.slice(1),actions:args.actions.filter(a=>a.objectId==='book')}),null);
 }
});
test('the house story binds both the original book and house rather than another house nearby',()=>{
 const arc=data.arcs.find(a=>a.id==='en-l1-a-story-corner-by-the-house'),progress=structuredClone(state);
 progress.homeStories={[JSON.stringify(['home',arc.id])]:{next:2,objects:{0:'house',1:'book'},pets:{}}};
 const args={state:progress,homeId:'home',index,objects:[...objects,{id:'other-house',itemId:'dollhouse',x:7,y:1}],pets,catalog,now:1000};
 assert.equal(homeStoryReadiness(data,arc,args).status,'ready');
 const lesson=data.games.find(g=>g.id===arc.steps[2].storyId),game=selectAuthoredHomeGame({...data,games:[lesson]}, {index,state,mode:'place',objects,pets,catalog,arcId:arc.id,newWordBudget:1,actions:homeGameActions('place',objects,pets,catalog)});
 assert.ok(game);const binding=game.position;
 assert.equal(homePositionCurrent(binding,[objects[0],{...objects[1],x:7,y:0}],catalog),false);
 assert.ok(homePositionCurrent(binding,[objects[0],{...objects[1],x:-1.5,y:1}],catalog));
 assert.equal(homePositionCurrent(binding,[{...objects[0],x:1},{...objects[1],x:-1.5,y:1}],catalog),false);
 assert.equal(homeStoryReadiness(data,arc,{...args,objects:args.objects.filter(o=>o.id!=='house')}).status,'saved-object');
});
