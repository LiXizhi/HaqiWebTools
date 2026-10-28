import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {completeCourseStep,coursePosition} from '../js/language_course_core.js';
import {buildWordIndex,parseWordLexicon,seedWordLexicon,canonicalWord} from '../js/word_lexicon_core.js';
import {emptyLanguageTree} from '../js/language_tree_core.js';
import {languageQuestRows,recommendedLanguageQuest} from '../js/language_quest_core.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/adventure/island-language-courses.json',import.meta.url),'utf8'));
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const course=data.courses.find(c=>c.id==='en-town-07');

test('three-books story invitation needs the actual speaker and counts each explicit target only after a valid reply',()=>{
    const state=emptyLanguageTree();seedWordLexicon(state,index);
    state.courses={'en-hanzi-01':{scene:{version:1,next:2}},'en-hanzi-02':{scene:{version:1,next:3}}};const counts=new Map();
    for(const [i,step] of course.steps.entries()){
        const event={id:`three-books-${i}`,at:100+i,input:'text',interaction:{...step.interaction,zone:'town',distance:20}};
        for(const bad of [{...event,interaction:{...event.interaction,id:0}},{...event,interaction:{...event.interaction,zone:'fire'}},{...event,interaction:{...event.interaction,distance:999}}])assert.equal(completeCourseStep(state,course,step.id,step.answer,bad,index),false);
        assert.equal(completeCourseStep(state,course,step.id,'Eight cups.',event,index),false);
        assert.equal(coursePosition(state,course),i);
        const answer=step.alternatives?.[0].answer||step.answer;
        assert.ok(completeCourseStep(state,course,step.id,answer,event,index));
        assert.equal(completeCourseStep(state,course,step.id,answer,event,index),false);
        for(const word of step.words){const id=canonicalWord(index,word);counts.set(id,(counts.get(id)||0)+1);assert.equal(state.words[id].practiceCount,counts.get(id),word);}
    }
    assert.equal(coursePosition(state,course),6);
    assert.equal(state.courses['en-hanzi-01'].scene.next,2);assert.equal(state.courses['en-hanzi-02'].scene.next,3);assert.equal(state.words.one.practiceCount,1);assert.equal(state.words.table.practiceCount,1);
    assert.equal(Object.keys(state.practiceReceipts).length,6);
    assert.equal(canonicalWord(index,'people'),canonicalWord(index,'person'));
});

test('the active three-books story story remains tracked ahead of an unstarted story on the same island',()=>{
    const state=emptyLanguageTree(),save={zone:'town',languageLearning:{enabled:true,target:'en'}},content={};
    state.courses={[course.id]:{acceptedAt:10,scene:{version:1,next:0}}};
    const recommend=()=>recommendedLanguageQuest(save,content,languageQuestRows(data,state,'en'));
    assert.equal(recommend().courseId,course.id);
    state.courses[course.id].scene.next=3;assert.equal(recommend().courseId,course.id);
    save.languageLearning.target='ja';assert.equal(recommend(),null);
    save.languageLearning.target='en';assert.equal(recommend().next,3);
    state.courses[course.id].scene.next=6;assert.equal(recommend().courseId,'en-town-01');
});
