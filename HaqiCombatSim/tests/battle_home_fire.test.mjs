import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildWordIndex,parseWordLexicon,canonicalWord} from '../js/word_lexicon_core.js';
import {validateAuthoredHomeGames,selectAuthoredHomeGame} from '../js/home_authored_game_core.js';
import {homeGameActions,homeGameActionMatches,homeGameAnswer,homeObjectWasMoved} from '../js/home_language_game_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read('data/adventure/curriculum/english-home-practice.json');
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const catalog=read('data/adventure/home/catalog.json').items;
const objects=['chair','cup','bread-basket','bed','ball'].map((itemId,i)=>({id:'object-'+i,itemId,x:i,y:0}));
const actions=homeGameActions('care',objects,[{id:'pet1'}],catalog);
const known=words=>({words:Object.fromEntries(words.map((w,i)=>[canonicalWord(index,w),{lastPractice:{at:i+1}}]))});

test('fire lessons bind the visible fireplace flame, never a glowing lamp or an unlit stove',()=>{
 const subset={...data,games:data.games.filter(g=>g.id.startsWith('en-l1-fire-')),arcs:[]};
 const objects=['desk-lamp','stove','fireplace'].map((itemId,i)=>({id:String(i),itemId,x:i*3,y:0})),pets=[{id:'pet'}];
 const args={mode:'find',index,state:{words:{}},objects,pets,catalog,newWordBudget:1,actions:homeGameActions('find',objects,pets,catalog)};
 const game=selectAuthoredHomeGame(subset,args);assert.ok(game);assert.equal(game.action.objectId,'2');assert.deepEqual(game.introducedWords,['fire']);
 assert.equal(homeGameActionMatches(game,{kind:'find',objectId:'0'}),false);assert.equal(homeGameActionMatches(game,{kind:'find',objectId:'1'}),false);assert.equal(homeGameActionMatches(game,{kind:'find',objectId:'2'}),true);
 assert.equal(selectAuthoredHomeGame(subset,{...args,objects:objects.slice(0,2),actions:args.actions.slice(0,2)}),null);
 assert.equal(selectAuthoredHomeGame(subset,{...args,newWordBudget:0}),null);
});
test('fire listening and reading need an already learned word and a different visible choice',()=>{
 const subset={...data,games:data.games.filter(g=>g.id.startsWith('en-l1-fire-')),arcs:[]},pets=[{id:'pet'}];
 const objects=[{id:'fire',itemId:'fireplace',x:0,y:0},{id:'lamp',itemId:'desk-lamp',x:3,y:0}];
 for(const mode of ['read','listen']){
 const args={mode,index,objects,pets,catalog,actions:homeGameActions(mode,objects,pets,catalog),state:known(['fire']),newWordBudget:3};
 const game=selectAuthoredHomeGame(subset,args);assert.ok(game?.choices);assert.equal(selectAuthoredHomeGame(subset,{...args,state:{words:{}}}),null);
 assert.equal(selectAuthoredHomeGame(subset,{...args,objects:objects.slice(0,1),actions:args.actions.slice(0,1)}),null);
 }
});
