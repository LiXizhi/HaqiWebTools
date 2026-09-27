import test from 'node:test';
import assert from 'node:assert/strict';
import {defeatReviewNotes} from '../js/view_battle_review.js';
import {explainResult,reviewBattle} from '../js/battle_ai/review_core.js';
test('review entry is hidden for victory, draw and empty or missing defeat reports',()=>{
 const report={result:'loss',diagnoses:[{text:'先破盾再攻击。'}],presentation:{highlights:[]}};
 assert.deepEqual(defeatReviewNotes(report,'near'),[]);
 assert.deepEqual(defeatReviewNotes(report,'draw'),[]);
 assert.deepEqual(defeatReviewNotes(null,'far'),[]);
 assert.deepEqual(defeatReviewNotes({result:'loss',frames:10,confidence:'observed',diagnoses:[],presentation:{headline:'下次加油',highlights:[]}},'far'),[]);
 assert.deepEqual(defeatReviewNotes({result:'loss',diagnoses:[{text:'  '}],presentation:{}},'far'),[]);
});
test('defeat reviews retain concrete diagnoses, highlights and verified luck explanation',()=>{
 const report={result:'loss',diagnoses:[{text:'先破盾再攻击。'}],presentation:{highlights:['治疗救下了队友。'],detail:'关键法术失误影响了结果。'}};
 assert.deepEqual(defeatReviewNotes(report,'far'),['先破盾再攻击。','治疗救下了队友。','关键法术失误影响了结果。']);
 assert.deepEqual(defeatReviewNotes({...report,result:'win'},'far'),[]);
});
test('simple win headline does not invite an unavailable review',()=>{
 const presentation=explainResult(reviewBattle({winner:'near'}));
 assert.equal(presentation.headline,'我们赢了！继续下一场冒险吧。');
});
