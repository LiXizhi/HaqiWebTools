import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {learningLesson,LEARNING_LANGUAGES} from '../js/learning_language_core.js';
import {openingFriendAnswer,applyOpeningJourney,validateOpeningJourney} from '../js/opening_journey_core.js';
import {wordplayGoal,wordplayAnswer,applyCompanionWordplay,validateCompanionWordplay} from '../js/companion_wordplay_core.js';
import {companionWorldGuide} from '../js/companion_guide_core.js';
import {homeItemLanguage,homeWishLine} from '../js/home_language_core.js';
import {summonSentences,matchHomeSpell,petWish} from '../js/home_core.js';
import {starterLampExercise} from '../js/home_starter_room_core.js';
import {parseWordLexicon,buildWordIndex,canonicalWord} from '../js/word_lexicon_core.js';
const read=rel=>fs.readFileSync(new URL('../'+rel,import.meta.url),'utf8');
const items=JSON.parse(read('data/adventure/home/catalog.json')).items;
const fresh=language=>({zone:'camp',openingJourney:{phase:'done'},inventory:{100:75},xp:1,languageLearning:{target:language}});
test('all four languages own their opening and three companion utterances',()=>{
 for(const language of LEARNING_LANGUAGES){const lesson=learningLesson(language);
  assert.equal(openingFriendAnswer(lesson.friend,language).accepted,true,language);
  const save=fresh(language);
  for(const [step,round]of lesson.rounds.entries()){
   assert.equal(wordplayGoal(save).example,round[1]);
   assert.equal(wordplayAnswer(step,round[1],language).accepted,true);
   assert.equal(applyCompanionWordplay(save,{}, {step:'answer',expectedStep:step,text:round[1],input:'text',receipt:`${language}-${step}`,at:step,language}).accepted,true);
  }
  assert.equal(validateCompanionWordplay(save),true);assert.equal(wordplayGoal(save).done,true);
  assert.deepEqual(save.openingJourney.wordplay.practices.map(x=>x.language),[language,language,language]);
  assert.equal(save.inventory[100],75);assert.equal(save.xp,1);
 }
 for(const language of ['ja','ko','zh-CN']){
  assert.equal(openingFriendAnswer('We are friends.',language).accepted,false);
  for(const [step,round]of learningLesson('en').rounds.entries())assert.equal(wordplayAnswer(step,round[1],language).accepted,false);
 }
});
test('switching language keeps independent companion practice and rejects late answers',()=>{
 const save=fresh('en');const answer=(step,text,language)=>applyCompanionWordplay(save,{}, {step:'answer',expectedStep:step,text,input:'speech',receipt:`${language}-${step}`,at:step,language});
 answer(0,'Hello!','en');save.languageLearning.target='ja';const before=structuredClone(save);
 assert.equal(answer(1,'Jump!','en').stale,true);assert.deepEqual(save,before);
 assert.equal(wordplayGoal(save).step,0);
 assert.equal(answer(0,'こんにちは！','ja').accepted,true);
 save.languageLearning.target='ko';assert.equal(wordplayGoal(save).step,0);
 assert.equal(answer(0,'안녕하세요!','ko').accepted,true);
 save.languageLearning.target='en';assert.equal(wordplayGoal(save).step,1);
 assert.equal(answer(1,'Jump!','en').accepted,true);
 save.languageLearning.target='ja';assert.equal(wordplayGoal(save).step,1);
 assert.equal(validateCompanionWordplay(save),true);assert.equal(save.xp,1);
 assert.deepEqual(save.openingJourney.wordplay.practices.map(row=>row.language),['en','ja','ko','en']);
});
test('a completed older-language practice does not complete a newly selected language',()=>{
 const save=fresh('en');
 for(const [step,round]of learningLesson('en').rounds.entries())assert.equal(applyCompanionWordplay(save,{}, {step:'answer',expectedStep:step,text:round[1],input:'text',receipt:`old-${step}`,at:step,language:'en'}).accepted,true);
 assert.equal(wordplayGoal(save).done,true);
 // A save written before language-tagged progress still has its opening language.
 delete save.openingJourney.wordplay.language;
 save.openingJourney.wordplay.practices=[];
 save.openingJourney.practice={language:'en'};
 save.languageLearning.target='ja';
 assert.equal(wordplayGoal(save).step,0);
 assert.equal(companionWorldGuide(save,{}).track,'companion-wordplay');
 assert.equal(applyCompanionWordplay(save,{}, {step:'answer',expectedStep:0,text:learningLesson('ja').rounds[0][1],input:'text',receipt:'new-0',at:4,language:'ja'}).accepted,true);
 assert.equal(validateCompanionWordplay(save),true);
 save.languageLearning.target='en';assert.equal(wordplayGoal(save).done,true);
 save.languageLearning.target='ja';assert.equal(wordplayGoal(save).step,1);
});
test('opening receipt freezes selected language and validates multilingual save records',()=>{
 for(const language of LEARNING_LANGUAGES){
  const save={zone:'camp',position:{x:0,y:0},languageLearning:{target:language},openingJourney:{version:1,phase:'explain',route:'talk'}};
  const content={worldMaps:{camp:{npcPositions:{36201:[0,0]}}}};
  assert.throws(()=>applyOpeningJourney(save,content,{step:'explain',text:learningLesson(language).friend,receipt:'old',at:1,language:language==='ja'?'en':'ja'}),/切换/);
  applyOpeningJourney(save,content,{step:'explain',text:learningLesson(language).friend,receipt:'new',at:1,language});
  assert.equal(save.openingJourney.practice.language,language);validateOpeningJourney(save);
 }
});
test('every catalog item has authored Japanese and Korean requests using the same asset ID',()=>{
 assert.equal(items.length,209);
 for(const language of ['ja','ko'])for(const item of items){
  assert.ok(homeItemLanguage(item,language),`${language}:${item.id}`);
  const rows=summonSentences(item,language);assert.equal(rows.length,3);
  for(const line of rows)assert.ok(matchHomeSpell(line,[item],language,{itemId:item.id}).candidates.some(x=>x.itemId===item.id),`${language}:${item.id}:${line}`);
  assert.equal(matchHomeSpell(summonSentences(item,'en')[0],[item],language,{itemId:item.id},{input:'speech',speechAttempts:3}).candidates.length,0);
 }
 for(const language of ['ja','ko']){
  const wish=petWish('pet',1,items,language);assert.ok(wish.text);assert.ok(wish.translation);
  const item=items.find(x=>x.id===wish.itemId);for(const key of ['HOME-PLACE','HOME-USE','HOME-READY'])assert.ok(homeWishLine(key,item,language));
 }
});
test('starter lamp and colored requests follow selected language',()=>{
 const lamp=starterLampExercise(items.find(x=>x.id==='bedside-lamp')||items[0]);
 for(const language of ['ja','ko'])for(const color of ['', 'red','blue','green','yellow','pink','purple','white','orange','brown','black','grey']){
  const line=summonSentences(lamp,language,color)[0];assert.ok(line);
  assert.equal(matchHomeSpell(line,[lamp],language,{itemId:lamp.id,color}).candidates.length,1);
 }
});
test('companion vocabulary resolves into selected-language lexicon',()=>{
 for(const language of ['ja','ko']){
  const index=buildWordIndex(parseWordLexicon(read(`data/adventure/locale/word_${language}.txt`),language));
  const lesson=learningLesson(language);
  for(const word of [lesson.friendWord,...lesson.rounds.map(x=>x[0]),language==='ja'?'ランプ':'램프'])assert.ok(canonicalWord(index,word),`${language}:${word}`);
 }
});
