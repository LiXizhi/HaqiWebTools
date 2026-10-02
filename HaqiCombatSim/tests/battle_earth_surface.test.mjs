import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createEarthSurfaceRaster,surfaceNoise,earthDecorationFrames,seamlessEarthAtlas} from '../js/adventure_earth_surface_core.js';
import {createEarthSurfacePainter} from '../js/adventure_earth_surface.js';
import {earthRules} from '../js/adventure_earth_core.js';
const options={size:64,resolution:32,cellSize:16,sample:(x,y)=>x<80?'forest':'water',worldWidth:256};
const raster=(x,y,size=64,resolution=32)=>{const r=createEarthSurfaceRaster({...options,x,y,size,resolution});while(!r.rows(3)){}return r.pixels;};
test('city ground uses the dedicated small-scale source texture rather than stone paving',()=>{
    const cityGround={width:2,height:2,data:new Uint8ClampedArray([230,20,20,255,20,230,20,255,20,20,230,255,210,210,20,255])};
    const render=sample=>{const job=createEarthSurfaceRaster({x:0,y:0,size:64,resolution:16,cellSize:16,sample,cityGround,cityGroundPeriod:64});while(!job.rows(16)){}return job.pixels;};
    const urban=render(()=> 'urban'),grass=render(()=> 'grass');assert.notDeepEqual(urban,grass);assert.ok(urban[0]>urban[1]*3);assert.ok(urban[12*4+1]>urban[12*4]*3);
    const unknown=render(()=>null);assert.deepEqual([...unknown.slice(0,4)],[111,119,117,255]);
    const art=JSON.parse(fs.readFileSync(new URL('../data/adventure/earth/surface-art.json',import.meta.url))).cityGround;
    assert.equal(art.tiles.length,4);assert.ok(art.width>=1200);assert.ok(art.sourceSha256);
    for(const tile of art.tiles){const bytes=fs.readFileSync(new URL('../'+tile.local,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),tile.sha256);assert.ok(bytes.length<=200000);assert.equal(bytes.length,tile.bytes);assert.ok(tile.x+tile.width<=art.width&&tile.y+tile.height<=art.height);}

});
test('low-capacity devices choose bounded 192px surface resolution',()=>{
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
    try{Object.defineProperty(globalThis,'navigator',{configurable:true,value:{hardwareConcurrency:4,deviceMemory:4}});const painter=createEarthSurfacePainter({rules:earthRules(),sample:()=>null,loadArt:async()=>({})});assert.equal(painter.stats.resolution,192);painter.dispose();}
    finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
});
test('surface worker keeps one job in flight, discards invalidated pixels and falls back after error',async()=>{
    const before=[globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame],frames=new Map(),messages=[];let id=0,terminated=0;
    globalThis.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};globalThis.cancelAnimationFrame=n=>frames.delete(n);
    const worker={postMessage:m=>messages.push(m),terminate(){terminated++;}},factory=()=>({width:0,height:0,getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}})});
    const p=createEarthSurfacePainter({rules:{...earthRules(),surfaceChunkSize:64,surfaceResolution:8,surfaceMaxChunks:16},sample:()=> 'urban',loadArt:async()=>({}),canvasFactory:factory,workerFactory:()=>worker,clock:()=>0}),world={},ctx={drawImage(){}};
    const tick=()=>{const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn());};
    try{
        p.draw(ctx,world,{x:1,y:1,w:30,h:30});await Promise.resolve();p.draw(ctx,world,{x:1,y:1,w:30,h:30});tick();
        assert.equal(messages.filter(m=>m.id).length,1);tick();assert.equal(messages.filter(m=>m.id).length,1);
        const job=messages.find(m=>m.id);p.invalidate();worker.onmessage({data:{id:job.id,pixels:new Uint8ClampedArray(400)}});assert.equal(p.stats.chunks,0);
        p.draw(ctx,world,{x:1,y:1,w:30,h:30});tick();worker.onerror();tick();assert.equal(p.stats.worker,false);assert.ok(p.stats.chunks>0);assert.equal(terminated,1);
    }finally{p.dispose();[globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame]=before;}
});
test('surface prepares an offscreen ring before camera enters it',async()=>{
    const before=[globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame],frames=new Map();let id=0;
    globalThis.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};globalThis.cancelAnimationFrame=n=>frames.delete(n);
    const factory=()=>({width:0,height:0,getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}})});
    let drawn=0;const ctx={drawImage(){drawn++;}},world={},p=createEarthSurfacePainter({rules:{...earthRules(),surfaceChunkSize:64,surfaceResolution:8,surfaceMaxChunks:16},sample:()=> 'urban',loadArt:async()=>({}),canvasFactory:factory,clock:()=>0});
    const tick=()=>{const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn());};
    try{p.draw(ctx,world,{x:1,y:1,w:30,h:30});await Promise.resolve();p.draw(ctx,world,{x:1,y:1,w:30,h:30});tick();assert.equal(p.stats.chunks,9);const built=p.stats.built;drawn=0;p.draw(ctx,world,{x:65,y:1,w:30,h:30});assert.equal(drawn,1);assert.equal(p.stats.built,built);}
    finally{p.dispose();[globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame]=before;}
});
test('Earth surface regeneration and subdivided chunk pixels agree exactly',()=>{
    const a=raster(0,0),b=raster(64,0),whole=raster(0,0,128,64);
    assert.deepEqual(a,raster(0,0));
    for(let y=0;y<32;y++){
        assert.deepEqual(a.slice(y*128,y*128+128),whole.slice(y*256,y*256+128));
        assert.deepEqual(b.slice(y*128,y*128+128),whole.slice(y*256+128,y*256+256));
    }
});
test('Earth surface unknown cells remain explicit, while water texture has detail',()=>{
    const job=createEarthSurfaceRaster({...options,x:0,y:0,sample:(x)=>x<32?null:'water'});job.rows(32);
    for(let y=0;y<32;y++)for(let x=0;x<16;x++)assert.deepEqual([...job.pixels.slice((y*32+x)*4,(y*32+x)*4+4)],[111,119,117,255]);
    assert.ok(new Set([...job.pixels.filter((v,i)=>i%4===1)]).size>4);
});
test('visual noise and material identities wrap across the date line',()=>{
    for(const scale of [5,46,180])assert.ok(Math.abs(surfaceNoise(0,31,scale)-surfaceNoise(8640000,31,scale))<1e-10);
    assert.deepEqual(raster(0,0),raster(256,0));
});
test('surface queue and decoded chunks stay bounded during sustained camera movement',async()=>{
    const before=[globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame],frames=new Map();let sequence=0,now=0,loads=0;
    globalThis.requestAnimationFrame=fn=>{frames.set(++sequence,fn);return sequence;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
    const made=[],factory=()=>{const c={width:0,height:0,getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}})};made.push(c);return c;};
    const rules={...earthRules(),surfaceChunkSize:64,surfaceResolution:16,surfaceMaxChunks:8},world={},ctx={drawImage(){}};
    const painter=createEarthSurfacePainter({rules,sample:()=> 'grass',loadArt:async()=>{loads++;return {};},canvasFactory:factory,clock:()=>now+=.05});
    const tick=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn());};
    try{
        assert.equal(loads,0);
        for(let i=0;i<80;i++){painter.draw(ctx,world,{x:i*64,y:0,w:120,h:120});await Promise.resolve();tick();tick();assert.ok(painter.stats.chunks<=8);assert.ok(painter.stats.queued<=8);assert.ok(painter.stats.bytes<=8*18*18*4);}
        assert.equal(loads,1);painter.dispose();assert.equal(frames.size,0);assert.equal(painter.stats.bytes,0);assert.ok(made.every(c=>c.width===0));
    }finally{[globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame]=before;}
});
test('Earth generated terrain and decoration WebP atlases retain provenance and budget',()=>{
    const manifest=JSON.parse(fs.readFileSync(new URL('../data/adventure/earth/surface-art.json',import.meta.url)));
    for(const key of ['terrain','decorations']){const art=manifest[key],bytes=fs.readFileSync(new URL('../'+art.local,import.meta.url));assert.ok(bytes.length<=200000);assert.equal(bytes.length,art.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),art.sha256);assert.equal(art.frames.length,16);assert.match(art.cdn,/^https:\/\/cdn.keepwork.com\//);assert.equal(art.width%4,0);}
});

test('decoration families follow land cover and latitude without inventing water vegetation',()=>{
    assert.deepEqual(earthDecorationFrames('ocean',20),[]);
    assert.ok(earthDecorationFrames('forest',22).includes(1));
    assert.ok(!earthDecorationFrames('forest',60).includes(1));
    assert.deepEqual(earthDecorationFrames('forest',-22),earthDecorationFrames('forest',22));
    assert.deepEqual(earthDecorationFrames('snow',22),[2,11]);
});

test('material atlas edges match without mirroring neighbouring terrain chunks',()=>{
    const width=32,cell=8,source=Uint8ClampedArray.from({length:width*width*4},(_,i)=>(i*71)%256),pixels=seamlessEarthAtlas(source,width);
    for(let frame=0;frame<16;frame++)for(let i=0;i<cell;i++){
        const pixel=(x,y)=>[...pixels.slice(((Math.floor(frame/4)*cell+y)*width+(frame%4)*cell+x)*4,((Math.floor(frame/4)*cell+y)*width+(frame%4)*cell+x)*4+4)];
        assert.deepEqual(pixel(0,i),pixel(cell-1,i));assert.deepEqual(pixel(i,0),pixel(i,cell-1));
    }
});

test('sunlit vegetation stays brighter and greener even with a dark source texture',()=>{
    const atlas={width:8,height:8,data:new Uint8ClampedArray(8*8*4).fill(40)};
    const render=tint=>{const r=createEarthSurfaceRaster({x:0,y:0,size:16,resolution:8,cellSize:16,sample:()=> 'grass',atlas,vegetationTint:tint});while(!r.rows(8)){}return r.pixels;};
    const dark=render(0),bright=render(earthRules().surfaceVegetationTint);
    assert.ok(bright[1]>dark[1]+40);assert.ok(bright[1]>bright[0]*1.2);assert.ok(bright[1]>bright[2]*2);
});
