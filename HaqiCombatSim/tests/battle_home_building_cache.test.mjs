import test from 'node:test';
import assert from 'node:assert/strict';
import {createHomeBuildingCache} from '../js/home_building_cache.js';
const item={id:'floor',size:[1,1],layer:'ground',art:{local:'floor',crop:[0,0,10,10]},building:{type:'floor',style:'wood'}};
const objects=[{id:'one',itemId:'floor',x:0,y:0}],rect={x:0,y:0,w:400,h:400},image={src:'floor',complete:true,naturalWidth:10,width:10};
const ctx=new Proxy({}, {get:()=>()=>{}}),pause=()=>new Promise(r=>setTimeout(r,15));
function mocks(){const old={Worker:globalThis.Worker,document:globalThis.document,createImageBitmap:globalThis.createImageBitmap,OffscreenCanvas:globalThis.OffscreenCanvas};globalThis.Worker=undefined;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>ctx})};globalThis.createImageBitmap=async()=>({closed:false,close(){this.closed=true;}});return ()=>Object.assign(globalThis,old);}
test('fallback bakes once, ignores unchanged views and invalidates moved content immediately',async()=>{const restore=mocks(),cache=createHomeBuildingCache({imageFor:()=>image});try{cache.prepare(objects,[item],rect,1);await pause();const before=cache.stats();assert.equal(before.bakes,1);const group=cache.prepare(objects,[item],rect,1)[0];cache.draw(ctx,group);assert.equal(cache.stats().hits,1);await pause();assert.equal(cache.stats().bakes,1);const changed=[{...objects[0],x:1}];const next=cache.prepare(changed,[item],rect,1)[0];cache.draw(ctx,next);assert.equal(cache.stats().live,1);cache.dispose();assert.equal(cache.stats().bytes,0);}finally{cache.dispose();restore();}});
test('missing images stay live and arriving images become cacheable',async()=>{const restore=mocks();let ready=false;const cache=createHomeBuildingCache({imageFor:()=>ready?image:null});try{cache.prepare(objects,[item],rect,1);await pause();assert.equal(cache.stats().bakes,0);ready=true;cache.prepare(objects,[item],rect,1);await pause();assert.equal(cache.stats().bakes,1);}finally{cache.dispose();restore();}});
test('selection removes a piece from baked groups and memory remains bounded',async()=>{const restore=mocks(),cache=createHomeBuildingCache({imageFor:()=>image});try{cache.prepare(objects,[item],rect,1);await pause();const groups=cache.prepare(objects,[item],rect,1,'one');assert.equal(groups[0].dynamic,true);assert.equal(cache.stats().bytes,0);cache.clear();assert.equal(cache.stats().pending,false);}finally{cache.dispose();restore();}});
test('obsolete worker replies close their bitmap instead of resurrecting deleted pieces',async()=>{const restore=mocks();let worker;globalThis.OffscreenCanvas=class{};globalThis.Worker=class{constructor(){worker=this;this.jobs=[];}postMessage(message){if(message.id)this.jobs.push(message);}terminate(){}};const cache=createHomeBuildingCache({imageFor:()=>image});try{cache.prepare(objects,[item],rect,1);await pause();assert.equal(worker.jobs.length,1);cache.prepare([],[item],rect,1);const bitmap={closed:false,close(){this.closed=true;}};worker.onmessage({data:{id:worker.jobs[0].id,bitmap}});assert.equal(bitmap.closed,true);assert.equal(cache.stats().bakes,0);assert.equal(cache.stats().bytes,0);}finally{cache.dispose();restore();}});
test('worker failure switches to cooperative raster fallback',async()=>{const restore=mocks();let worker;globalThis.OffscreenCanvas=class{};globalThis.Worker=class{constructor(){worker=this;}postMessage(){}terminate(){}};const cache=createHomeBuildingCache({imageFor:()=>image});try{cache.prepare(objects,[item],rect,1);await pause();worker.onerror();cache.prepare(objects,[item],rect,1);await pause();assert.equal(cache.stats().mode,'fallback');assert.equal(cache.stats().bakes,1);}finally{cache.dispose();restore();}});
test('neighbor wall removal invalidates baked floor AO across chunk borders, leaving distant floors cached',async()=>{
 const restore=mocks(),cache=createHomeBuildingCache({imageFor:()=>image});
 const wallItem={...item,id:'wall',layer:'solid',building:{type:'wall',style:'wood'}};
 const scene=[{id:'near',itemId:'floor',x:32,y:0},{id:'far',itemId:'floor',x:40,y:0},{id:'wall',itemId:'wall',x:31.9,y:0,rotation:1}];
 // Real gradient object is required by the ground painter in fallback.
 const gradientContext=new Proxy({}, {get:(_,key)=>key==='createLinearGradient'?()=>({addColorStop(){}}):()=>{}});
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>gradientContext})};
 try{
  for(let n=0;n<4;n++){cache.prepare(scene,[item,wallItem],{x:1200,y:-100,w:600,h:400},1);await pause();}
  const before=cache.stats();
  const next=cache.prepare(scene.slice(0,2),[item,wallItem],{x:1200,y:-100,w:600,h:400},1);
  cache.draw(gradientContext,next.find(g=>g.rows[0].o.id==='near'));assert.equal(cache.stats().live,before.live+1);
  cache.draw(gradientContext,next.find(g=>g.rows[0].o.id==='far'));assert.equal(cache.stats().hits,before.hits+1);
  assert.deepEqual(next.find(g=>g.rows[0].o.id==='near').rows[0].ao,[]);
 }finally{cache.dispose();restore();}
});
