import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildWordIndex,parseWordLexicon,seedWordLexicon} from '../js/word_lexicon_core.js';
import {selectAuthoredHomeGame,validateAuthoredHomeGames} from '../js/home_authored_game_core.js';
import {homeGameActions,homeGameActionMatches,homeGameObjectMatches} from '../js/home_language_game_core.js';
import {homeStoryReadiness} from '../js/home_story_readiness_core.js';
import {recordEffectivePractice} from '../js/language_practice_core.js';
import {homeStoryProgress} from '../js/home_story_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read('data/adventure/curriculum/english-home-practice.json'),catalog=read('data/adventure/home/catalog.json').items;
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const relatives=['mother','father','brother','sister','grandmother','grandfather','family'];
const drawing={version:1,strokes:[{color:'#294734',points:[[100,100],[400,500]]}]};

test('family gift stories keep the chosen paper, require a saved picture and count only the written relative',()=>{
 validateAuthoredHomeGames(data,index);
 for(const word of relatives){
  const arc=data.arcs.find(a=>a.id==='en-l1-picture-for-'+word),state={words:{}};seedWordLexicon(state,index);
  const objects=[{id:'paper1',itemId:'paper',x:2,y:1},{id:'paper2',itemId:'paper',x:4,y:1,drawing}],pets=[{id:'pet'}];
  for(let step=0;step<3;step++){
   const args={state,homeId:'home',index,objects,pets,catalog,now:1000};
   if(step===2){
    assert.equal(homeStoryReadiness(data,arc,args).status,'layout');
    objects[0].drawing=drawing;
   }
   const readiness=homeStoryReadiness(data,arc,args);assert.equal(readiness.status,'ready',word+':'+step);
   const lesson=data.games.find(g=>g.id===arc.steps[step].storyId),game=selectAuthoredHomeGame({...data,games:[lesson]},
    {mode:lesson.mode,index,state,objects:[objects[0]],pets,catalog,arcId:arc.id,newWordBudget:3,actions:homeGameActions(lesson.mode,[objects[0]],pets,catalog),now:1000});
   assert.ok(game);
   if(step===2){
    assert.equal(homeGameActionMatches(game,{kind:'label',objectId:'paper1',text:'For my friend.'}),false);
    assert.equal(homeGameActionMatches(game,{kind:'label',objectId:'paper2',text:game.answer}),false);
    assert.ok(homeGameActionMatches(game,{kind:'label',objectId:'paper1',text:game.answer}));
    assert.equal(homeGameObjectMatches(game,[{...objects[0],drawing:undefined}]),false);
   }
   const event={id:word+'-'+step,at:1000+step,input:'text',valid:true,words:game.words,source:'home-story:'+lesson.id,review:{mode:lesson.mode,story:{homeId:'home',id:arc.id,storyId:lesson.id,step,objectId:'paper1'}}};
   assert.ok(recordEffectivePractice(state,event,index));assert.equal(recordEffectivePractice(state,event,index),false);
  }
  assert.equal(homeStoryProgress(state,'home',arc.id).next,3);
  assert.equal(state.words[word].practiceCount,1);
  for(const other of relatives.filter(w=>w!==word))assert.equal(state.words[other]?.practiceCount||0,0);
 }
});

test('family invitation rehearsal requires an actual seated partner and respects the new-word budget',()=>{
 const objects=[{id:'seat',itemId:'chair',x:0,y:0},{id:'cup',itemId:'cup',x:2,y:0}],pets=[{id:'pet'}];
 for(const word of relatives){
  const lesson=data.games.find(g=>g.id===`en-l1-family-${word}-seat-meet`),subset={...data,games:[lesson],arcs:[]};
  const args={mode:'care',index,state:{words:{}},objects,pets,catalog,newWordBudget:1,actions:homeGameActions('care',objects,pets,catalog)};
  const game=selectAuthoredHomeGame(subset,args);assert.ok(game);assert.deepEqual(game.introducedWords,[word]);
  assert.equal(selectAuthoredHomeGame(subset,{...args,newWordBudget:0}),null);
  assert.equal(homeGameActionMatches(game,{...game.action,activity:'drink'}),false);
  assert.equal(homeGameActionMatches(game,{...game.action,petId:'someone-else'}),false);
  assert.ok(homeGameActionMatches(game,game.action));
 }
});
