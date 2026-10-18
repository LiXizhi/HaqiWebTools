import test from 'node:test';
import assert from 'node:assert/strict';
import {learnedWords,updateLearningReport,recordSpeakingPractice,learningReport,learningReportMarkdown} from '../js/learning_report_core.js';
const at=(date)=>new Date(date+'T12:00:00').getTime();
test('local words are unique; legacy baseline and repeated snapshots are not new learning',()=>{
 const state={languages:{en:{entries:{old:{learned:true}}},zh:{entries:{hanzi:{learned:true}}}}};
 updateLearningReport(learnedWords(state),state,at('2026-10-18'));
 assert.deepEqual(learningReport(state,at('2026-10-18')),{words:1,speaking:0,week:{words:0,speaking:0},month:{words:0,speaking:0}});
 const before=learnedWords(state);state.languages.en.entries.new={learned:true};
 updateLearningReport(before,state,at('2026-10-18'));
 updateLearningReport(learnedWords(state),state,at('2026-10-18'));
 assert.equal(learningReport(state,at('2026-10-18')).week.words,1);
});
test('natural Monday week and calendar month; spoken attempts count independently of rewards',()=>{
 const state={languages:{}};
 recordSpeakingPractice(state,at('2026-09-30'));recordSpeakingPractice(state,at('2026-10-18'));recordSpeakingPractice(state,at('2026-10-19'));
 let r=learningReport(state,at('2026-10-19'));assert.equal(r.speaking,3);assert.equal(r.week.speaking,1);assert.equal(r.month.speaking,2);
 r=learningReport(state,at('2026-11-01'));assert.equal(r.month.speaking,0);assert.equal(r.speaking,3);
 assert.ok(Array.from(learningReportMarkdown(state)).length<=200);
});
