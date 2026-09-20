import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generateIsland} from '../js/adventure_map_generator_core.js';
import {createWorld,walkable,findPath,followPath,distance} from '../js/adventure_world_core.js';
import {createAdventure,parseSave,syncProgression} from '../js/adventure_core.js';
import {drawIslandWeather} from '../js/adventure_weather.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const rules=read('config/maps/generator.json'),content=read('data/adventure/chapter.json');
const ids=Object.keys(content.worldMapIndex.islands);
content.worldMaps=Object.fromEntries(ids.map(id=>[id,read(`data/adventure/maps/${id}.json`)]));

test('shared road, forest and snow rules compile deterministically without mutating sources',()=>{
    const source=read('config/maps/islands/ice.json'),before=JSON.stringify({source,rules,content});
    const a=generateIsland(source,rules,content),b=generateIsland(source,rules,content);
    assert.deepEqual(a,b);assert.equal(JSON.stringify({source,rules,content}),before);
    const changed=structuredClone(rules);changed.roads.width=110;
    for(const biome of Object.values(changed.biomes))biome.forest.density=0;
    changed.biomes.snow.weather.count=12;
    const next=generateIsland(source,changed,content);
    assert.equal(next.paths[0].width,110);assert.equal(next.trees.length,0);
    assert.equal(next.regions.find(r=>r.biome==='snow').weather.count,12);
    assert.ok(a.trees.some(t=>t.snow));
    changed.biomes.snow.weather.count=10000;
    assert.throws(()=>generateIsland(source,changed,content),/天气/);
});

test('all compiled islands preserve reachable interactions and distinct large regional layouts',()=>{
    const signatures=new Set();
    for(const id of ids){
        const world=createWorld(id,content),spawn=world.layout.spawn;
        assert.ok(world.npcs.some(n=>n.id===36205));
        if(id!=='camp'){assert.ok(world.w*world.h>22000000);assert.ok(world.landmarks.length>=6);}
        signatures.add(JSON.stringify(world.layout.coast));
        for(const target of [...world.npcs,...world.encounters,...world.landmarks,world.portal]){
            assert.ok(walkable(world,target.x,target.y),`${id}:${target.id}`);
            const result=followPath(world,spawn,findPath(world,spawn,target),100000);
            assert.ok(!result.blocked&&distance(result.position,target)<1,`${id}:${target.id}`);
        }
    }
    assert.equal(signatures.size,6);
});

test('version one external islands migrate to their new arrival points while town positions survive',()=>{
    const c={...content,progression:{...content.progression,levelCap:50,xpThresholds:Array.from({length:50},(_,i)=>i*1000)}};
    for(const id of ids){
        const save=createAdventure(c);save.xp=49000;syncProgression(save,c);save.zone=id;save.worldLayoutVersion=1;
        save.position=id==='town'?{x:3500,y:2900}:{x:850,y:850};
        const next=parseSave(save,c);
        assert.equal(next.worldLayoutVersion,2);
        assert.deepEqual(next.position,['town','camp'].includes(id)?save.position:content.worldMapIndex.islands[id].spawn);
    }
});

test('regional weather has a fixed viewport budget and respects reduced motion',()=>{
    const world=createWorld('ice',content),position=world.layout.regions.find(r=>r.biome==='snow');
    const commands=[];const c=new Proxy({}, {get:(_,key)=>(...args)=>commands.push([key,...args])});
    drawIslandWeather(c,world,position,100,1280,720);const first=structuredClone(commands);
    assert.ok(commands.filter(c=>c[0]==='ellipse').length<=64);assert.ok(commands.length>10);
    commands.length=0;drawIslandWeather(c,world,position,100,1280,720);assert.deepEqual(commands,first);
    commands.length=0;drawIslandWeather(c,world,position,101,1280,720,true);assert.equal(commands.length,0);
});
