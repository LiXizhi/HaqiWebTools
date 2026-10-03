import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {geoToStreet,polygonContains,streetWalkable,createStreetMotion,stepStreetMotion,validateStreetscape,safeStreetPosition,routeLength,routePose} from '../js/adventure_city_street_core.js';
import {importPlaceGeometry,clipLine,clipPolygon} from '../js/adventure_place_import_core.js';
import {emptyStreet,rectangle} from '../js/adventure_city_street_layout_core.js';
import {generateCityDungeon,generatedCityRoute} from '../js/adventure_city_generated_core.js';
import {createCityDungeonLoader} from '../js/adventure_city_dungeons.js';
import {createAdventure} from '../js/adventure_core.js';
import {installCityDungeons,enterCityDungeon} from '../js/adventure_city_dungeons_core.js';
import {createWorld,findPath,clearSegment} from '../js/adventure_world_core.js';
import {createStreetPainter} from '../js/view_city_street.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const city=read('data/adventure/earth/cities/shenzhen.json');
test('street ground cache stays within 24 MiB and reuses a wide zoomed-out view',()=>{
    const made=[],ctx=new Proxy({}, {get:()=>()=>{}}),painter=createStreetPainter({content:{}},{makeCanvas:()=>{const canvas={width:0,height:0,getContext:()=>ctx};made.push(canvas);return canvas;}});
    const street=emptyStreet(),world={w:9000,h:9000,city:{},dungeon:{id:'test',scene:{streetscape:street}}},rect={x:100,y:100,w:7500,h:6500};
    painter.ground(ctx,world,rect);const warm=made.length;
    assert.ok(painter.stats().tiles<=24);assert.ok(painter.stats().bytes<=24*512*512*4);assert.ok(painter.stats().tileSize>512);
    for(let i=0;i<120;i++)painter.ground(ctx,world,{...rect,x:100+i*.1});assert.equal(made.length,warm);
    painter.ground(ctx,world,{x:10,y:10,w:600,h:600});assert.ok(made.slice(0,warm).every(c=>c.width===0));
    painter.reset();assert.equal(painter.stats().bytes,0);assert.ok(made.every(c=>c.width===0));
});
function setup(){const c=read('data/adventure/chapter.json');c.worldMaps={camp:read(c.worldMapIndex.islands.camp.file)};c.dungeons=[];c.cityStreetArt=read('data/adventure/earth/street-art.json');const save=createAdventure(c,{seed:42});save.zone='earth';return {c,save};}
test('geographic meters preserve local position and clip segments without invented edge roads',()=>{
    const origin={lon:114,lat:22,meters:300,unitsPerMeter:16};assert.deepEqual(geoToStreet(114,22,origin),{x:2400,y:2400});
    const p=geoToStreet(114,22+180/Math.PI/6378137,origin);assert.ok(Math.abs(p.y-2384)<.0001);
    assert.deepEqual(clipLine([{x:-10,y:20},{x:110,y:20}],100),[[{x:0,y:20},{x:100,y:20}]]);
    assert.equal(clipLine([{x:-10,y:20},{x:-10,y:80}],100).length,0);
    assert.ok(clipPolygon(rectangle(-10,-10,50,50),100).every(p=>p.x>=0&&p.y>=0));
});
test('polygon collision includes feet, water, narrow passages and safe old-position recovery',()=>{
    const scene={map:{w:600,h:600,spawn:{x:100,y:100},exit:{x:100,y:550},obstacles:[]},streetscape:emptyStreet()};
    scene.streetscape.colliders=[{id:'house',points:rectangle(200,100,100,200)},{id:'water',points:[{x:330,y:100},{x:500,y:100},{x:500,y:300},{x:330,y:300}]}];
    assert.equal(streetWalkable(scene,250,150),false);assert.equal(streetWalkable(scene,195,150),false);assert.equal(streetWalkable(scene,315,150),true);assert.equal(streetWalkable(scene,400,150),false);
    assert.ok(streetWalkable(scene,...Object.values(safeStreetPosition(scene,{x:250,y:150}))));
});
test('traffic stops at red and for the player, resumes at green and freezes under reduced motion',()=>{
    const street=emptyStreet();street.signals=[{id:'light',x:300,y:300,period:10,green:4,offset:5}];street.routes=[{id:'road',kind:'vehicle',points:[{x:100,y:300},{x:500,y:300}],speed:50,count:1,stops:[{signal:'light',distance:100}]}];
    const state=createStreetMotion(street);state.actors[0].distance=99;stepStreetMotion(state,street,.1,null);assert.equal(state.actors[0].distance,99);
    state.time=5;stepStreetMotion(state,street,.1,null);assert.equal(state.actors[0].distance,104);
    const next=routePose(street.routes[0],state.actors[0].distance+48);stepStreetMotion(state,street,.1,next);assert.equal(state.actors[0].distance,104);
    const frozen=JSON.stringify(state);stepStreetMotion(state,street,.1,null,{reducedMotion:true});assert.equal(JSON.stringify(state),frozen);
});
test('both real Shenzhen pilots have source-traceable geometry and every interactive point is reachable',()=>{
    const {c,save}=setup();installCityDungeons(c,city);
    for(const node of city.nodes.filter(n=>['nantou','bay'].includes(n.id))){save.zone='earth';save.dungeonReturn=null;enterCityDungeon(save,c,node.dungeon.id);const world=createWorld(save.zone,c,save),scene=node.dungeon;validateStreetscape(scene);
        assert.equal(scene.streetscape.provenance.kind,'osm-derived');assert.equal(world.npcs.length,6);assert.ok(scene.streetscape.roads.length>20);
        for(const route of scene.streetscape.routes)for(let distance=80;distance<routeLength(route.points)-80;distance+=16){const p=routePose(route,distance);assert.ok(streetWalkable(scene,p.x,p.y,route.kind==='vehicle'?25:8),`${node.id}: route crosses obstacle ${route.id}`);}
        for(const point of [...scene.npcs,...scene.hotspots,...scene.encounters,scene.map.exit]){const path=findPath(world,save.position,point);assert.ok(path.length,`${node.id}: inaccessible ${point.id||'exit'}`);let previous=save.position;for(const p of path){assert.ok(clearSegment(world,previous,p));previous=p;}assert.ok(Math.hypot(previous.x-point.x,previous.y-point.y)<24,`${node.id}: did not reach ${point.id}`);}
    }
});
test('new default streets are deterministic and populated while legacy checkpoint geometry remains unchanged',()=>{
    const {c,save}=setup(),route=generatedCityRoute({id:'v2',name:'测试城市',lon:114,lat:22},save),a=generateCityDungeon(c,route),b=generateCityDungeon(c,route);assert.deepEqual(a,b);assert.equal(a.city.nodes[0].dungeon.npcs.length,6);
    assert.equal(a.city.nodes[0].dungeon.streetscape.version,1);const legacy=generateCityDungeon(c,{...route,generationVersion:undefined});assert.equal(legacy.city.nodes[0].dungeon.streetscape,undefined);assert.equal(legacy.city.nodes[0].dungeon.map.w,1260);
});
test('art IO failure preserves playable streets and cancellation does not install content',async()=>{
    const {c,save}=setup();delete c.cityStreetArt;const route=generatedCityRoute({id:'v2',name:'测试城市',lon:114,lat:22},save),id='city:generated-v2:default';let current=true;
    const loader=createCityDungeonLoader({content:c,readJson:async()=>{current=false;return read('data/adventure/earth/street-art.json');}});
    await assert.rejects(loader.load(id,{cityFallback:route,isCurrent:()=>current}),/取消/);assert.equal(c.dungeons.length,0);assert.equal(c.cityStreetArt,undefined);
    const offline=createCityDungeonLoader({content:c,readJson:async()=>{throw Error('offline');}});await offline.load(id,{cityFallback:route});assert.ok(c.dungeons.find(d=>d.id===id)?.scene.streetscape);
});
test('imports retain provenance and explicitly report unsupported geometry and inferred widths',()=>{
    const result=importPlaceGeometry(read('scripts/sources/places/nantou.osm.json'),{lon:113.9157,lat:22.5454,meters:300,unitsPerMeter:16},{style:'old'});
    assert.ok(result.report.buildings>=60);assert.ok(result.report.roads>=20);assert.ok(result.report.inferredWidths.length);assert.ok(result.streetscape.objects.every(b=>b.sourceId.startsWith('osm:way:')));
});
