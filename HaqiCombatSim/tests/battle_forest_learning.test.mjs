import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {flushForestCommissionPractice} from '../js/learning/forest_commission_learning.js';
import {recordComprehensionPractice} from '../js/language_practice_core.js';
import {parseWordLexicon,buildWordIndex,canonicalWord,wordTreeKey} from '../js/word_lexicon_core.js';
import {createOpeningController} from '../js/adventure/opening_controller.js';
import {emptyLanguageTree} from '../js/language_tree_core.js';
import {configureLanguageTreeCapture,invalidateLanguageTreeCapture,languageTreeStore} from '../js/learning/language_tree_capture.js';
const read=language=>fs.readFileSync(new URL('../data/adventure/locale/word_'+language+'.txt',import.meta.url),'utf8');
const index=buildWordIndex(parseWordLexicon(read('en'),'en'));
const receipt=()=>({id:'forest:camp-patrol-supplies:boots:1',at:20,attempts:2,assisted:true});
const save=()=>({forestCommission:{version:1,phase:'delivery',practice:receipt()}});

test('opening outbox preserves in-flight retry requests through the real vocabulary adapter',async t=>{
 t.mock.method(globalThis,'fetch',async url=>({ok:true,text:async()=>fs.readFileSync(url,'utf8')}));
 const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 const makeSave=()=>({languageLearning:{target:'en'},forestCommission:{exchangeCompleted:['note'],exchangePractice:[{id:'forest:note:retry',word:'note',language:'en',input:'text',at:123,attempts:1,assisted:false}]}});
 for(const scenario of ['language switch and reopen','persistent storage failure','role switch'])await t.test(scenario,async sub=>{
  const firstEntered=deferred(),releaseFirst=deferred(),secondFinished=deferred();
  const original=makeSave();let current=original,role='old',attempts=0,persists=0;
  const states=new Map(),writes=[],warnings=[];
  configureLanguageTreeCapture(()=>({key:role}));
  sub.after(()=>{configureLanguageTreeCapture(()=>null);invalidateLanguageTreeCapture();});
  sub.mock.method(languageTreeStore,'update',async(key,reduce)=>{
   attempts++;
   if(attempts===1){firstEntered.resolve();await releaseFirst.promise;}
   try{
    const state=structuredClone(states.get(key)||emptyLanguageTree());
    const result=reduce(state); // Real adapter guards role/epoch and records the receipt here.
    if(scenario==='persistent storage failure')return {persisted:false,result};
    states.set(key,state);writes.push(key);return {persisted:true,result};
   }finally{if(attempts===2)secondFinished.resolve();}
  });
  const ctrl=createOpeningController({nodes:{},getContext:()=>({save:current,roleStore:{catalog:{activeId:role}},storageWarning:null}),persist:()=>{persists++;},toast:message=>warnings.push(message)});
  const initial=ctrl.drainForestPractice();await firstEntered.promise;
  if(scenario==='language switch and reopen'){
   invalidateLanguageTreeCapture();current.languageLearning.target='ja';
  }else if(scenario==='role switch'){
   role='new';current=makeSave();
  }
  // Repeated reopens while busy coalesce to one retry, rather than disappearing.
  await ctrl.drainForestPractice();await ctrl.drainForestPractice();
  releaseFirst.resolve();await initial;
  // Bound waiting so the pre-fix lost request fails rather than hanging the test.
  for(let n=0;n<20&&attempts<2;n++)await tick();
  assert.equal(attempts,2,'one pending reopen must start a second attempt');
  await secondFinished.promise;await tick();await tick();
  assert.equal(attempts,2,'persistent failure cannot recursively retry without a new request');
  assert.deepEqual(current.forestCommission.exchangeCompleted,['note']);
  if(scenario==='persistent storage failure'){
   assert.equal(persists,0);assert.equal(current.forestCommission.exchangePractice.length,1);
   assert.equal(warnings.length,2);assert.deepEqual(writes,[]);
  }else{
   assert.equal(persists,1);assert.equal(current.forestCommission.exchangePractice.length,0);
   assert.deepEqual(writes,[wordTreeKey(role,'en')],'only the active role receives the original receipt language');
   const stored=states.get(writes[0]);
   assert.equal(stored.practiceReceipts['forest:note:retry'],true);
   assert.equal(stored.words[canonicalWord(index,'note')].practiceCount,1);
   if(scenario==='role switch')assert.equal(original.forestCommission.exchangePractice.length,1,'late old-role result cannot acknowledge its receipt');
  }
 });
});

test('physical forest vocabulary uses the same aligned lexicon keys and canonical word forms',()=>{
 const chinese=parseWordLexicon(read('zh'),'zh');
 for(const language of ['en','ja','ko']){
  const keys=parseWordLexicon(read(language),language).keys;
  assert.equal(keys.length,chinese.keys.length,language+' key count');
  assert.deepEqual(new Set(keys),new Set(chinese.keys),language+' key coverage');
 }
 assert.equal(canonicalWord(index,'boots'),canonicalWord(index,'boot'));
 assert.ok(canonicalWord(index,'note'));assert.ok(canonicalWord(index,'tent'));
});

test('finding boots records supported reading only for a previously practiced word, without mastery or speaking credit',async()=>{
 const current=save(),id=canonicalWord(index,'boots'),state={words:{[id]:{practiceCount:4,lastPractice:{at:10},mark:'unknown'}}};
 const record=async event=>({persisted:true,value:recordComprehensionPractice(state,{...event,valid:true},index)});
 assert.equal(await flushForestCommissionPractice(current,{record,valid:()=>true,persist:()=>true}),true);
 assert.equal(current.forestCommission.practice,undefined);
 assert.equal(state.words[id].comprehension.read.count,1);assert.equal(state.words[id].comprehension.read.unassistedFirstChoice,0);
 assert.equal(state.words[id].practiceCount,4);assert.equal(state.words[id].lastPractice.at,10);assert.equal(state.words[id].mark,'unknown');
 assert.equal(state.words[id].comprehension.listen,undefined);
 const replay=save();await flushForestCommissionPractice(replay,{record,valid:()=>true,persist:()=>true});
 assert.equal(state.words[id].comprehension.read.count,1);
 const freshState={words:{[id]:{}}};
 assert.equal(recordComprehensionPractice(freshState,{...receipt(),input:'read',valid:true,words:['boots']},index),false);
 assert.equal(freshState.words[id].comprehension,undefined);
});

test('failed learning or character writes preserve the receipt and a retry cannot duplicate evidence',async()=>{
 const current=save(),original=current.forestCommission.practice;
 await assert.rejects(flushForestCommissionPractice(current,{record:async()=>{throw Error('offline');},valid:()=>true,persist:()=>true}),/offline/);
 assert.equal(current.forestCommission.practice,original);
 assert.equal(await flushForestCommissionPractice(current,{record:async()=>({persisted:false}),valid:()=>true,persist:()=>true}),false);
 const id=canonicalWord(index,'boots'),state={words:{[id]:{lastPractice:{at:10}}}};
 const record=async event=>({persisted:true,value:recordComprehensionPractice(state,{...event,valid:true},index)});
 assert.equal(await flushForestCommissionPractice(current,{record,valid:()=>true,persist:()=>false}),false);
 assert.equal(current.forestCommission.practice,original);
 await assert.rejects(flushForestCommissionPractice(current,{record,valid:()=>true,persist:()=>{throw Error('quota');}}),/quota/);
 assert.equal(current.forestCommission.practice,original);
 await flushForestCommissionPractice(current,{record,valid:()=>true,persist:()=>true});
 assert.equal(state.words[id].comprehension.read.count,1);assert.equal(current.forestCommission.practice,undefined);
});

test('a delayed result after switching character cannot clear or persist either character receipt',async()=>{
 const current=save();let active=true,writes=0;
 const record=async()=>{active=false;return {persisted:true};};
 assert.equal(await flushForestCommissionPractice(current,{record,valid:()=>active,persist:()=>{writes++;return true;}}),false);
 assert.deepEqual(current.forestCommission.practice,receipt());assert.equal(writes,0);
});
