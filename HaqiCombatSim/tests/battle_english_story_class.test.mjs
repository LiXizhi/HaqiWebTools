import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {completeCourseStep} from '../js/language_course_core.js';
import {emptyLanguageTree} from '../js/language_tree_core.js';
import {buildWordIndex,parseWordLexicon,seedWordLexicon,canonicalWord} from '../js/word_lexicon_core.js';
import {homeGameActions,homeGameActionMatches} from '../js/home_language_game_core.js';
import {selectAuthoredHomeGame} from '../js/home_authored_game_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
test('story class advances through actual NPC replies and keeps original hanzi course history unchanged',()=>{
 const course=read('data/adventure/island-language-courses.json').courses.find(c=>c.id==='en-hanzi-02'),state=emptyLanguageTree();seedWordLexicon(state,index);
 state.courses={'en-hanzi-01':{scene:{version:1,next:2}}};
 for(const [i,step] of course.steps.entries()){
  const event={id:'class-'+i,at:100+i,input:'text',interaction:{...step.interaction,zone:'hanzi',distance:20}};
  assert.equal(completeCourseStep(state,course,step.id,step.answer,{...event,interaction:{...event.interaction,id:0}},index),false);
  assert.equal(completeCourseStep(state,course,step.id,'No.',event,index),false);
  assert.ok(completeCourseStep(state,course,step.id,step.answer,event,index));
  assert.equal(completeCourseStep(state,course,step.id,step.answer,event,index),false);
  for(const word of step.words)assert.equal(state.words[canonicalWord(index,word)].practiceCount,1);
 }
 assert.equal(state.courses['en-hanzi-01'].scene.next,2);assert.equal(state.courses[course.id].scene.next,6);
});
test('playing teacher requires the authored reading or seating action and cannot use a different pet or facility',()=>{
 const data=read('data/adventure/curriculum/english-home-practice.json'),catalog=read('data/adventure/home/catalog.json').items;
 const objects=[{id:'book',itemId:'book',x:2,y:1},{id:'chair',itemId:'chair',x:0,y:1}],pets=[{id:'pet'}];
 for(const activity of ['read','sit']){
  const lesson=data.games.find(g=>g.id===`en-l1-teacher-${activity}-meet`),subset={...data,games:[lesson],arcs:[]},item=activity==='read'?'book':'chair';
  const args={mode:'care',index,state:{words:{[item]:{lastPractice:{at:1}}}},objects,pets,catalog,newWordBudget:1,actions:homeGameActions('care',objects,pets,catalog)};
  const game=selectAuthoredHomeGame(subset,args);assert.ok(game);assert.deepEqual(game.introducedWords,['teacher']);assert.equal(game.action.activity,activity);
  assert.equal(homeGameActionMatches(game,{...game.action,petId:'other'}),false);assert.equal(homeGameActionMatches(game,{...game.action,activity:'drink'}),false);
  assert.equal(selectAuthoredHomeGame(subset,{...args,state:{words:{}}}),null);assert.equal(selectAuthoredHomeGame(subset,{...args,newWordBudget:0}),null);
 }
});
