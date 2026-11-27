import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {flushForgeCommissionPractice} from '../js/learning/forge_commission_learning.js';
import {forgeLesson} from '../js/forge_commission_language_core.js';
import {recordEffectivePractice} from '../js/language_practice_core.js';
import {parseWordLexicon,buildWordIndex,canonicalWord,wordTreeKey} from '../js/word_lexicon_core.js';
import {emptyLanguageTree} from '../js/language_tree_core.js';
import {createOpeningController} from '../js/adventure/opening_controller.js';
import {configureLanguageTreeCapture,invalidateLanguageTreeCapture,languageTreeStore} from '../js/learning/language_tree_capture.js';
const save=language=>({forgeCommission:{practice:[{id:`forge:tea:${language}`,language,at:123,attempts:2,assisted:true}]}});
test('tea labels use actual vocabulary and failed adventure writes replay only once',async()=>{
 for(const language of ['en','ja','ko','zh-CN']){
  const lexiconLanguage=language==='zh-CN'?'zh':language;
  const text=fs.readFileSync(new URL(`../data/adventure/locale/word_${lexiconLanguage}.txt`,import.meta.url),'utf8');
  const index=buildWordIndex(parseWordLexicon(text,lexiconLanguage)),word=forgeLesson({languageLearning:{target:language}}).tea,id=canonicalWord(index,word);
  assert.ok(id,`${language} tea must exist in the real lexicon`);
  const state={words:{[id]:{practiceCount:0,mark:'unknown'}}},current=save(language);
  const record=async event=>{assert.equal(event.language,lexiconLanguage);assert.equal(event.input,'text');recordEffectivePractice(state,{...event,valid:true},index);return {persisted:true};};
  assert.equal(await flushForgeCommissionPractice(current,{record,valid:()=>true,persist:()=>false}),false);
  assert.equal(current.forgeCommission.practice.length,1);assert.equal(state.words[id].practiceCount,1);
  assert.equal(await flushForgeCommissionPractice(current,{record,valid:()=>true,persist:()=>true}),true);
  assert.equal(current.forgeCommission.practice.length,0);assert.equal(state.words[id].practiceCount,1);
  assert.equal(state.words[id].mark,'unknown');assert.equal(state.words[id].lastPractice.assisted,true);
  assert.equal(state.words[id].lastPractice.attempts,2);
 }
});
test('a vocabulary failure, role switch or exception retains its pending label',async()=>{
 for(const scenario of ['failure','switch','throw']){
  const current=save('en');let active=true,writes=0;
  const record=async()=>{if(scenario==='switch')active=false;return {persisted:scenario!=='failure'};};
  const run=()=>flushForgeCommissionPractice(current,{record,valid:()=>active,persist:()=>{writes++;if(scenario==='throw')throw Error('disk full');return true;}});
  if(scenario==='throw')await assert.rejects(run,/disk full/);else assert.equal(await run(),false);
  assert.equal(current.forgeCommission.practice.length,1);assert.equal(writes,scenario==='throw'?1:0);
 }
});

test('the opening controller retries tea receipts across role changes and failed adventure acknowledgements',async t=>{
 t.mock.method(globalThis,'fetch',async url=>({ok:true,text:async()=>fs.readFileSync(url,'utf8')}));
 const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 const text=fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8');
 const index=buildWordIndex(parseWordLexicon(text,'en')),tea=canonicalWord(index,forgeLesson({languageLearning:{target:'en'}}).tea);
 for(const timing of ['before vocabulary commit','after vocabulary commit','failed adventure acknowledgement'])await t.test(timing,async sub=>{
  const entered=deferred(),release=deferred(),states=new Map(),writes=[];
  const original=save('en'),next=save('en');let current=original,role='old',calls=0,persists=0,quota=false;
  const balances={coins:83,beans:64,marks:12};Object.assign(original,balances);Object.assign(next,balances);
  configureLanguageTreeCapture(()=>({key:role}));
  sub.after(()=>{configureLanguageTreeCapture(()=>null);invalidateLanguageTreeCapture();});
  sub.mock.method(languageTreeStore,'update',async(key,reduce)=>{
   const first=++calls===1;
   if(first&&timing==='before vocabulary commit'){entered.resolve();await release.promise;}
   const state=structuredClone(states.get(key)||emptyLanguageTree()),result=reduce(state);
   states.set(key,state);writes.push(key);
   if(first&&timing==='after vocabulary commit'){entered.resolve();await release.promise;}
   return {persisted:true,result};
  });
  const ctrl=createOpeningController({nodes:{},getContext:()=>({save:current,roleStore:{catalog:{activeId:role}},storageWarning:quota?'quota':null}),persist:()=>{persists++;},toast:()=>{}});
  if(timing==='failed adventure acknowledgement'){
   quota=true;await ctrl.drainForestPractice();
   assert.equal(original.forgeCommission.practice.length,1,'a vocabulary write cannot acknowledge a failed adventure save');
   quota=false;await ctrl.drainForestPractice();
  }else{
   const running=ctrl.drainForestPractice();await entered.promise;
   role='new';current=next;invalidateLanguageTreeCapture();
   await ctrl.drainForestPractice();release.resolve();await running;
   for(let n=0;n<30&&next.forgeCommission.practice.length;n++)await tick();
   assert.equal(next.forgeCommission.practice.length,0,'the new role gets its own pending receipt');
   assert.equal(original.forgeCommission.practice.length,1,'a late result never clears the previous role queue');
   role='old';current=original;invalidateLanguageTreeCapture();await ctrl.drainForestPractice();
  }
  assert.equal(original.forgeCommission.practice.length,0);
  assert.equal(states.get(wordTreeKey('old','en')).words[tea].practiceCount,1,'a committed receipt remains exactly once after retry');
  if(timing!=='failed adventure acknowledgement')assert.equal(states.get(wordTreeKey('new','en')).words[tea].practiceCount,1);
  assert.equal(persists,2);assert.equal(writes.length,timing==='after vocabulary commit'?3:2);
  for(const row of [original,next])for(const [key,value] of Object.entries(balances))assert.equal(row[key],value,'practice retries do not change rewards');
 });
});
