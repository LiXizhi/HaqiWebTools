import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWorld, findPath, followPath, walkable, distance, nearbyWorldObjects } from '../js/adventure_world_core.js';
import { createAdventure, applyAction, parseSave } from '../js/adventure_core.js';
import { islandSpawn } from '../js/adventure_world_map_core.js';
import { riverBlocks } from '../js/adventure_island_layout_core.js';
import { createTerrainTileCache, paintLargeTerrain } from '../js/adventure_large_terrain.js';
const content=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url)));
content.worldMaps=Object.fromEntries(Object.entries(content.worldMapIndex.islands).map(([id,row])=>[id,JSON.parse(fs.readFileSync(new URL('../'+row.file,import.meta.url)))]));

test('large town preserves authored content, separates encounters and has traversable scenic routes',()=>{
    const before=JSON.stringify(content),world=createWorld('town',content);
    assert.equal(JSON.stringify(content),before);
    assert.deepEqual(world,createWorld('town',content));
    assert.ok(world.w*world.h>8*1800*1600);
    assert.ok(distance(...world.encounters)>1200);
    assert.deepEqual(world.npcs.filter(n=>n.id!==36205).map(n=>n.id).sort(),Object.values(content.npcs).filter(n=>n.zone==='town').map(n=>n.id).sort());
    let position=world.center;
    for(const target of [...world.landmarks,...world.npcs,...world.encounters,world.portal]){
        assert.ok(walkable(world,target.x,target.y),target.name||target.id);
        const path=findPath(world,position,target);assert.ok(path.length,target.name||target.id);
        const next=followPath(world,position,path,30000);
        assert.equal(next.blocked,false,target.name||target.id);assert.ok(distance(next.position,target)<1,target.name||target.id);
        position=next.position;
    }
    const bridge=world.layout.bridges[1];assert.equal(riverBlocks(world,bridge.x,bridge.y),false);
    assert.equal(walkable(world,2790,1780),false);assert.equal(walkable(world,0,0),false);
    assert.equal(walkable(world,NaN,1000),false);
    const local=nearbyWorldObjects(world,{x:3000,y:2700,w:800,h:600});
    assert.ok(local.length<world.trees.length/3);
    for(const road of world.paths)for(const [start,end] of [[road.a,road.b],[road.b,road.a]]){
        const next=followPath(world,start,[end],30000);
        assert.ok(!next.blocked&&distance(next.position,end)<1,JSON.stringify(road));
    }
});

test('old town saves relocate once; large coordinates, retreat and invalid bounds use island dimensions',()=>{
    const original=createAdventure(content);applyAction(original,content,{type:'travel',zone:'town'});
    delete original.worldLayoutVersion;original.position={x:800,y:810};
    const old=JSON.stringify(original),migrated=parseSave(old,content);
    assert.deepEqual(migrated.position,islandSpawn('town',content));assert.equal(JSON.stringify(original),old);
    migrated.position={x:4700,y:2700};assert.deepEqual(parseSave(migrated,content).position,migrated.position);
    const invalid=structuredClone(migrated);invalid.position.x=6000;assert.throws(()=>parseSave(invalid,content),/位置/);
    const future=structuredClone(migrated);future.worldLayoutVersion=99;assert.throws(()=>parseSave(future,content),/地图版本/);
    applyAction(migrated,content,{type:'retreat'});assert.deepEqual(migrated.position,islandSpawn('town',content));
});

test('terrain caches only bounded small tiles, reuses warm frames and invalidates on a new world',()=>{
    let paints=0;const allocated=[];
    const cache=createTerrainTileCache(()=>paints++,()=>{const c={getContext:()=>({translate(){},scale(){}})};allocated.push(c);return c;},12);
    const ctx={drawImage(){}},world={w:5600,h:4400};
    const rect={x:2500,y:2300,w:1280,h:720};cache.draw(ctx,world,rect);const warm=paints;
    cache.draw(ctx,world,rect);assert.equal(paints,warm);
    for(let x=0;x<world.w;x+=512)cache.draw(ctx,world,{x,y:1000,w:1280,h:720});
    assert.ok(cache.size<=12);assert.ok(allocated.every(c=>c.width===516&&c.height===516));
    cache.draw(ctx,{...world},rect);assert.ok(paints>warm);
    const wide={x:0,y:0,w:5600,h:4400};cache.draw(ctx,world,wide);const wideWarm=paints;
    cache.draw(ctx,world,wide);assert.equal(paints,wideWarm);assert.ok(cache.size<=12);
    const streamed={...world};let fallbacks=0;
    for(let i=0;i<12;i++){const before=paints;cache.draw(ctx,streamed,rect,()=>fallbacks++);assert.ok(paints-before<=2);}
    const settled=paints;cache.draw(ctx,streamed,rect,()=>fallbacks++);assert.equal(paints,settled);assert.ok(fallbacks>0);
    const moving={...world};cache.draw(ctx,moving,rect);const parked=paints;
    cache.draw(ctx,moving,{...rect,x:rect.x+8});assert.equal(paints,parked+1);
});

test('terrain tile paint skips farmland outside the tile',()=>{
    let fills=0;
    const c={fillRect(){fills++;},beginPath(){},moveTo(){},lineTo(){},quadraticCurveTo(){},setLineDash(){},closePath(){},stroke(){},fill(){},save(){},restore(){},clip(){},translate(){},scale(){},rotate(){},ellipse(){},createRadialGradient(){return{addColorStop(){}};}};
    const world={w:4000,h:4000,zone:'town',center:{x:200,y:200},paths:[],trees:[],layout:{
        coast:[[0,0],[400,0],[400,400],[0,400]],regions:[],mountains:[],rivers:[],lakes:[],bridges:[],details:[],features:[],
        farms:[{x:3000,y:3000,rows:2,cols:2}],
        rules:{terrain:{ocean:'#000',sand:'#ccc',base:'#888',coastLayers:[[8,'#111']],coastWidth:4,shadow:'#000',texture:{cell:64,count:1,light:'#fff',dark:'#000'}},
            water:{},roads:{layers:[[0,'#654']]},bridge:{},mountain:{layers:1,baseRadius:1,stepRadius:1,stepHeight:1,aspect:1},
            plaza:{radiusX:10,radiusY:8,edge:'#aaa',fill:'#ddd',line:'#bbb'},biomes:{}},
    }};
    paintLargeTerrain(c,world,{x:0,y:0,w:200,h:200});
    assert.equal(fills,1);
});

test('terrain density changes rebuild sharp tiles within a fixed pixel budget',()=>{
    let paints=0;const allocated=[];
    const cache=createTerrainTileCache(()=>paints++,()=>{const c={getContext:()=>({translate(){},scale(){}})};allocated.push(c);return c;});
    const ctx={drawImage(){}},world={w:5600,h:4400},rect={x:1000,y:1000,w:1280,h:720};
    cache.draw(ctx,world,rect,undefined,1);const normal=paints;
    cache.draw(ctx,world,rect,undefined,2);assert.ok(paints>normal);assert.equal(allocated.at(-1).width,1028);
    const sharp=paints;cache.draw(ctx,world,rect,undefined,2);assert.equal(paints,sharp);
    for(let x=0;x<world.w;x+=512)cache.draw(ctx,world,{...rect,x},undefined,2);
    assert.ok(cache.size*1028*1028*4<=64*1024*1024);
    cache.draw(ctx,world,rect,undefined,1);assert.equal(allocated.at(-1).width,516);
});
