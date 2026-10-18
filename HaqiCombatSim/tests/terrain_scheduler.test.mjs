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

test('entry preparation counts only visible tiles and defers speculative work',()=>{
 const h=harness(),world={w:2048,h:2048,layout:{}},rect={x:0,y:0,w:500,h:500};
 const first=h.cache.prepare(world,rect,1,[],{visibleOnly:true});assert.equal(first.total,1);assert.equal(first.ready,0);
 h.drain();assert.equal(h.painted,1);assert.equal(h.cache.pending,0);
 const ready=h.cache.prepare(world,rect,1,[],{visibleOnly:true});assert.equal(ready.ready,ready.total);
 h.cache.draw(h.ctx,world,rect,()=>{});h.drain();assert.ok(h.painted>1,'normal play resumes neighbour prefetch');
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

test('unrelated atlas arrival preserves in-flight terrain; used atlas retries once',async()=>{
 for(const atlas of ['unrelated','meadow']){
    const tasks=[],requests=[],closed=[];
    const cache=createScheduledTerrainCache({schedule:fn=>{tasks.push(fn);return fn;},cancel:()=>{},rasterize:()=>new Promise(resolve=>requests.push(resolve))});
    const world={w:512,h:512,layout:{}},rect={x:0,y:0,w:400,h:400};
    cache.prepare(world,rect,1.25);tasks.shift()();await Promise.resolve();
    cache.invalidateAtlas(atlas);cache.prepare(world,rect,1.25);
    assert.equal(tasks.length,0,'no parallel duplicate tile on atlas arrival');
    requests.shift()({bitmap:{close(){closed.push(true);}},atlases:['meadow']});await new Promise(setImmediate);
    assert.equal(cache.size,atlas==='meadow'?0:1);
    assert.equal(closed.length,atlas==='meadow'?1:0);
    if(atlas==='meadow'){
        tasks.shift()();await Promise.resolve();requests.shift()({bitmap:{close(){}},atlases:['meadow']});await new Promise(setImmediate);
        assert.equal(cache.size,1);
    }
    assert.equal(cache.stats().bytes,644**2*4,'fractional DPR does not round up to 2x');cache.clear();
 }
});


test('unbounded home tiles cross negative coordinates and reuse cached neighbours within budget',()=>{
 const h=harness(),world={unbounded:true,seed:17};
 const rect={x:-700,y:-700,w:900,h:900};
 const first=h.cache.prepare(world,rect,1,[],{visibleOnly:true});
 assert.equal(first.total,9);assert.ok(first.tasks.some(t=>t.x===-2&&t.y===-2));
 assert.equal(h.painted,0);h.drain();assert.equal(h.painted,9);
 assert.equal(h.cache.prepare(world,rect,1,[],{visibleOnly:true}).ready,9);
 h.cache.prepare(world,{x:-1800,y:-1800,w:900,h:900},2);h.drain();
 assert.ok(h.cache.stats().bytes<=h.cache.stats().limitBytes);
 h.cache.clear();assert.equal(h.cache.pending,0);
});


test('local shadow edits invalidate only intersecting terrain tiles',()=>{
 const h=harness(),world={unbounded:true,layout:{}},rect={x:0,y:0,w:1000,h:400};
 h.cache.prepare(world,rect,1,[],{visibleOnly:true});h.drain();assert.equal(h.painted,2);
 h.cache.invalidateRect({x:50,y:50,w:20,h:20});
 const pending=h.cache.prepare({...world},rect,1,[],{visibleOnly:true});assert.equal(pending.ready,1);
 h.drain();assert.equal(h.painted,3);assert.equal(h.cache.prepare(world,rect,1,[],{visibleOnly:true}).ready,2);
 h.cache.clear();
});


test('shadow edits discard old worker replies before accepting the new furniture snapshot',async()=>{
 const jobs=[],replies=[],closed=[];
 const cache=createScheduledTerrainCache({schedule:fn=>{jobs.push(fn);return fn;},cancel:()=>{},rasterize:world=>new Promise(resolve=>replies.push({world,resolve}))});
 const world={unbounded:true,layout:{},objects:[]},rect={x:-500,y:-500,w:400,h:400};
 cache.prepare(world,rect,1,[],{visibleOnly:true});jobs.shift()();await Promise.resolve();
 cache.invalidateRect({x:-400,y:-400,w:100,h:100});
 const changed={...world,objects:[{x:-10,y:-10}]};cache.prepare(changed,rect,1,[],{visibleOnly:true});
 replies[0].resolve({bitmap:{close(){closed.push('stale');}},atlases:[]});await new Promise(setImmediate);
 assert.deepEqual(closed,['stale']);assert.equal(cache.size,0);
 jobs.shift()();await Promise.resolve();assert.equal(replies[1].world,changed);
 replies[1].resolve({bitmap:{close(){}},atlases:[]});await new Promise(setImmediate);assert.equal(cache.size,1);cache.clear();
});

test('home shadow refresh keeps complete terrain visible throughout cooperative repaint',()=>{
 const h=harness(),world={unbounded:true,layout:{}},rect={x:0,y:0,w:400,h:400};
 h.cache.prepare(world,rect,1,[],{visibleOnly:true});h.drain();
 const drawn=[];const ctx={drawImage(tile){drawn.push(tile);}};
 assert.equal(h.cache.draw(ctx,world,rect,()=>assert.fail('warm tile missing')),0);
 const original=drawn.at(-1);
 h.cache.invalidateRect({x:50,y:50,w:20,h:20},{keepPrevious:true});
 assert.equal(h.cache.prepare({...world},rect,1,[],{visibleOnly:true}).ready,0,'stale image is not reported as refreshed');
 assert.equal(h.cache.draw(ctx,world,rect,()=>assert.fail('refresh must not flash fallback')),0);
 assert.equal(drawn.at(-1),original);assert.ok(original.width>0);
 h.drain();h.cache.draw(ctx,world,rect,()=>assert.fail('replacement missing'));
 assert.notEqual(drawn.at(-1),original);assert.equal(original.width,0,'release replaced canvas');
 h.cache.clear();
});

test('repeated home moves keep the last bitmap while obsolete worker results are discarded',async()=>{
 const jobs=[],replies=[],closed=[],drawn=[];
 const cache=createScheduledTerrainCache({schedule:fn=>{jobs.push(fn);return fn;},cancel:()=>{},rasterize:world=>new Promise(resolve=>replies.push({world,resolve}))});
 const world={w:512,h:512,layout:{},objects:[]},rect={x:0,y:0,w:400,h:400},changed={x:50,y:50,w:20,h:20};
 const bitmap=id=>({id,close(){closed.push(id);}}),finish=async(index,id)=>{replies[index].resolve({bitmap:bitmap(id),atlases:[]});await new Promise(setImmediate);};
 const start=async w=>{cache.prepare(w,rect,1,[],{visibleOnly:true});jobs.shift()();await Promise.resolve();};
 const draw=w=>cache.draw({drawImage(tile){drawn.push(tile.id);}},w,rect,()=>assert.fail('terrain flashed during drag'));
 await start(world);await finish(0,'original');
 cache.invalidateRect(changed,{keepPrevious:true});await start({...world,objects:[{x:1,y:1}]});
 draw(world);assert.equal(drawn.at(-1),'original');
 cache.invalidateRect(changed,{keepPrevious:true});const latest={...world,objects:[{x:2,y:2}]};
 await start(latest);await finish(1,'obsolete');draw(latest);
 assert.deepEqual(closed,['obsolete']);assert.equal(drawn.at(-1),'original');
 assert.equal(replies[2].world,latest);await finish(2,'latest');draw(latest);
 assert.equal(drawn.at(-1),'latest');assert.deepEqual(closed,['obsolete','original']);
 cache.clear();assert.deepEqual(closed,['obsolete','original','latest']);
});
