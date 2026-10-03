import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createEarthSurfaceRaster,surfaceNoise,earthDecorationFrames,earthTreeFrames,earthDecorationStyle,seamlessEarthAtlas,earthMarchingCoverage,earthMarchingWeights,earthCoastCornerDelta} from '../js/adventure_earth_surface_core.js';
import {createEarthSurfacePainter} from '../js/adventure_earth_surface.js';
import {earthRules} from '../js/adventure_earth_core.js';
import {drawEarthBiomeDecoration} from '../js/adventure_earth_decoration.js';
const options={size:64,resolution:32,cellSize:16,sample:(x,y)=>x<80?'forest':'water',worldWidth:256};
const raster=(x,y,size=64,resolution=32)=>{const r=createEarthSurfaceRaster({...options,x,y,size,resolution});while(!r.rows(3)){}return r.pixels;};

test('baked ground details and worn roads are deterministic and continuous across chunk seams',()=>{
    const roads=[{a:{x:-64,y:40},b:{x:192,y:40},width:24}],rules=earthRules();
    const render=(x,size,resolution,extra={})=>{
        const job=createEarthSurfaceRaster({...options,x,y:0,size,resolution,sample:()=> 'grass',roads,
            detailStrength:rules.surfaceDetailStrength,detailSpacing:rules.surfaceDetailSpacing,detailDensity:rules.surfaceDetailDensity,
            roadStyle:{blendWidth:rules.cityConnectionBlendWidth,textureOpacity:rules.cityConnectionTextureOpacity},...extra});
        while(!job.rows(4)){}return job.pixels;
    };
    const whole=render(0,128,128);
    assert.deepEqual(whole,render(0,128,128));
    for(const x of [0,64]){const part=render(x,64,64);for(let y=0;y<64;y++)assert.deepEqual(part.slice(y*256,(y+1)*256),whole.slice(y*512+x*4,y*512+x*4+256));}
    const clean=render(0,128,128,{roads:[],detailStrength:0}),detailed=render(0,128,128,{roads:[]});
    assert.notDeepEqual(detailed,clean);
    // Outside the finite road fringe, baked terrain remains unchanged.
    assert.deepEqual(whole.slice(100*512),detailed.slice(100*512));
    const roadColors=new Set();for(let x=0;x<128;x++)roadColors.add(whole.slice((40*128+x)*4,(40*128+x)*4+3).join(','));
    assert.ok(roadColors.size>20,'路面磨损应有细微变化');
    // The shoulder gradually approaches the surrounding terrain.
    const delta=y=>Math.abs(whole[(y*128+60)*4]-detailed[(y*128+60)*4]);
    assert.ok(delta(57)>delta(71));assert.equal(delta(90),0);
    assert.deepEqual(render(0,128,128,{sample:()=> 'water'}),render(0,128,128,{sample:()=> 'water',roads:[],detailStrength:0}));
    assert.deepEqual(render(0,128,128,{roads:roads.map(r=>({...r,bridge:true}))}),detailed);
});

test('barren ground renders sandy gravel instead of grey scree, including the no-art fallback',()=>{
    const width=16,cell=width/4,data=new Uint8ClampedArray(width*width*4);
    for(let y=0;y<width;y++)for(let x=0;x<width;x++){
        const sand=x<cell&&y>=cell&&y<cell*2;
        data.set(sand?[224,188,120,255]:[112,112,112,255],(y*width+x)*4);
    }
    for(const atlas of [{width,data},undefined]){
        const job=createEarthSurfaceRaster({...options,x:0,y:0,sample:()=> 'barren',atlas});
        while(!job.rows(3)){}
        for(let i=0;i<job.pixels.length;i+=4){
            const [r,g,b,a]=job.pixels.slice(i,i+4);
            assert.ok(r-g>15&&g-b>35,'荒漠应呈沙褐色，而不是灰色碎石');
            assert.equal(a,255);
        }
    }
});
test('all ten HelloWorld land covers render distinctly and keep biome-specific vegetation',()=>{
    const palette=JSON.parse(fs.readFileSync(new URL('../data/adventure/earth/geography.json',import.meta.url))).palette;
    assert.deepEqual(palette.map(p=>p.type).sort(),['barren','crops','forest','grass','ocean','scrub','snow','urban','water','wetland']);
    const samples=palette.map(({type})=>{const r=createEarthSurfaceRaster({...options,x:0,y:0,sample:()=>type});r.rows(32);return [...r.pixels.slice(0,3)].join(',');});
    assert.equal(new Set(samples).size,10);
    for(const {type} of palette){const frames=earthDecorationFrames(type,60);assert.equal(frames.length>0,!['water','ocean'].includes(type));}
    assert.deepEqual(earthDecorationFrames('missing',20),[]);
    for(const lat of [-60,-40,-20,20,40,60]){
        assert.ok(earthTreeFrames('forest',lat).length);
        assert.equal(earthTreeFrames('forest',lat).includes(1),Math.abs(lat)<30);
    }
    assert.equal(earthDecorationFrames('crops',20).filter(f=>f===20).length,3);
    assert.ok(earthTreeFrames('urban',60).includes(2));
    assert.ok(earthDecorationFrames('barren',20).every(f=>f>=8));
});
test('snow trees, snow mounds and wheat draw without waiting for downloaded art',()=>{
    for(const [type,frame,variant] of [['snow',16,'snowTree'],['snow',19,'snowMound'],['crops',20,'wheat']]){
        const style=earthDecorationStyle(type,frame),colors=[];let depth=0;
        assert.equal(style.earthDecoVariant,variant);
        const ctx=new Proxy({save(){depth++;},restore(){depth--;},fill(){colors.push(this.fillStyle);}}, {get:(o,k)=>k in o?o[k]:()=>{}});
        assert.equal(drawEarthBiomeDecoration(ctx,{x:10,y:20,size:100,...style}),true);
        assert.equal(depth,0);assert.ok(colors.length>2);
        if(type==='snow')assert.ok(colors.includes('#f5faff'));
    }
    assert.equal(drawEarthBiomeDecoration({}, {earthDecoVariant:'snowRock'}),false);
    assert.deepEqual(earthDecorationStyle('forest',2),{});
});
test('supplemental WebP decorations override native fallback and use declared crop frames',async()=>{
    const before=[globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame];
    globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
    const calls=[],image={},rect=[256,0,256,256];
    const painter=createEarthSurfacePainter({rules:earthRules(),sample:()=> 'snow',workerFactory:()=>null,
        loadArt:async()=>({biomeDecorations:{image,width:1024,frames:[[0,0,256,256],rect]}})});
    try{
        const ctx={drawImage:(...args)=>calls.push(args)};
        painter.draw(ctx,{}, {x:0,y:0,w:10,h:10});await new Promise(resolve=>setImmediate(resolve));
        assert.equal(painter.decoration(ctx,{x:100,y:200,size:120,earthDecoFrame:17,earthDecoVariant:'snowTree'}),true);
        assert.deepEqual(calls[0],[image,...rect,40,94.4,120,120]);
        assert.equal(painter.decoration(ctx,{earthDecoFrame:24}),false);
    }finally{painter.dispose();[globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame]=before;}
});
test('supplemental eight-frame WebP retains provenance, crop bounds and runtime budget',()=>{
    const manifest=JSON.parse(fs.readFileSync(new URL('../data/adventure/earth/surface-art.json',import.meta.url))),art=manifest.biomeDecorations;
    const bytes=fs.readFileSync(new URL('../'+art.local,import.meta.url));
    assert.equal(bytes.length,art.bytes);assert.ok(bytes.length<=200000);assert.equal(createHash('sha256').update(bytes).digest('hex'),art.sha256);
    assert.equal(art.frameOffset,16);assert.equal(art.frames.length,8);assert.equal(new Set(art.frameNames).size,8);
    assert.ok(art.sourceSha256);assert.ok(fs.existsSync(new URL('../'+art.promptFile,import.meta.url)));
    for(const [x,y,w,h] of art.frames){assert.ok(x>=0&&y>=0&&x+w<=art.width&&y+h<=art.height);assert.equal(w,h);}
    for(const type of ['snow','crops','barren','scrub','wetland'])for(const lat of [20,40,60])for(const frame of earthDecorationFrames(type,lat))assert.ok(frame<16||art.frames[frame-art.frameOffset]);
});
test('tiny coastal fillets affect segment joins only, preserving straight shores and diagonals',()=>{
    const corner=(x,y)=>x>=0&&y>=0?'water':'forest';
    assert.ok(Math.abs(earthCoastCornerDelta(corner,0,-.5))>0);
    assert.equal(earthCoastCornerDelta(corner,-.25,-.25),0);
    assert.equal(earthCoastCornerDelta(corner,3,-.5),0);
    assert.equal(earthCoastCornerDelta(()=>null,0,-.5),0);
    const straight=(x)=>x>=0?'water':'forest';
    for(const x of [-.8,-.5,-.2])for(const y of [-1,-.02,0,.02,.5,1])assert.equal(earthCoastCornerDelta(straight,x,y),0);
    const diagonal=(x,y)=>x+y>=0?'water':'forest';
    assert.equal(earthCoastCornerDelta(diagonal,.5,.5),0);
    assert.ok(Math.abs(earthCoastCornerDelta(corner,0,-.5))<.06);
});
test('angular lake coasts remain identical across independently baked chunks',()=>{
    const sample=(x,y)=>x>=32&&x<96&&y>=16&&y<80?'water':'forest';
    const render=(x,size,resolution)=>{const job=createEarthSurfaceRaster({...options,x,y:0,size,resolution,sample});while(!job.rows(7)){}return job.pixels;};
    const whole=render(0,128,64);
    for(const x of [0,64]){const part=render(x,64,32);for(let y=0;y<32;y++)assert.deepEqual(part.slice(y*128,(y+1)*128),whole.slice(y*256+x*2,y*256+x*2+128));}
});
test('marching terrain cuts single corners diagonally and fills their complements',()=>{
    assert.equal(earthMarchingCoverage(1,.05,.05),1);
    assert.equal(earthMarchingCoverage(1,.45,.45),0);
    for(const mask of [1,2,4,8,3,6,9,12,5,10])for(const [u,v] of [[.1,.2],[.4,.4],[.7,.8],[.5,.5]]){
        assert.ok(Math.abs(earthMarchingCoverage(mask,u,v)+earthMarchingCoverage(15-mask,u,v)-1)<1e-10);
    }
    assert.equal(earthMarchingCoverage(5,.5,.5),0);
    assert.equal(earthMarchingCoverage(10,.5,.5),1);
    const weights=earthMarchingWeights(['forest','barren','barren','barren'],.45,.45);
    assert.equal(weights[0],0);assert.equal(weights[1],1);
    for(const near of [['grass','forest','urban','barren'],['grass','grass','grass','grass']]){
        const w=earthMarchingWeights(near,.5,.5);assert.equal(w.reduce((a,b)=>a+b,0),1);
    }
});
test('sloped material blending restores the old broad cell ramp used by seashores',()=>{
    const smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
    for(const u of [.1,.2,.3,.4,.5,.6,.7,.8,.9]){
        const weights=earthMarchingWeights(['forest','water','forest','water'],u,.3);
        const water=weights[1]+weights[3];
        assert.ok(Math.abs(water-smooth((u-.15)/.7))<1e-10);
    }
    // Sloped coast still cuts across the corner, with sand/shallow/foam weights
    // available on both sides rather than confined to the previous thin strip.
    const coast=(u,v)=>earthMarchingWeights(['forest','water','water','water'],u,v);
    for(const [u,v] of [[.1,.2],[.2,.3],[.3,.4]])assert.ok(coast(u,v)[0]>0&&coast(u,v)[0]<1);
    assert.ok(coast(.4,.4)[0]<coast(.1,.1)[0]);
});
test('vegetation shading no longer reintroduces the source rectangle at a diagonal edge',()=>{
    const render=x=>{const job=createEarthSurfaceRaster({x,y:12,size:.002,resolution:1,cellSize:16,sample:(x,y)=>x<16&&y<16?'forest':'barren',vegetationTint:.48});job.rows(1);return [...job.pixels];};
    const left=render(15.998),right=render(16.001);
    assert.ok(left.every((v,i)=>Math.abs(v-right[i])<=1),`${left} / ${right}`);
});
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

test('warm surface frames do not rebuild queues or schedule idle worker pumps',async()=>{
    const before=[globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame],frames=new Map();let id=0;
    globalThis.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};globalThis.cancelAnimationFrame=n=>frames.delete(n);
    const factory=()=>({width:0,height:0,getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}})});
    const world={},ctx={drawImage(){}},p=createEarthSurfacePainter({rules:{...earthRules(),surfaceChunkSize:64,surfaceResolution:8,surfaceMaxChunks:16},sample:()=> 'urban',loadArt:async()=>({}),canvasFactory:factory,clock:()=>0});
    const tick=()=>{const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn());};
    try{
        p.draw(ctx,world,{x:1,y:1,w:30,h:30});await new Promise(resolve=>setImmediate(resolve));tick();
        p.draw(ctx,world,{x:1,y:1,w:30,h:30});tick();const warm=p.stats;
        for(let i=0;i<120;i++)p.draw(ctx,world,{x:1+i*.1,y:1,w:30,h:30});
        assert.equal(p.stats.queueBuilds,warm.queueBuilds);assert.equal(p.stats.built,warm.built);assert.equal(frames.size,0);
        p.invalidate({x:1,y:1,w:1,h:1});p.draw(ctx,world,{x:1,y:1,w:30,h:30});tick();assert.ok(p.stats.built>warm.built);
    }finally{p.dispose();[globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame]=before;}
});

test('new terrain retains visible pixels until local replacements finish, without rebuilding distant chunks',async()=>{
    const before=[globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame],frames=new Map();let id=0;
    globalThis.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};globalThis.cancelAnimationFrame=n=>frames.delete(n);
    const factory=()=>({width:0,height:0,getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}})});
    const drawn=[],ctx={drawImage(canvas){drawn.push(canvas);}},world={},rect={x:1,y:1,w:30,h:30};
    const p=createEarthSurfacePainter({rules:{...earthRules(),unitsPerDegree:64,surfaceChunkSize:64,surfaceResolution:8,surfaceMaxChunks:16},sample:()=> 'urban',loadArt:async()=>({}),canvasFactory:factory,workerFactory:()=>null,clock:()=>0});
    const tick=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn());};
    try{
        p.draw(ctx,world,rect);await Promise.resolve();p.draw(ctx,world,rect);tick();
        const built=p.stats.built;assert.equal(built,9);
        p.draw(ctx,world,rect);const old=drawn.at(-1);
        p.invalidate({x:10000,y:10000,w:10,h:10});p.draw(ctx,world,rect);tick();assert.equal(p.stats.built,built);
        p.invalidate({x:0,y:0,w:1,h:1});
        p.draw(ctx,world,rect);assert.equal(drawn.at(-1),old);assert.ok(old.width>0);assert.equal(p.stats.chunks,9);
        tick();assert.equal(p.stats.built,built+4);assert.equal(old.width,0);
        p.draw(ctx,world,rect);assert.notEqual(drawn.at(-1),old);assert.ok(drawn.at(-1).width>0);
        assert.equal(p.covers(world,rect),true);
        const warm=p.stats.built;
        for(let i=0;i<20;i++){p.draw(ctx,world,{...rect,x:1+i*.1});tick();}
        assert.equal(p.stats.built,warm,'分块内连续移动复用烘焙缓存');
        world.paths=[{a:{x:10000,y:10000},b:{x:10100,y:10000},width:52}];
        p.draw(ctx,world,rect);tick();assert.equal(p.stats.built,warm,'远处路网流送不应重烘焙脚下地表');
        world.paths=[...world.paths,{a:{x:0,y:20},b:{x:100,y:20},width:52}];
        p.draw(ctx,world,rect);tick();assert.ok(p.stats.built>warm,'附近道路变化更新对应地表');
    }finally{p.dispose();[globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame]=before;}
});
test('Earth surface regeneration and subdivided chunk pixels agree exactly',()=>{
    const a=raster(0,0),b=raster(64,0),whole=raster(0,0,128,64);
    assert.deepEqual(a,raster(0,0));
    for(let y=0;y<32;y++){
        assert.deepEqual(a.slice(y*128,y*128+128),whole.slice(y*256,y*256+128));
        assert.deepEqual(b.slice(y*128,y*128+128),whole.slice(y*256+128,y*256+256));
    }
});
test('diagonal material edges agree across independently baked chunk boundaries',()=>{
    const sample=(x,y)=>Math.floor(x/16)+Math.floor(y/16)<8?'forest':'barren';
    const render=(x,size,resolution)=>{const job=createEarthSurfaceRaster({...options,x,y:0,size,resolution,sample});while(!job.rows(7)){}return job.pixels;};
    const whole=render(0,128,64);
    for(const x of [0,64]){const part=render(x,64,32);for(let y=0;y<32;y++)assert.deepEqual(part.slice(y*128,(y+1)*128),whole.slice(y*256+x*2,y*256+x*2+128));}
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
    assert.deepEqual(earthDecorationFrames('snow',22),[16,17,18,19,11]);
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


test('small scene decorations and shadows bake once, survive draw-index copies and invalidate locally',async()=>{
    const before=[globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame],frames=new Map();let sequence=0,painted=0,shadows=0;
    globalThis.requestAnimationFrame=fn=>{frames.set(++sequence,fn);return sequence;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
    const context=()=>new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),drawImage(){painted++;},createRadialGradient(){shadows++;return {addColorStop(){}};}},{get:(o,k)=>k in o?o[k]:()=>{}});
    const small={x:60,y:30,size:28,earthDecoFrame:8},tree={x:30,y:30,size:120,earthDecoFrame:2},world={trees:[small,tree]},rect={x:1,y:1,w:120,h:50};
    const p=createEarthSurfacePainter({rules:{...earthRules(),surfaceChunkSize:64,surfaceResolution:8,surfaceMaxChunks:24},sample:()=> 'grass',loadArt:async()=>({decorations:{image:{},width:640}}),canvasFactory:()=>({width:0,height:0,getContext:context}),workerFactory:()=>null,clock:()=>0});
    const ctx=context(),tick=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn());};
    try{
        p.draw(ctx,world,rect);await Promise.resolve();p.draw(ctx,world,rect);tick();
        assert.equal(p.isBaked({...small,kind:'tree'}),true,'spatial index copies match baked identities');
        assert.equal(p.isBaked(tree),false,'tall trees retain depth sorting');
        assert.ok(shadows>=2,'straddling sprite shadows bake on both chunks');
        const warm=p.stats.built;
        for(let i=0;i<20;i++){p.draw(ctx,world,{...rect,x:1+i*.1});tick();}
        assert.equal(p.stats.built,warm);
        const drawn=painted;p.decoration(ctx,{...small});assert.equal(painted,drawn,'fully baked sprite has no per-frame atlas draw');
        world.trees=[...world.trees,{x:10000,y:10000,size:28,earthDecoFrame:7}];p.draw(ctx,world,rect);tick();assert.equal(p.stats.built,warm);
        world.trees=world.trees.filter(o=>o!==small);p.draw(ctx,world,rect);tick();assert.ok(p.stats.built>warm);assert.equal(p.isBaked(small),false);
    }finally{p.dispose();[globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame]=before;}
});

test('transferred surface bitmaps commit without Canvas uploads and close on invalidation, eviction and disposal',async()=>{
    const before=[globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame],frames=new Map();let sequence=0,uploads=0;
    globalThis.requestAnimationFrame=fn=>{frames.set(++sequence,fn);return sequence;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
    const messages=[],worker={postMessage:m=>messages.push(m),terminate(){}};
    const o={x:20,y:25,size:12,earthDecoFrame:7},world={trees:[o]},rect={x:1,y:1,w:30,h:30};
    const p=createEarthSurfacePainter({rules:{...earthRules(),surfaceChunkSize:64,surfaceResolution:8,surfaceMaxChunks:1,surfacePrefetchRing:0},sample:()=> 'grass',loadArt:async()=>({}),workerFactory:()=>worker,canvasFactory:()=>{uploads++;throw Error('unexpected main-thread upload');},clock:()=>0});
    const tick=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn());},bitmap=()=>({closed:0,close(){this.closed++;}}),ctx={drawImage(){}};
    try{
        p.draw(ctx,world,rect);await Promise.resolve();p.draw(ctx,world,rect);tick();
        let job=messages.at(-1),old=bitmap();p.invalidate();worker.onmessage({data:{id:job.id,bitmap:old,baked:[0]}});assert.equal(old.closed,1);assert.equal(p.stats.chunks,0);
        p.draw(ctx,world,rect);tick();job=messages.at(-1);const first=bitmap();worker.onmessage({data:{id:job.id,bitmap:first,baked:[0]}});assert.equal(p.isBaked({...o}),true);assert.equal(uploads,0);
        p.draw(ctx,world,{...rect,x:129});tick();job=messages.at(-1);const second=bitmap();worker.onmessage({data:{id:job.id,bitmap:second,baked:[]}});assert.equal(first.closed,1);
        p.dispose();assert.equal(second.closed,1);assert.equal(p.stats.bytes,0);
    }finally{p.dispose();[globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame]=before;}
});


test('worker composites terrain, small sprites and shadows, with pixel fallback if OffscreenCanvas fails',async()=>{
    const before=[globalThis.self,globalThis.OffscreenCanvas],messages=[];let sprites=0,shadows=0;
    const bitmap={};
    globalThis.self={postMessage:(data,transfer)=>messages.push({data,transfer})};
    globalThis.OffscreenCanvas=class{
        getContext(){return new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),drawImage(){sprites++;},createRadialGradient(){shadows++;return {addColorStop(){}};}},{get:(o,k)=>k in o?o[k]:()=>{}});}
        transferToImageBitmap(){return bitmap;}
    };
    try{
        await import('../js/adventure_earth_surface_worker.js?surface-composite-test');
        const atlas={image:{},width:640},o={x:12,y:20,size:12,earthDecoFrame:7};
        self.onmessage({data:{type:'atlas',art:{decorations:atlas},composite:true}});
        const job={id:1,options:{x:0,y:0,size:32,resolution:8,cellSize:16,worldWidth:256},grid:Object.fromEntries(Array.from({length:64},(_,i)=>[`${i%8}:${Math.floor(i/8)}`,'grass'])),objects:[o]};
        self.onmessage({data:job});assert.equal(messages[0].data.bitmap,bitmap);assert.deepEqual(messages[0].transfer,[bitmap]);assert.deepEqual(messages[0].data.baked,[0]);assert.equal(sprites,1);assert.equal(shadows,1);
        globalThis.OffscreenCanvas=class{getContext(){throw Error('unsupported worker canvas');}};
        self.onmessage({data:{...job,id:2}});assert.equal(messages[1].data.error,undefined);assert.equal(messages[1].data.pixels.length,8*8*4);assert.equal(messages[1].transfer[0],messages[1].data.pixels.buffer);
    }finally{[globalThis.self,globalThis.OffscreenCanvas]=before;}
});

test('worker atlas initialization clones only transferable art metadata, retaining the main-thread atlas',async()=>{
    const before=[globalThis.OffscreenCanvas,globalThis.createImageBitmap,globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame],messages=[];
    globalThis.OffscreenCanvas=class{};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
    let cloned=0,closed=0;const image={};globalThis.createImageBitmap=async original=>{assert.equal(original,image);cloned++;return {close(){closed++;}};};
    const art={decorations:{image,width:640,frames:[[0,0,160,160]],dispose(){throw Error('source must remain available');}}};
    const worker={postMessage:(message,transfer)=>{assert.equal(message.art.decorations.dispose,undefined);messages.push({message,transfer});},terminate(){}};
    const p=createEarthSurfacePainter({rules:earthRules(),sample:()=> 'grass',loadArt:async()=>art,workerFactory:()=>worker});
    try{
        p.draw({drawImage(){}},{trees:[]},{x:1,y:1,w:20,h:20});await new Promise(resolve=>setImmediate(resolve));
        assert.equal(cloned,1);assert.equal(messages.length,1);assert.equal(messages[0].message.composite,true);assert.equal(messages[0].transfer[0],messages[0].message.art.decorations.image);assert.equal(closed,0);
    }finally{p.dispose();[globalThis.OffscreenCanvas,globalThis.createImageBitmap,globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame]=before;}
});
