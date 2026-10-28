import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
import {recommendHomeStories,homeStoryRecommendationText,HOME_ISLAND_REVIEW_WINDOW} from '../js/home_story_recommendation_core.js';
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const data={games:['book','apple','banana'].map(id=>({id,words:[id]}))};
const row=(id,words,status='ready',next=0)=>({arc:{id,steps:words.map(storyId=>({storyId}))},info:{status,next}});
test('ready ongoing stories win, then recent island words, while missing props and completed stories stay explicit',()=>{
 const rows=[row('old',['book']),row('fruit',['apple']),row('ongoing',['book','banana'],'ready',1),row('missing',['apple'],'items'),row('done',['apple'],'complete',1)];
 const state={words:{book:{lastPractice:{at:1,source:'word-card'}},apple:{lastPractice:{at:900,source:'island-course'}}}},before=structuredClone({state,rows});
 const result=recommendHomeStories(data,rows,{state,index,now:1000});
 assert.deepEqual(result.map(r=>r.arc.id),['ongoing','fruit','old','missing','done']);
 assert.equal(homeStoryRecommendationText(result[0]),'接着上次的故事玩');
 assert.equal(homeStoryRecommendationText(result[1]),'用岛上学过的词：apple');
 assert.equal(result[3].info.status,'items');assert.equal(homeStoryRecommendationText(result[4]),'可以再玩，复习：apple');
 assert.deepEqual({state,rows},before);
 const later=row('needs-later-prop',['apple']);later.info.futureItems=[['table']];
 const prepared=row('all-props',['apple']);prepared.info.futureItems=[];
 assert.deepEqual(recommendHomeStories(data,[later,prepared],{state,index,now:1000}).map(r=>r.arc.id),['all-props','needs-later-prop']);
});

test('completed stories surface due review without resetting completion or postponing a different skill',()=>{
 const lessons={games:[{id:'read',mode:'read',words:['book']},{id:'say',mode:'find',words:['apple']},{id:'listen',mode:'listen',words:['book']}]};
 const rows=[row('read',['read'],'complete',1),row('say',['say'],'complete',1),row('listen',['listen'],'complete',1)];
 const state={words:{book:{lastPractice:{at:10},homeReview:{nextAt:0},comprehension:{read:{review:{nextAt:200}},listen:{review:{nextAt:50}}}},apple:{lastPractice:{at:20},homeReview:{nextAt:300}}}};
 const before=structuredClone({state,rows});
 const result=recommendHomeStories(lessons,rows,{state,index,now:100});
 assert.deepEqual(result.map(r=>r.arc.id),['listen','read','say']);
 assert.equal(homeStoryRecommendationText(result[0]),'可以再玩，复习：book');
 assert.deepEqual(result[1].recommendation.due,[],'expression due does not make reading due');
 assert.deepEqual(result[2].recommendation.due,[]);
 assert.ok(result.every(r=>r.info.status==='complete'&&!r.recommendation.recent.length));
 assert.deepEqual({state,rows},before);
 for(const now of [-1,NaN,Infinity])assert.ok(recommendHomeStories(lessons,rows,{state,index,now}).every(r=>!r.recommendation.due.length));
 state.words.book.lastPractice.at=101;
 assert.deepEqual(recommendHomeStories(lessons,rows,{state,index,now:100}).find(r=>r.arc.id==='listen').recommendation.due,[]);
});
test('only remaining explicit targets with current island evidence receive island recommendations',()=>{
 const rows=[row('remaining',['apple','banana'],'ready',1),row('apple',['apple'])];
 for(const p of [{at:900,source:'word-card'},{at:1001,source:'island-course'},{at:1,source:'island-course'}]){
  const now=p.at===1?HOME_ISLAND_REVIEW_WINDOW+2:1000;
  assert.ok(recommendHomeStories(data,rows,{state:{words:{apple:{lastPractice:p}}},index,now}).every(r=>!r.recommendation.recent.length));
 }
 const result=recommendHomeStories(data,rows,{state:{words:{apple:{lastPractice:{at:900,source:'island-course'}}}},index,now:1000});
 assert.deepEqual(result.find(r=>r.arc.id==='remaining').recommendation.recent,[]);
 assert.deepEqual(recommendHomeStories(data,rows,{state:{words:{}},index,now:1000}).map(r=>r.arc.id),['remaining','apple']);
});


test('playable due replays can outrank fresh optional stories without hiding ongoing or island work',()=>{
 const lessons={games:[{id:'book',mode:'find',words:['book']},{id:'apple',mode:'find',words:['apple']},{id:'banana',mode:'find',words:['banana']}]};
 const readyReplay=row('replay',['book'],'complete',1);readyReplay.info.replay={status:'ready',futureItems:[]};
 const missingReplay=row('missing-replay',['book'],'complete',1);missingReplay.info.replay={status:'items',futureItems:[['book']]};
 const fresh=row('fresh',['apple']);const ongoing=row('ongoing',['apple','apple'],'ready',1);
 const state={words:{book:{lastPractice:{at:10},homeReview:{nextAt:50}},apple:{lastPractice:{at:10},homeReview:{nextAt:200}}}};
 const rows=[fresh,missingReplay,readyReplay,ongoing],before=structuredClone({state,rows});
 const result=recommendHomeStories(lessons,rows,{state,index,now:100});
 assert.deepEqual(result.map(r=>r.arc.id),['ongoing','replay','fresh','missing-replay']);
 assert.equal(result[1].info.status,'complete');assert.equal(result[1].info.next,1);
 assert.deepEqual({state,rows},before);
 state.words.banana={lastPractice:{source:'island-course',at:99}};
 assert.deepEqual(recommendHomeStories(lessons,[readyReplay,row('island',['banana'])],{state,index,now:100}).map(r=>r.arc.id),['island','replay']);
 state.words.book.homeReview.nextAt=200;
 assert.deepEqual(recommendHomeStories(lessons,[readyReplay,fresh],{state,index,now:100}).map(r=>r.arc.id),['fresh','replay']);
});
