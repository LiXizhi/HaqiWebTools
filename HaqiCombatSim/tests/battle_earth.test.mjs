import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {earthPoint,earthGeo,earthRules,terrainKey,cityKey,parseEarthCities,generateEarthCity,earthSafe,earthChapterEvent,earthEncounter,landRoadSegments} from '../js/adventure_earth_core.js';
import {createEarthService,EarthCache} from '../js/adventure_earth.js';
import {walkable,movePosition,findPath} from '../js/adventure_world_core.js';
import {createAdventure,parseSave,beginEncounter,recordDecision,settleEncounter} from '../js/adventure_core.js';
import {restorePveBattle,playPveRound} from '../js/combat_pve_core.js';
import {SimpleBot} from '../js/combat_policy_core.js';
import {installDungeons,enterDungeon,leaveDungeon} from '../js/adventure_dungeons_core.js';
import {packageRuntimeData} from '../scripts/package_runtime_data.mjs';
import {createWorldMapSwitch} from '../js/view_adventure_controls.js';
import {recordLearningCompletion} from '../js/language_adventure_core.js';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {durableSave,runtimeValues,restoreRuntime} from '../js/adventure_storage_core.js';
const read=file=>JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url)));
const content=read('data/adventure/chapter.json');
content.worldMaps=Object.fromEntries(Object.entries(content.worldMapIndex.islands).map(([id,info])=>[id,read(info.file)]));
function serviceHarness(){
    const requests=[],source=structuredClone(content);
    const fetcher=async url=>{requests.push(url);if(url.startsWith('data/')){const data=read(url);if(url.endsWith('/art.json'))data.atlas=null;return {ok:true,json:async()=>data};}
        if(url.endsWith('.png'))return {ok:true,blob:async()=>({})};
        if(url.includes('.csv'))return {ok:true,text:async()=> 'wikiDataId,name,country_name,lat,lon,native_name\nQ60,纽约,美国,40.758,-73.985,New York\nQ15174,深圳,中国,22.5431,114.0579,深圳'};
        throw Error('Unexpected request '+url);
    };
    const service=createEarthService({content:source,fetcher,decode:async(blob,palette,key)=>({key,width:2,height:2,indices:new Uint8Array([0,0,0,0]),types:['grass'],bytes:20})});
    return {service,requests,source};
}
test('Earth service construction and importing scene rules perform zero network requests',()=>{
    const {requests,service}=serviceHarness();assert.deepEqual(requests,[]);assert.equal(service.world,undefined);
    const boot=fs.readFileSync(new URL('../js/adventure_assets.js',import.meta.url),'utf8');assert.ok(!boot.includes('data/adventure/earth/'));
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
    const art=read('data/adventure/earth/shenzhen/art.json'),bytes=fs.readFileSync(new URL('../'+art.local,import.meta.url));
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
    const {service,requests}=serviceHarness();await service.atlas();assert.ok(!requests.some(url=>url.includes('shenzhen/')));await service.viewport({center:{lon:114,lat:22},span:2,height:1});assert.ok(!requests.some(url=>/npcs|quests|dialogue|art.json/.test(url)));assert.ok(requests.filter(url=>url.includes('terrain_')).length<=6);
});
test('arrival loads Shenzhen pieces separately; dialogue/quests wait for interaction',async()=>{
    const {service,requests}=serviceHarness();const result=await service.prepare({lon:114.0579,lat:22.5431});assert.equal(result.world.zone,'earth');assert.ok(result.world.npcs.length);assert.ok(requests.some(url=>url.endsWith('roads.json')));assert.ok(!requests.some(url=>url.endsWith('quests.json')));await service.story();assert.ok(requests.some(url=>url.endsWith('quests.json')));assert.ok(requests.some(url=>url.endsWith('dialogue.json')));
});
test('unpolished cities use real city positions and never request Shenzhen content',async()=>{
    const {service,requests}=serviceHarness();const {world}=await service.prepare({lon:-73.985,lat:40.758});assert.ok(world.buildings.length>0);assert.equal(world.npcs.length,0);assert.ok(!requests.some(url=>url.includes('shenzhen/')));assert.equal(world.earthRegion,null);
});
test('navigation is local and missing terrain is blocked, never fabricated',async()=>{
    const {service}=serviceHarness();const {world,position}=await service.prepare({lon:0,lat:0});assert.equal(walkable(world,position.x,position.y),true);assert.equal(walkable(world,earthPoint(100,30).x,earthPoint(100,30).y),false);assert.deepEqual(findPath(world,position,{x:position.x+50000,y:position.y}),[]);assert.notDeepEqual(movePosition(world,position,20,0),position);
});
test('monster spawns leave roads, buildings and residents outside their full territory',async()=>{
    const {service}=serviceHarness();const {world}=await service.prepare({lon:-73.985,lat:40.758});for(const monster of world.encounters)assert.equal(earthSafe(world,monster,world.earthRules.monsterClearance),false);
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
    const save=createAdventure(content),quests=read('data/adventure/earth/shenzhen/quests.json'),inventory=structuredClone(save.inventory);assert.equal(earthChapterEvent(save,quests,'clues'),false);assert.equal(earthChapterEvent(save,quests,'arrival'),true);assert.equal(earthChapterEvent(save,quests,'arrival'),false);for(const event of ['memory','clues','defense','return'])assert.equal(earthChapterEvent(save,quests,event),true);assert.equal(save.earthProgress.step,5);assert.deepEqual(save.inventory,inventory);
});
test('Earth encounters resolve existing monsters and reject invalid identities',()=>{
    assert.equal(earthEncounter(content,'earth:not-existing:1:2:0'),null);assert.equal(earthEncounter(content,'earth:water-bubble:1:2:0').monster,content.monsters['water-bubble']);const save=createAdventure(content);save.zone='earth';save.position=earthPoint(1,2);beginEncounter(save,content,'earth:water-bubble:1:2:0');assert.ok(save.pendingEncounter);
});

test('arrival-to-defense chapter replays its real battle, preserves the pet, and deduplicates rewards',async()=>{
    const {service,source}=serviceHarness(),quests=read('data/adventure/earth/shenzhen/quests.json');
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
    const {service}=serviceHarness();const before=(await service.prepare({lon:179.999,lat:0})).world.encounters.map(e=>({id:e.id,...earthGeo(e)}));
    const after=(await service.prepare({lon:-179.999,lat:0})).world.encounters.map(e=>({id:e.id,...earthGeo(e)}));
    const common=before.filter(a=>after.some(b=>b.id===a.id));assert.ok(common.length>5);
    for(const a of common){const b=after.find(b=>b.id===a.id);assert.ok(Math.abs(a.lon-b.lon)<1e-7);assert.ok(Math.abs(a.lat-b.lat)<1e-7);}
});

test('walking into and out of the Shenzhen footprint updates the same world and keeps story files lazy',async()=>{
    const {service,requests}=serviceHarness();const {world}=await service.prepare({lon:113.70,lat:22.54});assert.equal(world.earthRegion,null);assert.ok(!requests.some(url=>url.includes('shenzhen/')));
    await service.update(earthPoint(113.9,22.54),1000);assert.equal(service.world,world);assert.equal(world.earthRegion,'shenzhen');assert.ok(world.npcs.length);assert.ok(!requests.some(url=>url.endsWith('dialogue.json')));
    await service.update(earthPoint(113.7,22.54),2000);assert.equal(service.world,world);assert.equal(world.earthRegion,null);assert.equal(world.npcs.length,0);
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
    await service.story();const count=requests.filter(url=>url.endsWith('/quests.json')).length;
    await service.update(earthPoint(115,23),10000);assert.equal(service.chapter,null);
    await assert.rejects(service.story(),/没有城市章节/);
    await service.prepare({lon:114.0579,lat:22.5431});assert.equal(service.chapter,null);
    await service.story();assert.equal(service.chapter.id,'earth-shenzhen-united');
    assert.equal(requests.filter(url=>url.endsWith('/quests.json')).length,count);
});

test('production startup packs exclude every Earth file but keep individual lazy endpoints',()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'haqi-earth-pack-'));
    try{const input=path.join(root,'input'),output=path.join(root,'output');fs.mkdirSync(path.join(input,'adventure/earth/shenzhen'),{recursive:true});fs.writeFileSync(path.join(input,'adventure/earth/shenzhen/npcs.json'),'{"npcs":[]}');fs.writeFileSync(path.join(input,'adventure/chapter.json'),'{"version":1}');packageRuntimeData(input,output);assert.ok(!Object.keys(JSON.parse(fs.readFileSync(path.join(output,'adventure.json'))).files).some(k=>k.includes('/earth/')));assert.ok(fs.existsSync(path.join(output,'adventure/earth/shenzhen/npcs.json')));}finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('a dungeon trip from Earth restores its local return point without sending it to cloud shards',()=>{
    const source=structuredClone(content);installDungeons(source,read('data/adventure/combat.json'),read('data/adventure/dungeons.json'),read('data/kids/cards.json'));
    const save=createAdventure(source);save.zone='earth';save.position=earthPoint(114.0579,22.5431);const position={...save.position};
    enterDungeon(save,source,'dungeon:HaqiTown_FireCavern');const cloud=durableSave(save);assert.equal(cloud.zone,'camp');assert.equal(cloud.dungeonReturn,null);
    const local=parseSave(JSON.stringify(restoreRuntime(cloud,source,runtimeValues(save))),source);leaveDungeon(local,source);assert.equal(local.zone,'earth');assert.deepEqual(local.position,position);
    assert.equal(parseSave(JSON.stringify(restoreRuntime(cloud,source)),source).zone,'camp');
});
