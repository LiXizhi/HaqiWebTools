import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {COLORS,HOME_COLOR_HEX,parseSummon} from '../js/home_core.js';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
import {selectAuthoredHomeGame,validateAuthoredHomeGames} from '../js/home_authored_game_core.js';
import {homeGameActions,homeGameObjectMatches,validateHomeGame} from '../js/home_language_game_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read('data/adventure/curriculum/english-home-practice.json'),catalog=read('data/adventure/home/catalog.json').items;
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));

test('colour introductions only bind matching objects; later changes invalidate the exercise',()=>{
 const subset={...data,games:data.games.filter(g=>g.id==='en-l1-color-red-find')};
 const objects=[{id:'blue',itemId:'book',color:'blue'},{id:'red',itemId:'book',color:'red'}],pets=[{id:'pet'}];
 const args={mode:'find',index,state:{words:{}},objects,pets,actions:homeGameActions('find',objects,pets,catalog),newWordBudget:1};
 const game=selectAuthoredHomeGame(subset,args);assert.equal(game.action.objectId,'red');assert.deepEqual(game.words,['red']);
 assert.ok(homeGameObjectMatches(game,objects));
 assert.ok(!homeGameObjectMatches(game,objects.filter(o=>o.id!=='red')));
 assert.ok(!homeGameObjectMatches(game,objects.map(o=>({...o,color:'blue'}))));
 assert.equal(selectAuthoredHomeGame(subset,{...args,objects:objects.map(o=>({...o,color:'blue'}))}),null);
 const bad=structuredClone(subset);bad.games[0].action.colors=['invisible'];assert.throws(()=>validateAuthoredHomeGames(bad,index),/颜色/);
});

test('AI colour practice cannot claim a blue object is red',()=>{
 const objects=[{id:'book',itemId:'book',color:'blue'}],actions=homeGameActions('find',objects,[{id:'pet'}],catalog);
 const value={prompt:'What colour?',answer:'Red.',reply:'Show me.',words:['red'],action:actions[0]};
 assert.throws(()=>validateHomeGame(value,{words:['red'],index,actions,objects}),/颜色/);
 const game=validateHomeGame({...value,words:['blue'],answer:'Blue.'},{words:['blue'],index,actions,objects});
 assert.deepEqual(game.objectColors,['blue']);
});

test('all supported colours have a visible palette and black/grey furniture can be summoned',()=>{
 assert.deepEqual(Object.keys(COLORS).sort(),Object.keys(HOME_COLOR_HEX).sort());
 for(const color of ['black','grey'])assert.deepEqual(parseSummon(`I want a ${color} book.`,catalog,'en').candidates,[{itemId:'book',color}]);
 const words=new Set(data.games.filter(g=>g.id.startsWith('en-l1-color-')).flatMap(g=>g.words));
 assert.equal(words.size,11);assert.ok(!words.has('orange')); // The core orange objective is the fruit.
});
