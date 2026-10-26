import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildWordIndex,parseWordLexicon,seedWordLexicon} from '../js/word_lexicon_core.js';
import {emptyLanguageTree} from '../js/language_tree_core.js';
import {completeCourseStep,coursePosition,validateLanguageCourses} from '../js/language_course_core.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/adventure/island-language-courses.json',import.meta.url),'utf8'));
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const course=data.courses.find(c=>c.id==='en-fire-01');

test('fire story requires each scene in order and records the repeated location word only on valid replies',()=>{
    validateLanguageCourses(data,{en:index});
    const state=emptyLanguageTree();seedWordLexicon(state,index);
    for(const [i,step] of course.steps.entries()){
        const event={id:`fire-${i}`,input:'text',at:i+1,interaction:{...step.interaction,zone:'fire',distance:20}};
        assert.equal(completeCourseStep(state,course,step.id,step.answer,{...event,interaction:{...event.interaction,zone:'town'}},index),false);
        assert.ok(completeCourseStep(state,course,step.id,step.alternatives[0].answer,event,index));
        assert.equal(coursePosition(state,course),i+1);
        assert.equal(completeCourseStep(state,course,step.id,step.answer,event,index),false);
    }
    assert.equal(state.words.here.practiceCount,2);
    for(const id of ['hot','stop','careful','need','help','wait','safe'])assert.equal(state.words[id].practiceCount,1);
    assert.equal(Object.keys(state.practiceReceipts).length,4);
});

test('old completed fire saves remain completed without manufacturing new vocabulary evidence',()=>{
    const state=emptyLanguageTree();state.courses={[course.id]:{scene:{version:1,next:4},acceptedAt:1}};
    assert.equal(coursePosition(state,course),4);
    assert.deepEqual(state.words,{});
    const first=course.steps[0];assert.equal(completeCourseStep(state,course,first.id,first.answer,{id:'replay',input:'text',at:2,interaction:{...first.interaction,zone:'fire',distance:20}},index),false);
    assert.deepEqual(state.words,{});
});
