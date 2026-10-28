import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildWordIndex,parseWordLexicon,seedWordLexicon} from '../js/word_lexicon_core.js';
import {emptyLanguageTree} from '../js/language_tree_core.js';
import {recordComprehensionPractice,recordEffectivePractice} from '../js/language_practice_core.js';
import {homeComprehensionReviewDue,homeNewWordBudget,HOME_REVIEW_SESSION_GAP as gap} from '../js/home_review_core.js';
import {selectAuthoredHomeGame} from '../js/home_authored_game_core.js';
import {homeGameActions} from '../js/home_language_game_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const fresh=()=>{const s=emptyLanguageTree();seedWordLexicon(s,index);for(const word of ['book','cup'])recordEffectivePractice(s,{id:'seed-'+word,words:[word],valid:true,input:'text',at:1},index);return s;};
const event=(id,at,input='read',extra={})=>({id,at,input,words:['book'],valid:true,attempts:1,assisted:false,heard:input==='listen',source:'home-story:'+id,review:{mode:input,evidenceVersion:1},...extra});

test('read and listen space independently without altering expression counts, marks or intervals',()=>{
 const s=fresh(),expression=structuredClone(s.words.book);
 recordComprehensionPractice(s,event('read-1',1000),index);
 assert.equal(s.words.book.comprehension.read.review.nextAt,301000);
 assert.equal(homeComprehensionReviewDue(s.words.book,'listen',1001),true);
 assert.equal(homeComprehensionReviewDue(s.words.book,'read',1001),false);
 const listen=event('listen-1',1001,'listen');recordComprehensionPractice(s,listen,index);
 const listening=structuredClone(s.words.book.comprehension.listen);
 recordComprehensionPractice(s,event('fallback',1002,'read',{assisted:true,review:{mode:'listen'}}),index);
 assert.deepEqual(s.words.book.comprehension.listen,listening);
 for(const field of ['practiceCount','lastPractice','mark','homeReview'])assert.deepEqual(s.words.book[field],expression[field]);
 assert.equal(homeNewWordBudget(s,1003),3);
 const before=structuredClone(s);assert.equal(recordComprehensionPractice(s,listen,index),false);assert.deepEqual(s,before);
});

test('only delayed independent understanding advances its interval; reopening and clock rollback do not',()=>{
 let s=fresh();recordComprehensionPractice(s,event('first',1000),index);
 s=JSON.parse(JSON.stringify(s));recordComprehensionPractice(s,event('repeat',302000),index);
 let r=s.words.book.comprehension.read.review;assert.equal(r.visits,1);assert.equal(r.stage,0);
 recordComprehensionPractice(s,event('later',302000+gap),index);assert.equal(r.stage,1);assert.equal(r.visits,2);
 const before=structuredClone(r);recordComprehensionPractice(s,event('clock-back',200),index);assert.deepEqual(r,before);
 recordComprehensionPractice(s,event('help',r.nextAt,'read',{attempts:2}),index);assert.equal(r.stage,0);
 assert.equal(r.nextAt,r.lastAt+300000);
 s.words.book.selfMark='unknown';s.words.book.markAt=r.lastAt+1;assert.equal(homeComprehensionReviewDue(s.words.book,'read',r.lastAt+2),true);
});

test('authored comprehension rotation survives reopen and prioritizes missing skill evidence',()=>{
 const all=read('data/adventure/curriculum/english-home-practice.json'),catalog=read('data/adventure/home/catalog.json').items;
 const data={...all,games:all.games.filter(g=>!g.arcOnly&&['read','listen'].includes(g.mode)&&g.words.length===1&&['book','cup'].includes(g.words[0]))};
 const objects=[{id:'b',itemId:'book',x:0,y:0},{id:'c',itemId:'cup',x:2,y:0}],pets=[{id:'pet'}];
 const s=fresh(),args={index,state:s,objects,pets,catalog,mode:'read',actions:homeGameActions('read',objects,pets,catalog),now:1000};
 const first=selectAuthoredHomeGame(data,args);assert.ok(first);
 recordComprehensionPractice(s,event('picked',1000,'read',{words:first.words,source:'home-story:'+first.storyId}),index);
 const restored=JSON.parse(JSON.stringify(s)),before=structuredClone(restored);
 const next=selectAuthoredHomeGame(data,{...args,state:restored,now:1001});assert.notDeepEqual(next.words,first.words);assert.deepEqual(restored,before);
 assert.ok(restored.homeReviewSession.stories.includes('home-story:'+first.storyId));
 const heard=selectAuthoredHomeGame(data,{...args,state:restored,mode:'listen',actions:homeGameActions('listen',objects,pets,catalog),now:1001});assert.ok(heard);assert.equal(homeComprehensionReviewDue(restored.words[heard.words[0]],'listen',1001),true);
});
