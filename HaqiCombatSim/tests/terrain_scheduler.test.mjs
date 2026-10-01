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
