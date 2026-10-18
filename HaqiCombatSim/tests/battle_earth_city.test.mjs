import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {isOcean} from '../js/adventure_fishing_core.js';
import {earthRules,earthGeo,earthLandmarkSize,placeEarthLandmark,distanceToRoad} from '../js/adventure_earth_core.js';
import {earthCityProfile,earthCitySpriteRect,generateEarthUrbanChunk,generateEarthUrbanRoads} from '../js/adventure_earth_city_core.js';
import {buildEarthScene} from '../js/adventure_earth_scene_core.js';
import {earthPoint} from '../js/adventure_earth_core.js';
const rules=earthRules();
test('world scenes retain authored Shenzhen landmarks and natural trees without scattered buildings',()=>{
    const city=JSON.parse(fs.readFileSync(new URL('../data/adventure/earth/cities/shenzhen.json',import.meta.url)));
    const landmark=city.buildings[0],p=earthPoint(landmark.lon,landmark.lat,rules);
    const target={isEarth:true,w:360*rules.unitsPerDegree,h:180*rules.unitsPerDegree,earthRules:rules,portal:{},layout:{},revision:0};
    const auth={row:{id:city.id,name:city.name},city,art:city.art.landmarks,buildings:{buildings:city.buildings},npcs:{npcs:[]},encounters:{encounters:[],safeAreas:[]}};
    const steps=buildEarthScene({target,p,cityRows:[],auth,rules,content:{},species:[],typeAt:()=> 'urban',playerLevel:4});
    while(!steps.next().done){}
    assert.ok(target.buildings.some(b=>b.id===landmark.id&&b.earthFrame===landmark.frame));
    assert.ok(target.buildings.every(b=>b.earthFrame!==undefined||b.earthCityAtlas==='street'));
    assert.ok(target.trees.length>0);
});
test('landmarks preserve source aspect ratio and move completely clear of roads',()=>{
    const size=earthLandmarkSize({w:300,h:350},[530,0,238,275]);assert.equal(size.w/size.h,238/275);
    const building={id:'tower',x:500,y:500,...size},roads=[{a:{x:500,y:-2000},b:{x:500,y:2000},width:85}];
    const placed=placeEarthLandmark(building,roads,()=> 'urban',rules);assert.ok(placed);
    assert.ok(distanceToRoad({x:placed.x,y:placed.y-placed.h/2},roads[0])>=Math.hypot(placed.w,placed.h)/2+85/2+rules.landmarkRoadClearance);
    assert.deepEqual(placed,placeEarthLandmark(building,roads,()=> 'urban',rules));
    assert.equal(placeEarthLandmark(building,roads,()=> 'ocean',rules),null);
});
test('city atlases contain sixteen valid crops each and meet WebP budget',()=>{
    const manifest=JSON.parse(fs.readFileSync(new URL('../data/adventure/earth/city-art.json',import.meta.url)));
    for(const key of ['buildings','street']){const art=manifest[key],bytes=fs.readFileSync(new URL('../'+art.local,import.meta.url));assert.ok(bytes.length<=200000);assert.equal(bytes.length,art.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),art.sha256);assert.equal(art.frames.length,16);for(const [x,y,w,h]of art.frames){assert.ok(x>=0&&y>=0&&x+w<=art.width&&y+h<=art.height);}assert.match(art.cdn,/^https:\/\/cdn.keepwork.com\//);}
});
test('Earth land, water and unknown chunks never start fishing',()=>{
    for(const type of ['grass','urban','forest','crops','barren','ocean','water',null])assert.equal(isOcean({isEarth:true,h:1000,layout:{coast:[]},terrainAt:()=>type},100,100),false,type);
});
test('urban scatter preserves street greenery and furniture but never generates large buildings',()=>{
    const city={id:'test',...earthGeo({x:1500,y:1500},rules)};
    const small=generateEarthUrbanChunk(1,1,[{...city,population:1000}],rules,()=> 'urban');
    const large=generateEarthUrbanChunk(1,1,[{...city,population:12000000}],rules,()=> 'urban');
    assert.ok(large.length>small.length);assert.ok(earthCityProfile(12000000,rules).frames.includes(0));
    const districtObjects=Array.from({length:9},(_,x)=>generateEarthUrbanChunk(x,1,[{...city,population:12000000}],rules,()=> 'urban')).flat();assert.ok(districtObjects.length);assert.ok([...small,...large,...districtObjects].every(b=>b.earthCityAtlas==='street'&&b.decorationOnly));
    assert.ok(!earthCityProfile(0,rules).frames.includes(0));assert.ok(large.length<=2*rules.cityCellsPerChunk**2);
});
test('urban generation is deterministic, wraps the date line and respects terrain and exclusions',()=>{
    const generate=(x,sample=()=> 'urban',blocked)=>generateEarthUrbanChunk(x,1,[],rules,sample,blocked);
    assert.deepEqual(generate(1),generate(1));
    for(const type of ['forest','water','ocean',null])assert.deepEqual(generate(1,()=>type),[]);
    assert.deepEqual(generate(1,()=> 'urban',()=>true),[]);
    const a=generate(0),b=generate(360*rules.unitsPerDegree/rules.chunkSize);
    assert.deepEqual(a.map(o=>o.id),b.map(o=>o.id));
    assert.deepEqual(a.map(o=>o.earthCityFrame),b.map(o=>o.earthCityFrame));
});

test('district roads align with block boundaries and never cross unavailable terrain',()=>{
    const roads=generateEarthUrbanRoads(1,1,rules,()=> 'urban');assert.equal(roads.length,4);
    assert.ok(roads.every(r=>r.urban&&(r.a.x%rules.cityBlockSize===0||r.a.y%rules.cityBlockSize===0)));
    assert.deepEqual(generateEarthUrbanRoads(1,1,rules,()=>null),[]);
    assert.deepEqual(generateEarthUrbanRoads(1,1,rules,()=> 'urban',()=>true),[]);
    const objects=Array.from({length:12},(_,x)=>generateEarthUrbanChunk(x,1,[],rules,()=> 'urban')).flat();
    assert.ok(objects.some(b=>b.district==='park'));assert.ok(objects.some(b=>b.id.startsWith('earth-street:')));assert.ok(objects.every(b=>b.earthCityAtlas==='street'));
});

test('measured city crops keep their aspect ratio and ground anchor',()=>{
    const manifest=JSON.parse(fs.readFileSync(new URL('../data/adventure/earth/city-art.json',import.meta.url)));
    // The first high-rise extends below the former 192px cell; bamboo begins above 320px.
    assert.ok(manifest.buildings.frames[0][1]+manifest.buildings.frames[0][3]>192);
    assert.ok(manifest.street.frames[8][1]<320);
    for(const art of [manifest.buildings,manifest.street])for(const frame of art.frames){
        const [x,y,w,h]=earthCitySpriteRect({x:500,y:600,w:140,h:140},frame);
        assert.ok(Math.abs(w/h-frame[2]/frame[3])<1e-10);
        assert.equal(x+w/2,500);assert.equal(y+h,600);assert.ok(w<=140&&h<=140);
    }
});
