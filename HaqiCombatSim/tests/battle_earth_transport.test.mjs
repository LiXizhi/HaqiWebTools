import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {earthRules,earthGeo} from '../js/adventure_earth_core.js';
import {generateEarthUrbanRoads} from '../js/adventure_earth_city_core.js';
import {createEarthSettlementSampler,generateEarthCityConnections} from '../js/adventure_earth_transport_core.js';
const rules=earthRules(),city={id:'ordinary-city',population:50000,...earthGeo({x:500,y:500},rules)};
test('cities without authored regions gain roads even on coarse grass classification',()=>{
    const sample=createEarthSettlementSampler(()=> 'grass',[city],rules);
    assert.equal(sample(500,500),'urban');assert.equal(sample(4000,4000),'grass');assert.ok(generateEarthUrbanRoads(0,0,rules,sample).length);
    for(const type of [null,'water','ocean','forest'])assert.equal(createEarthSettlementSampler(()=>type,[city],rules)(500,500),type);
});
test('nearby real city coordinates gain curved deterministic roads, never railway tracks',()=>{
    const cities=[city,{id:'neighbour',...earthGeo({x:1800,y:1200},rules)},{id:'remote',...earthGeo({x:60000,y:1000},rules)}];
    const roads=generateEarthCityConnections(cities,{x:500,y:500},3000,rules,()=> 'grass');
    assert.ok(roads.length>2);assert.ok(roads.every(r=>r.connection&&!r.id.includes('remote')));
    assert.deepEqual(roads,generateEarthCityConnections([...cities].reverse(),{x:500,y:500},3000,rules,()=> 'grass'));
    assert.ok(new Set(roads.map(r=>((r.b.y-r.a.y)/(r.b.x-r.a.x)).toFixed(3))).size>2);
    for(const sample of [()=>null,()=> 'ocean',()=> 'water'])assert.equal(generateEarthCityConnections(cities,{x:500,y:500},3000,rules,sample).length,0);
    assert.equal(generateEarthCityConnections(cities,{x:500,y:500},3000,rules,()=> 'grass',()=>true).length,0);
});

test('transit atlas keeps eight valid crops, provenance and the WebP budget',()=>{
    const art=JSON.parse(fs.readFileSync(new URL('../data/adventure/earth/city-art.json',import.meta.url))).transport;
    const bytes=fs.readFileSync(new URL('../'+art.local,import.meta.url));assert.ok(bytes.length<=200000);assert.equal(bytes.length,art.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),art.sha256);assert.equal(art.frames.length,8);assert.ok(art.sourceSha256);
    for(const [x,y,w,h] of art.frames)assert.ok(x>=0&&y>=0&&x+w<=art.width&&y+h<=art.height);
});

test('connection remains visible between cities outside the active viewport',()=>{
    const cities=[{id:'west',...earthGeo({x:1000,y:1000},rules)},{id:'east',...earthGeo({x:9000,y:1000},rules)}];
    const roads=generateEarthCityConnections(cities,{x:5000,y:1000},600,rules,()=> 'grass');
    assert.ok(roads.length);assert.ok(roads.every(r=>[r.a,r.b].every(p=>p.x>=4400&&p.x<=5600&&p.y>=400&&p.y<=1600)));
});

test('dense city triangles retain short links instead of overlapping redundant routes',()=>{
    const cities=[['a',500,500],['b',1100,500],['c',1400,900]].map(([id,x,y])=>({id,...earthGeo({x,y},rules)}));
    const roads=generateEarthCityConnections(cities,{x:1000,y:700},3000,rules,()=> 'grass');
    const links=new Set(roads.map(r=>r.id.split(':')[1]));
    assert.deepEqual([...links].sort(),['a|b','b|c']);
    assert.deepEqual(roads,generateEarthCityConnections([...cities].reverse(),{x:1000,y:700},3000,rules,()=> 'grass'));
});

const roadLinks=roads=>[...new Set(roads.map(r=>r.id.split(':')[1]))].sort();
function positionedCities(rows){return rows.map(([id,x,y])=>({id,...earthGeo({x:10000+x,y:10000+y},rules)}));}

test('nearby tight city clusters join with one short connector, not isolated nearest-neighbour networks',()=>{
    const cities=positionedCities([['a',0,0],['b',200,0],['c',400,0],['d',2000,0],['e',2200,0],['f',2400,0]]);
    const center={x:11200,y:10000};
    const roads=generateEarthCityConnections(cities,center,5000,rules,()=> 'grass');
    assert.deepEqual(roadLinks(roads),['a|b','b|c','c|d','d|e','e|f']);
    assert.deepEqual(roads,generateEarthCityConnections([...cities].reverse(),center,5000,rules,()=> 'grass'));
});

test('a chain connects farther cities through intermediate cities without long shortcuts',()=>{
    const cities=positionedCities([['a',0,0],['b',2000,0],['c',4000,0],['d',8000,0]]);
    const roads=generateEarthCityConnections(cities,{x:14000,y:10000},6000,{...rules,cityConnectionDistance:2500},()=> 'grass');
    assert.deepEqual(roadLinks(roads),['a|b','b|c']);
});

test('equal-distance city grid stays sparse and connected without depending on input order',()=>{
    const cities=positionedCities(Array.from({length:25},(_,i)=>[String(i),i%5*400,Math.floor(i/5)*400]));
    const center={x:10800,y:10800},roads=generateEarthCityConnections(cities,center,4000,rules,()=> 'grass'),links=roadLinks(roads);
    assert.ok(links.length<=40,'no diagonal shortcuts or all-pairs mesh');
    const seen=new Set(['0']);
    for(let i=0;i<cities.length;i++)for(const link of links){const [a,b]=link.split('|');if(seen.has(a)||seen.has(b)){seen.add(a);seen.add(b);}}
    assert.equal(seen.size,cities.length);
    assert.deepEqual(roads,generateEarthCityConnections([...cities].reverse(),center,4000,rules,()=> 'grass'));
});

test('joining clusters keeps short bridges but does not invent crossings over oceans or wide rivers',()=>{
    const cities=positionedCities([['a',0,0],['b',200,0],['c',400,0],['d',2000,0],['e',2200,0],['f',2400,0]]);
    const center={x:11200,y:10000},straight={...rules,cityConnectionBend:0};
    const narrow=x=>x>11000&&x<11200?'water':'grass';
    const bridged=generateEarthCityConnections(cities,center,5000,straight,narrow);
    assert.ok(bridged.some(r=>r.bridge&&r.id.includes('c|d')));
    for(const sample of [x=>x>10800&&x<11600?'water':'grass',x=>x>11000&&x<11200?'ocean':'grass',x=>x>11000&&x<11200?null:'grass']){
        const roads=generateEarthCityConnections(cities,center,5000,straight,sample);
        assert.ok(!roads.some(r=>r.bridge));
        assert.ok(!roads.some(r=>Math.min(r.a.x,r.b.x)<11100&&Math.max(r.a.x,r.b.x)>11100));
    }
});
