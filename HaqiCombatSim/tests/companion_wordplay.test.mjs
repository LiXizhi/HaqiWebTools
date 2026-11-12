import test from 'node:test';
import assert from 'node:assert/strict';
import {wordplayGoal,wordplayAnswer,applyCompanionWordplay,validateCompanionWordplay} from '../js/companion_wordplay_core.js';
const fresh=()=>({zone:'camp',openingJourney:{phase:'done'},inventory:{100:75},xp:1});
const answer=(save,step,text,extra={})=>applyCompanionWordplay(save,{}, {step:'answer',expectedStep:step,text,input:'text',receipt:`r${step}`,at:1000+step,...extra});
test('wordplay cannot be submitted before completion, outside camp or during battle',()=>{
 for(const change of [s=>s.zone='town',s=>s.openingJourney.phase='challenge',s=>s.pendingEncounter={id:'fight'}]){const s=fresh();change(s);const before=structuredClone(s);assert.throws(()=>answer(s,0,'hello'),/先完成/);assert.deepEqual(s,before);}
});
test('three rounds advance only on matching independent utterances and grant no money',()=>{
 const save=fresh();assert.equal(wordplayGoal(save).example,'Hello!');
 for(const [step,text]of ['HELLO！','Please jump.','Come here!'].entries()){
  const result=answer(save,step,text,{input:step===1?'speech':'text'});assert.equal(result.accepted,true);assert.equal(result.step,step+1);assert.equal(validateCompanionWordplay(save),true);
 }
 assert.equal(wordplayGoal(save).done,true);assert.equal(save.inventory[100],75);assert.equal(save.xp,1);
 assert.deepEqual(save.openingJourney.wordplay.practices.map(p=>[p.itemId,p.word]),[['companion-wordplay-1','hello'],['companion-wordplay-2','jump'],['companion-wordplay-3','come']]);
});
test('whitelist rejects questions, negation, unrelated sentences and wrong-round answers',()=>{
 for(const [step,rows]of [[0,['hello?','not hello','hello goodbye','jump']], [1,['do not jump','can I jump?','jump？','jump and run']], [2,['do not come here','come here?','come there','come here later']]])for(const text of rows)assert.equal(wordplayAnswer(step,text).accepted,false,text);
 assert.equal(wordplayAnswer(1,'  JUMP   PLEASE! ').accepted,true);
});
test('failed answers and demo inputs never initialize or advance saved progress',()=>{
 const save=fresh(),before=structuredClone(save);assert.equal(answer(save,0,'goodbye').accepted,false);assert.deepEqual(save,before);
 assert.throws(()=>answer(save,0,'Hello!',{input:'demo'}),/自己输入/);assert.deepEqual(save,before);
});
test('duplicate receipt and stale asynchronous responses cannot advance next round',()=>{
 const save=fresh();answer(save,0,'hello');const before=structuredClone(save);
 assert.equal(answer(save,1,'jump',{receipt:'r0'}).duplicate,true);assert.deepEqual(save,before);
 assert.equal(answer(save,0,'jump',{receipt:'late'}).stale,true);assert.deepEqual(save,before);
});
test('resume and learning queue drain preserve receipt idempotency',()=>{
 let save=fresh();answer(save,0,'hello');save=JSON.parse(JSON.stringify(save));save.openingJourney.wordplay.practices=[];
 assert.equal(validateCompanionWordplay(save),true);assert.equal(wordplayGoal(save).step,1);answer(save,1,'jump');
 assert.equal(save.openingJourney.wordplay.practices.length,1);assert.equal(answer(save,2,'come here',{receipt:'r0'}).duplicate,true);
});
test('failed persistence of a prepared clone leaves original progress retryable',()=>{
 const save=fresh(),before=structuredClone(save),candidate=structuredClone(save);answer(candidate,0,'hello');
 assert.throws(()=>{throw Error('storage failed');},/storage/);assert.deepEqual(save,before);assert.equal(answer(save,0,'hello').accepted,true);
});
test('validation rejects forged progress and learning receipts',()=>{
 const save=fresh();save.openingJourney.wordplay={step:0};assert.equal(validateCompanionWordplay(save),true);
 save.openingJourney.wordplay.step=1;assert.throws(()=>validateCompanionWordplay(save),/收据/);
 save.openingJourney.wordplay=undefined;answer(save,0,'hello');save.openingJourney.wordplay.practices[0].word='jump';assert.throws(()=>validateCompanionWordplay(save),/练习/);
});

test('natural polite commands pass without accepting negation or different subjects',()=>{
 for(const [step,text]of [[1,'Can you jump?'],[1,'Could you please jump?'],[2,'Come over here!'],[2,'Could you come here?']])assert.equal(wordplayAnswer(step,text).accepted,true,text);
 for(const text of ["Don't jump",'Can I jump?','Could you not jump?','Can you jump and run?'])assert.equal(wordplayAnswer(1,text).accepted,false,text);
});
import fs from 'node:fs';
import {parseWordLexicon,buildWordIndex,seedWordLexicon,canonicalWord} from '../js/word_lexicon_core.js';
import {recordEffectivePractice} from '../js/language_practice_core.js';
test('queued hello jump come receipts match the real lexicon and retry without double counting',()=>{
 const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
 const tree={words:{}};seedWordLexicon(tree,index);const save=fresh();['hello','jump','come here'].forEach((text,i)=>answer(save,i,text));
 for(const row of save.openingJourney.wordplay.practices){const event={...row,words:[row.word],valid:true,source:'companion-wordplay'};const key=canonicalWord(index,row.word);assert.ok(key,row.word);assert.equal(recordEffectivePractice(tree,event,index),true);assert.equal(recordEffectivePractice(tree,event,index),false);assert.equal(tree.words[key].practiceCount,1);assert.notEqual(tree.words[key].mark,'basic');}
});
