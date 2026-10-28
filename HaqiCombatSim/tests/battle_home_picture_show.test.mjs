import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
import {selectAuthoredHomeGame,validateAuthoredHomeGames} from '../js/home_authored_game_core.js';
import {homeGameActions,homeGameAnswer,homeGameActionMatches,homeGameObjectMatches,homeGameExposesTarget} from '../js/home_language_game_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read('data/adventure/curriculum/english-home-practice.json'),catalog=read('data/adventure/home/catalog.json').items;
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const drawing={version:1,strokes:[{color:'#294734',points:[[100,100],[500,600]]}]};
test('picture introductions need the learned word, real strokes and matching label, and retain both snapshots',()=>{
 validateAuthoredHomeGames(data,index);
 for(const lesson of data.games.filter(g=>g.readCharacterLabel)){
  const word=lesson.words[0],objects=[{id:'paper',itemId:'paper',drawing,label:lesson.alternatives[0].answer}],pets=[{id:'pet'}];
  const subset={...data,games:[lesson],arcs:[]},args={mode:'find',index,state:{words:{[word]:{lastPractice:{at:1}}}},objects,pets,catalog,arcId:lesson.arcOnly,newWordBudget:3,actions:homeGameActions('find',objects,pets,catalog)};
  const game=selectAuthoredHomeGame(subset,args);assert.ok(game);assert.ok(homeGameExposesTarget(game,index,objects),'visible labels mean assisted practice');
  assert.ok(homeGameAnswer(game,lesson.answer));assert.ok(homeGameAnswer(game,lesson.alternatives[0].answer));
  assert.equal(homeGameActionMatches(game,{kind:'find',objectId:'other'}),false);assert.ok(homeGameActionMatches(game,{kind:'find',objectId:'paper'}));
  for(const changed of [{...objects[0],label:'A face.'},{...objects[0],drawing:undefined},{...objects[0],id:'other'}]){
   assert.equal(homeGameObjectMatches(game,[changed]),false);
  }
  for(const changed of [{...objects[0],label:'A face.'},{...objects[0],drawing:undefined}])assert.equal(selectAuthoredHomeGame(subset,{...args,objects:[changed]}),null);
  assert.equal(selectAuthoredHomeGame(subset,{...args,state:{words:{}}}),null);
 }
});
test('character recap cannot introduce an unseen target or remove the saved artwork requirement',()=>{
 const lesson=structuredClone(data.games.find(g=>g.readCharacterLabel&&!g.arcOnly));
 lesson.introduces=[{word:lesson.words[0],meaning:'人物'}];assert.throws(()=>validateAuthoredHomeGames({...data,games:[lesson],arcs:[]},index));
 delete lesson.introduces;delete lesson.requiresDrawing;assert.throws(()=>validateAuthoredHomeGames({...data,games:[lesson],arcs:[]},index));
});
