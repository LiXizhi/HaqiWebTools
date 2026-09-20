import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAdventure, applyAction, parseSave, syncProgression } from '../js/adventure_core.js';
import { ISLANDS, travelStatus, islandSpawn } from '../js/adventure_world_map_core.js';
import { createWorld, walkable, findPath } from '../js/adventure_world_core.js';
import { prepareDebugEdit } from '../js/adventure_debug_core.js';
const content=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url)));
content.worldMaps=Object.fromEntries(Object.entries(content.worldMapIndex.islands).map(([id,row])=>[id,JSON.parse(fs.readFileSync(new URL('../'+row.file,import.meta.url)))]));
// Extended thresholds exercise all island gates without importing the pet catalogue.
const c={...content,progression:{...content.progression,levelCap:50,xpThresholds:Array.from({length:50},(_,i)=>i*1000)}};
function hero(level){const s=createAdventure(c,{school:'fire',seed:530});s.xp=(level-1)*1000;syncProgression(s,c);return s;}
test('each island blocks below its level and permits the exact unlock level',()=>{
    for(const island of ISLANDS){
        const level=travelStatus(hero(1),c,island.id).minLevel;
        if(level>1){const s=hero(level-1),before=JSON.stringify(s);assert.throws(()=>applyAction(s,c,{type:'travel',zone:island.id}),/达到/);assert.equal(JSON.stringify(s),before);}
        const s=hero(level);applyAction(s,c,{type:'travel',zone:island.id});
        assert.equal(s.zone,island.id);assert.deepEqual(s.position,islandSpawn(island.id,c));
        assert.equal(parseSave(JSON.stringify(s),c).zone,island.id);
        applyAction(s,c,{type:'travel',zone:'camp'});assert.equal(s.zone,'camp');
    }
});
test('battle and unknown destinations cannot mutate travel; params control gates',()=>{
    const s=hero(50);s.pendingEncounter={};const before=JSON.stringify(s);
    assert.throws(()=>applyAction(s,c,{type:'travel',zone:'fire'}),/战斗/);assert.equal(JSON.stringify(s),before);
    s.pendingEncounter=null;assert.throws(()=>applyAction(s,c,{type:'travel',zone:'missing'}),/目的地/);
    assert.equal(travelStatus(hero(15),{...c,balanceParams:{version:'kids',worldTravel:{fire:16}}},'fire').allowed,false);
    const low=hero(1);low.zone='dark';assert.throws(()=>parseSave(low,c),/岛屿/);
});
test('all islands have deterministic walkable arrivals and reachable return portals',()=>{
    for(const island of ISLANDS){const world=createWorld(island.id,c),spawn=islandSpawn(island.id,c);
        assert.deepEqual(world,createWorld(island.id,c));assert.ok(walkable(world,spawn.x,spawn.y),island.id);
        assert.ok(findPath(world,spawn,world.portal).length,island.id);
        if(!['camp','town'].includes(island.id)){assert.ok(world.npcs.every(n=>n.id===36205));assert.equal(world.portal.zone,'camp');}
    }
});
test('debug lowering a level returns safely to camp without invalidating the save',()=>{
    const s=hero(40);applyAction(s,c,{type:'travel',zone:'dark'});
    const result=prepareDebugEdit(s,c,{level:1});
    assert.equal(result.save.zone,'camp');assert.equal(result.save.level,1);
    assert.ok(result.notes.some(note=>note.includes('返回魔法营地')));
    assert.equal(s.zone,'dark');
});
