import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {storyLanguageLines,storyHasLanguage,prepareStoryLanguage} from '../js/story_language.js';
import {createStoryChat} from '../js/language_story.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/adventure/camp-conversations.json',import.meta.url)));
const profile=catalog.profiles.find(p=>p.npcId===36205),story=profile.stories[0];
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const translated=(source,locale)=>({lines:storyLanguageLines(source).map((_,id)=>({id,text:locale==='ja'?`これは練習${id}です。`:`이것은 연습${id}예요.`}))});
test('adapt authored story before use without mutating source, IDs or rewards',async()=>{
 for(const locale of ['ja','ko']){
  const source=structuredClone(story);source.id+=locale;const before=structuredClone(source);let calls=0;
  const voice={judge:async()=>{calls++;return translated(source,locale);}};
  const adapted=await prepareStoryLanguage(source,locale,voice);
  assert.equal(storyHasLanguage(adapted,locale),true);assert.deepEqual(source,before);
  assert.equal(adapted.id,source.id);assert.equal(adapted.rewardGroup,source.rewardGroup);
  assert.deepEqual(adapted.turns.map(x=>x.id),source.turns.map(x=>x.id));
  await prepareStoryLanguage(source,locale,voice);assert.equal(calls,1);
 }
});
test('reject incomplete, duplicate, wrong-script and aborted translations',async()=>{
 for(const kind of ['short','duplicate','english','aborted']){
  const source=structuredClone(story);source.turns[0].question.en+=kind;
  const abort=new AbortController();const output=translated(source,'ja');
  if(kind==='short')output.lines.pop();if(kind==='duplicate')output.lines[1].id=0;if(kind==='english')output.lines[0].text='Hello';
  await assert.rejects(prepareStoryLanguage(source,'ja',{judge:async()=>{if(kind==='aborted')abort.abort();return output;}},abort.signal));
  assert.equal(storyHasLanguage(source,'ja'),false);
 }
});
function harness(locale,judge){
 const state={save:{zone:'camp',languageLearning:{enabled:true,target:locale,native:'zh-CN'},languageAdventure:{version:1,progress:{}}},content:{},role:'test',identity:'test'};
 let cb,ui,claims=0;const speech=[];
 const voice={cancel:async()=>{},start:async()=>{},finish:async()=>'',speak:async(text,language)=>speech.push({text,language}),judge};
 const chat=createStoryChat({getState:()=>state,voice,commit:()=>{claims++;return {amount:0};},viewFactory:callbacks=>{cb=callbacks;return {render:s=>{ui=s;},close(){}};}});
 return {state,chat,speech,get cb(){return cb;},get ui(){return ui;},get claims(){return claims;}};
}
test('Japanese and Korean story inputs and speech use prepared lesson, not English fallback',async()=>{
 for(const locale of ['ja','ko']){
  const source=structuredClone(story);source.turns[0].question.en+=` controller ${locale}`;
  const h=harness(locale,async()=>translated(source,locale));await h.chat.open(profile,source,null);await flush();
  assert.equal(h.ui.phase,'ready');assert.equal(h.ui.glossLocale,'zh-CN');assert.ok(h.speech.length);
  assert.ok(h.speech.every(x=>x.language===locale&&x.text!==source.turns[0].question.en));
  await h.cb.help(source.turns[0].answer.en);assert.equal(h.ui.index,0);
  for(const turn of h.ui.story.turns)await h.cb.help(turn.answer[locale]);
  assert.equal(h.ui.done,true);assert.equal(h.claims,1);h.chat.close();
 }
});
test('failed preparation exposes retry without speaking English or accepting answers',async()=>{
 const source=structuredClone(story);source.turns[0].question.en+=' retry';let calls=0;
 const h=harness('ko',async()=>{if(calls++===0)throw Error('offline');return translated(source,'ko');});
 await h.chat.open(profile,source,null);assert.equal(h.ui.loadError,true);assert.equal(h.speech.length,0);
 await h.cb.help(source.turns[0].answer.en);assert.equal(h.ui.index,0);assert.equal(h.claims,0);
 h.cb.next();await flush();assert.equal(h.ui.loadError,undefined);assert.equal(h.ui.phase,'ready');assert.ok(h.speech.length);h.chat.close();
});
test('switching target during preparation prevents late speech and progress',async()=>{
 const source=structuredClone(story);source.turns[0].question.en+=' deferred';let resolve;
 const h=harness('ja',()=>new Promise(r=>resolve=r));const opening=h.chat.open(profile,source,null);
 assert.equal(h.ui.phase,'preparing');h.state.save.languageLearning.target='ko';h.chat.tick();resolve(translated(source,'ja'));await opening;
 assert.equal(h.chat.active,false);assert.equal(h.speech.length,0);assert.equal(h.claims,0);
});
