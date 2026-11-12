import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../js/home_app.js',import.meta.url),'utf8');
const view=readFileSync(new URL('../js/view_home.js',import.meta.url),'utf8');
const wishSource=source.slice(source.indexOf(' function currentPetWish('),source.indexOf(' function emit(){'));

test('starter-room wishes only ask for the same lamp exercise, and stop after its use is fulfilled',()=>{
 let ready=true,random=0;
 const context={home:{id:'starter-room-v1'},STARTER_ROOM_ID:'starter-room-v1',canRequestStarterLamp:()=>ready,petWish:()=>{random++;return {itemId:'greenhouse'};},catalog:{items:[]},lang:()=> 'en',round:0};
 vm.runInNewContext(wishSource,context);
 const wish=context.currentPetWish('pet1');assert.equal(wish.itemId,'bedside-lamp');assert.equal(wish.text,'Can I have a lamp?');assert.equal(wish.starterLamp,true);assert.equal(wish.expanded,false);assert.equal(random,0);
 ready=false;assert.equal(context.currentPetWish('pet1',true),null);assert.equal(random,0);
 context.home.id='ordinary-home';assert.equal(context.currentPetWish('pet1',true).itemId,'greenhouse');assert.equal(random,1);
});

test('deliberately helping a starter wish uses the real starter lamp request path',()=>{
 const handler=source.slice(source.indexOf('  helpWish:()=>{')+'  helpWish:'.length,source.indexOf('  speakWish:')).trim().replace(/,$/,'');
 let requested=0,selected=0;
 const fn=new Function('home','STARTER_ROOM_ID','requestStarterLamp','wish','select','view','return ('+handler+');')({id:'starter-room-v1'},'starter-room-v1',()=>requested++,{itemId:'greenhouse'},()=>selected++,{});
 fn();assert.equal(requested,1);assert.equal(selected,0);
});

test('pointerup movement without a pointermove event drops a pet and never opens its wish',()=>{
 const handler=view.slice(view.indexOf('  canvas.onpointerup=e=>{'),view.indexOf('  const cancelPointer='));
 const calls=[],canvas={hasPointerCapture:()=>false,getBoundingClientRect:()=>({width:800,height:600})};
 const context={canvas,eraseStroke:null,paintStroke:null,gesture:{id:1,moved:false,start:{sx:100,sy:100},hit:{kind:'pet',id:'p1'}},position:()=>({sx:140,sy:100}),run:fn=>fn(),document:{elementFromPoint:()=>canvas},body:{dataset:{}},side:{contains:()=>false},dock:{children:[null,null,{contains:()=>false}]},petDragPoint:()=>({x:400,y:300}),model:{camera:{x:0,y:0},scale:40},cb:{drop:()=>calls.push('drop'),tap:()=>calls.push('tap')}};
 vm.runInNewContext(handler,context);canvas.onpointerup({pointerId:1,clientX:140,clientY:100});assert.deepEqual(calls,['drop']);
});
