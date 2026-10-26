import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildWordIndex,parseWordLexicon,seedWordLexicon} from '../js/word_lexicon_core.js';
import {emptyLanguageTree,setTreeMark} from '../js/language_tree_core.js';
import {recordEffectivePractice} from '../js/language_practice_core.js';
import {homeNewWordBudget,homeWordReviewDue,HOME_REVIEW_SESSION_GAP as gap} from '../js/home_review_core.js';
import {homePracticeWords} from '../js/home_language_game_core.js';
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const fresh=()=>{const s=emptyLanguageTree();seedWordLexicon(s,index);return s;};
const event=(id,at,words=['book'],mode='find')=>({id,at,words,valid:true,input:'text',source:'home-story:'+mode,review:{mode}});

test('window reopen and receipt retries cannot reset the new-word budget or manufacture review visits',()=>{
 const s=fresh();recordEffectivePractice(s,event('a',1000),index);
 assert.equal(homeNewWordBudget(s,1001),2);assert.equal(s.words.book.homeReview.visits,1);
 const restored=JSON.parse(JSON.stringify(s));assert.equal(homeNewWordBudget(restored,1002),2);
 const before=structuredClone(restored);assert.equal(recordEffectivePractice(restored,event('a',1003),index),false);assert.deepEqual(restored,before);
 recordEffectivePractice(restored,event('b',2000,['book'],'write'),index);
 assert.equal(restored.words.book.homeReview.visits,1);assert.equal(restored.words.book.homeReview.stage,0);
 assert.equal(restored.words.book.homeReview.nextAt,301000);assert.equal(homeNewWordBudget(restored,2001),2);
 assert.deepEqual(restored.words.book.homeReview.modes,{find:1,write:1});assert.equal(restored.words.book.homeReview.support,'unknown');
 assert.deepEqual(restored.homeReviewSession.stories,['home-story:find','home-story:write']);
 recordEffectivePractice(restored,event('c',3000,['lamp','cup']),index);assert.equal(homeNewWordBudget(restored,3001),0);
 assert.equal(homeNewWordBudget(restored,100),0);assert.equal(homeNewWordBudget(restored,3000+gap),3);
});

test('only a later due visit advances intervals; early practice and backwards clocks cannot push them out',()=>{
 const s=fresh();recordEffectivePractice(s,event('a',1000),index);
 recordEffectivePractice(s,event('b',1000+gap),index);
 const r=s.words.book.homeReview;assert.equal(r.visits,2);assert.equal(r.stage,1);const due=r.nextAt;
 recordEffectivePractice(s,event('c',1000+gap*2),index);
 assert.equal(r.visits,3);assert.equal(r.stage,1);assert.equal(r.nextAt,due);
 const before=structuredClone(r);recordEffectivePractice(s,event('clock-back',500),index);assert.deepEqual(r,before);
 recordEffectivePractice(s,event('d',due),index);assert.equal(r.stage,2);assert.equal(r.nextAt,due+3*86400000);
 assert.equal(s.words.book.practiceCount,5);assert.equal(s.words.book.mark,null);
});

test('legacy counts are not backfilled as spaced evidence, manual unknown stays due, and selection is pure',()=>{
 const s=fresh();s.words.book.practiceCount=20;s.words.book.lastPractice={at:1};
 assert.equal(s.words.book.homeReview,undefined);assert.ok(homeWordReviewDue(s.words.book,1000));
 recordEffectivePractice(s,event('a',1000),index);assert.equal(s.words.book.homeReview.visits,1);
 setTreeMark(s,'book','unknown',2000);assert.ok(homeWordReviewDue(s.words.book,2001));
 recordEffectivePractice(s,event('b',3000),index);assert.equal(s.words.book.homeReview.stage,0);assert.equal(s.words.book.mark,'unknown');
 s.words.lamp.practiceCount=1;s.words.lamp.lastPractice={at:2999};
 const before=structuredClone(s);assert.equal(homePracticeWords(s,index,1,3001)[0],'lamp');assert.deepEqual(s,before);
 assert.equal(homePracticeWords(s,index,1,3001)[0],homePracticeWords(s,index,1,3001)[0]);
});


test('a due repeat inside one visit gets a short pause without advancing the interval stage',()=>{
 const s=fresh();recordEffectivePractice(s,event('a',1000),index);
 recordEffectivePractice(s,event('b',400000),index);
 assert.equal(s.words.book.homeReview.visits,1);assert.equal(s.words.book.homeReview.stage,0);
 assert.equal(s.words.book.homeReview.nextAt,700000);assert.ok(!homeWordReviewDue(s.words.book,400001));
});


test('a backwards-clock first practice still consumes the current new-word budget',()=>{
 const s=fresh();recordEffectivePractice(s,event('a',1000),index);
 recordEffectivePractice(s,event('b',500,['lamp']),index);
 assert.equal(homeNewWordBudget(s,501),1);assert.equal(s.homeReviewSession.at,1000);
 assert.equal(s.words.lamp.homeReview,undefined);assert.equal(s.words.lamp.practiceCount,1);
});
