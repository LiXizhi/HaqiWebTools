import test from 'node:test';
import assert from 'node:assert/strict';
import {createIslandTerrainRasterizer} from '../js/island_terrain_rasterizer.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

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
