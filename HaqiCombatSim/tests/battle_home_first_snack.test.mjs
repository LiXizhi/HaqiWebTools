import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
import {selectAuthoredHomeGame,validateAuthoredHomeGames} from '../js/home_authored_game_core.js';
import {homeGameActions,homeGameActionMatches} from '../js/home_language_game_core.js';
import {homeStoryReadiness} from '../js/home_story_readiness_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read('data/adventure/curriculum/english-home-practice.json'),catalog=read('data/adventure/home/catalog.json').items;
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const objects=[{id:'bread',itemId:'bread-basket',x:2,y:1},{id:'cup',itemId:'cup',x:3,y:3}],pets=[{id:'guest'},{id:'other'}];
test('offering food teaches only give or take after the correct guest actually eats or drinks',()=>{
 validateAuthoredHomeGames(data,index);
 for(const lesson of data.games.filter(g=>/^en-l1-(give|take)-/.test(g.id))){
  const state={words:{bread:{lastPractice:{at:1}},water:{lastPractice:{at:1}},give:{lastPractice:{at:2}},take:{lastPractice:{at:2}}}};
  const args={mode:'care',index,state,objects,pets,catalog,newWordBudget:1,actions:homeGameActions('care',objects,pets,catalog)};
  const game=selectAuthoredHomeGame({...data,games:[lesson],arcs:[]},args);assert.ok(game);
  assert.equal(homeGameActionMatches(game,{...game.action,petId:'missing'}),false);
  assert.equal(homeGameActionMatches(game,{...game.action,activity:'sleep'}),false);
  assert.equal(homeGameActionMatches(game,{...game.action,objectId:game.action.objectId==='cup'?'bread':'cup'}),false);
  assert.ok(homeGameActionMatches(game,game.action));
  assert.equal(selectAuthoredHomeGame({...data,games:[lesson],arcs:[]},{...args,state:{words:{}}}),null);
  if(lesson.introduces){
   const first={...args,state:{words:{bread:state.words.bread,water:state.words.water}}};
   assert.equal(selectAuthoredHomeGame({...data,games:[lesson],arcs:[]},{...first,newWordBudget:0}),null);
   assert.deepEqual(selectAuthoredHomeGame({...data,games:[lesson],arcs:[]},first).introducedWords,lesson.words);
  }
 }
});
test('the invited guest remains bound for the second course even when a different pet is available',()=>{
 const arc=data.arcs.find(a=>a.id==='en-l1-first-snack'),state={words:{bread:{lastPractice:{at:1}},water:{lastPractice:{at:1}},give:{lastPractice:{at:1}}},homeStories:{[JSON.stringify(['home',arc.id])]:{next:1,objects:{0:'bread'},pets:{0:'guest'}}}};
 const args={state,homeId:'home',index,objects,pets,catalog,now:1000};
 assert.equal(homeStoryReadiness(data,arc,args).status,'ready');
 assert.notEqual(homeStoryReadiness(data,arc,{...args,pets:[pets[1]]}).status,'ready');
 assert.notEqual(homeStoryReadiness(data,arc,{...args,objects:[objects[0]]}).status,'ready');
});
