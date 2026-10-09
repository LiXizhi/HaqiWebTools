import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {projectDungeon} from '../js/adventure_dungeons_core.js';
import {dungeonBiome} from '../js/adventure_dungeon_scenery_core.js';
import {stepSocialActors,socialTrailGap} from '../js/adventure_social_motion_core.js';
import {routePoint,routeLocation,walkable} from '../js/adventure_world_core.js';
import {SOCIAL_DEFAULTS} from '../js/adventure_social_core.js';
import {groundDecorations} from '../js/adventure_ground_decorations_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const catalog=read('../data/adventure/dungeons.json'),rules=read('../data/adventure/maps/camp.json').rules;
const source=catalog.worlds.find(d=>d.id==='dungeon:FlamingPhoenixIsland_TheGreatTree');
function worldFor(d=source){const layout=projectDungeon(d,rules);return {zone:d.id,w:layout.w,h:layout.h,layout,paths:layout.paths,trees:layout.trees,buildings:[],npcs:[],encounters:[],center:layout.center};}
test('every dungeon has reproducible scenery and a different identity keeps a different route',()=>{
    for(const d of catalog.worlds.filter(d=>d.arenas.length)){
        const a=projectDungeon(d,rules),b=projectDungeon(structuredClone(d),rules);
        assert.deepEqual(a,b,d.id);assert.ok(a.trees.length,d.id);assert.ok(a.rivers.length&&a.bridges.length,d.id);
        for(const p of a.route)assert.ok(p.x>=0&&p.y>=0&&p.x<=a.w&&p.y<=a.h,d.id);
    }
    assert.notDeepEqual(projectDungeon(source,rules).route,projectDungeon({...source,id:source.id+'-other'},rules).route);
    assert.equal(dungeonBiome(source),'forest');
    assert.equal(dungeonBiome({name:'冰封秘境',id:'dungeon:CrazyTower_11_to_15'}),'snow');
    assert.equal(dungeonBiome({name:'梦魇火鸟岛',id:'dream'}),'dark');
});
test('dungeons reuse island ground decorations without filling the walkable road',()=>{
    const world=worldFor(),rows=groundDecorations(world,{x:0,y:0,w:world.w,h:world.h});
    assert.ok(rows.length>20);assert.ok(rows.every(p=>!walkable(world,p.x,p.y)));
});
test('all three party members follow turns, remain on the trail, pause and regroup after retreat',()=>{
    const world=worldFor(),actors=Array.from({length:3},(_,i)=>({profile:{id:`ally${i}`},position:{x:900,y:900},path:[],facing:0}));
    const opts={team:actors.map(a=>a.profile.id),view:{x:-900,y:-900,w:1,h:1}};
    let leader;
    for(let progress=150;progress<1300;progress+=7){leader=routePoint(world,progress);stepSocialActors(actors,world,1/30,{...opts,leader});assert.ok(actors.every(a=>walkable(world,a.position.x,a.position.y)));}
    actors.forEach((a,i)=>assert.ok(Math.abs(routeLocation(world,a.position).progress-(routeLocation(world,leader).progress-socialTrailGap()*(i+1)))<30));
    const before=structuredClone(actors);stepSocialActors(actors,world,.1,{...opts,leader:routePoint(world,1400),paused:true});assert.deepEqual(actors,before);
    // Reverse direction while walking; all members keep moving even outside the viewport.
    for(let progress=1290;progress>850;progress-=7){leader=routePoint(world,progress);stepSocialActors(actors,world,1/30,{...opts,leader});}
    assert.ok(actors.every(a=>walkable(world,a.position.x,a.position.y)));
    assert.ok(actors.every(a=>Math.hypot(a.position.x-leader.x,a.position.y-leader.y)<socialTrailGap()*(actors.length+1)));
    leader=routePoint(world,200);stepSocialActors(actors,world,.05,{...opts,leader});
    assert.ok(actors.every(a=>routeLocation(world,a.position).progress<=200));
});

import {updateDungeonExploration} from '../js/adventure_world_core.js';
import {durableSave,runtimeValues,restoreRuntime} from '../js/adventure_storage_core.js';
test('walking reveals the trail permanently on retreat and restores locally without dirtying cloud state',()=>{
    const world=worldFor(),save={zone:world.zone,revision:7,position:routePoint(world,150)};
    const before=durableSave(save);
    updateDungeonExploration(world,save);
    save.position=routePoint(world,600);updateDungeonExploration(world,save);
    const farthest=save.dungeonExploration[world.zone];assert.ok(Math.abs(farthest-600)<.01);
    save.position=routePoint(world,250);updateDungeonExploration(world,save);
    assert.equal(save.dungeonExploration[world.zone],farthest);
    assert.deepEqual(durableSave(save),before);
    const content={worldMapIndex:{islands:{[world.zone]:{initialSpawn:world.layout.spawn}}}};
    const restored=restoreRuntime(durableSave(save),content,runtimeValues(save));
    assert.equal(restored.dungeonExploration[world.zone],farthest);
    const rebuilt=worldFor();updateDungeonExploration(rebuilt,restored);
    assert.equal(restored.dungeonExploration[world.zone],farthest);
    assert.equal(restoreRuntime(durableSave(save),content).dungeonExploration,undefined);
});
