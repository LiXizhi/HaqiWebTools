import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {flushForestCommissionPractice} from '../js/forest_commission_learning.js';
import {recordComprehensionPractice} from '../js/language_practice_core.js';
import {parseWordLexicon,buildWordIndex,canonicalWord} from '../js/word_lexicon_core.js';
const read=language=>fs.readFileSync(new URL('../data/adventure/locale/word_'+language+'.txt',import.meta.url),'utf8');
const index=buildWordIndex(parseWordLexicon(read('en'),'en'));
const receipt=()=>({id:'forest:camp-patrol-supplies:boots:1',at:20,attempts:2,assisted:true});
const save=()=>({forestCommission:{version:1,phase:'delivery',practice:receipt()}});

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
