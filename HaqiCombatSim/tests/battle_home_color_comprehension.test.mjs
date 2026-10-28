import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {homeComprehensionChoices,homeComprehensionAnswer,homeComprehensionCurrent} from '../js/home_comprehension_core.js';
import {selectAuthoredHomeGame,validateAuthoredHomeGames} from '../js/home_authored_game_core.js';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/adventure/curriculum/english-home-practice.json',import.meta.url),'utf8'));
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const objects=[{id:'a',itemId:'book',color:'red'},{id:'b',itemId:'book',color:'blue'},{id:'c',itemId:'book',color:'red'}],actions=objects.map(o=>({kind:'find',objectId:o.id}));
test('colour comprehension needs same-item contrast and accepts every matching frozen target',()=>{
 const choices=homeComprehensionChoices(['book','cup'],objects,actions,['red']);
 assert.ok(choices);for(const objectId of ['a','c'])assert.ok(homeComprehensionAnswer(choices,{kind:'find',objectId},objects));
 assert.equal(homeComprehensionAnswer(choices,{kind:'find',objectId:'b'},objects),false);
 assert.equal(homeComprehensionChoices(['book','cup'],objects.map(o=>o.id==='b'?{...o,itemId:'cup'}:o),actions,['red']),null);
 assert.equal(homeComprehensionChoices(['book'],objects.map(o=>o.id==='b'?{...o,color:undefined}:o),actions,['red']),null);
 assert.equal(homeComprehensionCurrent(choices,objects.filter(o=>o.id!=='b')),false);
 const changed=objects.map(o=>o.id==='a'?{...o,color:'blue'}:o);
 assert.ok(homeComprehensionCurrent(choices,changed));assert.equal(homeComprehensionAnswer(choices,{kind:'find',objectId:'a'},changed),false);
 assert.ok(homeComprehensionAnswer(choices,{kind:'find',objectId:'c'},changed));
 assert.equal(homeComprehensionCurrent(choices,objects.map(o=>o.id==='b'?{...o,color:'red'}:o)),false);
});
test('all ten colours require known words, checked colour metadata and real choices in both skills',()=>{
 validateAuthoredHomeGames(data,index);
 for(const color of ['red','blue','green','yellow','purple','pink','black','white','brown','grey'])for(const mode of ['read','listen']){
  const lesson=data.games.find(g=>g.id===`en-l1-color-${color}-${mode}`),subset={...data,games:[lesson],arcs:[]};
  const scene=objects.map(o=>({...o,color:o.id==='b'?(color==='blue'?'red':'blue'):color}));
  const args={mode,index,state:{words:{[color]:{lastPractice:{at:1}}}},objects:scene,actions,pets:[{id:'pet'}]};
  const game=selectAuthoredHomeGame(subset,args);assert.ok(game);assert.equal(game.choices.targets.length,2);assert.deepEqual(game.words,[color]);
  assert.equal(selectAuthoredHomeGame(subset,{...args,state:{words:{}},newWordBudget:3}),null);
  assert.equal(selectAuthoredHomeGame(subset,{...args,objects:scene.filter(o=>o.id!=='b')}),null);
  const broken=structuredClone(subset);delete broken.games[0].action.colors;assert.throws(()=>validateAuthoredHomeGames(broken,index),/颜色/);
 }
});
