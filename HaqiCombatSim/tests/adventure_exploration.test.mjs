import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWorld, findPath, followPath, walkable, distance, nearbyWorldObjects } from '../js/adventure_world_core.js';
import { createAdventure, applyAction, parseSave } from '../js/adventure_core.js';
import { islandSpawn } from '../js/adventure_world_map_core.js';
import { riverBlocks } from '../js/adventure_island_layout_core.js';
import { createTerrainTileCache } from '../js/adventure_large_terrain.js';
const content=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url)));

test('large town preserves authored content, separates encounters and has traversable scenic routes',()=>{
    const before=JSON.stringify(content),world=createWorld('town',content);
    assert.equal(JSON.stringify(content),before);
    assert.deepEqual(world,createWorld('town',content));
    assert.ok(world.w*world.h>8*1800*1600);
    assert.ok(distance(...world.encounters)>1200);
    assert.deepEqual(world.npcs.map(n=>n.id).sort(),Object.values(content.npcs).filter(n=>n.zone==='town').map(n=>n.id).sort());
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
    assert.deepEqual(migrated.position,islandSpawn('town'));assert.equal(JSON.stringify(original),old);
    migrated.position={x:4700,y:2700};assert.deepEqual(parseSave(migrated,content).position,migrated.position);
    const invalid=structuredClone(migrated);invalid.position.x=6000;assert.throws(()=>parseSave(invalid,content),/位置/);
    const future=structuredClone(migrated);future.worldLayoutVersion=2;assert.throws(()=>parseSave(future,content),/地图版本/);
    applyAction(migrated,content,{type:'retreat'});assert.deepEqual(migrated.position,islandSpawn('town'));
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
});
