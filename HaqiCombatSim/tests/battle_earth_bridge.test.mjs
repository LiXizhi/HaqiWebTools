import test from 'node:test';
import assert from 'node:assert/strict';
import {earthRoadCrossings,earthRoadBridges} from '../js/adventure_earth_bridge_core.js';
import {earthRules,earthGeo,earthWalkable} from '../js/adventure_earth_core.js';
import {generateEarthCityConnections} from '../js/adventure_earth_transport_core.js';
import {onBridge} from '../js/adventure_bridge_core.js';
const rules=earthRules(),route=Array.from({length:10},(_,i)=>({id:`road:${i}`,a:{x:i*120,y:500},b:{x:(i+1)*120,y:500},width:52}));
const river=(x,y)=>x>=480&&x<=720?'water':'urban';

test('short river crossing spans multiple road segments and is walkable only on the bridge',()=>{
    const paths=earthRoadCrossings(route,river,rules),bridges=earthRoadBridges(paths);
    assert.ok(bridges.length>=2);assert.deepEqual(paths,earthRoadCrossings(route,river,rules));
    const world={h:2000,terrainAt:river,paths,buildings:[]};
    for(let x=450;x<=750;x+=3){
        assert.equal(earthWalkable(world,x,500),true,`connected deck at ${x}`);
        if(river(x,500)==='water')assert.ok(bridges.some(b=>onBridge(b,x,500)));
    }
    assert.equal(earthWalkable(world,600,550),false);
    const shortDeck={id:'short',a:{x:580,y:500},b:{x:620,y:500},width:52,bridge:true};
    assert.equal(earthWalkable({...world,paths:[shortDeck]},630,500),false,'bridge ends have no invisible round collision cap');
    assert.equal(earthWalkable({...world,paths:paths.map(r=>({...r,bridge:false}))},600,500),false);
});

test('oblique bridge decks follow the road and leave water beside them blocked',()=>{
    const road={id:'diagonal',a:{x:100,y:100},b:{x:900,y:900},width:52};
    const sample=x=>x>=440&&x<=560?'water':'grass',paths=earthRoadCrossings([road],sample,rules);
    const world={h:2000,terrainAt:sample,paths,buildings:[]};
    assert.ok(paths.some(r=>r.bridge));
    for(let x=400;x<=600;x+=4)assert.equal(earthWalkable(world,x,x),true);
    assert.equal(earthWalkable(world,500,560),false);
    assert.ok(earthRoadBridges(paths).every(b=>Math.abs(b.angle-Math.PI/4)<1e-10));
});

test('wide water, ocean, unloaded banks and water at route ends do not gain bridges',()=>{
    for(const sample of [x=>x>=240&&x<=960?'water':'urban',x=>x>=480&&x<=720?'ocean':'urban',x=>x<480?null:x<=720?'water':'urban',x=>x<=720?'water':'urban',x=>x>=480?'water':'urban']){
        assert.equal(earthRoadCrossings(route,sample,rules).filter(r=>r.bridge).length,0);
    }
    assert.equal(earthRoadCrossings(route,river,{...rules,cityBridgeMaxSpan:120}).filter(r=>r.bridge).length,0);
});

test('full bridge width checks prevent a shore-hugging road from bridging ocean beside it',()=>{
    const sample=(x,y)=>x>=480&&x<=720?(y>520?'ocean':'water'):'urban';
    assert.equal(earthRoadCrossings(route,sample,rules).filter(r=>r.bridge).length,0);
});

test('city connections classify bridges before clipping and respect blocked crossings',()=>{
    const cities=[['a',0,500],['b',1200,500]].map(([id,x,y])=>({id,...earthGeo({x,y},rules)}));
    const center={x:600,y:500},local={...rules,cityConnectionBend:0};
    const paths=generateEarthCityConnections(cities,center,80,local,river);
    assert.ok(paths.length);assert.ok(paths.every(r=>r.bridge));
    assert.deepEqual(paths,generateEarthCityConnections([...cities].reverse(),center,80,local,river));
    assert.equal(generateEarthCityConnections(cities,center,80,local,river,()=>true).length,0);
});
