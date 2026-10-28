import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildWordIndex,parseWordLexicon,seedWordLexicon} from '../js/word_lexicon_core.js';
import {homeStoryReadiness} from '../js/home_story_readiness_core.js';
import {recordEffectivePractice,recordComprehensionPractice} from '../js/language_practice_core.js';
import {homeStoryProgress} from '../js/home_story_core.js';
import {homeGameActions} from '../js/home_language_game_core.js';
import {selectAuthoredHomeGame} from '../js/home_authored_game_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read('data/adventure/curriculum/english-home-practice.json'),catalog=read('data/adventure/home/catalog.json').items;
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
test('toy parade preserves original toys and separates listen/read evidence from spoken and written expressions',()=>{
 const arc=data.arcs.find(a=>a.id==='en-l1-the-toy-parade'),state={words:{}};seedWordLexicon(state,index);
 const objects=[{id:'duck',itemId:'rubber-duck',x:0,y:1},{id:'horse',itemId:'rocking-horse',x:2,y:0}],pets=[{id:'pet'}];
 for(let step=0;step<6;step++){
  const lesson=data.games.find(g=>g.id===arc.steps[step].storyId),args={state,homeId:'home',index,objects,pets,catalog,now:1000+step};
  assert.equal(homeStoryReadiness(data,arc,args).status,'ready','step '+step);
  if(step>=2){
   const key=step===2||step===4?'duck':'horse';
   assert.equal(homeStoryReadiness(data,arc,{...args,objects:objects.map(o=>o.id===key?{...o,id:'replacement'}:o)}).status,'saved-object');
  }
  const comprehension=['read','listen'].includes(lesson.mode),objectId=lesson.action.itemIds.includes('rubber-duck')?'duck':'horse';
  const event={id:'toy-'+step,at:1000+step,valid:true,words:lesson.words,input:comprehension?lesson.mode:'text',heard:true,attempts:1,assisted:false,source:'home-story:'+lesson.id,review:{mode:lesson.mode,story:{id:arc.id,homeId:'home',step,storyId:lesson.id,objectId}}};
  const record=comprehension?recordComprehensionPractice:recordEffectivePractice;
  assert.ok(record(state,event,index));assert.equal(record(state,event,index),false);
 }
 assert.equal(homeStoryProgress(state,'home',arc.id).next,6);
 assert.equal(state.words.duck.practiceCount,1);assert.equal(state.words.horse.practiceCount,2);assert.equal(state.words.near.practiceCount,1);
 assert.equal(state.words.duck.comprehension.listen.count,1);assert.equal(state.words.horse.comprehension.read.count,1);
});
test('six extra noun comprehension lessons require known targets and an actual distinguishable alternative',()=>{
 for(const word of ['duck','horse','picture','cake','wall','floor'])for(const mode of ['read','listen']){
  const lesson=data.games.find(g=>g.id===`en-l1-object-${word}-${mode}`),subset={...data,games:[lesson],arcs:[]};
  const objects=[{id:'target',itemId:lesson.action.itemIds[0],x:0,y:0},{id:'decoy',itemId:'book',x:4,y:0}],pets=[{id:'pet'}];
  const args={mode,index,state:{words:{[word]:{lastPractice:{at:1}}}},objects,pets,catalog,actions:homeGameActions(mode,objects,pets,catalog)};
  assert.ok(selectAuthoredHomeGame(subset,args));
  assert.equal(selectAuthoredHomeGame(subset,{...args,state:{words:{}},newWordBudget:3}),null);
  assert.equal(selectAuthoredHomeGame(subset,{...args,objects:objects.slice(0,1)}),null);
 }
});
