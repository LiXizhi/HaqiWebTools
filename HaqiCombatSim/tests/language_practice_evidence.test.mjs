import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {recordEffectivePractice,recordComprehensionPractice} from '../js/language_practice_core.js';
import {buildWordIndex,parseWordLexicon,canonicalWord} from '../js/word_lexicon_core.js';
import {flushForestCommissionPractice} from '../js/learning/forest_commission_learning.js';

const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const event={id:'forest:camp-patrol-supplies:label-boots:1',valid:true,input:'text',source:'forest-commission',at:100,words:['boots']};
const word=canonicalWord(index,'boots');

test('typed recall preserves hints and attempts without awarding extra practice or mastery',()=>{
 for(const evidence of [{assisted:true,attempts:2},{assisted:false,attempts:1}]){
  const state={words:{[word]:{count:1}}};
  assert.equal(recordEffectivePractice(state,{...event,...evidence},index),true);
  assert.deepEqual(state.words[word].lastPractice,{id:event.id,input:'text',source:'forest-commission',at:100,...evidence});
  assert.equal(state.words[word].practiceCount,1);
  assert.equal(state.words[word].mark,undefined);
  assert.equal(recordEffectivePractice(state,{...event,...evidence},index),false);
  assert.equal(state.words[word].practiceCount,1);
 }
});

test('older practice events retain their previous shape and malformed optional evidence is ignored',()=>{
 for(const evidence of [{},{assisted:'false',attempts:1},{assisted:false,attempts:0}]){
  const state={words:{[word]:{}}};
  assert.equal(recordEffectivePractice(state,{...event,...evidence},index),true);
  assert.deepEqual(state.words[word].lastPractice,{id:event.id,input:'text',source:'forest-commission',at:100});
 }
});

test('forest labels reach canonical vocabulary entries and survive an acknowledgement retry without double credit',async()=>{
 const receipts=['boots','note'].map((word,i)=>({id:`forest:camp-patrol-supplies:label-${word}:1`,word,at:100+i,assisted:i===0,attempts:i+1}));
 const save={forestCommission:{labelPractice:structuredClone(receipts)}};
 const state={words:Object.fromEntries(receipts.map(r=>[canonicalWord(index,r.word),{}]))};
 let canPersist=false;
 const adapter={valid:()=>true,persist:()=>canPersist,record:async event=>({persisted:true,changed:recordEffectivePractice(state,{...event,valid:true},index)})};
 assert.equal(await flushForestCommissionPractice(save,adapter),false);
 assert.equal(save.forestCommission.labelPractice.length,2);
 canPersist=true;
 assert.equal(await flushForestCommissionPractice(save,adapter),true);
 assert.equal(save.forestCommission.labelPractice.length,0);
 for(const receipt of receipts){
  const entry=state.words[canonicalWord(index,receipt.word)];
  assert.equal(entry.practiceCount,1);
  assert.equal(entry.lastPractice.assisted,receipt.assisted);
  assert.equal(entry.lastPractice.attempts,receipt.attempts);
  assert.equal(entry.mark,undefined);
 }
});
test('route note reading survives an acknowledgement retry without double credit',async()=>{
 const receipt={id:'forest:camp-patrol-supplies:note:1',at:120,attempts:2,assisted:true};
 const save={forestCommission:{notePractice:receipt}},note=canonicalWord(index,'note'),state={words:{[note]:{practiceCount:1,lastPractice:{at:10}}}};
 let canPersist=false;
 const adapter={valid:()=>true,persist:()=>canPersist,record:async event=>({persisted:true,changed:recordComprehensionPractice(state,{...event,valid:true},index)})};
 assert.equal(await flushForestCommissionPractice(save,adapter),false);
 assert.equal(save.forestCommission.notePractice,receipt);
 canPersist=true;
 assert.equal(await flushForestCommissionPractice(save,adapter),true);
 assert.equal(save.forestCommission.notePractice,undefined);
 assert.equal(state.words[note].practiceCount,1);
 assert.deepEqual(state.words[note].lastPractice,{at:10});
 assert.deepEqual(state.words[note].comprehension.read,{count:1,unassistedFirstChoice:0,last:{id:receipt.id,at:120,source:'forest-commission',assisted:true,attempts:2}});
});
