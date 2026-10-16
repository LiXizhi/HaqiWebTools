import test from 'node:test';
import assert from 'node:assert/strict';
import {createHanziWriting} from '../js/view_hanzi_writing.js';

function pad(t,count=4){
 const original=globalThis.Path2D;globalThis.Path2D=class{};t.after(()=>{if(original===undefined)delete globalThis.Path2D;else globalThis.Path2D=original;});
 const context=new Proxy({globalAlpha:1},{get:(obj,key)=>key in obj?obj[key]:()=>{}});
 return {canvas:{style:{},getContext:()=>context,addEventListener(){}},glyph:{strokes:Array(count).fill('M0 0L1 1'),medians:Array.from({length:count},()=>[[0,0],[1,1]])}};
}
test('dictionary demonstration gives each stroke time and reports the current stroke only',t=>{
 t.mock.timers.enable({apis:['setInterval']});const {canvas,glyph}=pad(t),events=[];
 const writing=createHanziWriting(canvas,glyph,{hint:false,preserveOnDemo:true,demoStrokeMs:650,onDemo:(active,stroke,total)=>events.push({active,stroke,total})});
 writing.demonstrate();assert.deepEqual(events,[{active:true,stroke:1,total:4}]);t.mock.timers.tick(640);assert.equal(events.length,1);t.mock.timers.tick(40);assert.equal(events.at(-1).stroke,2);
 t.mock.timers.tick(1920);assert.deepEqual(events.filter(e=>e.active).map(e=>e.stroke),[1,2,3,4]);assert.equal(events.at(-1).active,false);assert.deepEqual(writing.strokes,[]);writing.dispose();
});
test('stopping or disposing a demonstration prevents late progress callbacks',t=>{
 t.mock.timers.enable({apis:['setInterval']});const {canvas,glyph}=pad(t,8),events=[];
 const writing=createHanziWriting(canvas,glyph,{hint:false,demoStrokeMs:650,onDemo:active=>events.push(active)});
 writing.demonstrate();writing.stopDemonstration();const stopped=events.length;t.mock.timers.tick(10000);assert.equal(events.length,stopped);assert.equal(events.at(-1),false);
 writing.demonstrate();writing.dispose();const disposed=events.length;t.mock.timers.tick(10000);assert.equal(events.length,disposed);
});

test('restored writing is cloned, remains editable and is never demonstration output',t=>{
 const {canvas,glyph}=pad(t),changes=[],writing=createHanziWriting(canvas,glyph,{hint:false,onChange:n=>changes.push(n)}),draft=[[[.1,.2],[.3,.4]],[[.5,.6],[.7,.8]]];
 writing.restore(draft);draft[0][0][0]=.9;assert.equal(writing.strokes[0][0][0],.1);assert.equal(changes.at(-1),2);writing.undo();assert.equal(writing.strokes.length,1);writing.clear();assert.deepEqual(writing.strokes,[]);writing.dispose();
});


test('single-stroke demonstration preserves the draft and reports the real stroke number without advancing practice',t=>{
 t.mock.timers.enable({apis:['setInterval']});const {canvas,glyph}=pad(t,14),events=[],changes=[];
 const writing=createHanziWriting(canvas,glyph,{hint:false,preserveOnDemo:true,demoStrokeMs:650,onDemo:(active,stroke,total)=>events.push({active,stroke,total}),onChange:n=>changes.push(n)});
 const draft=[[[.1,.2],[.3,.4]],[[.5,.6],[.7,.8]]];writing.restore(draft);writing.demonstrate({strokeIndex:2});
 assert.deepEqual(events,[{active:true,stroke:3,total:14}]);t.mock.timers.tick(680);assert.equal(events.at(-1).active,false);assert.deepEqual(writing.strokes,draft);assert.deepEqual(changes,[2]);
 const count=events.length;for(const strokeIndex of [-1,14,1.5,NaN])writing.demonstrate({strokeIndex});assert.equal(events.length,count);
 writing.demonstrate({strokeIndex:2});writing.stopDemonstration();t.mock.timers.tick(2000);assert.deepEqual(writing.strokes,draft);writing.demonstrate();assert.equal(events.at(-1).stroke,1);writing.dispose();
});

test('pausing a stroke demonstration keeps its position and draft until resumed',t=>{
 t.mock.timers.enable({apis:['setInterval']});const {canvas,glyph}=pad(t),events=[];
 const writing=createHanziWriting(canvas,glyph,{hint:false,preserveOnDemo:true,demoStrokeMs:650,onDemo:(active,stroke,total,paused=false)=>events.push({active,stroke,total,paused})});
 const draft=[[[.1,.2],[.3,.4]]];writing.restore(draft);writing.demonstrate();t.mock.timers.tick(680);writing.pauseDemonstration();assert.deepEqual(events.at(-1),{active:true,stroke:2,total:4,paused:true});const paused=events.length;t.mock.timers.tick(10000);assert.equal(events.length,paused);assert.deepEqual(writing.strokes,draft);
 writing.resumeDemonstration();assert.equal(events.at(-1).stroke,2);assert.equal(events.at(-1).paused,false);for(let i=0;i<50;i++)t.mock.timers.tick(40);assert.equal(events.at(-1).active,false,JSON.stringify(events));assert.deepEqual(writing.strokes,draft);
 writing.demonstrate({strokeIndex:2});writing.pauseDemonstration();assert.equal(events.at(-1).stroke,3);writing.stopDemonstration();const stopped=events.length;writing.resumeDemonstration();t.mock.timers.tick(10000);assert.equal(events.length,stopped);
 writing.demonstrate();writing.pauseDemonstration();writing.dispose();const disposed=events.length;writing.resumeDemonstration();t.mock.timers.tick(10000);assert.equal(events.length,disposed);
});
