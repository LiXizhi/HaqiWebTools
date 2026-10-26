import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {beginHomeWalk,advanceHomeWalk,homeWalkBinding,homeWalkNear,homeWalkCurrent} from '../js/home_walking_practice_core.js';
import {homeGameActionMatches,homeGameActions,homeGameObjectMatches} from '../js/home_language_game_core.js';
import {validateAuthoredHomeGames} from '../js/home_authored_game_core.js';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const catalog=read('data/adventure/home/catalog.json').items,chair={id:'chair',itemId:'chair',x:3,y:1},binding=homeWalkBinding(chair,catalog);
test('walking practice requires continuous actual movement and arrival rather than time, clicks, teleports or duplicates',()=>{
 let trace=beginHomeWalk({x:0,y:1});const unchanged=advanceHomeWalk(trace,{x:0,y:1},{x:0,y:1},100,binding);assert.equal(unchanged,trace);
 const jumped=advanceHomeWalk(trace,{x:0,y:1},{x:2,y:1},.05,binding);assert.equal(jumped.distance,0);assert.equal(jumped.arrived,false);
 for(let i=1;i<=20;i++){
  const before={x:(i-1)/10,y:1},after={x:i/10,y:1};trace=advanceHomeWalk(trace,before,after,.05,binding);
  const duplicate=advanceHomeWalk(trace,before,after,.05,binding);assert.equal(duplicate,trace);
  if(i<15)assert.equal(trace.arrived,false);
 }
 assert.ok(trace.arrived);assert.ok(Math.abs(trace.distance-2)<1e-6);
 assert.equal(homeWalkNear(binding,{x:-2,y:1}),false);assert.equal(homeWalkNear(binding,{x:3.5,y:1.5}),false);
 assert.equal(homeGameActionMatches({action:{kind:'walk',objectId:'chair'}},{kind:'walk',objectId:'chair'}),false);
 assert.equal(advanceHomeWalk(trace,{x:NaN,y:1},{x:2,y:1},.05,binding),null);
});
test('walking destinations retain their exact furniture geometry and cannot follow moved or mounted objects',()=>{
 assert.ok(homeWalkCurrent(binding,[chair],catalog));assert.ok(homeGameObjectMatches({walking:binding},[chair],catalog));
 for(const changed of [{...chair,x:4},{...chair,sizeScale:2},{...chair,parentId:'other'},{...chair,itemId:'table'}])assert.equal(homeWalkCurrent(binding,[changed],catalog),false);
 assert.equal(homeWalkCurrent(binding,[],catalog),false);
 assert.equal(homeGameActions('walk',[{...chair,parentId:'table'}],[],catalog).length,0);
 const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));validateAuthoredHomeGames(read('data/adventure/curriculum/english-home-practice.json'),index);
});
