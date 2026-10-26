import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {homeComparisonBinding,homeComparisonCurrent} from '../js/home_comparison_core.js';
import {homeGameActions,validateHomeGame,homeGameActionMatches} from '../js/home_language_game_core.js';
import {validateAuthoredHomeGames,selectAuthoredHomeGame} from '../js/home_authored_game_core.js';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read('data/adventure/curriculum/english-home-practice.json'),catalog=read('data/adventure/home/catalog.json').items;
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
test('long and short require same pen type and orientation, clear length contrast, reference and decoy',()=>{
 for(const itemId of ['pencil','pen'])for(const kind of ['long','short']){
  const objects=[1,2,.5,1.25,2].map((sizeScale,i)=>({id:String(i),itemId,sizeScale})),actions=objects.map(o=>({kind:'find',objectId:o.id}));
  const spec={kind,anchorItemIds:[itemId],itemIds:[itemId]},b=homeComparisonBinding(spec,objects,actions);
  assert.equal(b.anchor.id,'0');assert.deepEqual(b.targets.map(o=>o.id),kind==='long'?['1','4']:['2']);
  for(const t of b.targets)assert.ok(homeGameActionMatches({comparison:b},{kind:'find',objectId:t.id}));
  assert.equal(homeComparisonCurrent(b,objects.map(o=>o.id==='0'?{...o,sizeScale:2}:o)),false);
  assert.equal(homeComparisonCurrent(b,objects.map(o=>o.id==='1'?{...o,rotation:1}:o)),false);
  assert.equal(homeComparisonBinding(spec,objects.map(o=>({...o,sizeScale:1})),actions),null);
  assert.equal(homeComparisonBinding(spec,objects.slice(0,3).map((o,i)=>({...o,rotation:i})),actions),null);
  assert.equal(homeComparisonBinding({...spec,anchorItemIds:['book'],itemIds:['book']},objects.map(o=>({...o,itemId:'book'})),actions),null);
 }
});
test('length teaching requires a known noun, budget and validated geometry; AI cannot invent long props',()=>{
 validateAuthoredHomeGames(data,index);
 const objects=[1,2,.5].map((sizeScale,i)=>({id:String(i),itemId:'pencil',sizeScale})),pets=[{id:'pet'}],actions=homeGameActions('find',objects,pets,catalog),subset={...data,games:data.games.filter(g=>g.id.startsWith('en-l1-length-'))};
 const args={mode:'find',index,objects,pets,actions,state:{words:{pencil:{lastPractice:{at:1}}}},newWordBudget:1};
 const game=selectAuthoredHomeGame(subset,args);assert.ok(game);assert.ok(game.comparison);assert.equal(selectAuthoredHomeGame(subset,{...args,newWordBudget:0}),null);assert.equal(selectAuthoredHomeGame(subset,{...args,state:{words:{}}}),null);
 const value={prompt:'Which pencil?',answer:'The long pencil.',reply:'Show me.',words:['long'],action:actions[1],comparison:game.comparison};
 assert.throws(()=>validateHomeGame(value,{...args,words:['long']}),/真实笔类/);
 const bad=structuredClone(subset);bad.games[0].action.itemIds=['book'];assert.throws(()=>validateAuthoredHomeGames(bad,index),/笔类/);
});
