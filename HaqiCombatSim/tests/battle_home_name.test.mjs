import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {homeNameLabel} from '../js/home_name_label_core.js';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
import {validateAuthoredHomeGames,selectAuthoredHomeGame} from '../js/home_authored_game_core.js';
import {homeGameActions,homeGameAnswer,homeGameActionMatches,homeGameObjectMatches,validateHomeGame} from '../js/home_language_game_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read('data/adventure/curriculum/english-home-practice.json'),catalog=read('data/adventure/home/catalog.json').items;
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));

test('nickname writing accepts chosen names rather than one answer and rejects empty or unrelated messages',()=>{
 for(const text of ['My name is Luna.','my name is Jo','My name is Anne-Marie!','My name is José.','My name is O’Neil.'])assert.ok(homeNameLabel(text),text);
 for(const text of ['','My name is','My name is your name.','My name is 123.','My book.','My name is <b>Pip</b>.','My name is Pip. I like books.','My name is '+'a'.repeat(40)])assert.equal(homeNameLabel(text),null,text);
 validateAuthoredHomeGames(data,index);
 const story=data.games.find(g=>g.id==='en-l1-name-book-meet'),objects=[{id:'book',itemId:'book',x:2,y:1}],pets=[{id:'pet'}];
 const args={mode:'write',index,objects,pets,catalog,actions:homeGameActions('write',objects,pets,catalog),state:{words:{book:{lastPractice:{at:1}}}},newWordBudget:1};
 const game=selectAuthoredHomeGame({...data,games:[story]},args);
 assert.ok(game);assert.deepEqual(game.introducedWords,['name']);assert.ok(homeGameAnswer(game,'My name is Luna.'));
 assert.ok(homeGameActionMatches(game,{kind:'label',objectId:'book',text:'My name is Luna.'}));
 assert.equal(homeGameActionMatches(game,{kind:'label',objectId:'another',text:'My name is Luna.'}),false);
 assert.equal(homeGameActionMatches(game,{kind:'label',objectId:'book',text:'My book.'}),false);
 assert.equal(selectAuthoredHomeGame({...data,games:[story]},{...args,newWordBudget:0}),null);
 const bad=structuredClone(data);bad.games.find(g=>g.writing).mode='find';assert.throws(()=>validateAuthoredHomeGames(bad,index));
});

test('the next conversation consumes the actual saved name and invalidates edited or missing labels',()=>{
 const story=data.games.find(g=>g.id==='en-l1-name-book-visit'),pets=[{id:'pet'}];
 const objects=[{id:'not-labeled',itemId:'book',x:0,y:1},{id:'chosen',itemId:'book',x:2,y:1,label:'My name is Luna.'}];
 const args={mode:'care',index,objects,pets,catalog,actions:homeGameActions('care',objects,pets,catalog),state:{words:Object.fromEntries(['name','book','read'].map(w=>[w,{lastPractice:{at:1}}]))}};
 const game=selectAuthoredHomeGame({...data,games:[story]},args);
 assert.equal(game.action.objectId,'chosen');assert.equal(game.answer,'My name is Luna.');
 assert.ok(homeGameAnswer(game,'My name is Luna'));assert.equal(homeGameAnswer(game,'My name is Pip.'),false);
 assert.ok(homeGameObjectMatches(game,objects));
 assert.equal(homeGameObjectMatches(game,objects.map(o=>({...o,label:'My name is Jo.'}))),false);
 assert.equal(homeGameObjectMatches(game,objects.slice(0,1)),false);
 assert.equal(selectAuthoredHomeGame({...data,games:[story]},{...args,objects:objects.map(o=>({...o,label:'My book.'}))}),null);
 assert.equal(homeGameActionMatches(game,{...game.action,petId:'other'}),false);
 assert.throws(()=>validateHomeGame({...story,action:game.action},{...args,words:['name']}),/昵称/);
});
