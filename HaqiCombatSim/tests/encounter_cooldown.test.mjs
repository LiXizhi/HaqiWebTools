import {stepMonsterWander} from '../js/adventure_monster_motion_core.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import * as P from '../js/combat_pve_core.js';
import * as W from '../js/adventure_world_core.js';
import {durableSave,runtimeValues,restoreRuntime} from '../js/adventure_storage_core.js';
const content=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url)));
content.worldMaps=Object.fromEntries(Object.entries(content.worldMapIndex.islands).map(([id,row])=>[id,JSON.parse(fs.readFileSync(new URL('../'+row.file,import.meta.url)))]));
const dataset=JSON.parse(fs.readFileSync(new URL('../data/adventure/combat.json',import.meta.url)));
function defeated(){
    const save=A.createAdventure(content);
    A.beginEncounter(save,content,'fire-scout',{now:1000});
    const battle=P.restorePveBattle(dataset,content,save.pendingEncounter);
    battle.finished=true;battle.winner='near';
    A.settleEncounter(save,content,battle,{now:2000});
    return save;
}
test('victory hides the monster, blocks stale clicks and restores it at 30 seconds',()=>{
    const save=defeated(),world=W.createWorld(save.zone,content,save);
    const mob=world.encounters.find(e=>e.id==='fire-scout');
    const rect={x:0,y:0,w:world.w,h:world.h};
    W.nearbyWorldObjects(world,rect); // Warm the renderer cache before hiding.
    W.updateEncounterVisibility(world,save,2000);
    assert.equal(mob.hidden,true);
    assert.notEqual(W.nearestInteraction(world,mob)?.id,mob.id);
    assert.equal(W.nearbyWorldObjects(world,rect).find(e=>e.id===mob.id).hidden,true);
    const before=JSON.stringify(save);
    assert.throws(()=>A.beginEncounter(save,content,mob.id,{now:31999}),/尚未刷新/);
    assert.equal(JSON.stringify(save),before);
    W.updateEncounterVisibility(world,save,32000);
    assert.equal(mob.hidden,false);
    assert.equal(W.nearbyWorldObjects(world,rect).find(e=>e.id===mob.id).hidden,false);
    A.beginEncounter(save,content,mob.id,{now:32000});
    assert.equal(save.pendingEncounter.encounterId,mob.id);
});
test('cooldown survives local reload but is excluded from cloud state',()=>{
    const save=defeated(),runtime=runtimeValues(save),durable=durableSave(save);
    assert.equal(durable.encounterRespawns,undefined);
    const restored=A.parseSave(restoreRuntime(durable,content,runtime),content);
    assert.throws(()=>A.beginEncounter(restored,content,'fire-scout',{now:3000}),/尚未刷新/);
    assert.throws(()=>A.parseSave({...save,encounterRespawns:{'fire-scout':-1}},content),/刷新记录/);
});
test('returning inside a dungeon contact does not immediately start another battle',()=>{
    const mob={id:'guard',x:100,y:0},world={isDungeon:true,layout:{route:[]},encounters:[mob],portal:{hidden:true}};
    W.resetAutoInteraction(world,mob);
    assert.equal(W.takeAutoInteraction(world,mob),null);
    assert.equal(W.takeAutoInteraction(world,{x:0,y:0}),null);
    assert.equal(W.takeAutoInteraction(world,mob)?.id,'guard');
    assert.equal(W.takeAutoInteraction(world,mob),null);
    mob.hidden=true;assert.equal(W.dungeonAutoInteraction(world,mob),null);
});
test('ordinary scenes require near-touch contact, much closer than dungeon contact',()=>{
    const world=W.createWorld('camp',content),mob=world.encounters[0];
    const at=d=>({x:mob.x+d,y:mob.y});
    assert.equal(W.takeAutoInteraction(world,at(23))?.id,mob.id,'direct contact starts immediately');
    W.takeAutoInteraction(world,at(30));
    for(let i=0;i<30;i++)stepMonsterWander(world,mob,.05,{x:mob.x-200,y:mob.y-200,w:400,h:400},{hero:at(23)});
    assert.equal(W.takeAutoInteraction(world,at(83)),null);
    assert.equal(W.takeAutoInteraction(world,at(24)),null);
    assert.equal(W.takeAutoInteraction(world,at(23))?.id,mob.id);
    assert.equal(W.takeAutoInteraction(world,mob),null);
    W.takeAutoInteraction(world,at(30));
    assert.equal(W.takeAutoInteraction(world,mob)?.id,mob.id);
    W.resetAutoInteraction(world,mob);
    assert.equal(W.takeAutoInteraction(world,mob),null);
    assert.equal(W.nearestInteraction(world,mob)?.id,mob.id,'explicit interaction remains available');
    mob.hidden=true;assert.equal(W.autoInteraction(world,mob),null);
    mob.hidden=false;mob.blocked=['unsupported'];assert.equal(W.autoInteraction(world,mob),null);
    const dungeon={isDungeon:true,layout:{route:[]},encounters:[{id:'guard',x:0,y:0}],portal:{hidden:true}};
    assert.equal(W.autoInteraction(dungeon,{x:83,y:0})?.id,'guard');
    assert.equal(W.autoInteraction(dungeon,{x:84,y:0}),null);
});
test('ordinary victory lands beside the defeated monster outside every monster contact',()=>{
    const save=defeated(),world=W.createWorld(save.zone,content,save);
    const mob=world.encounters.find(e=>e.id==='fire-scout');
    assert.ok(W.distance(save.position,mob)>=100&&W.distance(save.position,mob)<=220);
    assert.ok(world.encounters.every(e=>W.distance(save.position,e)>=100));
    assert.equal(W.walkable(world,save.position.x,save.position.y),true);
});
