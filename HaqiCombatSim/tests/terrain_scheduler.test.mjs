import test from 'node:test';
import assert from 'node:assert/strict';
import {createScheduledTerrainCache} from '../js/terrain_tile_scheduler.js';
function harness(){let time=0,id=0,painted=0;const callbacks=new Map();const cache=createScheduledTerrainCache({
 createCanvas:()=>({getContext:()=>({translate(){},scale(){}})}),now:()=>time,
 schedule:fn=>{callbacks.set(++id,fn);return id;},cancel:id=>callbacks.delete(id),limit:12,
 paint:function*(c,w,r,atlases){atlases.add(r.x<512?'meadow':'stones');for(let i=0;i<5;i++){time+=1;yield;}painted++;}
 });return {cache,get painted(){return painted;},drain(){let safety=10000;while(callbacks.size){assert.ok(safety-->0);const [id,fn]=callbacks.entries().next().value;callbacks.delete(id);fn();}},ctx:{drawImage(){}}};}
test('draw only schedules; completed tiles survive reconstructed worlds and targeted invalidation',()=>{
 const h=harness(),world={w:2048,h:2048,layout:{}},rect={x:0,y:0,w:500,h:500};
 h.cache.draw(h.ctx,world,rect,()=>{});assert.equal(h.painted,0);h.drain();const warm=h.painted;
 h.cache.draw(h.ctx,{...world},rect,()=>{});h.drain();assert.equal(h.painted,warm);
 h.cache.invalidateAtlas('unknown');h.cache.draw(h.ctx,world,rect,()=>{});h.drain();assert.equal(h.painted,warm);
 h.cache.invalidateAtlas('meadow');h.cache.draw(h.ctx,world,rect,()=>{});h.drain();assert.ok(h.painted>warm);assert.ok(h.cache.size<=12);
});
test('teleports cancel obsolete jobs; world/density changes discard incompatible tiles',()=>{
 const h=harness(),world={w:4096,h:4096,layout:{}},rect={x:0,y:0,w:500,h:500};
 h.cache.prepare(world,rect);h.cache.prepare(world,{...rect,x:3000,y:3000});h.drain();assert.ok(h.cache.size<=12);
 h.cache.prepare({...world,layout:{}},rect,2);assert.equal(h.cache.size,0);h.drain();assert.ok(h.cache.size<=12);
 h.cache.clear();assert.equal(h.cache.size,0);assert.equal(h.cache.pending,0);
});

test('world resume is restricted to the same island character and layout',async()=>{
 const {canResumeWorld}=await import('../js/adventure_world_core.js');const layout={},save={zone:'camp'},world={zone:'camp',layout,isDungeon:false},content={worldMaps:{camp:layout}};
 assert.equal(canResumeWorld(world,save,save,content),true);
 assert.equal(canResumeWorld(world,save,{...save},content),false);
 assert.equal(canResumeWorld({...world,isDungeon:true},save,save,content),false);
 assert.equal(canResumeWorld(world,save,save,{worldMaps:{camp:{}}}),false);
 assert.equal(canResumeWorld(world,save,{zone:'town'},content),false);
});

test('worker terrain never paints on the main thread and closes stale replies',async()=>{
 const callbacks=[],requests=[],closed=[];let painted=0;
 const cache=createScheduledTerrainCache({paint:function*(){painted++;},createCanvas:()=>{throw Error('main allocation');},schedule:fn=>{callbacks.push(fn);return fn;},cancel:fn=>{const i=callbacks.indexOf(fn);if(i>=0)callbacks.splice(i,1);},rasterize:(world,rect,pixels)=>new Promise(resolve=>requests.push({resolve,rect,pixels}))});
 const world={w:4096,h:4096,layout:{}},rect={x:0,y:0,w:400,h:400};cache.prepare(world,rect,2);callbacks.shift()();await Promise.resolve();assert.equal(requests.length,1);assert.equal(requests[0].pixels,1028);assert.equal(painted,0);
 cache.clear();requests[0].resolve({bitmap:{close(){closed.push('stale');}},atlases:[]});await new Promise(setImmediate);assert.deepEqual(closed,['stale']);assert.equal(cache.size,0);
 cache.prepare(world,rect,2);callbacks.shift()();await Promise.resolve();requests[1].resolve({bitmap:{close(){closed.push('live');}},atlases:['meadow']});await new Promise(setImmediate);assert.equal(cache.size,1);cache.invalidateAtlas('meadow');assert.equal(cache.size,0);assert.deepEqual(closed,['stale','live']);cache.clear();
});

test('worker failure resumes the bounded cooperative painter',async()=>{
 const callbacks=[];let painted=0,allocated=0;
 const cache=createScheduledTerrainCache({paint:function*(){painted++;},createCanvas:()=>{allocated++;return{getContext:()=>({translate(){},scale(){}})};},schedule:fn=>{callbacks.push(fn);return fn;},cancel:fn=>{const i=callbacks.indexOf(fn);if(i>=0)callbacks.splice(i,1);},rasterize:()=>Promise.reject(Error('worker unavailable'))});
 cache.prepare({w:512,h:512,layout:{}},{x:0,y:0,w:400,h:400});callbacks.shift()();for(let i=0;i<5;i++)await Promise.resolve();assert.equal(allocated,0);assert.equal(callbacks.length,1);callbacks.shift()();assert.equal(painted,1);assert.equal(cache.size,1);cache.clear();
});
