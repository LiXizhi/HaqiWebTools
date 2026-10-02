import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {isOcean} from '../js/adventure_fishing_core.js';
import {earthRules,earthGeo,earthLandmarkSize,placeEarthLandmark,distanceToRoad} from '../js/adventure_earth_core.js';
import {earthCityProfile,generateEarthUrbanChunk,generateEarthUrbanRoads} from '../js/adventure_earth_city_core.js';
const rules=earthRules();
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
test('Earth land clicks do not start fishing; unknown chunks are not water',()=>{
    for(const type of ['grass','urban','forest','crops','barren',null])assert.equal(isOcean({isEarth:true,h:1000,layout:{coast:[]},terrainAt:()=>type},100,100),false,type);
    for(const type of ['ocean','water'])assert.equal(isOcean({isEarth:true,h:1000,terrainAt:()=>type},100,100),true);
});
test('population increases city density and unlocks high-rise families',()=>{
    const city={id:'test',...earthGeo({x:1500,y:1500},rules)};
    const small=generateEarthUrbanChunk(1,1,[{...city,population:1000}],rules,()=> 'urban');
    const large=generateEarthUrbanChunk(1,1,[{...city,population:12000000}],rules,()=> 'urban');
    assert.ok(large.length>small.length);assert.ok(earthCityProfile(12000000,rules).frames.includes(0));
    const districtObjects=Array.from({length:9},(_,x)=>generateEarthUrbanChunk(x,1,[{...city,population:12000000}],rules,()=> 'urban')).flat();assert.ok(districtObjects.some(b=>b.district==='commercial'&&b.earthCityFrame<4));
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
    assert.ok(objects.some(b=>b.district==='park'));assert.ok(objects.some(b=>b.district==='residential'));assert.ok(objects.filter(b=>b.district==='park').every(b=>b.earthCityAtlas==='street'));
});
