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
test('paper friend advances through actual NPC replies and keeps original hanzi course history unchanged',()=>{
 const course=read('data/adventure/island-language-courses.json').courses.find(c=>c.id==='en-hanzi-03'),state=emptyLanguageTree();seedWordLexicon(state,index);
 state.courses={'en-hanzi-01':{scene:{version:1,next:2}},'en-hanzi-02':{scene:{version:1,next:3}}};
 for(const [i,step] of course.steps.entries()){
  const event={id:'paper-friend-'+i,at:100+i,input:'text',interaction:{...step.interaction,zone:'hanzi',distance:20}};
  assert.equal(completeCourseStep(state,course,step.id,step.answer,{...event,interaction:{...event.interaction,id:0}},index),false);
  assert.equal(completeCourseStep(state,course,step.id,'No.',event,index),false);
  assert.ok(completeCourseStep(state,course,step.id,step.answer,event,index));
  assert.equal(completeCourseStep(state,course,step.id,step.answer,event,index),false);
  for(const word of step.words)assert.equal(state.words[canonicalWord(index,word)].practiceCount,1);
 }
 assert.equal(state.courses['en-hanzi-01'].scene.next,2);assert.equal(state.courses['en-hanzi-02'].scene.next,3);assert.equal(state.courses[course.id].scene.next,6);
});
