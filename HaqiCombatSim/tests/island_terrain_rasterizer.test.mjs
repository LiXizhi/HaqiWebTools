import test from 'node:test';
import assert from 'node:assert/strict';
import {createIslandTerrainRasterizer} from '../js/island_terrain_rasterizer.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createScheduledTerrainCache} from '../js/terrain_tile_scheduler.js';

const flush=()=>new Promise(setImmediate);
function controlledWorker(t,{decode=async()=>({close(){}}),post=()=>{}}={}){
    const timers=new Map(),messages=[],workers=[];let timerId=0;
    t.mock.method(globalThis,'setTimeout',(fn,ms)=>{assert.equal(ms,15000);timers.set(++timerId,fn);return timerId;});
    t.mock.method(globalThis,'clearTimeout',id=>timers.delete(id));
    const originals=new Map(['Worker','OffscreenCanvas','createImageBitmap'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
    t.after(()=>{for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
    globalThis.OffscreenCanvas=class {};
    globalThis.createImageBitmap=decode;
    globalThis.Worker=class {
        terminated=0;
        constructor(){workers.push(this);}
        postMessage(data){messages.push(data);post(data,this);}
        terminate(){this.terminated++;}
        reply(data){this.onmessage({data});}
    };
    return {timers,messages,workers,expire(){const timer=timers.values().next().value;assert.ok(timer,'a deadline must already exist');timer();}};
}

test('deadline covers a stuck decoder and settles every queued scene request',async t=>{
    let finish,copies=0,closed=0;
    const h=controlledWorker(t,{decode:()=>{copies++;return new Promise(resolve=>{finish=resolve;});}});
    const rasterize=createIslandTerrainRasterizer({images:{ground:{}}});
    const requests=[rasterize({zone:'camp'},{},516,1),rasterize({zone:'ice'},{},516,1)];
    const rejected=requests.map(request=>assert.rejects(request,/超时/));
    await flush();assert.equal(copies,1);assert.equal(h.timers.size,2);assert.equal(h.messages.length,0);
    h.expire();await Promise.all(rejected);
    assert.equal(h.timers.size,0);assert.equal(h.workers[0].terminated,1);
    finish({close(){closed++;}});await flush();
    assert.equal(closed,1);assert.equal(h.messages.length,0);
    await assert.rejects(rasterize({},{},516,1),/不可用/);
});

test('dispose rejects preparation immediately and closes partial and late decodes once',async t=>{
    let finish;const closed=[];
    const h=controlledWorker(t,{decode:image=>image==='first'?Promise.resolve({close(){closed.push('first');}}):new Promise(resolve=>{finish=resolve;})});
    const rasterize=createIslandTerrainRasterizer({images:{ground:'first',water:'second'}});
    const rejected=assert.rejects(rasterize({},{},516,1),/已结束/);
    await flush();rasterize.dispose();await rejected;
    assert.deepEqual(closed,['first']);assert.equal(h.timers.size,0);
    rasterize.dispose();finish({close(){closed.push('second');}});await flush();
    assert.deepEqual(closed,['first','second']);assert.equal(h.messages.length,0);assert.equal(h.workers[0].terminated,1);
});

test('worker deadline releases late tiles without disturbing an independent replacement',async t=>{
    const h=controlledWorker(t),art={images:{}},world={};let closed=0;
    const old=createIslandTerrainRasterizer(art),rejected=assert.rejects(old(world,{},516,1),/超时/);
    await flush();const oldId=h.messages.at(-1).id;h.expire();await rejected;
    const replacement=createIslandTerrainRasterizer(art),current=replacement(world,{},516,1);
    await flush();h.workers[0].reply({id:oldId,bitmap:{close(){closed++;}}});
    assert.equal(closed,1);assert.equal(h.timers.size,1);
    const bitmap={close(){}};h.workers[1].reply({id:h.messages.at(-1).id,bitmap});
    assert.equal((await current).bitmap,bitmap);assert.equal(h.timers.size,0);replacement.dispose();
});

test('dispose before preparation starts does not decode or post a scene',async t=>{
    let copies=0;
    const h=controlledWorker(t,{decode:async()=>{copies++;return {close(){}};}});
    const rasterize=createIslandTerrainRasterizer({images:{ground:{}}});
    const rejected=assert.rejects(rasterize({},{},516,1),/已结束/);
    rasterize.dispose();await rejected;await flush();
    assert.equal(copies,0);assert.equal(h.messages.length,0);assert.equal(h.timers.size,0);
});

test('worker errors reject queued tiles and late completion cannot revive a disposed request',async t=>{
    for(const mode of ['error','dispose']){
        await t.test(mode,async t=>{
            const h=controlledWorker(t),world={};let closed=0;
            const rasterize=createIslandTerrainRasterizer({images:{}});
            const requests=[rasterize(world,{},516,1),rasterize(world,{},516,1)];
            const rejected=requests.map(request=>assert.rejects(request,mode==='error'?/失败/:/已结束/));
            await flush();
            if(mode==='error')h.workers[0].onerror();else rasterize.dispose();
            await Promise.all(rejected);assert.equal(h.timers.size,0);assert.equal(h.workers[0].terminated,1);
            for(const message of h.messages.filter(message=>message.id))h.workers[0].reply({id:message.id,bitmap:{close(){closed++;}}});
            assert.equal(closed,2);await assert.rejects(rasterize(world,{},516,1),/不可用/);
        });
    }
});

test('simultaneous tiles share preparation and keep scene changes ordered',async t=>{
    let finish,copies=0;
    const h=controlledWorker(t,{decode:()=>{copies++;return new Promise(resolve=>{finish=resolve;});},post:(data,worker)=>{if(data.id)queueMicrotask(()=>worker.reply({id:data.id,bitmap:{close(){}}}));}});
    const rasterize=createIslandTerrainRasterizer({images:{ground:{}}}),camp={zone:'camp'},ice={zone:'ice'};
    const requests=[rasterize(camp,{x:1},516,1),rasterize(camp,{x:2},516,1),rasterize(ice,{x:3},516,1)];
    await flush();assert.equal(copies,1);finish({close(){assert.fail('transferred atlas belongs to worker');}});
    await Promise.all(requests);
    assert.deepEqual(h.messages.map(message=>message.type==='scene'?message.world.zone:message.rect.x),['camp',1,2,'ice',3]);
    assert.equal(copies,1);assert.equal(h.timers.size,0);rasterize.dispose();
});

test('decode rejection and scene post failure close prepared resources and settle callers',async t=>{
    for(const mode of ['decode','post']){
        await t.test(mode,async t=>{
            let closed=0;
            const h=controlledWorker(t,{decode:async image=>{if(mode==='decode'&&image===2)throw Error('decode failed');return {close(){closed++;}};},post:()=>{throw Error('post failed');}});
            const rasterize=createIslandTerrainRasterizer({images:{ground:1,water:2}});
            await assert.rejects(rasterize({},{},516,1),new RegExp(mode+' failed'));
            assert.equal(closed,mode==='decode'?1:2);assert.equal(h.timers.size,0);assert.equal(h.workers[0].terminated,1);
        });
    }
});

test('a real rasterizer preparation timeout lets the terrain scheduler paint its fallback',async t=>{
    const h=controlledWorker(t,{decode:()=>new Promise(()=>{})}),jobs=[];let painted=0;
    const rasterize=createIslandTerrainRasterizer({images:{ground:{}}});
    const cache=createScheduledTerrainCache({rasterize,schedule:fn=>{jobs.push(fn);return fn;},cancel:()=>{},createCanvas:()=>({getContext:()=>({translate(){},scale(){}})}),paint:function*(){painted++;}});
    const world={w:512,h:512,layout:{}},rect={x:0,y:0,w:400,h:400};
    cache.prepare(world,rect,1,[],{visibleOnly:true});jobs.shift()();await flush();
    assert.equal(cache.size,0);assert.equal(painted,0);h.expire();await flush();
    assert.equal(jobs.length,1);jobs.shift()();
    assert.equal(painted,1);assert.equal(cache.prepare(world,rect,1,[],{visibleOnly:true}).ready,1);assert.equal(h.timers.size,0);cache.clear();
});

test('worker retains unchanged atlases and releases replaced/removed bitmaps',()=>{
    const source=readFileSync(new URL('../js/island_terrain_worker.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/,'');
    const context=vm.createContext({self:{}});vm.runInContext(source,context);
    const closed=[],image=id=>({close(){closed.push(id);}}),ground=image('ground'),water=image('water');
    const send=data=>context.self.onmessage({data:{type:'scene',manifest:{},...data}});
    send({world:{zone:'camp'},images:{ground,water}});
    send({world:null,images:{water:image('water-new')}});
    assert.deepEqual(closed,['water']);
    assert.equal(vm.runInContext('world.zone',context),'camp');
    assert.equal(vm.runInContext('images.ground',context),ground);
    send({world:{zone:'ice'},images:{},removed:['ground']});
    assert.deepEqual(closed,['water','ground']);
    assert.equal(vm.runInContext('world.zone',context),'ice');
    assert.equal(vm.runInContext('Object.keys(images).join()',context),'water');
});

test('atlas arrivals and island changes transfer only changed images',async t=>{
    const messages=[],copies=[];
    t.mock.method(globalThis,'setTimeout',()=>0);
    const originals=new Map(['Worker','OffscreenCanvas','createImageBitmap'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
    t.after(()=>{for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
    globalThis.OffscreenCanvas=class {};
    globalThis.createImageBitmap=async image=>{copies.push(image);return {close(){}};};
    globalThis.Worker=class {postMessage(data){messages.push(data);if(data.id)queueMicrotask(()=>this.onmessage({data:{id:data.id,bitmap:{close(){}},atlases:[]}}));}terminate(){}};
    const art={images:{ground:{}},manifest:{}},rasterize=createIslandTerrainRasterizer(art),world={layout:{}};
    await rasterize(world,{},516,1);
    art.images.water={};await rasterize(world,{},516,1);
    assert.equal(copies.length,2);
    assert.deepEqual(Object.keys(messages.filter(m=>m.type==='scene')[1].images),['water']);
    await rasterize({...world}, {},516,1);assert.equal(copies.length,2);
    assert.ok(messages.filter(m=>m.type==='scene')[2].world);
    delete art.images.ground;await rasterize(world,{},516,1);
    assert.deepEqual(messages.filter(m=>m.type==='scene')[3].removed,['ground']);
    art.images.water={};await rasterize(world,{},516,1);assert.equal(copies.length,3);
    rasterize.dispose();await assert.rejects(rasterize(world,{},516,1),/不可用/);
});
