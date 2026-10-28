import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
import {selectAuthoredHomeGame,validateAuthoredHomeGames} from '../js/home_authored_game_core.js';
import {homeGameActions,homeGameExposesTarget} from '../js/home_language_game_core.js';
import {recordComprehensionPractice} from '../js/language_practice_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read('data/adventure/curriculum/english-home-practice.json'),catalog=read('data/adventure/home/catalog.json').items;
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
test('action riddles require all four familiar choices and only create comprehension evidence',()=>{
 validateAuthoredHomeGames(data,index);
 for(const lesson of data.games.filter(g=>g.listenAction)){
  const objects=[{id:'chair',itemId:'chair',x:3,y:1}],pets=[{id:'pet'}],state={words:Object.fromEntries(['chair','walk','run','stand','jump'].map(w=>[w,{practiceCount:1,lastPractice:{at:1}}]))};
  const args={mode:lesson.mode,index,state,objects,pets,catalog,arcId:lesson.arcOnly,actions:homeGameActions(lesson.mode,objects,pets,catalog),newWordBudget:3};
  const subset={...data,games:[lesson],arcs:[]},game=selectAuthoredHomeGame(subset,args);assert.ok(game.listenAction);assert.equal(game.walking.id,'chair');
  assert.equal(homeGameExposesTarget({...game,prompt:''},index,objects),false);
  assert.ok(homeGameExposesTarget({...game,prompt:''},index,[{...objects[0],label:lesson.mode}]));
  assert.equal(selectAuthoredHomeGame(subset,{...args,arcId:null}),null);
  const missing=structuredClone(state);delete missing.words.jump;assert.equal(selectAuthoredHomeGame(subset,{...args,state:missing}),null);
  const event={id:lesson.id,at:10,valid:true,input:'listen',heard:true,attempts:1,assisted:false,words:game.words,source:'home-story:'+lesson.id,review:{mode:'listen'}};
  assert.equal(recordComprehensionPractice(state,{...event,heard:false},index),false);
  assert.ok(recordComprehensionPractice(state,event,index));assert.equal(recordComprehensionPractice(state,event,index),false);
  assert.equal(state.words[lesson.mode].practiceCount,1);assert.equal(state.words[lesson.mode].comprehension.listen.count,1);
 }
});
test('action listening cannot introduce unseen words or appear in a menu that reveals the target action',()=>{
 const lesson=structuredClone(data.games.find(g=>g.listenAction));delete lesson.arcOnly;
 assert.throws(()=>validateAuthoredHomeGames({...data,games:[lesson],arcs:[]},index));
 lesson.arcOnly='arc';lesson.introduces=[{word:lesson.mode,meaning:'动作'}];assert.throws(()=>validateAuthoredHomeGames({...data,games:[lesson],arcs:[]},index));
});
