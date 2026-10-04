import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {buildEarthScene,createEarthSceneCache} from '../js/adventure_earth_scene_core.js';
import {classifyEarthTerrain} from '../js/adventure_earth_decode_core.js';
import {earthRules,earthPoint,parseEarthCities,reuseEarthObjects,prepareEarthCollisionIndex,earthWalkable,earthSafe} from '../js/adventure_earth_core.js';
import {createEarthWorkScheduler} from '../js/earth_work_scheduler.js';
import {createEarthStreamWorker} from '../js/adventure_earth_stream.js';
import {createWorldViewQuery,invalidateWorldObjects,prepareWorldObjectIndex,adoptWorldObjectIndex,findPath,findPathSteps} from '../js/adventure_world_core.js';
import {createPerformanceDiagnostics} from '../js/performance_diagnostics.js';
import {createSocialActors,createSocialActorsSteps} from '../js/adventure_social_motion_core.js';
import {createEarthService,EarthCache} from '../js/adventure_earth.js';
import fs from 'node:fs';
import {defaultParams,resolveParams,resolveParamGroup} from '../js/combat_params_core.js';
import {imageAlphaBoundsSteps} from '../js/image_bounds_core.js';
const drain=steps=>{let result;do{result=steps.next();}while(!result.done);return result.value;};
test('background alpha bounds retain original threshold, source offset and empty-image fallback',()=>{
    const pixels=new Uint8Array(4*3*4);pixels[(1*4+2)*4+3]=21;pixels[(2*4+3)*4+3]=20;
    assert.deepEqual(drain(imageAlphaBoundsSteps(pixels,4,3,[100,200,4,3])),[102,201,1,1]);assert.deepEqual(drain(imageAlphaBoundsSteps(new Uint8Array(48),4,3,[100,200,4,3])),[100,200,4,3]);
});
const rules={...earthRules(),activeRadius:1,treesPerChunk:6,decorationsPerChunk:12,forestDecorationsPerChunk:16},p=earthPoint(40.5,10.5,rules);
test('hot-path parameter groups preserve full resolution and immediate override edits without sharing mutable defaults',()=>{
    for(const version of ['kids','teen']){
        const params=defaultParams(version);for(const group of ['adventure','petInteractions']){assert.deepEqual(resolveParamGroup(params,group),resolveParams({cards:{}},params)[group]);assert.deepEqual(resolveParams({cards:{}},params,{groups:[group]})[group],resolveParams({cards:{}},params)[group]);}
        params.adventure.foodPrice=731;assert.equal(resolveParamGroup(params,'adventure').foodPrice,731);params.adventure.foodPrice=732;assert.equal(resolveParamGroup(params,'adventure').foodPrice,732);
    }
    const a=resolveParamGroup(null,'adventure','kids'),b=resolveParamGroup(null,'adventure','kids');a.stageLevels[0]=999;assert.notEqual(b.stageLevels[0],999);
});
function input(at=p){return {target:{isEarth:true,w:360*rules.unitsPerDegree,h:180*rules.unitsPerDegree,earthRules:rules,portal:{hidden:true},layout:{},revision:0},p:at,cityRows:[],auth:null,rules,content:{},species:[],playerLevel:4,playerPower:800,terrainVersion:'forest:1'};}
class BrowserWorker {
    constructor(){this.worker=new Worker(new URL('./fixtures/earth-stream-worker.mjs',import.meta.url));this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.(error));}
    postMessage(data,transfer){this.worker.postMessage(data,transfer);}terminate(){return this.worker.terminate();}
}
test('terrain palette classification preserves transparency, nearest color and first-match ties across yield sizes',()=>{
    const palette=[{rgb:'ff0000',color:'#abcdef',type:'grass'},{rgb:'0000ff',color:'#123456',type:'water'}],pixels=new Uint8ClampedArray([255,0,0,255,0,0,255,255,128,0,128,255,0,0,0,0]);
    const indices=drain(classifyEarthTerrain(pixels,palette));assert.deepEqual([...indices],[0,1,0,255]);assert.deepEqual([...pixels],[171,205,239,255,18,52,86,255,171,205,239,255,111,119,117,255]);
});
test('cached scene steps preserve seeded objects, bound memory, and refresh terrain while player growth leaves scenery unchanged',()=>{
    const cache=createEarthSceneCache(),sample=()=> 'forest';
    const first=drain(buildEarthScene({...input(),typeAt:sample,cache}));
    const second=drain(buildEarthScene({...input(),playerLevel:20,playerPower:1400,typeAt:sample,cache}));
    assert.deepEqual(second.trees,first.trees);assert.ok(cache.stats.hits>=27);assert.ok(second.wildSpawns.every(s=>s.level!==first.wildSpawns.find(o=>o.id===s.id).level));
    const uncached=drain(buildEarthScene({...input(),typeAt:sample}));assert.deepEqual(first.trees,uncached.trees);assert.deepEqual(first.wildSpawns,uncached.wildSpawns);
    const changed=drain(buildEarthScene({...input(),terrainVersion:'water:2',typeAt:()=> 'water',cache}));assert.deepEqual(changed.trees,[]);assert.deepEqual(changed.wildSpawns,[]);
    for(let i=0;i<15;i++)drain(buildEarthScene({...input({...p,x:p.x+i*rules.chunkSize}),typeAt:sample,cache}));assert.ok(cache.stats.chunks<=rules.streamCacheChunks);assert.ok(cache.stats.urbanSamples<=8192);
});
test('real module worker scene batches and CSV match the shared fallback and cancellation releases pending work',async()=>{
    const scheduler=createEarthWorkScheduler(),worker=createEarthStreamWorker({workerFactory:()=>new BrowserWorker(),scheduler,timeoutMs:10000});
    try{
        const data=input();data.terrain=[{key:'40_10',width:2,height:2,indices:new Uint8Array(4),types:['forest']}];const remote=await worker.run('scene',data,{epoch:4,version:'one'}),local=drain(buildEarthScene({...input(),typeAt:()=> 'forest'}));
        for(const key of ['paths','trees','buildings','wildSpawns','npcs','landmarks'])assert.deepEqual(remote[key],local[key]);
        remote.trees[0].liveState={toJSON(){throw Error('must preserve the main-thread live object');}};
        const repeated=await worker.run('scene',data,{epoch:4,version:'two'});assert.equal(repeated.trees[0],remote.trees[0]);
        const shifted=await worker.run('scene',{...data,p:{...p,x:p.x+rules.chunkSize}},{epoch:4,version:'three'});
        const overlap=shifted.trees.find(row=>remote.trees.some(old=>old.earthSignature===row.earthSignature));assert.ok(overlap);assert.equal(overlap,remote.trees.find(row=>row.earthSignature===overlap.earthSignature));
        const csv='id,name,country,lat,lon,native,population\na,"名字,一",中国,10.5,40.5,x,100\nb,无效,x,no,40,x,0';assert.deepEqual(await worker.run('cities',{text:csv}),parseEarthCities(csv));
        const pending=worker.run('cities',{text:csv});worker.cancel();await assert.rejects(pending,{name:'AbortError'});assert.equal(worker.stats.pending,0);assert.equal(worker.stats.worker,false);
    }finally{worker.cancel();scheduler.dispose();}
});
test('a prepared index survives wild changes without rebuilding static buckets or collision bins',()=>{
    let reads=0;const b={get x(){reads++;return 20;},y:30,w:50,h:70};
    const world={isEarth:true,w:1000,h:1000,earthRules:rules,terrainAt:()=> 'grass',paths:[],buildings:[b],trees:[{id:'tree',x:0,y:0}],npcs:[],landmarks:[],encounters:[],revision:1};
    drain(prepareEarthCollisionIndex(world));drain(prepareWorldObjectIndex(world));const query=createWorldViewQuery(),rect={x:-50,y:-50,w:200,h:200};query.query(world,rect);reads=0;
    world.encounters=[{id:'wild',x:50,y:50}];world.revision++;invalidateWorldObjects(world,{wildOnly:true});earthWalkable(world,900,900);
    assert.ok(query.query(world,rect).some(o=>o.id==='wild'));assert.equal(reads,0);
    const staged={...world,trees:[{id:'next',x:0,y:0}]};drain(prepareWorldObjectIndex(staged));world.trees=staged.trees;adoptWorldObjectIndex(world,staged);invalidateWorldObjects(world,{prepared:true});assert.ok(query.query(world,rect).some(o=>o.id==='next'));
});
test('prepared safety bins preserve exact roads, buildings, residents and safe-radius decisions including larger padding',()=>{
    const world={earthRules:earthRules(),paths:[{a:{x:20,y:30},b:{x:950,y:850},width:70}],buildings:[{x:600,y:300,w:120,h:200}],npcs:[{x:200,y:850}],safeAreas:[{x:700,y:900,radius:130}]},points=[];
    for(const padding of [0,40,100])for(let y=0;y<=1200;y+=19)for(let x=0;x<=1200;x+=23)points.push({x,y,padding,safe:earthSafe(world,{x,y},padding)});
    drain(prepareEarthCollisionIndex(world));for(const p of points)assert.equal(earthSafe(world,p,p.padding),p.safe);
});
test('generation signatures preserve live overlapping objects without serializing their mutable state',()=>{
    const first=drain(buildEarthScene({...input(),typeAt:()=> 'forest'})),next=drain(buildEarthScene({...input(),typeAt:()=> 'forest'}));
    first.trees[0].live={toJSON(){throw Error('live state must not be serialized');}};
    assert.equal(reuseEarthObjects(first.trees,next.trees),first.trees);assert.ok(!Object.keys(first.trees[0]).includes('earthSignature'));
});
test('shared scheduler limits slices, rejects obsolete tasks, and drains disposal without another frame',async()=>{
    let time=0;const frames=[],scheduler=createEarthWorkScheduler({clock:()=>time,budgetMs:2,schedule:cb=>{frames.push(cb);return frames.length;},unschedule:()=>{}}),seen=[];
    const result=scheduler.run((function*(){for(let i=0;i<10;i++){seen.push(i);time+=.5;yield;}return 42;})());
    frames.shift()();assert.equal(seen.length,4);while(frames.length)frames.shift()();assert.equal(await result,42);assert.equal(scheduler.stats.maxSliceMs,2);
    const stale=scheduler.run((function*(){throw Error('must not execute');})(),{valid:()=>false});frames.shift()();await assert.rejects(stale,{name:'AbortError'});
    const disposed=scheduler.run((function*(){yield;})());scheduler.dispose();await assert.rejects(disposed,{name:'AbortError'});
});
test('diagnostics retain long-walk P99, cumulative hitches and the stream event near a slow frame',()=>{
    let time=0;const perf=createPerformanceDiagnostics(true,{clock:()=>time,frameLimit:10,sampleLimit:3});perf.frame(0,true);time=1;perf.event('earth-stream',{chunk:1});perf.frame(60,true);
    for(let i=0;i<100;i++)perf.record('frame',16);const row=perf.summary().frame;assert.equal(row.count,101);assert.equal(row.samples,10);assert.equal(row.max,60);assert.equal(row.over50,1);assert.equal(row.p99,16);assert.equal(perf.timeline().hitches[0].events[0].name,'earth-stream');perf.reset();assert.deepEqual(perf.summary(),{});perf.dispose();
});
test('cooperative social placement keeps the synchronous seeded actor positions and RNG state',()=>{
    const world={zone:'earth',isEarth:true,w:2000,h:2000,center:{x:500,y:500},earthRules:earthRules(),terrainAt:()=> 'grass',paths:[{a:{x:0,y:500},b:{x:1800,y:500},width:70}],buildings:[],landmarks:[],npcs:[],encounters:[]};
    const profiles=Array.from({length:8},(_,i)=>({id:'person:'+i})),a=createSocialActors(world,profiles,7),b=drain(createSocialActorsSteps(world,profiles,7));
    assert.deepEqual(b.map(({position,rng})=>({position,seed:rng.seed})),a.map(({position,rng})=>({position,seed:rng.seed})));
});
test('resumable Earth pet routing returns the exact synchronous obstacle route',()=>{
    const world={isEarth:true,w:2000,h:2000,earthRules:earthRules(),terrainAt:()=> 'grass',paths:[],buildings:[{x:450,y:500,w:200,h:200}]};
    const from={x:350,y:500},to={x:550,y:500},expected=findPath(world,from,to),steps=findPathSteps(world,from,to);let slices=0,result;do{result=steps.next();slices++;}while(!result.done);assert.ok(slices>20);assert.deepEqual(result.value,expected);assert.ok(expected.length);
});
function serviceHarness(workerFactory=()=>null,options={}){
    const content=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url))),requests=[];
    const fetcher=async url=>{requests.push(url);if(url.startsWith('data/'))return {ok:true,json:async()=>JSON.parse(fs.readFileSync(new URL('../'+url,import.meta.url)))};if(url.includes('.csv'))return {ok:true,text:async()=> 'id,name,country,lat,lon\n'};return {ok:true,blob:async()=>({})};};
    return {requests,service:createEarthService({content,workerFactory,fetcher,...options,decode:async(blob,palette,key)=>({key,width:2,height:2,indices:new Uint8Array(4),types:['grass'],bytes:20})})};
}
test('streaming prepares the next block before crossing, holds it while standing and refreshes on reversing direction',async()=>{
    const {service}=serviceHarness();try{
        const {world,position}=await service.prepare({lon:40.5,lat:10.5}),size=service.rules.chunkSize,current=Math.floor(position.x/size)*size;
        const near={...position,x:current+size-300};await service.update(near,10000);assert.equal(world.center.x,current+size+1);
        const revision=world.revision;assert.equal(service.update(near,11000),undefined);assert.equal(world.revision,revision);
        await service.update({...position,x:current+200},12000);assert.equal(world.center.x,current-1);
    }finally{service.cancel();}
});
test('worker failure falls back to the same cooperative scene without leaving a pending task',async()=>{
    class FailedWorker{postMessage(){queueMicrotask(()=>this.onerror?.(Error('failed')));}terminate(){}}
    const {service}=serviceHarness(()=>new FailedWorker());try{const {world}=await service.prepare({lon:40.5,lat:10.5});assert.equal(world.zone,'earth');assert.equal(service.streamStats.failed,true);assert.equal(service.streamStats.pending,0);assert.ok(world.trees.length>0);}finally{service.cancel();}
});
test('a rapid reversal cancels the pending neighbour and never commits its obsolete scene',async()=>{
    const {service}=serviceHarness();try{
        const {world,position}=await service.prepare({lon:40.5,lat:10.5}),size=service.rules.chunkSize,current=Math.floor(position.x/size)*size,centres=[];world.onObjectsChanged=()=>centres.push(world.center.x);
        const obsolete=service.update({...position,x:current+size-300},10000),replacement=service.update({...position,x:current+100},11000);
        await Promise.all([obsolete,replacement]);assert.equal(world.center.x,current-1);assert.ok(!centres.includes(current+size+1));assert.equal(service.streamStats.pending,0);
    }finally{service.cancel();}
});
test('an over-budget pinned preparation rolls back its insertion and disposes it',async()=>{
    const cache=new EarthCache({bytes:10,limit:3}),disposed=[];await cache.get('current',async()=>({bytes:8,dispose(){disposed.push('current');}}));cache.pinned=new Set(['current','next']);
    await assert.rejects(cache.get('next',async()=>({bytes:8,dispose(){disposed.push('next');}})),/缓存预算/);assert.equal(cache.bytes,8);assert.deepEqual([...cache.entries.keys()],['current']);assert.deepEqual(disposed,['next']);cache.clear();
});


test('scene asset readiness precedes publication and a cancelled readiness barrier cannot commit',async()=>{
    let hold=false,release,entered;
    const {service}=serviceHarness(()=>null,{prepareAssets:async()=>{if(hold){const pending=new Promise(resolve=>release=resolve);entered();await pending;}}});
    try{
        const {world,position}=await service.prepare({lon:40.5,lat:10.5}),center={...world.center};hold=true;
        const waiting=new Promise(resolve=>entered=resolve),task=service.update({...position,x:position.x+service.rules.chunkSize},10000);
        await waiting;assert.deepEqual(world.center,center);service.cancel();release();await task;
        assert.deepEqual(world.center,center);assert.equal(service.streamStats.pending,0);
    }finally{service.cancel();}
});
