import test from 'node:test';
import assert from 'node:assert/strict';
import {homeDuoCamera,homeDuoStep,homeDuoScale} from '../js/home_local_core.js';
const viewport={width:800,height:480,scale:40};
const step=(heroes,targets,objects=[],catalog=[])=>homeDuoStep(heroes,targets,.05,objects,catalog,null,viewport);

test('home partners move independently without changing adventure coordinates',()=>{
 const heroes=[{x:0,y:0,facing:0},{x:2,y:0,facing:0}],snapshot=structuredClone(heroes);
 const next=step(heroes,[{x:-3,y:0},{x:2,y:3}]);
 assert.ok(next[0].x<0);assert.equal(next[0].y,0);
 assert.equal(next[1].x,2);assert.ok(next[1].y>0);
 assert.deepEqual(heroes,snapshot);
 assert.deepEqual(homeDuoCamera(next),{x:(next[0].x+next[1].x)/2,y:(next[0].y+next[1].y)/2});
 assert.equal(step(next,[null,null])[1].moving,false);
});

test('second player obeys the same furniture collision as the first',()=>{
 const heroes=[{x:-3,y:1},{x:-.3,y:1}];
 const next=step(heroes,[null,{x:3,y:1}],[{id:'wall-1',itemId:'wall',x:0,y:0,rotation:0}],[{id:'wall',layer:'solid',size:[2,3]}]);
 assert.ok(next[1].x<0);assert.equal(next[0].x,-3);
});

test('shared home camera keeps separated players visible and allows reunion',()=>{
 let heroes=[{x:0,y:0},{x:1.5,y:0}];
 for(let i=0;i<200;i++)heroes=step(heroes,[{x:-100,y:0},{x:100,y:0}]);
 assert.ok(heroes[1].x-heroes[0].x<=16);
 const gap=heroes[1].x-heroes[0].x;
 heroes=step(heroes,[heroes[1],heroes[0]]);
 assert.ok(heroes[1].x-heroes[0].x<gap);
});

import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {assignedKeyboardAction,normalizePlayerInputs} from '../js/player_input_core.js';
import {normalizeLocalKeys} from '../js/local_controls_core.js';
const app=readFileSync(new URL('../js/home_app.js',import.meta.url),'utf8');
test('home input routes both keyboards and releases movement on blur or text focus',()=>{
 const listeners={},context={secondHero:{x:1.5,y:0},secondDestination:null,secondPath:[],hero:{x:0,y:0},destination:null,walkPath:[],home:{id:'h'},entering:false,held:[new Set(),new Set()],getContext:()=>({secondSave:{},settings:{}}),document:{hidden:false,activeElement:null,addEventListener(){}},window:{addEventListener:(name,fn)=>listeners[name]=fn},assignedKeyboardAction,normalizePlayerInputs,normalizeLocalKeys,createPlayerInput:options=>{context.pad=options;return {};}};
 vm.runInNewContext(app.slice(app.indexOf(' const duo='),app.indexOf(' let walkChunk=')),context);
 const event=code=>({code,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}});
 listeners.keydown(event('KeyW'));listeners.keydown(event('ArrowRight'));
 assert.ok(context.held[0].has('up'));assert.ok(context.held[1].has('right'));
 context.secondDestination={x:3,y:0};listeners.keyup(event('ArrowRight'));
 assert.equal(context.secondDestination,null);assert.equal(context.held[1].size,0);
 listeners.blur();assert.equal(context.held[0].size,0);
 context.document.activeElement={closest:()=>true};const typed=event('KeyW');listeners.keydown(typed);
 assert.equal(typed.stopped,undefined);assert.equal(context.held[0].size,0);
 assert.equal(context.pad.enabled(),false);
 context.document.activeElement=null;context.pad.dispatch(1,{action:'left',down:true});assert.ok(context.held[1].has('left'));
 context.pad.dispatch(1,{action:'left',down:false});assert.equal(context.held[1].size,0);
});

test('home zoom keeps both players in view after resizing',()=>{
 const heroes=[{x:0,y:0},{x:16,y:4}];
 assert.equal(homeDuoScale(heroes,72,viewport),40);
 assert.ok(homeDuoScale(heroes,40,{width:480,height:400})<=20);
});
