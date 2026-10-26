import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateLanguageCourses,completeCourseStep,coursePosition} from '../js/language_course_core.js';
import {buildWordIndex,parseWordLexicon,seedWordLexicon,canonicalWord} from '../js/word_lexicon_core.js';
import {emptyLanguageTree} from '../js/language_tree_core.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/adventure/island-language-courses.json',import.meta.url),'utf8'));
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const course=data.courses.find(c=>c.id==='en-town-01');

test('the cup invitation story accepts reviewed natural variations and records all explicit targets once',()=>{
    const state=emptyLanguageTree();seedWordLexicon(state,index);
    for(const [i,step] of course.steps.entries()){
        const event={id:`cups-${i}`,at:100+i,input:'text',interaction:{...step.interaction,zone:'town',distance:20}};
        assert.equal(completeCourseStep(state,course,step.id,'No. I do not like that.',event,index),false);
        assert.equal(coursePosition(state,course),i);
        assert.ok(completeCourseStep(state,course,step.id,step.alternatives[0].answer,event,index));
        assert.equal(completeCourseStep(state,course,step.id,step.alternatives[0].answer,event,index),false);
        for(const word of step.words)assert.equal(state.words[canonicalWord(index,word)].practiceCount,1);
    }
    assert.equal(coursePosition(state,course),4);
    assert.equal(Object.keys(state.practiceReceipts).length,4);
    const snapshot=structuredClone(state);
    assert.equal(completeCourseStep(state,course,course.steps[0].id,course.steps[0].answer,{id:'replay'},index),false);
    assert.deepEqual(state,snapshot);
});

test('alternative answers cannot claim practice for a target that was not said',()=>{
    const bad=structuredClone(data),step=bad.courses.find(c=>c.id===course.id).steps[0];
    step.alternatives=[{id:'bad-target',answer:'Yes, please.',answerGloss:'好的，谢谢。'}];
    assert.throws(()=>validateLanguageCourses(bad,{en:index}),/学习词条未核验/);
    step.alternatives=[{answer:step.answer}];
    assert.throws(()=>validateLanguageCourses(bad,{en:index}),/替代表达/);
    assert.equal(validateLanguageCourses(data,{en:index}),data);
});
