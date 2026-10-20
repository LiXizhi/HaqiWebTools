import test from 'node:test';
import assert from 'node:assert/strict';
import {createWordTreeView} from '../js/view_word_tree.js';
import {chooseLearningLabels} from '../js/word_tree_layout_core.js';

test('tree defers text rasterization, bounds filtered surfaces, sleeps and wakes, releases atlases',t=>{
 const queue=new Map(),canvases=[],textCalls=[];let serial=0,time=0,observer;
 function canvas(){const c={width:0,height:0,getBoundingClientRect:()=>({width:1100,height:700}),addEventListener(){},setPointerCapture(){}};
 const ctx=new Proxy({measureText:()=>({width:50}),fillText(){textCalls.push({width:c.width,height:c.height,filter:ctx.filter});}}, {get:(o,k)=>k in o?o[k]:()=>{}});c.getContext=()=>ctx;canvases.push(c);return c;}
 for(const [key,value] of Object.entries({document:{hidden:false,createElement:canvas,addEventListener(){},removeEventListener(){}},devicePixelRatio:1,matchMedia:()=>({matches:false}),ResizeObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}},requestAnimationFrame:fn=>{queue.set(++serial,fn);return serial;},cancelAnimationFrame:id=>queue.delete(id)})){const previous=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});t.after(()=>{if(previous)Object.defineProperty(globalThis,key,previous);else delete globalThis[key];});}
 const c=canvas(),view=createWordTreeView(c),words=Object.fromEntries(Array.from({length:2000},(_,i)=>['word'+i,{id:'word'+i,ordinal:i,contexts:[],evidence:[],count:0}]));
 const state={words,questions:[]};view.setState(state);assert.equal(textCalls.length,0,'opening does not rasterize 1200 tiles synchronously');
 function frame(){const jobs=[...queue.values()];queue.clear();time+=16;for(const fn of jobs)fn(time);}
 frame();assert.ok(textCalls.filter(x=>x.width===204).length<=48,'at most 24 tiles per frame');
 for(let i=0;i<500&&queue.size;i++)frame();
 assert.equal(queue.size,0,'unchanged tree stops drawing');assert.ok(view.hits.length>0);assert.equal(view.stats.total,600);
 assert.ok(textCalls.some(x=>x.filter==='blur(1.4px)'));
 assert.ok(textCalls.filter(x=>x.filter==='blur(1.4px)').every(x=>x.width===204&&x.height===40),'blur never runs on a large atlas');
 const before=view.camera.yaw;c.onkeydown({key:'ArrowRight',preventDefault(){}});assert.ok(queue.size);frame();assert.ok(view.camera.yaw>before);
 observer();assert.ok(queue.size,'resize wakes rendering');
 view.setQuestions([{id:'fruit',target:'word0',completed:false}]);frame();assert.equal(view.fruits.length,1);assert.ok(queue.size,'fruit animation continues');
 view.dispose();assert.equal(queue.size,0);assert.ok(canvases.slice(1).every(x=>x.width===0&&x.height===0));
});

test('label collision checks measure each candidate once',()=>{
 const points=Array.from({length:600},(_,i)=>({x:70+i%10*100,y:60+Math.floor(i/10)*60,depth:i,node:{id:String(i),entry:{text:String(i)},status:{kind:'seen'}}}));
 let calls=0;const labels=chooseLearningLabels(points,32,1100,700,()=>{calls++;return 50;});assert.ok(labels.length>0);assert.ok(calls<=points.length);
});
