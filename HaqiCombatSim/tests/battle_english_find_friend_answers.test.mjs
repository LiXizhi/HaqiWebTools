import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {courseAnswerFeedback,validateLanguageCourses} from '../js/language_course_core.js';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';

const data=JSON.parse(fs.readFileSync(new URL('../data/adventure/island-language-courses.json',import.meta.url),'utf8'));
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const steps=data.courses.find(course=>course.id==='en-hanzi-01').steps;

test('first quest accepts the prompted meaning and keeps previous sample answers',()=>{
    validateLanguageCourses(data,{en:index});
    for(const [stepNumber,answers] of [
        [2,['Yes, I am helping my friend Achu.','I am helping my friend Achu.','Yes. He is my friend.']],
        [4,['No. He is not at home.','No. Not at home.']],
        [5,['Achu is waiting at the dock.','Yes, Achu is waiting at the dock.','He is waiting.']],
    ])for(const answer of answers)assert.equal(courseAnswerFeedback(steps[stepNumber],answer).kind,'accepted',answer);
    assert.notEqual(courseAnswerFeedback(steps[4],'Yes. He is at home.').kind,'accepted');
});
