import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {homeGameActions,homeGameActionMatches} from '../js/home_language_game_core.js';
import {validateAuthoredHomeGames,selectAuthoredHomeGame} from '../js/home_authored_game_core.js';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read('data/adventure/curriculum/english-home-practice.json'),catalog=read('data/adventure/home/catalog.json').items;
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
test('talk binds a real partner and story corner; no generic pet action completes dialogue',()=>{
 const objects=[{id:'book',itemId:'book'}],pets=[{id:'friend'}],actions=homeGameActions('talk',objects,pets,catalog),story=data.games.find(g=>g.id==='en-l1-talk-speak-first');
 const subset={...data,games:[story],arcs:[]},args={mode:'talk',index,state:{words:{book:{lastPractice:{at:1}}}},objects,pets,catalog,actions,newWordBudget:1};
 const game=selectAuthoredHomeGame(subset,args);assert.ok(game);assert.equal(game.replyGloss,'可以。我在听。');
 assert.equal(homeGameActionMatches(game,{...game.action,petId:'other'}),false);assert.equal(homeGameActionMatches(game,{...game.action,kind:'pet-use',activity:'read'}),false);assert.ok(homeGameActionMatches(game,game.action));
 assert.deepEqual(homeGameActions('talk',objects,[],catalog),[]);assert.deepEqual(homeGameActions('talk',[],pets,catalog),[]);
 assert.equal(selectAuthoredHomeGame(subset,{...args,newWordBudget:0}),null);
 const bad=structuredClone(subset);delete bad.games[0].replyGloss;assert.throws(()=>validateAuthoredHomeGames(bad,index),/伙伴对话/);
});
