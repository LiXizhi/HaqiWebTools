import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAdventure,parseSave,beginEncounter,recordDecision,settleEncounter,applyAction} from '../js/adventure_core.js';
import {createWorld,walkable,findPath} from '../js/adventure_world_core.js';
import {restorePveBattle,playPveRound} from '../js/combat_pve_core.js';
import {SimpleBot} from '../js/combat_policy_core.js';
import {durableSave,runtimeValues,restoreRuntime,splitRoleSave} from '../js/adventure_storage_core.js';
import {createCityDungeonLoader} from '../js/adventure_city_dungeons.js';
import {cityEntranceAppearance,installCityDungeons,validateCityDungeons,validateCityNodeBindings,cityNodeForSource,enterCityDungeon,leaveCityDungeon,applyCityInteraction,cityDungeonState,cityBattleReady,createCityDungeonWorld} from '../js/adventure_city_dungeons_core.js';
import {updateCityNode} from '../scripts/update_earth_city_node.mjs';
import {createRoleStore} from '../js/adventure_roles.js';
import {createRuntimeStore} from '../js/adventure_runtime_store.js';
const read=file=>JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'));
const city=read('data/adventure/earth/cities/shenzhen.json'),index=read('data/adventure/earth/index.json');
function setup(){const content=read('data/adventure/chapter.json');content.worldMaps={camp:read(content.worldMapIndex.islands.camp.file)};content.dungeons=[];installCityDungeons(content,city);const save=createAdventure(content,{seed:42});save.zone='earth';save.position={x:7057390,y:1618965};return {content,save};}
const overview='city:shenzhen:overview',shekou='city:shenzhen:shekou',market='city:shenzhen:huaqiangbei',bay='city:shenzhen:bay';
const dFor=(content,id)=>content.dungeons.find(d=>d.id===id);
test('city entrances have five distinct sizes, colors and ring counts; unknown tiers are neutral',()=>{
    const appearances=Array.from({length:5},(_,i)=>cityEntranceAppearance(i+1));
    for(const field of ['w','color','rings'])assert.equal(new Set(appearances.map(a=>a[field])).size,5);
    assert.ok(appearances[0].w>appearances[4].w);assert.equal(cityEntranceAppearance(undefined).rings,1);assert.ok(cityEntranceAppearance(1,true).w<appearances[4].w);
});
test('explicit authored/CSV node binding rejects ambiguous ownership and invalid references',()=>{
    validateCityDungeons(city);const other=structuredClone(city);other.id='other';assert.throws(()=>validateCityNodeBindings([city,other]),/重复归属/);
    const csv={...structuredClone(city.nodes[0]),source:{kind:'csv',id:'15174'}};assert.equal(cityNodeForSource({nodes:[csv]},{id:15174}),csv);assert.equal(cityNodeForSource({nodes:[csv]},{id:15175}),undefined);
    const wrong=structuredClone(city);wrong.nodes[0].source.id='missing';assert.throws(()=>validateCityDungeons(wrong),/地标/);
    const cycle=structuredClone(city),a=cycle.nodes[0].dungeon.actions;a[0].requires=[a.at(-1).id];assert.throws(()=>validateCityDungeons(cycle),/成环/);
    const blocked=structuredClone(city);blocked.nodes[0].dungeon.map.obstacles.push({x:590,y:760,w:20,h:20});assert.throws(()=>validateCityDungeons(blocked),/阻挡/);
});
test('overview and direct Earth entry share node progress, with correct local return chains',()=>{
    const {save,content}=setup(),origin={...save.position};enterCityDungeon(save,content,overview);save.position={x:300,y:460};const total={...save.position};
    enterCityDungeon(save,content,shekou);applyCityInteraction(save,dFor(content,shekou),shekou+':ask');leaveCityDungeon(save,content);
    assert.equal(save.zone,overview);assert.deepEqual(save.position,total);leaveCityDungeon(save,content);assert.equal(save.zone,'earth');assert.deepEqual(save.position,origin);
    enterCityDungeon(save,content,shekou);assert.ok(cityDungeonState(save,city.id,shekou).done.includes(shekou+':ask'));leaveCityDungeon(save,content);assert.equal(save.zone,'earth');
    assert.deepEqual(runtimeValues(save).cityDungeonRuns,{});
    const cloud=durableSave(save),cold=read('data/adventure/chapter.json');assert.equal(parseSave(JSON.stringify(restoreRuntime(cloud,cold)),cold).zone,'camp');assert.ok(cloud.earthCityProgress.cities.shenzhen.dungeons[shekou]);
});
test('scene inventory is independent; invalid or repeated delivery never consumes twice',()=>{
    const {save,content}=setup();enterCityDungeon(save,content,market);const d=dFor(content,market),inventory=structuredClone(save.inventory);
    assert.throws(()=>applyCityInteraction(save,d,market+':combine'),/准备/);assert.equal(cityDungeonState(save,city.id,market).done.length,0);
    for(const key of ['ask','wire','bulb','combine','check'])applyCityInteraction(save,d,market+':'+key);
    const previous=JSON.stringify(save);assert.equal(applyCityInteraction(save,d,market+':check').changed,false);assert.equal(JSON.stringify(save),previous);assert.deepEqual(save.inventory,inventory);
    assert.equal(cityDungeonState(save,city.id,market).items.kit,0);assert.equal(cityBattleReady(save,d,market+':magic'),true);
    assert.throws(()=>applyCityInteraction(save,d,market+':light'),/准备/);
});
test('living city scenes are freely walkable, expose NPCs and only reveal prepared encounters',()=>{
    const {save,content}=setup();enterCityDungeon(save,content,bay);let world=createWorld(bay,content,save);assert.equal(world.encounters.length,0);assert.equal(world.npcs.length,6);
    assert.equal(walkable(world,10,10),false);assert.ok(findPath(world,save.position,world.dungeon.scene.hotspots.find(h=>h.id==='notice')).length);
    for(const key of ['rules','observe','record','report'])applyCityInteraction(save,dFor(content,bay),bay+':'+key);
    world=createWorld(bay,content,save);assert.equal(world.encounters.length,1);assert.equal(world.portal.hidden,false);
});
test('each critical fight uses real deterministic combat; only victory advances and it cannot reward twice',()=>{
    for(const [id,steps,finish]of [[market,['ask','wire','bulb','combine','check'],'light'],[bay,['rules','observe','record','report'],'restore']]){
        const {save,content}=setup();save.xp=4654;save.level=10;enterCityDungeon(save,content,id);const d=dFor(content,id);
        assert.throws(()=>beginEncounter(save,content,id+':magic'),/生活互动/);
        for(const key of steps)applyCityInteraction(save,d,id+':'+key);
        beginEncounter(save,content,id+':magic');const checkpoint=structuredClone(save.pendingEncounter);const battle=restorePveBattle(read('data/adventure/combat.json'),content,save.pendingEncounter),bot=new SimpleBot();
        let rounds=0;while(!battle.finished&&rounds++<200){const decision=bot.pick(battle,battle.sides.near[0]);playPveRound(battle,decision);recordDecision(save,decision);}
        assert.equal(battle.winner,'near');settleEncounter(save,content,battle);assert.deepEqual(cityDungeonState(save,city.id,id).cleared,[id+':magic']);
        applyCityInteraction(save,d,id+':'+finish);assert.equal(createCityDungeonWorld(content,save,d).encounters.length,0);
        const inventory=structuredClone(save.inventory);save.pendingEncounter=checkpoint;assert.equal(settleEncounter(save,content,battle),false);assert.deepEqual(save.inventory,inventory);
        assert.throws(()=>beginEncounter(save,content,id+':magic'),/已经击败/);
    }
});
test('retreat preserves a retryable city encounter without clearing the story',()=>{
    const {save,content}=setup();enterCityDungeon(save,content,market);const d=dFor(content,market);
    for(const key of ['ask','wire','bulb','combine','check'])applyCityInteraction(save,d,market+':'+key);
    beginEncounter(save,content,market+':magic');applyAction(save,content,{type:'retreat'});
    assert.equal(save.pendingEncounter,null);assert.equal(cityBattleReady(save,d,market+':magic'),true);assert.deepEqual(cityDungeonState(save,city.id,market).cleared,[]);
});
test('a real defeat leaves the critical city story unfinished and allows another attempt',()=>{
    const {save,content}=setup();enterCityDungeon(save,content,market);const dungeon=dFor(content,market);
    for(const key of ['ask','wire','bulb','combine','check'])applyCityInteraction(save,dungeon,market+':'+key);
    beginEncounter(save,content,market+':magic');const battle=restorePveBattle(read('data/adventure/combat.json'),content,save.pendingEncounter),bot=new SimpleBot();
    let count=0;while(!battle.finished&&count++<200){const decision=bot.pick(battle,battle.sides.near[0]);playPveRound(battle,decision);recordDecision(save,decision);}
    assert.equal(battle.winner,'far');settleEncounter(save,content,battle);assert.equal(cityBattleReady(save,dungeon,market+':magic'),true);assert.deepEqual(cityDungeonState(save,city.id,market).cleared,[]);assert.throws(()=>applyCityInteraction(save,dungeon,market+':light'),/准备/);
});
test('records retain city actions while coordinates, return chain, pending fight and runtime runs remain local',()=>{
    const {save,content}=setup();save.earthProgress={version:1,step:3};enterCityDungeon(save,content,overview);enterCityDungeon(save,content,market);
    for(const key of ['ask','wire','bulb','combine','check'])applyCityInteraction(save,dFor(content,market),market+':'+key);
    beginEncounter(save,content,market+':magic');const cloud=durableSave(save),runtime=runtimeValues(save);
    assert.equal(cloud.zone,'camp');assert.equal(cloud.cityReturnStack,undefined);assert.equal(cloud.pendingEncounter,undefined);assert.equal(cloud.dungeonRuns[market],undefined);
    assert.ok(splitRoleSave(save).records.earthCityProgress.cities.shenzhen.dungeons[market]);assert.equal(cloud.earthProgress.step,3);
    const restored=parseSave(JSON.stringify(restoreRuntime(cloud,content,runtime)),content);assert.equal(restored.zone,market);assert.equal(restored.pendingEncounter.encounterId,market+':magic');assert.equal(restored.cityReturnStack[0].zone,overview);
    assert.equal(restoreRuntime(cloud,content).zone,'camp');
});
test('city loader is lazy, merges requests, restores local routes, and retries a failed package',async()=>{
    const {content}=setup();delete content.earthCities;content.dungeons=[];const requests=[];
    const loader=createCityDungeonLoader({content,readJson:async path=>{requests.push(path);return read(path);}});
    await loader.prepareSaves([{zone:'camp'}]);assert.deepEqual(requests,[]);
    await Promise.all([loader.load(shekou),loader.load(bay)]);assert.equal(requests.filter(p=>p.includes('cities/')).length,1);
    await loader.prepareSaves([{zone:market,cityReturnStack:[{zone:overview}]}]);assert.equal(requests.length,3);
    await assert.rejects(loader.load('city:shenzhen:missing'),/不存在/);
    let fail=true;const retry=createCityDungeonLoader({content,readJson:async path=>{if(fail&&path.includes('cities/'))throw Error('offline');return read(path);}});
    await assert.rejects(retry.load(market),/offline/);fail=false;assert.equal((await retry.load(market)).id,market);
});
test('a cancelled city load cannot install late content or register art, and the cached package can be retried',async()=>{
    const {content}=setup();content.dungeons=[];delete content.earthCities;let active=false,registered=0;
    const loader=createCityDungeonLoader({content,readJson:async path=>read(path),registerImage:()=>registered++});
    await assert.rejects(loader.load(market,{isCurrent:()=>active}),/取消/);assert.equal(content.dungeons.length,0);assert.equal(registered,0);
    active=true;await loader.load(market,{isCurrent:()=>active});assert.ok(dFor(content,market));assert.equal(registered,0); // NPCs use the hero library, never the legacy city portrait atlas.
});
test('cold role preparation loads the local city route before hydration and keeps account state isolated',async()=>{
    const {content,save}=setup();enterCityDungeon(save,content,overview);enterCityDungeon(save,content,shekou);applyCityInteraction(save,dFor(content,shekou),shekou+':ask');
    const rows=new Map(),storage={getItem:k=>rows.get(k)||null,setItem:(k,v)=>rows.set(k,v)},runtimeStore=createRuntimeStore({indexedDB:null}),dataset=read('data/adventure/combat.json');
    const initial=createRoleStore({content,dataset,storage,runtimeStore,uuid:()=> '12345678-1234-1234-1234-123456789012'});initial.open('city-test');initial.create(save);
    const cold=setup().content;cold.dungeons=[];delete cold.earthCities;for(const id of Object.keys(cold.worldMaps))if(id.startsWith('city:'))delete cold.worldMaps[id];
    const requests=[],loader=createCityDungeonLoader({content:cold,readJson:async file=>{requests.push(file);return read(file);}});
    const reopened=createRoleStore({content:cold,dataset,storage,runtimeStore,prepareSaves:loader.prepareSaves});await reopened.prepareOpen('city-test',{recover:true});reopened.open('city-test',{recover:true});
    const restored=reopened.catalog.roles[0].save;assert.equal(restored.zone,shekou);assert.equal(restored.cityReturnStack[0].zone,overview);assert.ok(cityDungeonState(restored,city.id,shekou).done.includes(shekou+':ask'));assert.equal(requests.filter(f=>f.includes('cities/')).length,1);
    reopened.open('other-account');assert.equal(reopened.catalog.roles.length,0);
});
test('generation helper adds a new explicit CSV node and updates old text without changing saved event identities',()=>{
    const node=structuredClone(city.nodes[0]),original=node.dungeon.id;
    node.id='community-visit';node.name='社区访客点';node.source={kind:'csv',id:'test-city-source'};node.dungeon.id='city:shenzhen:community-visit';
    node.dungeon=JSON.parse(JSON.stringify(node.dungeon).replaceAll(original,node.dungeon.id));
    const generated=updateCityNode(city,node,index);assert.equal(generated.city.nodes.length,city.nodes.length+1);assert.ok(generated.index.regions[0].dungeonIds.includes(node.dungeon.id));
    const expanded=setup().content;installCityDungeons(expanded,generated.city);const layout=expanded.worldMaps[overview];assert.ok(layout.h>1000);assert.ok(layout.landmarks.every(p=>p.y<layout.spawn.y&&p.y<layout.h));
    const {save,content}=setup();enterCityDungeon(save,content,shekou);applyCityInteraction(save,dFor(content,shekou),shekou+':ask');const progress=structuredClone(save.earthCityProgress);
    const edit=structuredClone(city.nodes[0]);edit.dungeon.actions[0].reply='新对白，原事件编号保持。';const updated=updateCityNode(city,edit,index);installCityDungeons(content,updated.city);
    assert.equal(applyCityInteraction(save,dFor(content,shekou),shekou+':ask').changed,false);assert.deepEqual(save.earthCityProgress,progress);
    edit.dungeon.actions.shift();assert.throws(()=>updateCityNode(city,edit,index),/删除/);
});
