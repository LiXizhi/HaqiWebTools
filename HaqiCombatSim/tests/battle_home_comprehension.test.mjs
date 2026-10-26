import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {homeComprehensionChoices,homeComprehensionCurrent,homeComprehensionAnswer} from '../js/home_comprehension_core.js';
import {recordComprehensionPractice,recordEffectivePractice} from '../js/language_practice_core.js';
import {validateAuthoredHomeGames,selectAuthoredHomeGame} from '../js/home_authored_game_core.js';
import {homeGameActions} from '../js/home_language_game_core.js';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=buildWordIndex(parseWordLexicon(read('data/adventure/locale/word_en.txt'),'en'));
const data=JSON.parse(read('data/adventure/curriculum/english-home-practice.json'));
const catalog=JSON.parse(read('data/adventure/home/catalog.json')).items;
const objects=[{id:'book1',itemId:'book'},{id:'book2',itemId:'book'},{id:'lamp',itemId:'desk-lamp'}],pets=[{id:'pet'}];
const actions=homeGameActions('read',objects,pets,catalog);
test('comprehension needs distinct choices and accepts every matching real object',()=>{
 assert.equal(homeComprehensionChoices(['book'],objects.slice(0,2),actions),null);
 const choices=homeComprehensionChoices(['book'],objects,actions);
 for(const objectId of ['book1','book2'])assert.ok(homeComprehensionAnswer(choices,{kind:'find',objectId},objects));
 assert.equal(homeComprehensionAnswer(choices,{kind:'find',objectId:'lamp'},objects),false);
 assert.equal(homeComprehensionCurrent(choices,objects.slice(0,2)),false);
 assert.equal(homeComprehensionAnswer(choices,{kind:'find',objectId:'book1'},[{id:'book1',itemId:'cup'},objects[2]]),false);
});
test('authored listening and reading reuse known words without introducing or inventing targets',()=>{
 validateAuthoredHomeGames(data,index);
 for(const mode of ['read','listen']){
  const args={mode,index,state:{words:{book:{lastPractice:{at:1}}}},objects,pets,actions};
  const game=selectAuthoredHomeGame(data,args);assert.ok(game.choices);assert.equal(game.prompt,'Find the book.');
  assert.equal(selectAuthoredHomeGame(data,{...args,objects:objects.slice(0,2)}),null);
  assert.equal(selectAuthoredHomeGame(data,{...args,state:{words:{}},newWordBudget:3}),null);
 }
});
test('comprehension receipts never create speech/text counts, basic marks or recent card eligibility',()=>{
 const state={words:{book:{practiceCount:9,mark:'unknown',lastPractice:{at:1,input:'text'}}}};
 const event={id:'read-1',valid:true,input:'read',at:50,words:['book'],source:'home-story:test',attempts:1,assisted:false};
 assert.ok(recordComprehensionPractice(state,event,index));
 assert.equal(recordComprehensionPractice(state,event,index),false);
 assert.equal(recordEffectivePractice(state,{...event,input:'text'},index),false);
 assert.equal(state.words.book.practiceCount,9);assert.equal(state.words.book.mark,'unknown');assert.equal(state.words.book.lastPractice.at,1);
 assert.equal(state.words.book.comprehension.read.unassistedFirstChoice,1);
 assert.equal(recordComprehensionPractice(state,{...event,id:'listen-1',input:'listen'},index),false);
 assert.ok(recordComprehensionPractice(state,{...event,id:'listen-1',input:'listen',heard:true,assisted:true,attempts:2},index));
 assert.equal(state.words.book.comprehension.listen.unassistedFirstChoice,0);
 assert.equal(recordComprehensionPractice({words:{}},event,index),false);
});
