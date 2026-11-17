import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {homeTargetGames} from '../js/home_target_games.js';
import {selectAuthoredHomeGame} from '../js/home_authored_game_core.js';
import {homeGameActions,homeGameAnswer,HOME_LANGUAGE_MODES} from '../js/home_language_game_core.js';
import {homeCountAnswer} from '../js/home_counting_core.js';
import {parseWordLexicon,buildWordIndex,matchWordText} from '../js/word_lexicon_core.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/adventure/home/catalog.json',import.meta.url))).items;
const read=lang=>fs.readFileSync(new URL(`../data/adventure/locale/word_${lang}.txt`,import.meta.url),'utf8');
for(const language of ['ja','ko'])test(`${language} home curriculum selects every mode against real assets and selected-language answers`,()=>{
 const index=buildWordIndex(parseWordLexicon(read(language),language)),data=homeTargetGames(index);
 for(const story of data.games){for(const word of story.words)assert.ok(matchWordText(index,story.answer).some(row=>row.id===word),story.id);if(story.count){assert.ok(homeCountAnswer(story,story.answer.replace(story.count.spokenNumber,String(story.count.amount)),'speech'),story.id);}}
 const state={words:Object.fromEntries(data.games.flatMap(g=>g.words).map(word=>[word,{lastPractice:{at:1}}]))};
 const ids=['book','chair','table','ball','cup','bed','bread-basket','kettle','build-wood-door','paper'];
 const objects=ids.map((itemId,i)=>({id:'obj'+i,itemId,x:i*6,y:0})),pets=[{id:'pet'}];
 const before=structuredClone(state);
 for(const mode of Object.keys(HOME_LANGUAGE_MODES)){
  let game;try{game=selectAuthoredHomeGame(data,{mode,index,state,objects,pets,catalog,actions:homeGameActions(mode,objects,pets,catalog),countArea:{x:-1,y:-1,w:80,h:20}});}catch(error){throw Error(`${language}:${mode}: ${error.message}`);}
  assert.ok(game,mode);assert.equal(homeGameAnswer(game,game.answer),true,mode);
  assert.equal(homeGameAnswer(game,'This is a book.'),false,mode);
  if(mode==='count'){assert.ok(homeCountAnswer(game,game.answer,'text'));const digits=game.answer.replace(game.count.spokenNumber,'1');assert.equal(homeCountAnswer(game,digits,'speech'),true);assert.equal(homeCountAnswer(game,digits,'text'),false);}
 }
 assert.deepEqual(state,before);assert.equal(new Set(data.games.map(g=>g.id)).size,data.games.length);
 assert.equal(data.games.length,52);
});
