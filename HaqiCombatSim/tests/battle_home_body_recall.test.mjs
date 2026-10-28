import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
import {selectAuthoredHomeGame,validateAuthoredHomeGames} from '../js/home_authored_game_core.js';
import {homeGameActions,homeGameAnswer,homeGameExposesTarget,homeGameObjectMatches} from '../js/home_language_game_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read('data/adventure/curriculum/english-home-practice.json'),catalog=read('data/adventure/home/catalog.json').items;
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
test('visual body recall uses an already learned target without exposing its name and rejects a replaced picture',()=>{
 validateAuthoredHomeGames(data,index);
 const objects=[{id:'picture',itemId:'body-friend-picture'}],pets=[{id:'pet'}],actions=homeGameActions('find',objects,pets,catalog);
 for(const lesson of data.games.filter(g=>g.bodyRecall)){
  const word=lesson.words[0],subset={...data,games:[lesson],arcs:[]},args={mode:'find',index,state:{words:{[word]:{lastPractice:{at:1}}}},objects,pets,catalog,actions,arcId:lesson.arcOnly,newWordBudget:3};
  const game=selectAuthoredHomeGame(subset,args);assert.ok(game);assert.equal(game.bodyCue.part,word);
  assert.equal(homeGameExposesTarget(game,index,objects),false);
  assert.ok(homeGameAnswer(game,word));assert.ok(homeGameAnswer(game,lesson.answer));assert.equal(homeGameAnswer(game,'book'),false);
  assert.ok(homeGameObjectMatches(game,objects));assert.equal(homeGameObjectMatches(game,[{id:'picture',itemId:'book'}]),false);assert.equal(homeGameObjectMatches(game,[]),false);
  assert.equal(selectAuthoredHomeGame(subset,{...args,state:{words:{}}}),null);
  assert.ok(homeGameExposesTarget(game,index,[{...objects[0],label:word}]));
 }
});
test('recall author configuration cannot turn an unseen word or an unmarked picture into a visual question',()=>{
 const lesson=data.games.find(g=>g.bodyRecall),subset={...data,games:[structuredClone(lesson)],arcs:[]};delete subset.games[0].arcOnly;
 subset.games[0].introduces=[{word:lesson.words[0],meaning:'词义'}];assert.throws(()=>validateAuthoredHomeGames(subset,index));delete subset.games[0].introduces;
 delete subset.games[0].action.bodyPart;assert.throws(()=>validateAuthoredHomeGames(subset,index));
});
