import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
import {homeStoryReadiness,homePrerequisiteLesson} from '../js/home_story_readiness_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const data=read('data/adventure/curriculum/english-home-practice.json'),catalog=read('data/adventure/home/catalog.json').items;
const index=buildWordIndex(parseWordLexicon(fs.readFileSync(new URL('../data/adventure/locale/word_en.txt',import.meta.url),'utf8'),'en'));
const arc=data.arcs.find(a=>a.id==='en-l1-my-name-in-my-corner');
const args=()=>({homeId:'home',index,catalog,state:{words:{}},objects:[{id:'book',itemId:'book',x:2,y:1}],pets:[{id:'pet'}],now:1000});

test('count story preparation requires the actual complete set and keeps the original table for the note',()=>{
 const a=args(),story=data.arcs.find(a=>a.id==='en-l1-two-books-for-story-time');
 a.state.words.book={lastPractice:{at:1}};a.objects.push({id:'table',itemId:'table',x:0,y:3});
 a.state.homeStories={[JSON.stringify(['home',story.id])]:{next:1,objects:{0:'table'}}};
 a.countArea={x:-2,y:-2,w:6,h:5};
 const missing=homeStoryReadiness(data,story,a);assert.equal(missing.status,'layout');assert.deepEqual(missing.needsCount,{amount:2,itemIds:['book']});
 a.objects.push({id:'book2',itemId:'book',x:0,y:1});assert.equal(homeStoryReadiness(data,story,a).status,'ready');
 a.objects.push({id:'book3',itemId:'book',x:1,y:1});assert.equal(homeStoryReadiness(data,story,a).status,'layout');
 a.objects.pop();a.state.homeStories[JSON.stringify(['home',story.id])].next=2;a.state.words.two={lastPractice:{at:1}};
 assert.equal(homeStoryReadiness(data,story,a).status,'ready');a.objects=a.objects.filter(o=>o.id!=='table');
 assert.equal(homeStoryReadiness(data,story,a).status,'saved-object');
});
test('story previews distinguish prerequisites and offer only executable introductions without changing state',()=>{
 const a=args(),before=structuredClone(a.state);
 const r=homeStoryReadiness(data,arc,a);assert.equal(r.status,'words');assert.deepEqual(r.words,['book']);
 const lesson=homePrerequisiteLesson(data,'book',a);assert.equal(lesson.id,'en-l1-find-book');assert.deepEqual(a.state,before);
 assert.equal(homePrerequisiteLesson(data,'book',{...a,objects:[]}),null);
 assert.equal(homeStoryReadiness(data,arc,{...a,pets:[]}).status,'pet');
 a.state.words.book={lastPractice:{at:1}};assert.equal(homeStoryReadiness(data,arc,a).status,'ready');
 assert.equal(homeStoryReadiness(data,arc,{...a,objects:[]}).status,'items');
 const key=JSON.stringify(['home',arc.id]);a.state.homeStories={[key]:{next:1,objects:{0:'book'}}};
 assert.equal(homeStoryReadiness(data,arc,a).status,'ready');
 a.state.homeReviewSession={at:1000,introduced:3};assert.equal(homeStoryReadiness(data,arc,a).status,'budget');
 assert.equal(homeStoryReadiness(data,arc,{...a,objects:[]}).status,'saved-object');
 a.state.homeStories[key].next=3;assert.equal(homeStoryReadiness(data,arc,a).status,'complete');
});
test('animal preparation previews remaining props and actual appearance and preserves saved partner identity',()=>{
 const a=args(),animal=data.arcs.find(a=>a.id==='en-l1-a-day-with-rabbit');a.state.words=Object.fromEntries(['hello','ball','water','sit'].map(w=>[w,{lastPractice:{at:1}}]));
 a.objects=[{id:'ball',itemId:'ball',x:2,y:1}];a.pets=[{id:'rabbit',speciesId:'pixel_volt_bunny',stage:0}];
 assert.equal(homeStoryReadiness(data,animal,a).status,'pet-stage');a.pets[0].stage=1;
 const ready=homeStoryReadiness(data,animal,a);assert.equal(ready.status,'ready');assert.ok(ready.futureItems.some(ids=>ids.includes('cup')));assert.ok(ready.futureItems.some(ids=>ids.includes('chair')));
 a.state.homeStories={[JSON.stringify(['home',animal.id])]:{next:1,objects:{0:'ball'},pets:{0:'gone'}}};
 assert.equal(homeStoryReadiness(data,animal,a).status,'saved-pet');
});

test('a missing drawing sends the child back to the original paper without resetting story progress',()=>{
 const a=args(),picture=data.arcs.find(a=>a.id==='en-l1-a-picture-for-tomorrow');
 a.objects=[{id:'another',itemId:'paper'},{id:'original',itemId:'paper'}];
 a.state.words.paper={lastPractice:{at:1}};
 a.state.homeStories={[JSON.stringify(['home',picture.id])]:{next:2,objects:{0:'original',1:'original'}}};
 const before=structuredClone(a.state),missing=homeStoryReadiness(data,picture,a);
 assert.equal(missing.status,'layout');assert.equal(missing.needsDrawing,true);assert.equal(missing.drawingObjectId,'original');assert.deepEqual(a.state,before);
 a.objects[1].drawing={version:1,strokes:[{color:'#294734',points:[[100,100],[700,500]]}]};
 assert.equal(homeStoryReadiness(data,picture,a).status,'ready');assert.deepEqual(a.state,before);
});

test('listening stories require an actual different object and never recommend fake single-choice comprehension',()=>{
 const a=args(),arc=data.arcs.find(a=>a.id==='en-l1-listen-read-label-book');a.state.words.book={lastPractice:{at:1}};
 assert.equal(homeStoryReadiness(data,arc,a).status,'choices');
 a.objects.push({id:'book2',itemId:'book',x:4,y:1});assert.equal(homeStoryReadiness(data,arc,a).status,'choices');
 a.objects.push({id:'lamp',itemId:'desk-lamp',x:0,y:1});assert.equal(homeStoryReadiness(data,arc,a).status,'ready');
});


test('completed story replay preparation uses current objects without changing saved completion',()=>{
 const a=args();a.state.words.book={lastPractice:{at:1}};
 const saved={next:arc.steps.length,objects:{0:'old-book'},pets:{0:'old-pet'},at:99,replayCount:2};
 a.state.homeStories={[JSON.stringify(['home',arc.id])]:saved};
 const before=structuredClone(a.state);
 const ready=homeStoryReadiness(data,arc,a);
 assert.equal(ready.status,'complete');assert.equal(ready.next,arc.steps.length);assert.equal(ready.replay.status,'ready');assert.equal(ready.replay.next,0);
 assert.equal(homeStoryReadiness(data,arc,{...a,objects:[]}).replay.status,'items');
 assert.equal(homeStoryReadiness(data,arc,{...a,pets:[]}).replay.status,'pet');
 assert.deepEqual(a.state,before);
});
