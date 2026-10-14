import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generateIsland} from '../js/adventure_map_generator_core.js';
import {createWorld,walkable,findPath,findPathSteps,followPath,distance} from '../js/adventure_world_core.js';
import {createAdventure,parseSave,beginEncounter} from '../js/adventure_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {durableSave,runtimeValues,restoreRuntime,coreCatalogKey} from '../js/adventure_storage_core.js';
import {migrateSaveCoordinates,migrateLocationCoordinates,locationSnapshot,migrateCampDrops} from '../js/adventure_coordinates_core.js';
import {createPetInstance} from '../js/adventure_pet_interactions_core.js';
import {hydratePetFile,petFileEnvelope} from '../js/adventure_pet_files.js';
import {petSummary,petContentKey,petFilePath} from '../js/adventure_pet_files_core.js';
import {enterDungeon,leaveDungeon,installDungeons,installDungeonIndex} from '../js/adventure_dungeons_core.js';
import {campScenerySteps} from '../js/adventure_camp_scenery_core.js';
import {groundDecorations} from '../js/adventure_ground_decorations_core.js';
import {createIslandTerrainRasterizer} from '../js/island_terrain_rasterizer.js';
import {islandAtlasPoint} from '../js/haqi_atlas_core.js';
import {installNpcCatalog} from '../js/adventure_npc_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const {content}=installExpansion(read('data/adventure/chapter.json'),read('data/adventure/combat.json'),read('data/adventure/pets.json'),read('data/adventure/shop-candidates.json'),read('data/kids/cards.json'),read('data/kids/charms.json'));
content.worldMaps=Object.fromEntries(Object.keys(content.worldMapIndex.islands).map(id=>[id,read(`data/adventure/maps/${id}.json`)]));
const world=createWorld('camp',content),spawn=world.layout.spawn;

test('camp doubles authored anchors, preserves sprite sizes and compiles deterministically',()=>{
    const spec=read('config/maps/islands/camp.json'),rules=read('config/maps/generator.json');
    assert.deepEqual([world.w,world.h],[3600,3200]);assert.equal(world.layout.coordinateVersion,2);assert.equal(rules.layoutVersion,2);
    assert.deepEqual(spec.initialSpawn,{x:1720,y:1700});assert.deepEqual(spec.npcPositions[36211],[1720,1460]);
    assert.deepEqual(spec.buildings.map(b=>[b.w,b.h]),[[190,180],[175,165],[175,170]]);
    assert.deepEqual(generateIsland(spec,rules,content),generateIsland(spec,rules,content));
    assert.ok(world.trees.length<=180);
    for(const target of [world.layout.initialSpawn,...world.npcs,...world.encounters,...world.landmarks,world.portal]){
        assert.ok(walkable(world,target.x,target.y),target.name||target.id);
        const result=followPath(world,spawn,findPath(world,spawn,target),100000);
        assert.equal(result.blocked,false);assert.ok(distance(result.position,target)<1);
    }
    for(const p of world.paths)for(const [a,b]of [[p.a,p.b],[p.b,p.a]])assert.equal(followPath(world,a,[b],100000).blocked,false);
});
test('legacy JSON and independent runtime coordinates migrate once without changing progress',()=>{
    const old=createAdventure(content);old.position={x:860,y:850};delete old.positionCoordinateVersion;
    const next=parseSave(JSON.stringify(old),content);
    assert.deepEqual(next.position,{x:1720,y:1700});assert.equal(next.positionCoordinateVersion,2);
    for(const key of ['inventory','quests','xp','seed','encounterSerial'])assert.deepEqual(next[key],old[key]);
    assert.deepEqual(parseSave(next,content).position,next.position);
    const runtime=runtimeValues(old),restored=restoreRuntime(durableSave(next),content,runtime);
    assert.deepEqual(restored.position,next.position);assert.deepEqual(restoreRuntime(durableSave(restored),content,runtimeValues(restored)).position,next.position);
    assert.equal(durableSave(restored).positionCoordinateVersion,undefined);
    const catalog=save=>({roles:[{id:'same',save}]});
    assert.equal(coreCatalogKey(catalog(old)),coreCatalogKey(catalog(restored)));
});
test('cloud-only or mismatching runtime restores the new spawn without double scaling',()=>{
    const save=createAdventure(content),durable=durableSave(save);
    for(const runtime of [null,{zone:'camp',revision:save.revision,values:{}},{zone:'town',revision:save.revision,values:{position:{x:800,y:800}}},{zone:'camp',revision:999,values:{position:{x:800,y:800}}}]){
        const restored=restoreRuntime(durable,content,runtime);
        assert.deepEqual(restored.position,content.worldMapIndex.islands.camp.initialSpawn);
        assert.equal(restored.positionCoordinateVersion,2);
    }
});
test('return snapshots migrate while away, keep other islands intact and stamp new returns',()=>{
    const save=createAdventure(content);save.zone='town';save.position={x:2000,y:2000};
    save.dungeonReturn={zone:'camp',position:{x:860,y:850}};
    save.earthReturn={zone:'camp',position:{x:860,y:850}};
    save.coopRun={returnTo:{zone:'camp',position:{x:860,y:850}}};
    migrateSaveCoordinates(save,content);
    for(const row of [save.dungeonReturn,save.earthReturn,save.coopRun.returnTo]){assert.deepEqual(row.position,{x:1720,y:1700});assert.equal(row.coordinateVersion,2);}
    assert.deepEqual(save.position,{x:2000,y:2000});
    const fresh=locationSnapshot(createAdventure(content),content);migrateLocationCoordinates(fresh,content);assert.deepEqual(fresh.position,{x:1720,y:1700});
});
test('an old dungeon return lands on the expanded camp and pending battle input is untouched',()=>{
    const c=structuredClone(content),dataset=read('data/adventure/combat.json');installDungeons(c,dataset,read('data/adventure/dungeons.json'),read('data/kids/cards.json'));
    const save=createAdventure(c);enterDungeon(save,c,'dungeon:HaqiTown_FireCavern');
    save.dungeonReturn={zone:'camp',position:{x:860,y:850}};
    const restored=parseSave(save,c);leaveDungeon(restored,c);
    assert.deepEqual(restored.position,{x:1720,y:1700});assert.equal(restored.positionCoordinateVersion,2);
    const battling=createAdventure(c);beginEncounter(battling,c,'fire-scout');
    battling.position={x:860,y:850};delete battling.positionCoordinateVersion;
    const pending=structuredClone(battling.pendingEncounter),next=parseSave(battling,c);
    assert.deepEqual(next.pendingEncounter,pending);assert.equal(next.positionCoordinateVersion,2);
});
test('legacy obstructed points snap to land; invalid/future versions do not silently pass',()=>{
    const building=world.buildings.find(b=>!b.decorationOnly),p={x:building.x,y:building.y-5};
    assert.equal(walkable(world,p.x,p.y),false);
    const row={zone:'camp',position:{x:p.x/2,y:p.y/2}};migrateLocationCoordinates(row,content);
    assert.ok(walkable(world,row.position.x,row.position.y));assert.ok(distance(row.position,p)<260);
    assert.throws(()=>migrateLocationCoordinates({zone:'camp',position:{x:1900,y:800}},content),/坐标/);
    assert.throws(()=>migrateLocationCoordinates({zone:'camp',coordinateVersion:3,position:p},content),/版本/);
});
test('lazy pet files migrate only the hydrated birth point and retain original immutable bytes',()=>{
    const save=createAdventure(content),pet=createPetInstance(content,{id:'baby-camp-test',speciesId:Object.keys(content.pets)[0],ownerId:'birth'});
    pet.ownerId=null;pet.birth={parents:['parent-a','parent-b'],at:1,seed:530,zone:'camp',anchor:{x:860,y:850},adoptedAt:null};
    const file=petFileEnvelope('test','pet',pet),before=JSON.stringify(file),ref={group:'petWorld',path:petFilePath(pet.id,'v1'),summary:petSummary(pet),contentKey:petContentKey(pet)};
    save.petWorld={};save.petFileRefs={[pet.id]:ref,unloaded:{group:'petWorld',path:'unread',summary:{zone:'camp'}}};
    const reads=[];hydratePetFile(save,pet.id,'test',p=>{reads.push(p);return file;},content);
    assert.deepEqual(save.petWorld[pet.id].birth.anchor,{x:1720,y:1700});assert.equal(save.petWorld[pet.id].birth.coordinateVersion,2);
    migrateSaveCoordinates(save,content);assert.deepEqual(save.petWorld[pet.id].birth.anchor,{x:1720,y:1700});
    assert.deepEqual(reads,[ref.path]);assert.equal(JSON.stringify(file),before);assert.equal(save.petWorld.unloaded,undefined);
});
test('purely cosmetic floor details are deterministic across tile boundaries and do not change gathering',()=>{
    const rect={x:1800,y:600,w:900,h:1000},before=groundDecorations(world,rect),a=[...campScenerySteps(world,rect)],b=[...campScenerySteps(world,rect)];
    assert.ok(a.length);assert.deepEqual(a,b);assert.deepEqual(groundDecorations(world,rect),before);
    const overlap=[...campScenerySteps(world,{x:rect.x+80,y:rect.y,w:rect.w,h:rect.h})];
    for(const d of a.filter(d=>d.x>rect.x+240&&d.x<rect.x+rect.w-160))assert.ok(overlap.some(v=>JSON.stringify(v)===JSON.stringify(d)));
    assert.equal([...campScenerySteps({...world,zone:'town'},rect)].length,0);
});
test('cooperative navigation produces exactly the synchronous route and yields through cold graph preparation',()=>{
    const cold=createWorld('camp',content),target=cold.encounters.find(e=>e.id==='storm-scout');
    const steps=findPathSteps(cold,cold.layout.spawn,target);let n=0,result;do{result=steps.next();n++;}while(!result.done);
    assert.ok(n>10);assert.deepEqual(result.value,findPath(cold,cold.layout.spawn,target));
    assert.equal(followPath(cold,cold.layout.spawn,result.value,100000).blocked,false);
});
test('local ground drops migrate once without changing reward identities or amounts',()=>{
    const record={drops:[{id:'receipt',zone:'camp',x:860,y:850,amount:5,currency:100},{id:'elsewhere',zone:'town',x:500,y:600}],depleted:{key:2}};
    migrateCampDrops(record,content);migrateCampDrops(record,content);
    assert.deepEqual(record.drops[0],{id:'receipt',zone:'camp',x:1720,y:1700,amount:5,currency:100,coordinateVersion:2});assert.equal(record.drops[1].x,500);assert.deepEqual(record.depleted,{key:2});
});

test('terrain worker receives the same decoration exclusions as the live camp',async()=>{
    const original=Object.fromEntries(['Worker','OffscreenCanvas','createImageBitmap'].map(key=>[key,globalThis[key]]));
    const rect={x:1800,y:600,w:900,h:1000};let snapshot;
    try{
        globalThis.OffscreenCanvas=class{};globalThis.createImageBitmap=async image=>image;
        globalThis.Worker=class{postMessage(data){if(data.type==='scene')snapshot=structuredClone(data.world);else queueMicrotask(()=>this.onmessage({data:{id:data.id,bitmap:{close(){}},atlases:[]}}));}};
        await createIslandTerrainRasterizer({images:{}})(world,rect,1028,2);
        assert.deepEqual([...campScenerySteps(snapshot,rect)],[...campScenerySteps(world,rect)]);
        assert.deepEqual(snapshot.portal,world.portal);assert.deepEqual(snapshot.landmarks,world.landmarks);
    }finally{for(const [key,value]of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
test('existing illustrated map keeps normalized camp landmarks and player positions aligned',()=>{
    const atlas=read('data/adventure/world-map-art.json'),island=atlas.islands.find(i=>i.id==='camp');
    assert.equal(island.detailStyle,'illustration');
    for(const p of [world.layout.initialSpawn,world.portal,...world.landmarks])assert.deepEqual(islandAtlasPoint(island,world,p),islandAtlasPoint(island,{w:1800,h:1600},{x:p.x/2,y:p.y/2}));
});
test('production NPC catalogue, harbor and dungeon entrances remain reachable after scenery placement',()=>{
    const c=structuredClone(content);installNpcCatalog(c,read('data/adventure/npc-catalog.json'));
    c.dungeonJourneys=read('data/adventure/dungeon-journeys.json');installDungeonIndex(c,read('data/adventure/dungeon-index.json'));
    const live=createWorld('camp',c),targets=[...live.npcs,...live.encounters,...live.landmarks,live.portal];
    assert.ok(live.npcs.length>world.npcs.length);assert.ok(live.landmarks.some(p=>p.dungeonId));
    for(const p of targets){const route=findPath(live,spawn,p);assert.ok(route.length,p.name);assert.ok(distance(followPath(live,spawn,route,100000).position,p)<1,p.name);}
    for(const p of live.paths)for(const [a,b]of [[p.a,p.b],[p.b,p.a]])assert.equal(followPath(live,a,[b],100000).blocked,false);
    for(let i=0;i<live.trees.length;i++)for(let j=0;j<i;j++)assert.ok(distance(live.trees[i],live.trees[j])>=80);
});
