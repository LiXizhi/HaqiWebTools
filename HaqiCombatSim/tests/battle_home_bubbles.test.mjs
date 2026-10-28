import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildWordIndex,parseWordLexicon,canonicalWord} from '../js/word_lexicon_core.js';
import {validateAuthoredHomeGames,selectAuthoredHomeGame} from '../js/home_authored_game_core.js';
import {validateHomeGame,homeGameActions,homeGameActionMatches,homeGameAnswer,homeObjectWasMoved} from '../js/home_language_game_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read('data/adventure/curriculum/english-home-practice.json');
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const catalog=read('data/adventure/home/catalog.json').items;
const objects=['chair','cup','bread-basket','bed','ball'].map((itemId,i)=>({id:'object-'+i,itemId,x:i,y:0}));
const actions=homeGameActions('care',objects,[{id:'pet1'}],catalog);
const known=words=>({words:Object.fromEntries(words.map((w,i)=>[canonicalWord(index,w),{lastPractice:{at:i+1}}]))});

test('clean means requesting an actual bath; food, water and sleep cannot satisfy it',()=>{
 const subset={...data,games:data.games.filter(g=>g.id.startsWith('en-l1-clean-')),arcs:[]};
 const objects=['cup','bed','bathtub','shower'].map((itemId,i)=>({id:String(i),itemId,x:i*3,y:0})),pets=[{id:'pet'}],actions=homeGameActions('care',objects,pets,catalog);
 const args={mode:'care',index,state:{words:{}},objects,pets,catalog,newWordBudget:1,actions};
 const game=selectAuthoredHomeGame(subset,args);assert.ok(game);assert.equal(game.action.activity,'bathe');assert.deepEqual(game.introducedWords,['clean']);
 for(const activity of ['sleep','drink','eat'])assert.equal(homeGameActionMatches(game,{...game.action,activity}),false);
 assert.equal(homeGameActionMatches(game,{...game.action,petId:'other'}),false);
 assert.equal(selectAuthoredHomeGame(subset,{...args,objects:objects.slice(0,2),actions:actions.filter(a=>a.activity!=='bathe')}),null);
 assert.throws(()=>validateHomeGame({...game,action:actions.find(a=>a.activity==='drink')},{words:['clean'],index,objects,actions}),/洗澡/);
 assert.throws(()=>validateHomeGame({...game,action:{...actions.find(a=>a.activity==='drink'),activity:'bathe'}},{words:['clean'],index,objects,actions}),/洗澡/);
 assert.equal(selectAuthoredHomeGame(subset,{...args,newWordBudget:0}),null);
});
