import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installDungeons,enterDungeon,leaveDungeon} from '../js/adventure_dungeons_core.js';
import * as A from '../js/adventure_core.js';
import * as P from '../js/combat_pve_core.js';
import {createWorld,walkable,findPath,followPath,movePosition,dungeonAutoInteraction} from '../js/adventure_world_core.js';
import {projectRuntimeData} from '../scripts/package_runtime_data.mjs';
import {checkedProgress} from '../js/adventure_cloud_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p+'.json',import.meta.url)));
const content=read('adventure/chapter'),dataset=read('adventure/combat'),catalog=read('adventure/dungeons');
content.worldMaps=Object.fromEntries(Object.entries(content.worldMapIndex.islands).map(([id,row])=>[id,JSON.parse(fs.readFileSync(new URL('../'+row.file,import.meta.url)))]));
installDungeons(content,dataset,catalog,read('kids/cards'));
const id='dungeon:HaqiTown_FireCavern';
test('all exported dungeon spawns, formations and exits are reachable; supported battles execute and replay',()=>{
    assert.equal(content.dungeons.length,catalog.worlds.length);
    for(const d of content.dungeons.filter(d=>d.playable)){
        const save=A.createAdventure(content);enterDungeon(save,content,d.id);
        const world=createWorld(d.id,content,save);
        assert.ok(walkable(world,save.position.x,save.position.y),d.id);
        assert.ok(findPath(world,save.position,world.portal).length,d.id);
        for(const e of world.encounters){
            assert.ok(walkable(world,e.x,e.y),e.id);
            assert.ok(findPath(world,save.position,e).length,e.id);
            save.dungeonRuns[d.id].cleared=d.arenas.slice(0,d.arenas.findIndex(a=>a.id===e.id)).filter(a=>!a.blocked.length).map(a=>a.id);
            if(e.blocked.length||d.arenas.slice(0,d.arenas.findIndex(a=>a.id===e.id)).some(a=>a.blocked.length)){assert.throws(()=>A.beginEncounter(save,content,e.id));continue;}
            A.beginEncounter(save,content,e.id);
            const battle=P.restorePveBattle(dataset,content,save.pendingEncounter);
            assert.equal(battle.sides.far.length,e.monsterIds.length);
            assert.deepEqual(battle.sides.far.map(m=>m.slot),e.monsterSlots);
            P.playPveRound(battle,{pass:true});A.recordDecision(save,{pass:true},battle);
            const restored=checkedProgress(save,content,dataset);
            assert.deepEqual(restored.battle.events,battle.events,e.id);
            A.applyAction(save,content,{type:'retreat'});
        }
    }
});
test('dungeon group victory persists, cannot double reward, and exit/re-entry resumes the run',()=>{
    const save=A.createAdventure(content),origin={zone:save.zone,position:{...save.position}};
    enterDungeon(save,content,id);const encounter=content.encounters.find(e=>e.zone===id);
    A.beginEncounter(save,content,encounter.id);const b=P.restorePveBattle(dataset,content,save.pendingEncounter);
    const before=save.inventory[100]||0;
    b.finished=true;b.winner='near';A.settleEncounter(save,content,b);
    assert.equal(save.inventory[100]-before,encounter.monsterIds.reduce((n,id)=>n+content.monsters[id].coins,0));
    assert.ok(!createWorld(id,content,save).encounters.some(e=>e.id===encounter.id));
    assert.throws(()=>A.beginEncounter(save,content,encounter.id),/已经击败/);
    const restored=checkedProgress(save,content,dataset).save;
    leaveDungeon(restored,content);assert.equal(restored.zone,origin.zone);assert.deepEqual(restored.position,origin.position);
    enterDungeon(restored,content,id);assert.deepEqual(restored.dungeonRuns[id].cleared,[encounter.id]);
    enterDungeon(restored,content,id,{restart:true});assert.deepEqual(restored.dungeonRuns[id].cleared,[]);
});
test('battle blocks exit/reset and tampered group progress and formations are rejected',()=>{
    const save=A.createAdventure(content);enterDungeon(save,content,id);A.beginEncounter(save,content,content.encounters.find(e=>e.zone===id).id);
    const before=JSON.stringify(save);assert.throws(()=>leaveDungeon(save,content),/战斗/);assert.throws(()=>enterDungeon(save,content,id,{restart:true}),/战斗/);assert.equal(JSON.stringify(save),before);
    const altered=structuredClone(save);altered.pendingEncounter.dungeonMonsterIds.reverse();altered.pendingEncounter.dungeonMonsterIds.pop();assert.throws(()=>A.parseSave(altered,content),/阵容/);
    const invalid=structuredClone(save);invalid.dungeonRuns[id].cleared=['fake'];assert.throws(()=>A.parseSave(invalid,content),/清怪/);
    const old=A.createAdventure(content);delete old.dungeonRuns;delete old.dungeonReturn;assert.deepEqual(A.parseSave(old,content).dungeonRuns,{});
});

test('source and release-projected catalogues preserve identical checkpoint templates',()=>{
    const projectedContent=read('adventure/chapter'),projectedDataset=read('adventure/combat');
    projectedContent.worldMaps={camp:read('adventure/maps/camp')};
    installDungeons(projectedContent,projectedDataset,projectRuntimeData('adventure/dungeons.json',catalog),read('kids/cards'));
    assert.deepEqual(projectedContent.monsters,content.monsters);
    const save=A.createAdventure(content);enterDungeon(save,content,id);A.beginEncounter(save,content,content.encounters.find(e=>e.zone===id).id);
    assert.deepEqual(checkedProgress(save,projectedContent,projectedDataset).save,checkedProgress(save,content,dataset).save);
});


test('dungeon roads block shortcuts and skipping; only defeating the last Boss opens the exit',()=>{
    const save=A.createAdventure(content);enterDungeon(save,content,id);
    let world=createWorld(id,content,save);
    assert.equal(world.portal.hidden,true);
    assert.equal(dungeonAutoInteraction(world,world.portal),null);
    assert.equal(walkable(world,save.position.x+150,save.position.y-150),false);
    assert.throws(()=>A.beginEncounter(save,content,world.encounters.at(-1).id),/挡路/);
    const boss=content.dungeons.find(d=>d.id===id).bossArenaId;
    assert.equal(world.encounters.at(-1).id,boss);
    const ordered=world.encounters.map(e=>e.id);
    for(const encounterId of ordered){
        const next=world.encounters[0];
        const walk=followPath(world,save.position,findPath(world,save.position,world.portal),100000);
        save.position=walk.position;
        assert.equal(dungeonAutoInteraction(world,save.position)?.id,encounterId);
        const pushed=movePosition(world,save.position,(next.x-save.position.x)*20,(next.y-save.position.y)*20);
        assert.equal(dungeonAutoInteraction(world,pushed)?.id,encounterId,'large movements cannot tunnel past guards');
        A.beginEncounter(save,content,encounterId);
        const battle=P.restorePveBattle(dataset,content,save.pendingEncounter);
        battle.finished=true;battle.winner='near';A.settleEncounter(save,content,battle);
        world=createWorld(id,content,save);
        assert.ok(!world.encounters.some(e=>e.id===encounterId));
        assert.equal(world.portal.hidden,encounterId!==boss);
    }
    save.position=followPath(world,save.position,findPath(world,save.position,world.portal),100000).position;
    assert.equal(dungeonAutoInteraction(world,save.position)?.kind,'portal');
    leaveDungeon(save,content);assert.equal(save.zone,'camp');
    enterDungeon(save,content,id,{restart:true});assert.equal(createWorld(id,content,save).portal.hidden,true);
});

test('entrance portal is always reachable, preserves clears, and re-entry does not immediately leave',()=>{
    const save=A.createAdventure(content),origin={zone:save.zone,position:{...save.position}};
    enterDungeon(save,content,id);
    let world=createWorld(id,content,save);
    assert.ok(world.entrancePortal);
    assert.equal(dungeonAutoInteraction(world,save.position),null);
    assert.equal(world.portal.hidden,true);
    save.position=followPath(world,save.position,findPath(world,save.position,world.entrancePortal),1000).position;
    assert.equal(dungeonAutoInteraction(world,save.position)?.id,'dungeon-entrance');
    leaveDungeon(save,content);
    assert.equal(save.zone,origin.zone);assert.deepEqual(save.position,origin.position);
    enterDungeon(save,content,id);world=createWorld(id,content,save);
    assert.deepEqual(save.position,world.layout.spawn);
    assert.equal(dungeonAutoInteraction(world,save.position),null);
    const first=world.encounters[0].id;save.dungeonRuns[id].cleared.push(first);
    world=createWorld(id,content,save);
    save.position=world.entrancePortal;leaveDungeon(save,content);enterDungeon(save,content,id);
    assert.deepEqual(save.dungeonRuns[id].cleared,[first]);
    world=createWorld(id,content,save);assert.equal(world.portal.hidden,true);
    save.dungeonRuns[id].cleared.push(world.layout.bossArenaId);
    world=createWorld(id,content,save);assert.equal(world.portal.hidden,false,'exit visibility depends on the final Boss');
});
