import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
import {selectAuthoredHomeGame,validateAuthoredHomeGames} from '../js/home_authored_game_core.js';
import {homeGameActions,homeGameActionMatches} from '../js/home_language_game_core.js';
import {homeStoryReadiness} from '../js/home_story_readiness_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read('data/adventure/curriculum/english-home-practice.json'),catalog=read('data/adventure/home/catalog.json').items;
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const arc=data.arcs.find(a=>a.id==='en-l1-hello-before-play');
test('hello play returns to the original chair and partner and cannot substitute a newly available one',()=>{
 validateAuthoredHomeGames(data,index);
 const objects=[{id:'first-chair',itemId:'chair',x:0,y:1},{id:'other-chair',itemId:'chair',x:2,y:2},{id:'ball',itemId:'ball',x:2,y:1}],pets=[{id:'guest'},{id:'other'}];
 const state={words:Object.fromEntries(['hello','chair','play','sit','yes'].map(w=>[w,{lastPractice:{at:1}}])),homeStories:{[JSON.stringify(['home',arc.id])]:{next:2,objects:{0:'first-chair',1:'ball'},pets:{0:'guest',1:'guest'}}}};
 const args={state,homeId:'home',index,objects,pets,catalog,now:1000};assert.equal(homeStoryReadiness(data,arc,args).status,'ready');assert.notEqual(homeStoryReadiness(data,arc,{...args,pets:[pets[1]]}).status,'ready');assert.notEqual(homeStoryReadiness(data,arc,{...args,objects:objects.slice(1)}).status,'ready');
});
