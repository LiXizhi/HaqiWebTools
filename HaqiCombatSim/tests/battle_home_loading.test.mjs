import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createJsonReader} from '../js/runtime_data.js';
import {loadEnvironmentArt} from '../js/adventure_environment_art.js';
import {createScheduledTerrainCache} from '../js/terrain_tile_scheduler.js';
const source=readFileSync(new URL('../js/view_home.js',import.meta.url),'utf8');
const method=source.slice(source.indexOf('  async prepare('),source.indexOf('  openSummon:'));
function fixture({decode=async()=>{}}={}){
 const image={src:'furniture',decode},state={dead:false,terrainMissing:Infinity,model:{objects:[{itemId:'chair'}],catalog:{items:[{id:'chair',art:{cdn:'furniture'}}]},pets:[]},images:new Map([['furniture',image]]),imageFor:()=>image,ensureWorldAtlases:async()=>{},performance:{now:()=>0},setTimeout:fn=>{state.tick=fn;}};
 const view=vm.runInNewContext('({'+method+'})',state);return {view,state};
}
const flush=()=>new Promise(setImmediate);
test('home camera zoom reuses baked terrain and keeps building raster density stable',()=>{
 const draw=source.slice(source.indexOf('  const worldRect={'),source.indexOf('  const sections=buildings.sections()'));
 for(const ratio of [1,1.5,2]){
  const callbacks=new Map(),world={unbounded:true,layout:{}};
  const painted=new Set();let id=0;
  const cache=createScheduledTerrainCache({
   createCanvas:()=>({getContext:()=>({translate(){},scale(){}})}),
   schedule:fn=>{callbacks.set(++id,fn);return id;},cancel:key=>callbacks.delete(key),
   paint:function*(c,w,rect){
    const key=`${rect.x},${rect.y},${rect.w}`;
    assert.ok(!painted.has(key),'zoom must not repaint already cached terrain');
    painted.add(key);
   }
  });
  const state={
   model:{camera:{x:5,y:5},home:{seed:1},catalog:{items:[]}},
   r:{width:200,height:200},ratio,objects:[],envArt:null,decorArt:null,gesture:null,
   ctx:{save(){},restore(){},translate(){},scale(){},drawImage(){}},
   terrain:{draw(c,seed,rect,env,decor,density){return cache.draw(c,world,rect,()=>{},density);}},
   buildings:{prepare(objects,catalog,rect,density){assert.equal(density,ratio);return [];}}
  };
  const render=scale=>{
   vm.runInNewContext(draw,{...state,scale});
   while(callbacks.size){const [key,fn]=callbacks.entries().next().value;callbacks.delete(key);fn();}
  };
  try{
   render(24);assert.ok(painted.size>0);
   for(const scale of [40,44,60,72,36,24])render(scale);
  }finally{cache.clear();}
 }
});
test('home atlas entry uses the release pack and retries a failed download',async()=>{
 const paths=['environment-art','terrain-decoration-art'];
 const files=Object.fromEntries(paths.map(name=>[`data/adventure/${name}.json`,JSON.parse(readFileSync(new URL(`../data/adventure/${name}.json`,import.meta.url)))]));
 const calls=[];let fail=true;
 const fetchJson=createJsonReader({packed:true,request:async url=>{
  calls.push(url);assert.equal(url,'data/adventure.json');
  return {ok:!fail,status:503,json:async()=>({schemaVersion:1,files})};
 }});
 const loaded=[];
 const context={fetchJson,model:{assetMode:'cdn'},dead:false,terrain:{clear(){}},loadEnvironmentArt:async(...args)=>{
  const art=await loadEnvironmentArt(...args);
  art.ensure=async key=>{assert.ok(art.manifest.atlases[key].cdn);loaded.push(key);};
  return art;
 }};
 const start=source.indexOf(' let worldAtlasesPromise='),end=source.indexOf(' function ensureFallbackHero()');
 const load=vm.runInNewContext(source.slice(start,end)+';ensureWorldAtlases',context);
 await assert.rejects(load(),/503/);
 fail=false;await load();await load();
 assert.deepEqual(calls,['data/adventure.json','data/adventure.json']);
 assert.deepEqual(loaded.sort(),['campTrees','islandTrees','meadow','shore','stones','trees'].sort());
});
test('home gate waits for decoded furniture and the final visible terrain tile',async()=>{
 let decode;const f=fixture({decode:()=>new Promise(resolve=>decode=resolve)});let ready=false;
 const work=f.view.prepare().then(()=>ready=true);await flush();assert.equal(f.state.tick,undefined);
 decode();await flush();assert.equal(ready,false);
 f.state.terrainMissing=1;f.state.tick();await flush();assert.equal(ready,false);
 f.state.terrainMissing=0;f.state.tick();await work;assert.equal(ready,true);
});
test('failed home art rejects entry and evicts the failed image for retry',async()=>{
 const f=fixture({decode:async()=>{throw Error('network');}});
 await assert.rejects(f.view.prepare(),/家园图片加载失败/);assert.equal(f.state.images.size,0);
});
test('leaving home during preparation rejects stale completion',async()=>{
 const f=fixture();let current=true;const work=f.view.prepare({isCurrent:()=>current});await flush();
 current=false;f.state.terrainMissing=0;f.state.tick();await assert.rejects(work,/已取消/);
});

test('home releases all scene raster caches and backing canvases while retaining world state',()=>{
 const renderer=readFileSync(new URL('../js/adventure_renderer.js',import.meta.url),'utf8');
 const release=renderer.slice(renderer.indexOf('    function releaseScene()'),renderer.indexOf('    return {releaseScene,'));
 const calls=[],backing={width:1024,height:1024},overview={width:560,height:560};
 const context={terrainTiles:{clear:()=>calls.push('terrain')},terrainRasterizer:{dispose:()=>calls.push('worker')},islandScenery:{clear:()=>calls.push('trees')},streetPainter:{reset:()=>calls.push('street')},backing,backingZone:{},overview,overviewWorld:{},canvas:{width:800,height:600}};
 vm.runInNewContext(release+'releaseScene()',context);
 assert.deepEqual(calls,['terrain','worker','trees','street']);assert.equal(backing.width,0);assert.equal(overview.width,0);
 assert.equal(context.canvas.width,1);assert.equal(context.terrainRasterizer,null);assert.equal(context.backingZone,null);
});
