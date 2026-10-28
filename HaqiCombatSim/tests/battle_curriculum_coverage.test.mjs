import test from 'node:test';
import assert from 'node:assert/strict';
import {auditEnglishLevelOne,renderEnglishLevelOneAudit} from '../scripts/audit_english_level_one.mjs';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
const index=buildWordIndex(parseWordLexicon('人||person, people\n书||book','en'));
const curriculum=()=>({words:[{id:'w1',entryId:'person',word:'person',meaning:'人',existingSteps:[],coverage:{homeVariants:[],authoredIntroduction:null}},{id:'w2',entryId:'book',word:'book',meaning:'书',existingSteps:[],coverage:{homeVariants:[],authoredIntroduction:null}}]});
test('visual naming supply requires an explicit recall target and is not comprehension or mastery evidence',()=>{
 const bodyIndex=buildWordIndex(parseWordLexicon('眼睛||eye\n耳朵||ear','en'));
 const games=[
  {id:'recall',mode:'find',bodyRecall:true,words:['eye'],action:{bodyPart:'eye'}},
  {id:'read',mode:'read',words:['ear'],action:{bodyPart:'ear'}},
  {id:'incidental',mode:'find',bodyRecall:true,words:['ear'],action:{bodyPart:'eye'}},
  {id:'plain-find',mode:'find',words:['ear'],action:{bodyPart:'ear'}}
 ];
 const c={words:['eye','ear'].map(id=>({id,entryId:id,word:id,coverage:{homeVariants:games.filter(g=>g.words.includes(id)).map(g=>({storyId:g.id,file:'data/adventure/curriculum/english-home-practice.json'}))}}))};
 const report=auditEnglishLevelOne(c,{games},{courses:[]},bodyIndex);
 assert.deepEqual(report.issues,[]);
 assert.deepEqual(report.words[0].visualNaming,['recall']);
 assert.deepEqual(report.words[1].visualNaming,[]);
 assert.equal(report.summary.visualNamingSupplied,1);
 assert.equal(report.summary.listeningSupplied,0);
 assert.equal(report.summary.readingSupplied,1);
 assert.equal(report.complete,false);
 assert.match(renderEnglishLevelOneAudit(report),/看图自主命名供给 1 词/);
});
test('coverage counts explicit canonical targets, not incidental mentions, duplicate IDs or different modes as life contexts',()=>{
 const c=curriculum(),games=Array.from({length:12},(_,i)=>({id:'g'+i,mode:i===0?'read':i===1?'listen':i===2?'write':'care',words:['people'],answer:'People read a book.',intro:'A book.'}));
 c.words[0].coverage.homeVariants=games.map(g=>({file:'data/adventure/curriculum/english-home-practice.json',storyId:g.id}));
 c.words[0].coverage.authoredIntroduction=c.words[0].coverage.homeVariants[0];
 const report=auditEnglishLevelOne(c,{games:[...games,games[0]]},{courses:[]},index);
 assert.equal(report.summary.homeCovered,1);assert.equal(report.words[0].homeOpportunities,12);assert.equal(report.words[1].homeOpportunities,0);
 assert.equal(report.summary.atLeast12HomeOpportunities,1);assert.equal(report.summary.listeningSupplied,1);assert.equal(report.summary.readingSupplied,1);assert.equal(report.summary.guidedWritingSupplied,1);
 assert.deepEqual(report.issues,['重复家园身份：g0']);assert.equal(report.complete,false);
 assert.ok(report.words[0].gaps.includes('四次会话与三种生活情境待逐词审核'));
 assert.match(renderEnglishLevelOneAudit(report),/完整 L1 尚未证明完成/);
});
test('coverage rejects missing, wrong-target and duplicated references without accepting another language as English teaching',()=>{
 const c=curriculum();c.words[0].existingSteps=[{courseId:'en',stepId:'one'}];
 c.words[0].coverage.homeVariants=[{file:'bad-file',storyId:'book'},{file:'bad-file',storyId:'book'}];
 c.words[1].coverage.authoredIntroduction={courseId:'gone',stepId:'one'};
 const courses={courses:[{id:'en',language:'en',steps:[{id:'one',words:['book']}]},{id:'ja',language:'ja',steps:[{id:'one',words:['person']}]}]};
 const report=auditEnglishLevelOne(c,{games:[{id:'book',mode:'write',words:['book']}]},courses,index);
 assert.equal(report.words[0].islandIds.length,0);assert.equal(report.words[1].islandIds.length,1);
 for(const text of ['失效词条引用：person','重复家园引用：person','未知家园来源','遗漏家园引用：book','遗漏岛屿引用：book','失效词条引用：book'])assert.ok(report.issues.some(i=>i.startsWith(text)),text);
});


test('coverage separates comprehension modes from authors that do not directly disclose the answer',()=>{
 const c=curriculum(),games=[{id:'heard',mode:'listen',words:['book'],opening:'先找书吧。',intro:'听一听。',prompt:'Find the book.'},{id:'read',mode:'read',words:['book'],intro:'按请求选择物品。',prompt:'Find the book.'}];
 c.words[1].coverage.homeVariants=games.map(g=>({file:'data/adventure/curriculum/english-home-practice.json',storyId:g.id}));
 const report=auditEnglishLevelOne(c,{games},{courses:[]},index);
 assert.equal(report.summary.listeningSupplied,1);assert.equal(report.summary.uncuedListeningSupplied,0);assert.equal(report.summary.uncuedReadingSupplied,1);
 assert.ok(report.words[1].gaps.includes('听力开场直接提示目标，需改写'));
 games[0].opening='帮我找一件东西，好吗？';
 assert.equal(auditEnglishLevelOne(c,{games},{courses:[]},index).summary.uncuedListeningSupplied,1);
 assert.equal(report.complete,false);
});
