import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {earthPoint,earthGeo,earthRules,earthLocalMapBounds,terrainKey,cityKey,parseEarthCities,generateEarthCity,earthSafe,earthChapterEvent,earthEncounter,landRoadSegments,earthWalkable,distanceToRoad} from '../js/adventure_earth_core.js';
import {createEarthService,EarthCache,decodeMapOverview} from '../js/adventure_earth.js';
import {generateEarthCityConnections} from '../js/adventure_earth_transport_core.js';

test('local Earth collision queries preserve road priority and refresh after streaming without scanning distant buildings',()=>{
    let distantReads=0;
    const far=Array.from({length:600},(_,i)=>({get x(){distantReads++;return 2000+i*20;},y:1000,w:80,h:100}));
    const buildings=[{x:110,y:120,w:100,h:180},{x:440,y:310,w:90,h:140},...far];
    const paths=[{a:{x:0,y:110},b:{x:600,y:340},width:52}];
    const world={w:20000,h:2000,earthRules:earthRules(),terrainAt:()=> 'grass',paths,buildings,revision:1};
    const brute=(x,y)=>paths.some(r=>distanceToRoad({x,y},r)<=r.width/2)||!buildings.some(b=>x>b.x-b.w*.3-10&&x<b.x+b.w*.3+10&&y>b.y-b.h*.42-10&&y<b.y+12);
    for(let y=0;y<500;y+=13)for(let x=0;x<600;x+=17)assert.equal(earthWalkable(world,x,y),brute(x,y));
    distantReads=0;
    for(let i=0;i<100;i++)earthWalkable(world,10+i,10);
    assert.equal(distantReads,0,'连续行走应只检查附近建筑');
    assert.equal(earthWalkable(world,30,30),true);
    world.buildings=[{x:30,y:40,w:80,h:80}];world.paths=[];world.revision++;
    assert.equal(earthWalkable(world,30,30),false);
    world.buildings=[];world.revision++;
    assert.equal(earthWalkable(world,30,30),true);
});
import {walkable,movePosition,findPath} from '../js/adventure_world_core.js';
import {createAdventure,parseSave,beginEncounter,recordDecision,settleEncounter} from '../js/adventure_core.js';
import {restorePveBattle,playPveRound} from '../js/combat_pve_core.js';
import {SimpleBot} from '../js/combat_policy_core.js';
import {installDungeons,enterDungeon,leaveDungeon} from '../js/adventure_dungeons_core.js';
import {packageRuntimeData} from '../scripts/package_runtime_data.mjs';
import {createWorldMapSwitch} from '../js/view_adventure_controls.js';
import {renderEarthLocalMap} from '../js/view_adventure_earth_local_map.js';
import {layoutEarthMapLabels} from '../js/earth_map_labels_core.js';
import {recordLearningCompletion} from '../js/language_adventure_core.js';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';

test('city map covers the loaded neighbourhood with the player at its centre',()=>{
    const rules=earthRules(),position=earthPoint(114.0579,22.5431,rules),bounds=earthLocalMapBounds(position,rules);
    assert.equal(bounds.w,rules.chunkSize*(rules.activeRadius+1)*2);
    assert.equal(bounds.w,bounds.h);
    assert.equal(bounds.x+bounds.w/2,position.x);
    assert.equal(bounds.y+bounds.h/2,position.y);
    assert.ok(bounds.w<360*rules.unitsPerDegree/100);
});

test('city map dragging moves terrain and city nodes together without triggering travel',()=>{
    const previousDocument=globalThis.document,draws=[],trips=[];
    class Element {
        constructor(){this.children=[];this.style={};this.dataset={};this.className='';this.classList={add:()=>{},remove:()=>{}};}
        append(...nodes){this.children.push(...nodes);}
        replaceChildren(...nodes){this.children=nodes;}
        setAttribute(){} focus(){} setPointerCapture(){}
        getBoundingClientRect(){return this.className==='earth-local-city'?{width:100,height:30}:{width:560,height:560};}
        querySelector(selector){return this.children.find(node=>node.className?.split(' ').includes(selector.slice(1)))||this.children.map(node=>node.querySelector?.(selector)).find(Boolean);}
    }
    globalThis.document={createElement:()=>new Element(),createElementNS:()=>new Element()};
    try{
        const root=new Element(),position=earthPoint(114.0579,22.5431),size=earthLocalMapBounds(position).w;
        const city={...position,name:'深圳',lon:114.0579,lat:22.5431},offscreen={...city,x:position.x+size*.6,name:'附近城市'};
        renderEarthLocalMap(root,{layout:{name:'中国.深圳'},earthRules:earthRules(),mapCities:[city,offscreen]},{position},{close(){},switchWorld(){},travel:city=>trips.push(city),draw:(canvas,options)=>draws.push(options.bounds)});
        const map=root.querySelector('.earth-local-map'),node=map.querySelector('.earth-local-city'),dot=map.querySelector('.earth-local-dot'),canvas=map.querySelector('.earth-atlas'),other=map.querySelector('.earth-local-cities').children.at(-1);
        assert.equal(dot.style.left,'50%');assert.equal(other.hidden,true);
        map.onpointerdown({button:0,pointerId:1,clientX:280,clientY:280,target:node});
        map.onpointermove({pointerId:1,clientX:168,clientY:336});
        map.onpointerup({pointerId:1});node.onclick({detail:1});
        assert.equal(trips.length,0);assert.equal(draws.at(-1).x,draws[0].x+size*.2);assert.equal(draws.at(-1).y,draws[0].y-size*.1);
        assert.equal(dot.style.left,'30%');assert.equal(other.hidden,false);
        map.onpointerdown({button:0,pointerId:2,clientX:168,clientY:336,target:node});map.onpointerup({pointerId:2});node.onclick({detail:1});
        assert.deepEqual(trips,[city]);
        const before=draws.at(-1).x;canvas.onkeydown({key:'ArrowLeft',preventDefault(){}});assert.equal(draws.at(-1).x,before-size/8);
        map.querySelector('.earth-local-locate').onclick();assert.deepEqual(draws.at(-1),draws[0]);assert.equal(dot.style.left,'50%');
    }finally{globalThis.document=previousDocument;}
});

test('crowded city names have separate label boxes connected to unchanged real anchors',()=>{
    const points=Array.from({length:10},(_,i)=>({id:String(i),x:260+i%3,y:280+i%2,w:90,h:28}));
    for(const width of [560,330]){
        const result=layoutEarthMapLabels(points,width,width,[{x:0,y:0,w:220,h:52}]);
        assert.equal(result.filter(point=>point.box).length,points.length);
        for(const [i,item] of result.entries()){
            assert.equal(item.x,points[i].x);assert.equal(item.y,points[i].y);
            assert.ok(item.box.x>=0&&item.box.x+item.box.w<=width);
            assert.ok(item.box.y>=0&&item.box.y+item.box.h<=width);
            for(const other of result.slice(i+1)){const a=item.box,b=other.box;assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);}
        }
    }
});

test('city map ignores obsolete viewport results and stops applying updates after closing',async()=>{
    const previousDocument=globalThis.document,pending=[],draws=[];
    class Element {
        constructor(){this.children=[];this.style={};this.dataset={};this.className='';this.classList={add(){},remove(){}};}
        append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
        setAttribute(){}focus(){}setPointerCapture(){}
        getBoundingClientRect(){return this.className==='earth-local-city'?{width:100,height:30}:{width:560,height:560};}
        querySelector(selector){return this.children.find(node=>node.className?.split(' ').includes(selector.slice(1)))||this.children.map(node=>node.querySelector?.(selector)).find(Boolean);}
    }
    globalThis.document={createElement:()=>new Element(),createElementNS:()=>new Element()};
    let view;
    try{
        const root=new Element(),position=earthPoint(114.0579,22.5431),world={layout:{name:'中国.深圳'},earthRules:earthRules(),mapCities:[]};
        view=renderEarthLocalMap(root,world,{position},{close(){},switchWorld(){},travel(){},draw:(canvas,data)=>draws.push(data),viewport:bounds=>new Promise(resolve=>pending.push({bounds,resolve}))});
        const map=root.querySelector('.earth-local-map'),canvas=map.querySelector('.earth-atlas');
        map.onpointerdown({button:0,pointerId:1,clientX:0,clientY:0,target:canvas});map.onpointermove({pointerId:1,clientX:80,clientY:0});map.onpointerup({pointerId:1});
        assert.equal(pending.length,2);
        pending[0].resolve({cities:[{name:'过期城市',x:position.x,y:position.y}],paths:[]});await Promise.resolve();
        assert.equal(map.querySelector('.earth-local-city'),undefined);
        pending[1].resolve({cities:[{name:'当前视野城市',x:position.x,y:position.y}],paths:[]});await Promise.resolve();
        assert.equal(map.querySelector('.earth-local-city').textContent,'当前视野城市');
        map.querySelector('.earth-local-status').onclick();assert.equal(pending.length,3);view.dispose();
        const count=draws.length;pending[2].resolve({cities:[],paths:[]});await Promise.resolve();assert.equal(draws.length,count);
    }finally{view?.dispose();globalThis.document=previousDocument;}
});
import {durableSave,runtimeValues,restoreRuntime} from '../js/adventure_storage_core.js';
const read=file=>JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url)));
const content=read('data/adventure/chapter.json');
content.worldMaps=Object.fromEntries(Object.entries(content.worldMapIndex.islands).map(([id,info])=>[id,read(info.file)]));
function serviceHarness({beforeFetch=async()=>{},cityCsv=null,terrainType='grass',editCity=()=>{}}={}){
    const requests=[],source=structuredClone(content);source.pets=read('data/adventure/pets.json').pets;
    const fetcher=async url=>{await beforeFetch(url);requests.push(url);if(url.startsWith('data/')){const data=read(url);if(url.endsWith('/cities/shenzhen.json')){data.art.landmarks.atlas=null;editCity(data);}return {ok:true,json:async()=>data};}
        if(/\.(png|webp)$/.test(url))return {ok:true,blob:async()=>({})};
        if(url.includes('.csv'))return {ok:true,text:async()=> cityCsv??'wikiDataId,name,country_name,lat,lon,native_name\nQ60,纽约,美国,40.758,-73.985,New York\nQ15174,深圳,中国,22.5431,114.0579,深圳'};
        throw Error('Unexpected request '+url);
    };
    const service=createEarthService({content:source,fetcher,decodeOverview:async()=>({key:'overview',width:2,height:2,bytes:16}),decode:async(blob,palette,key)=>({key,width:2,height:2,indices:new Uint8Array([0,0,0,0]),types:[terrainType],bytes:20})});
    return {service,requests,source};
}
test('Earth service construction and importing scene rules perform zero network requests',()=>{
    const {requests,service}=serviceHarness();assert.deepEqual(requests,[]);assert.equal(service.world,undefined);
    const boot=fs.readFileSync(new URL('../js/adventure_assets.js',import.meta.url),'utf8');assert.ok(!boot.includes('data/adventure/earth/'));
});

test('world atlas retains all catalog levels at every zoom without a count cap or loading dense detail shards',async()=>{
    const requests=[],catalog='name,lat,lng,population,level,province\n次级城市,22.54,114.04,9000000,2,省\n大城市,22.55,114.05,3000000,1,省\n中城市,22.56,114.06,2000000,1,省\n另一城市,22.57,114.07,1000000,1,省';
    const service=createEarthService({content:{},fetcher:async url=>{
        requests.push(url);if(url.startsWith('data/'))return {ok:true,json:async()=>read(url)};
        if(url.includes('/topcities/'))return {ok:true,text:async()=>catalog};
        throw Error('World atlas should not request detail shards: '+url);
    }});
    for(const span of [360,5,1]){
        const result=await service.viewport({center:{lon:114.05,lat:22.55},span,height:span/2,atlasOnly:true});
        assert.deepEqual(result.cities.map(c=>c.name),['大城市','中城市','另一城市','次级城市']);assert.deepEqual(result.tiles,[]);
    }
    assert.equal(requests.filter(url=>url.includes('/topcities/')).length,1);assert.ok(!requests.some(url=>/stationdata|terrain_/.test(url)));
    service.cancel();
});

test('political atlas preserves original geographic bounds and records a verified WebP source',()=>{
    const art=read('data/adventure/earth/geography.json').overview,bytes=fs.readFileSync(new URL('../'+art.local,import.meta.url));
    assert.deepEqual(art.bounds,{west:-180,east:180,south:-60,north:85});
    assert.equal(art.width/art.height,512/211);
    assert.equal(art.style,'political');assert.equal(art.projection,'equirectangular');
    assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.equal(bytes.length,art.bytes);assert.ok(bytes.length<=500000);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),art.sha256);
    assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../'+art.source.local,import.meta.url))).digest('hex'),art.source.sha256);
    assert.equal(art.source.license,'CC0-1.0');assert.match(art.cdn,/^https:\/\/cdn.keepwork.com\//);
});

test('political overview decoding preserves its bitmap without terrain color classification',async()=>{
    const previous=globalThis.createImageBitmap;let closed=false;
    const bitmap={width:2048,height:844,close(){closed=true;}};
    globalThis.createImageBitmap=async()=>bitmap;
    try{const result=await decodeMapOverview({});assert.equal(result.image,bitmap);assert.equal(result.bytes,2048*844*4);assert.equal(result.indices,undefined);assert.equal(closed,false);result.dispose();assert.equal(closed,true);}
    finally{if(previous===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=previous;}
});

test('panning city map loads new terrain and cities without changing the gameplay world',async()=>{
    const {service,requests}=serviceHarness();const {world}=await service.prepare({lon:114.0579,lat:22.5431}),before={...world.center};
    const bounds=earthLocalMapBounds(earthPoint(111.99,22.5431),service.rules),view=await service.localViewport(bounds);
    assert.ok(requests.some(url=>url.includes('terrain_110_112_22_24.png')));
    assert.ok(requests.some(url=>url.includes('terrain_112_114_22_24.png')));
    assert.equal(view.terrainAt(bounds.x,bounds.y),'grass');
    assert.equal(service.world,world);assert.deepEqual(world.center,before);
    assert.ok(!requests.some(url=>url.endsWith('dialogue.json')||url.endsWith('quests.json')));
});

test('map header selectors do not load Earth until explicitly selected',()=>{
    const previousDocument=globalThis.document,previousFetch=globalThis.fetch;let requests=0;const selected=[];
    class Element {constructor(){this.children=[];this.attributes={};}append(...children){this.children.push(...children);}setAttribute(k,v){this.attributes[k]=v;}}
    globalThis.document={createElement:()=>new Element()};globalThis.fetch=()=>{requests++;};
    try{const tabs=createWorldMapSwitch('haqi',id=>selected.push(id));assert.equal(requests,0);assert.equal(tabs.children.length,2);assert.equal(tabs.children[0].attributes['aria-pressed'],'true');assert.equal(tabs.children[1].attributes['aria-pressed'],'false');tabs.children[1].onclick();assert.deepEqual(selected,['earth']);assert.equal(requests,0);}finally{globalThis.document=previousDocument;globalThis.fetch=previousFetch;}
});

test('Earth language completion reuses existing reward deduplication',()=>{
    const save=createAdventure(content);save.zone='earth';save.languageLearning={...save.languageLearning,enabled:true,target:'en'};
    const completion={course:{id:'help',tier:'beginner'},mode:'basic',locale:'en',attemptId:'earth-practice-1',now:1790880000000,score:100,spoken:true,story:{id:'earth-shenzhen:help-together',turnIds:['a','b','c'],proof:['a','b','c'].map(turnId=>({turnId,quote:'Let us help.',hinted:false}))}};
    recordLearningCompletion(save,content,completion,{learningCompletion:completion});const inventory=structuredClone(save.inventory);
    assert.equal(recordLearningCompletion(save,content,completion,{learningCompletion:completion}).duplicate,true);assert.deepEqual(save.inventory,inventory);
    const again={...completion,attemptId:'earth-practice-2'};assert.equal(recordLearningCompletion(save,content,again,{learningCompletion:again}).amount,0);
});

test('Shenzhen artwork has a verified permanent URL, bounded WebP and valid six-landmark crops',()=>{
    const art=read('data/adventure/earth/cities/shenzhen.json').art.landmarks,bytes=fs.readFileSync(new URL('../'+art.local,import.meta.url));
    assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.ok(bytes.length<=200000);assert.equal(bytes.length,art.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),art.sha256);assert.equal(new URL(art.atlas).hostname,'cdn.keepwork.com');assert.equal(art.frames.length,6);
    for(const [x,y,w,h]of art.frames)assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=art.width&&y+h<=art.height);
});
test('coordinates round-trip, date-line wraps, and pole tiles remain inside Earth',()=>{
    for(const [lon,lat]of [[114.0579,22.5431],[-73.985,40.758],[-179.99,-89.99],[179.99,89.99]]){const result=earthGeo(earthPoint(lon,lat));assert.ok(Math.abs(result.lon-lon)<1e-8);assert.ok(Math.abs(result.lat-lat)<1e-8);}
    assert.equal(earthGeo(earthPoint(181,0)).lon,-179);assert.equal(terrainKey(180,90),'-180_88');assert.equal(cityKey(-73,40),'40_n80');
});
test('CSV parser supports quoted names, missing population, and rejects invalid coordinates',()=>{
    const rows=parseEarthCities('id,name,country,lat,lon,native\nQ1,"Town, East",X,22,114,N\nQ2,"A ""B""",X,-5,-10,N,123\nbad,Bad,X,91,3,N');assert.equal(rows.length,2);assert.equal(rows[0].name,'Town, East');assert.equal(rows[1].name,'A "B"');
});
test('generated city layout is independent of visit order and does not use gameplay RNG',()=>{
    const rules=earthRules(),city={id:'Q1',lon:12,lat:32};const first=generateEarthCity(city,rules);generateEarthCity({id:'Q2',lon:13,lat:31},rules);assert.deepEqual(generateEarthCity(city,rules),first);assert.equal(new Set(first.buildings.map(b=>b.id)).size,first.buildings.length);
});
test('atlas loads overview and visible tiles without authored NPCs, quests or artwork',async()=>{
    const {service,requests}=serviceHarness();await service.atlas();assert.ok(!requests.some(url=>url.includes('cities/shenzhen.json')));await service.viewport({center:{lon:114,lat:22},span:2,height:1});assert.ok(!requests.some(url=>/npcs|quests|dialogue|art.json/.test(url)));assert.ok(requests.filter(url=>url.includes('terrain_')).length<=6);
});
test('arrival loads one Shenzhen bundle and interaction reuses its cached content',async()=>{
    const {service,requests}=serviceHarness();const result=await service.prepare({lon:114.0579,lat:22.5431});assert.equal(result.world.zone,'earth');assert.ok(result.world.npcs.length);assert.ok(!requests.some(url=>url.endsWith('roads.json')));assert.equal(result.world.layout.name,'中国.深圳');assert.ok(result.world.paths.every(road=>road.connection));assert.ok(!requests.some(url=>url.endsWith('quests.json')));const count=requests.length;const story=await service.story();assert.equal(requests.length,count);assert.equal(story.city.id,'shenzhen');assert.equal(requests.filter(url=>url.endsWith('cities/shenzhen.json')).length,1);
});

test('authored Earth residents move aside after city entrances are finalized',async()=>{
    let npcId;
    const {service}=serviceHarness({editCity(city){
        npcId=city.npcs[0].id;
        city.npcs[0].lon=city.entrance.lon;city.npcs[0].lat=city.entrance.lat;
    }});
    const city=read('data/adventure/earth/cities/shenzhen.json');
    const {world}=await service.prepare(city.entrance);
    const npc=world.npcs.find(n=>n.id===npcId),entrance=world.landmarks.find(m=>m.id==='city:shenzhen:entrance');
    assert.ok(npc&&entrance);
    const {SOCIAL_DEFAULTS}=await import('../js/adventure_social_core.js');
    for(const mark of world.landmarks.filter(m=>m.dungeonId&&!m.hidden))assert.ok(Math.hypot(npc.x-mark.x,npc.y-mark.y)>=SOCIAL_DEFAULTS.entranceClearance);
    assert.equal(walkable(world,npc.x,npc.y),true);
    assert.equal(walkable(world,entrance.x,entrance.y),true,'player can still use the entrance');
});
test('unpolished cities use real city positions and never request Shenzhen content',async()=>{
    const {service,requests}=serviceHarness();const {world}=await service.prepare({lon:-73.985,lat:40.758});assert.ok(world.buildings.length>0);assert.equal(world.npcs.length,0);assert.ok(!requests.some(url=>url.includes('cities/shenzhen.json')));assert.equal(world.earthRegion,null);assert.equal(world.layout.name,'美国.纽约');
});
test('Shenzhen uses wide city connections without loading or retaining legacy streets',async()=>{
    const {service,requests}=serviceHarness({cityCsv:'wikiDataId,name,country_name,lat,lon,native_name\nQ15174,深圳,中国,22.5431,114.0579,深圳\nneighbour,邻城,中国,22.57,114.15,邻城'});
    const {world}=await service.prepare({lon:114.0579,lat:22.5431});
    assert.ok(world.paths.length>0);
    assert.ok(world.paths.every(road=>road.connection&&road.width===52));
    assert.ok(!requests.some(url=>url.endsWith('roads.json')));
    assert.ok(world.buildings.some(b=>b.earthFrame!==undefined));
    assert.ok(world.npcs.length>0);
});

test('landmarks do not cut the continuous city road and road surfaces remain walkable',async()=>{
    const cities=[{id:'west',name:'西侧',lon:114.0251,lat:22.5280667},{id:'east',name:'东侧',lon:114.0751,lat:22.5280667}];
    const cityCsv='wikiDataId,name,country_name,lat,lon,native_name\n'+cities.map(c=>`${c.id},${c.name},中国,${c.lat},${c.lon},${c.name}`).join('\n');
    const {service}=serviceHarness({cityCsv});
    const geo={lon:114.0501,lat:22.5280667},center=earthPoint(geo.lon,geo.lat);
    const {world}=await service.prepare(geo),rules=world.earthRules;
    const expected=generateEarthCityConnections(cities,center,rules.chunkSize*(rules.activeRadius+1),rules,()=> 'grass');
    const landmarks=world.buildings.filter(b=>b.earthFrame!==undefined);
    assert.ok(landmarks.length);
    assert.ok(expected.some(r=>landmarks.some(b=>Math.abs(r.a.x-b.x)<b.w/2+r.width/2&&Math.abs(r.a.y-b.y)<b.h+r.width/2)),'fixture crosses the old landmark exclusion box');
    assert.deepEqual(world.paths,expected,'landmarks must not remove road segments');
    for(const road of expected)for(let i=0;i<=4;i++)assert.ok(walkable(world,road.a.x+(road.b.x-road.a.x)*i/4,road.a.y+(road.b.y-road.a.y)*i/4));
});
test('navigation is local and missing terrain is blocked, never fabricated',async()=>{
    const {service}=serviceHarness();const {world,position}=await service.prepare({lon:0,lat:0});assert.equal(walkable(world,position.x,position.y),true);assert.equal(walkable(world,earthPoint(100,30).x,earthPoint(100,30).y),false);assert.deepEqual(findPath(world,position,{x:position.x+50000,y:position.y}),[]);assert.notDeepEqual(movePosition(world,position,20,0),position);
});

test('restoring a local sea position keeps it afloat while fresh map travel still requires land',async()=>{
    const {service}=serviceHarness({terrainType:'ocean'}),geo={lon:0,lat:0};
    await assert.rejects(service.prepare(geo),/安全陆地/);
    const restored=await service.prepare(geo,{restore:true});
    assert.deepEqual(restored.position,earthPoint(0,0));assert.equal(restored.world.earthBoating,true);
    assert.equal(walkable(restored.world,restored.position.x,restored.position.y),true);
    assert.equal(restored.world.npcs.length,0);assert.equal(restored.world.encounters.length,0);
});

test('arrival does not trigger a redundant rebuild and streaming reuses overlap buildings',async()=>{
    const {service,requests}=serviceHarness();const {world,position}=await service.prepare({lon:-73.985,lat:40.758});
    // This Node harness intentionally lacks browser artwork decoding; exercise
    // healthy streaming here rather than the separate failed-art retry path.
    world.error='';
    const revision=world.revision,buildings=world.buildings,count=requests.length;
    assert.equal(service.update(position,1000),undefined);
    assert.equal(world.revision,revision);assert.equal(world.buildings,buildings);assert.equal(requests.length,count);
    assert.equal(service.update({...position,x:position.x+.01},2000),undefined);
    buildings.forEach(b=>b.liveMarker='retained');
    await service.update({...position,x:position.x+1000},3000);
    const byId=new Map(buildings.map(b=>[b.id,b]));
    const overlap=world.buildings.filter(b=>byId.has(b.id));assert.ok(overlap.length>0);
    for(const b of overlap){assert.equal(b,byId.get(b.id));assert.equal(b.liveMarker,'retained');}
    assert.equal(world.layout.buildings,world.buildings);
    let changes=0;world.onObjectsChanged=()=>changes++;world.error='retry';
    await service.update({...position,x:position.x+1000},10000);
    assert.equal(changes,0,'unchanged retries do not reset object indices or social actors');service.cancel();
});
test('wild spawn points avoid roads, buildings and residents without suppressing the whole grassland',async()=>{
    const {service}=serviceHarness();const {world}=await service.prepare({lon:-73.985,lat:40.758});for(const monster of world.encounters)assert.equal(earthSafe(world,monster,monster.monster?world.earthRules.wildSpawnClearance:world.earthRules.monsterClearance),false);
});
test('cache deduplicates concurrent loads, limits concurrency and evicts by byte budget',async()=>{
    const cache=new EarthCache({limit:2,bytes:12,concurrency:1});let loads=0,active=0,max=0,disposed=0;
    const load=async()=>{loads++;active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;return {bytes:6,dispose:()=>disposed++};};
    await Promise.all([cache.get('a',load),cache.get('a',load),cache.get('b',load),cache.get('c',load)]);assert.equal(loads,3);assert.equal(max,1);assert.equal(cache.entries.size,2);assert.equal(cache.bytes,12);assert.equal(disposed,1);
});

test('preparing another destination cannot evict the currently active scene',async()=>{
    const cache=new EarthCache({limit:1,bytes:10});let disposed=false;
    const active=await cache.get('current',async()=>({bytes:10,dispose(){disposed=true;}}));cache.pinned.add('current');
    await assert.rejects(cache.get('destination',async()=>({bytes:10})),/预算/);assert.equal(cache.peek('current'),active);assert.equal(disposed,false);assert.equal(cache.bytes,10);
});
test('cancelled cache work cannot publish late results or overwrite a new request',async()=>{
    const cache=new EarthCache({concurrency:2});let resolve;const first=cache.get('a',()=>new Promise(r=>resolve=r));await Promise.resolve();cache.clear();const second=await cache.get('a',async()=>({value:'new'}));resolve({value:'old'});await assert.rejects(first,/取消/);assert.equal(cache.peek('a'),second);
});
test('failed destination preparation preserves the previously active world',async()=>{
    const {service}=serviceHarness();const current=await service.prepare({lon:0,lat:0});await assert.rejects(service.prepare({lon:NaN,lat:NaN}));assert.equal(service.world,current.world);
});
test('Earth position and return point are local; cloud restores camp and retains chapter',()=>{
    const save=createAdventure(content);save.zone='earth';save.position=earthPoint(114,22);save.earthReturn={zone:'town',position:{x:100,y:200}};save.earthProgress={version:1,step:2};
    const cloud=durableSave(save);assert.equal(cloud.zone,'camp');assert.equal(cloud.position,undefined);assert.equal(cloud.earthReturn,undefined);assert.equal(cloud.earthProgress.step,2);
    const local=restoreRuntime(cloud,content,runtimeValues(save));assert.equal(local.zone,'earth');assert.deepEqual(local.position,save.position);assert.equal(parseSave(JSON.stringify(local),content).zone,'earth');assert.equal(restoreRuntime(cloud,content).zone,'camp');
});
test('chapter order rejects wrong clues and repeated completion without rewards',()=>{
    const save=createAdventure(content),quests=read('data/adventure/earth/cities/shenzhen.json').quests,inventory=structuredClone(save.inventory);assert.equal(earthChapterEvent(save,quests,'clues'),false);assert.equal(earthChapterEvent(save,quests,'arrival'),true);assert.equal(earthChapterEvent(save,quests,'arrival'),false);for(const event of ['memory','clues','defense','return'])assert.equal(earthChapterEvent(save,quests,event),true);assert.equal(save.earthProgress.step,5);assert.deepEqual(save.inventory,inventory);
});
test('Earth encounters resolve existing monsters and reject invalid identities',()=>{
    assert.equal(earthEncounter(content,'earth:not-existing:1:2:0'),null);assert.equal(earthEncounter(content,'earth:water-bubble:1:2:0').monster,content.monsters['water-bubble']);const save=createAdventure(content);save.zone='earth';save.position=earthPoint(1,2);beginEncounter(save,content,'earth:water-bubble:1:2:0');assert.ok(save.pendingEncounter);
});

test('arrival-to-defense chapter replays its real battle, preserves the pet, and deduplicates rewards',async()=>{
    const {service,source}=serviceHarness(),quests=read('data/adventure/earth/cities/shenzhen.json').quests;
    const save=createAdventure(source,{seed:42}),pet=structuredClone(save.pet);
    for(const event of ['arrival','memory','clues'])assert.equal(earthChapterEvent(save,quests,event),true);
    const prepared=await service.prepare({lon:114.55,lat:22.62});source.earthWorld=prepared.world;save.zone='earth';save.position=prepared.position;
    const encounter=prepared.world.encounters.find(e=>e.chapterEvent==='defense');assert.ok(encounter);
    beginEncounter(save,source,encounter.id);const checkpoint=structuredClone(save.pendingEncounter);
    const restored=parseSave(JSON.stringify(restoreRuntime(durableSave(save),source,runtimeValues(save))),source);
    assert.equal(restored.pendingEncounter.encounterId,encounter.id);
    const battle=restorePveBattle(read('data/adventure/combat.json'),source,restored.pendingEncounter),bot=new SimpleBot();
    while(!battle.finished){const action=bot.pick(battle,battle.sides.near[0]);playPveRound(battle,action);recordDecision(restored,action);}
    assert.equal(battle.winner,'near');settleEncounter(restored,source,battle);assert.equal(restored.earthProgress.step,4);
    const inventory=structuredClone(restored.inventory);restored.pendingEncounter=checkpoint;assert.equal(settleEncounter(restored,source,battle),false);assert.deepEqual(restored.inventory,inventory);
    assert.equal(earthChapterEvent(restored,quests,'return'),true);assert.equal(restored.earthProgress.step,5);assert.equal(restored.pet?.itemId,pet?.itemId);
});

test('sustained geographic movement keeps scene objects, request queue and tile groups bounded',async()=>{
    const {service}=serviceHarness();const {world}=await service.prepare({lon:0,lat:10});let changes=0;world.onObjectsChanged=()=>changes++;
    for(let i=0;i<180;i++){await service.update(earthPoint(i*.1,10),i*1000+1000);assert.ok(world.encounters.length<=25);assert.ok(world.buildings.length<=service.rules.maxSceneCities*service.rules.buildingsPerCity);assert.ok(service.cache.queue.length<=service.rules.maxQueuedRequests);assert.ok(service.cache.bytes<=service.rules.maxDecodedBytes);}
    assert.ok(changes>170);assert.ok([...service.cache.entries.keys()].filter(k=>k.startsWith('terrain:')).length<=service.rules.maxTiles);
    assert.ok([...service.cache.entries.keys()].filter(k=>k.startsWith('cities:')).length<=service.rules.maxCityTiles);
});

test('procedural chunks regenerate consistently across the date line',async()=>{
    const {service}=serviceHarness();const before=(await service.prepare({lon:179.999,lat:0})).world.wildSpawns.map(e=>({id:e.id,...earthGeo(e.position)}));
    const after=(await service.prepare({lon:-179.999,lat:0})).world.wildSpawns.map(e=>({id:e.id,...earthGeo(e.position)}));
    const common=before.filter(a=>after.some(b=>b.id===a.id));assert.ok(common.length>5);
    for(const a of common){const b=after.find(b=>b.id===a.id);assert.ok(Math.abs(a.lon-b.lon)<1e-7);assert.ok(Math.abs(a.lat-b.lat)<1e-7);}
});

test('walking into and out of the Shenzhen footprint updates the same world and keeps story files lazy',async()=>{
    const {service,requests}=serviceHarness();const {world}=await service.prepare({lon:113.70,lat:22.54});assert.equal(world.earthRegion,null);assert.equal(world.layout.name,'22.540, 113.700');assert.ok(!requests.some(url=>url.includes('cities/shenzhen.json')));
    await service.update(earthPoint(113.9,22.54),1000);assert.equal(service.world,world);assert.equal(world.earthRegion,'shenzhen');assert.ok(world.npcs.length);assert.ok(!requests.some(url=>url.endsWith('dialogue.json')));
    await service.update(earthPoint(113.7,22.54),2000);assert.equal(service.world,world);assert.equal(world.earthRegion,null);assert.equal(world.layout.name,'22.540, 113.700');assert.equal(world.npcs.length,0);
});

test('procedural roads stop at water and unavailable terrain',()=>{
    const road={a:{x:0,y:0},b:{x:1000,y:0},width:70},terrain=x=>x<300?'grass':x<500?'water':x<750?'urban':null;
    const paths=landRoadSegments(road,terrain,24);assert.equal(paths.length,2);
    for(const path of paths)for(let x=path.a.x;x<=path.b.x;x+=5)assert.ok(['grass','urban'].includes(terrain(x)));
});

test('unknown terrain and water reject arrival without replacing the active world; retry recovers',async()=>{
    const {service}=serviceHarness();const {world}=await service.prepare({lon:0,lat:0});const tile=await service.tile('40_10');tile.types=['water'];
    await assert.rejects(service.prepare({lon:40.5,lat:10.5}),/安全陆地/);assert.equal(service.world,world);
    tile.types=['grass'];assert.equal((await service.prepare({lon:40.5,lat:10.5})).world.zone,'earth');
});

test('queued work has a hard limit and cancellation discards stale travel results',async()=>{
    const cache=new EarthCache({concurrency:1,maxQueue:2});let release;
    const a=cache.get('a',()=>new Promise(r=>release=r));const caught=a.catch(e=>e.message);await Promise.resolve();
    const b=cache.get('b',async()=>({})).catch(e=>e.message),c=cache.get('c',async()=>({})).catch(e=>e.message);
    await assert.rejects(cache.get('d',async()=>({})),/繁忙/);cache.cancelPending();release({});assert.match(await caught,/取消/);await Promise.all([b,c]);assert.equal(cache.entries.size,0);
    const {service}=serviceHarness(),pending=service.prepare({lon:114,lat:22});service.cancel();await assert.rejects(pending,/取消/);assert.equal(service.world,null);
});

test('cached chapter responses cannot restore story state after character cancellation',async()=>{
    const {service}=serviceHarness();await service.prepare({lon:114.0579,lat:22.5431});
    await service.story();assert.equal(service.chapter.id,'earth-shenzhen-united');
    const pending=service.story();service.cancel();
    await assert.rejects(pending,/取消城市章节/);assert.equal(service.chapter,null);assert.equal(service.world,null);
});

test('leaving an authored region clears its active chapter while re-entry reuses lazy content',async()=>{
    const {service,requests}=serviceHarness();await service.prepare({lon:114.0579,lat:22.5431});
    await service.story();const count=requests.filter(url=>url.endsWith('/cities/shenzhen.json')).length;
    await service.update(earthPoint(115,23),10000);assert.equal(service.chapter,null);
    await assert.rejects(service.story(),/没有城市章节/);
    await service.prepare({lon:114.0579,lat:22.5431});assert.equal(service.chapter.id,'earth-shenzhen-united');
    await service.story();assert.equal(service.chapter.id,'earth-shenzhen-united');
    assert.equal(requests.filter(url=>url.endsWith('/cities/shenzhen.json')).length,count);
});

test('production startup packs exclude every Earth file but keep individual lazy endpoints',()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'haqi-earth-pack-'));
    try{const input=path.join(root,'input'),output=path.join(root,'output');fs.mkdirSync(path.join(input,'adventure/earth/cities'),{recursive:true});fs.writeFileSync(path.join(input,'adventure/earth/cities/shenzhen.json'),'{"npcs":[]}');fs.writeFileSync(path.join(input,'adventure/chapter.json'),'{"version":1}');packageRuntimeData(input,output);assert.ok(!Object.keys(JSON.parse(fs.readFileSync(path.join(output,'adventure.json'))).files).some(k=>k.includes('/earth/')));assert.ok(fs.existsSync(path.join(output,'adventure/earth/cities/shenzhen.json')));}finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('a dungeon trip from Earth restores its local return point without sending it to cloud shards',()=>{
    const source=structuredClone(content);installDungeons(source,read('data/adventure/combat.json'),read('data/adventure/dungeons.json'),read('data/kids/cards.json'));
    const save=createAdventure(source);save.zone='earth';save.position=earthPoint(114.0579,22.5431);const position={...save.position};
    enterDungeon(save,source,'dungeon:HaqiTown_FireCavern');const cloud=durableSave(save);assert.equal(cloud.zone,'camp');assert.equal(cloud.dungeonReturn,null);
    const local=parseSave(JSON.stringify(restoreRuntime(cloud,source,runtimeValues(save))),source);leaveDungeon(local,source);assert.equal(local.zone,'earth');assert.deepEqual(local.position,position);
    assert.equal(parseSave(JSON.stringify(restoreRuntime(cloud,source)),source).zone,'camp');
});

test('streaming preserves the current buildings and painter until replacement art is ready',async()=>{
    let blocked=false,release,entered;const hold=new Promise(r=>release=r),reached=new Promise(r=>entered=r);
    const {service}=serviceHarness({beforeFetch:async url=>{if(blocked&&url.endsWith('/city-art.json')){entered();await hold;}}});
    const {world,position}=await service.prepare({lon:-73.985,lat:40.758});
    const buildings=world.buildings,draw=()=>true;world.drawEarthBuilding=draw;
    service.cache.entries.delete('data/adventure/earth/city-art.json');blocked=true;
    const task=service.update({...position,x:position.x+1000},10000);await reached;
    assert.equal(world.buildings,buildings);assert.equal(world.drawEarthBuilding,draw);
    release();await task;assert.equal(world.buildings,buildings);assert.notEqual(world.drawEarthBuilding,draw);service.cancel();
});


test('snow and crop scenes generate their actual biome details reproducibly',async()=>{
    for(const terrainType of ['snow','crops']){
        const {service}=serviceHarness({terrainType,cityCsv:'wikiDataId,name,country_name,lat,lon,native_name\n'});
        const first=await service.prepare({lon:0,lat:60});
        const trees=structuredClone(first.world.trees);
        assert.ok(trees.length>0);
        if(terrainType==='snow'){
            assert.ok(trees.every(t=>t.snow));
            for(const variant of ['snowTree','snowRock','snowMound'])assert.ok(trees.some(t=>t.earthDecoVariant===variant));
        }else assert.ok(trees.some(t=>t.earthDecoVariant==='wheat'));
        const second=await service.prepare({lon:0,lat:60});
        assert.deepEqual(second.world.trees,trees);
        service.cancel();
    }
});
