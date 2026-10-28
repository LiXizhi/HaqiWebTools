import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
import {selectAuthoredHomeGame,validateAuthoredHomeGames} from '../js/home_authored_game_core.js';
import {homeGameActions,homeGameActionMatches,homeGameAnswer,homeGameObjectMatches} from '../js/home_language_game_core.js';
import {homeStoryReadiness} from '../js/home_story_readiness_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read('data/adventure/curriculum/english-home-practice.json'),catalog=read('data/adventure/home/catalog.json').items;
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const arc=data.arcs.find(a=>a.id==='en-l1-wait-for-my-picture');
test('preference writing requires the original saved drawing and sharing requires the original friend',()=>{
 validateAuthoredHomeGames(data,index);
 const drawing={version:1,strokes:[{color:'#294734',points:[[100,100],[400,400]]}]};
 const objects=[{id:'chair',itemId:'chair',x:0,y:1},{id:'paper',itemId:'paper',x:2,y:1,drawing},{id:'other',itemId:'paper',x:3,y:3,drawing}],pets=[{id:'guest'},{id:'other-pet'}];
 const progress={next:2,objects:{0:'chair',1:'paper'},pets:{0:'guest'}};
 const state={words:Object.fromEntries(['wait','draw','paper','chair','book'].map(w=>[w,{lastPractice:{at:1}}])),homeStories:{[JSON.stringify(['home',arc.id])]:progress}};
 const args={state,homeId:'home',index,objects,pets,catalog,now:1000};assert.equal(homeStoryReadiness(data,arc,args).status,'ready');assert.notEqual(homeStoryReadiness(data,arc,{...args,objects:objects.filter(o=>o.id!=='paper')}).status,'ready');assert.notEqual(homeStoryReadiness(data,arc,{...args,objects:objects.map(o=>o.id==='paper'?{...o,drawing:undefined}:o)}).status,'ready');
 progress.next=3;state.words.like={lastPractice:{at:2}};assert.equal(homeStoryReadiness(data,arc,args).status,'ready');assert.notEqual(homeStoryReadiness(data,arc,{...args,pets:[pets[1]]}).status,'ready');
});

test('preference sentence frames accept learned present props but reject invented or unlearned choices',()=>{
 const drawing={version:1,strokes:[{color:'#294734',points:[[100,100],[400,400]]}]};
 const objects=[{id:'paper',itemId:'paper',x:0,y:1,drawing},{id:'chair',itemId:'chair',x:2,y:1},{id:'lamp',itemId:'desk-lamp',x:3,y:1}],pets=[{id:'guest'}];
 const state={words:Object.fromEntries(['paper','chair','draw','book','cup'].map(w=>[w,{lastPractice:{at:1}}]))};
 const lesson=data.games.find(g=>g.id==='en-l1-wait-for-my-picture-like');
 const game=selectAuthoredHomeGame({...data,games:[lesson]},{mode:'write',index,state,objects,pets,catalog,newWordBudget:1,arcId:arc.id,actions:homeGameActions('write',objects,pets,catalog)});assert.ok(game);
 for(const text of ['I like my chair.','I like the chair.','I like my paper.','I like books.','I like drawing.'])assert.ok(homeGameAnswer(game,text),text);
 for(const text of ['I like my cup.','I like the lamp.','I dislike my chair.','I like my dragon.','I like my chair and my cup.','I like <script>.'])assert.equal(homeGameAnswer(game,text),false,text);
 assert.deepEqual(game.words,['like']);assert.ok(homeGameActionMatches(game,{kind:'label',objectId:'paper',text:'I like the chair.'}));assert.equal(homeGameActionMatches(game,{kind:'label',objectId:'chair',text:'I like the chair.'}),false);
 assert.ok(homeGameObjectMatches(game,objects));assert.equal(homeGameObjectMatches(game,objects.filter(o=>o.id!=='chair')),false);assert.equal(homeGameObjectMatches(game,objects.map(o=>o.id==='chair'?{...o,itemId:'cup'}:o)),false);assert.ok(homeGameObjectMatches(game,[...objects,{id:'extra',itemId:'cup',x:5,y:5}]));
});
