import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generatedCityRoute,generatedCityDungeonId,generateCityDungeon} from '../js/adventure_city_generated_core.js';
import {createCityDungeonLoader} from '../js/adventure_city_dungeons.js';
import {createAdventure,beginEncounter,parseSave,recordDecision,settleEncounter,playerSpec,syncProgression,recommendedDeck} from '../js/adventure_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {startCoopRun} from '../js/adventure_coop_core.js';
import {makeSocialSnapshot} from '../js/adventure_social_core.js';
import {enterCityDungeon,leaveCityDungeon,cityDungeonState} from '../js/adventure_city_dungeons_core.js';
import {createWorld,findPath} from '../js/adventure_world_core.js';
import {durableSave,runtimeValues,restoreRuntime} from '../js/adventure_storage_core.js';
import {restorePveBattle,playPveRound} from '../js/combat_pve_core.js';
import {SimpleBot} from '../js/combat_policy_core.js';
import {drawDungeonEntrance} from '../js/view_dungeon_entrance.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'));
function setup(){const content=read('data/adventure/chapter.json');content.worldMaps={camp:read(content.worldMapIndex.islands.camp.file)};content.dungeons=[];const save=createAdventure(content,{seed:42});save.zone='earth';return {content,save};}
const city={id:'12345',name:'测试城市',lon:114,lat:22,level:2};
test('city markers use the existing static WebP frame at road width without animation',()=>{
    const calls=[],c={};const art={draw:(...args)=>{calls.push(args.slice(1));return true;}};
    drawDungeonEntrance(c,{x:20,y:30,cityDungeon:true,cityLevel:1},0,false,art);
    drawDungeonEntrance(c,{x:20,y:30,cityDungeon:true,cityLevel:1},900,false,art);
    assert.deepEqual(calls[0],calls[1]);assert.deepEqual(calls[0].slice(0,2),['shared','elite']);assert.equal(calls[0][4],64);assert.ok(calls[0][5]<40);
});
test('unconfigured city generation is repeatable, isolated and adapts real opponents to party level',()=>{
    const {save,content}=setup(),route=generatedCityRoute(city,save,[{level:40},{level:20}]),a=generateCityDungeon(content,route),b=generateCityDungeon(content,route);
    assert.deepEqual(a,b);assert.equal(route.challengeLevel,40);assert.equal(route.partySize,3);assert.deepEqual(Object.values(a.monsters).map(m=>m.level),[38,39,40]);
    assert.ok(a.city.nodes[0].dungeon.encounters.every(e=>e.monsterIds.length===3));assert.ok(Object.values(a.monsters).every(m=>m.pool.length&&m.hp>0));
    const other=generateCityDungeon(content,generatedCityRoute({...city,id:'54321'},save));assert.notDeepEqual(a.city.nodes[0].dungeon.blocks,other.city.nodes[0].dungeon.blocks);assert.notEqual(a.city.id,other.city.id);
});
test('default loader needs no city JSON request; cancelled generation leaves content unchanged',async()=>{
    const {save,content}=setup(),route=generatedCityRoute(city,save),loader=createCityDungeonLoader({content,readJson:()=>{throw Error('不应请求城市正文');}}),id=generatedCityDungeonId(route),before=JSON.stringify(content);
    await assert.rejects(loader.load(id,{cityFallback:route,isCurrent:()=>false}),/取消/);assert.equal(JSON.stringify(content),before);
    await loader.load(id,{cityFallback:route});enterCityDungeon(save,content,id);save.cityFallback=route;
    const world=createWorld(id,content,save);assert.equal(world.encounters.length,3);for(const e of world.encounters)assert.ok(findPath(world,save.position,{x:e.x,y:e.y}).length);
    // Choose the third challenge first: generated cities must not enforce linear dungeon order.
    beginEncounter(save,content,world.encounters[2].id);assert.equal(save.pendingEncounter.dungeonMonsterIds.length,1);
});
test('default city local route restores cold saves and never enters durable cloud records',async()=>{
    const {save,content}=setup(),route=generatedCityRoute(city,save),id=generatedCityDungeonId(route),loader=createCityDungeonLoader({content,readJson:()=>{throw Error('不应请求');}});
    await loader.load(id,{cityFallback:route});enterCityDungeon(save,content,id);save.cityFallback=route;const runtime=runtimeValues(save),cloud=durableSave(save);
    assert.equal(cloud.cityFallback,undefined);assert.equal(cloud.zone,'camp');
    const cold=setup().content,coldLoader=createCityDungeonLoader({content:cold,readJson:()=>{throw Error('不应请求');}});await coldLoader.prepareSaves([{...cloud,zone:runtime.earthDungeonZone,cityFallback:runtime.values.cityFallback}]);
    const restored=parseSave(JSON.stringify(restoreRuntime(cloud,cold,runtime)),cold);assert.equal(restored.zone,id);leaveCityDungeon(restored,cold);assert.equal(restored.zone,'earth');assert.equal(restored.cityFallback,undefined);
});
test('generated opponents run real combat, replay and settlement with duplicate rewards guarded',async()=>{
    const {content}=setup(),dataset=read('data/adventure/combat.json');installExpansion(content,dataset,read('data/adventure/pets.json'),read('data/adventure/shop-candidates.json'),read('data/kids/cards.json'),read('data/kids/charms.json'),read('data/kids/card_names.json'));
    const save=createAdventure(content,{seed:42});save.zone='earth';save.xp=4654;syncProgression(save,content);save.deck=recommendedDeck(save,content);const route={...generatedCityRoute(city,save),challengeLevel:1},id=generatedCityDungeonId(route),loader=createCityDungeonLoader({content,readJson:()=>{throw Error('不应请求');}});
    await loader.load(id,{cityFallback:route});enterCityDungeon(save,content,id);save.cityFallback=route;const encounter=createWorld(id,content,save).encounters[2];beginEncounter(save,content,encounter.id);
    const battle=restorePveBattle(dataset,content,save.pendingEncounter),bot=new SimpleBot();let rounds=0;
    while(!battle.finished&&rounds++<200){const decision=bot.pick(battle,battle.sides.near[0]);playPveRound(battle,decision);recordDecision(save,decision,battle);}
    assert.ok(battle.finished);assert.equal(battle.winner,'near');assert.equal(restorePveBattle(dataset,content,save.pendingEncounter).winner,battle.winner);settleEncounter(save,content,battle);
    if(battle.winner==='near'){assert.ok(cityDungeonState(save,generatedCityDungeonId(route).split(':')[1],id).cleared.includes(encounter.id));assert.throws(()=>beginEncounter(save,content,encounter.id),/击败|条件/);}else assert.equal(cityDungeonState(save,id.split(':')[1],id).cleared.length,0);
    assert.equal(parseSave(JSON.stringify(save),content).zone,id);
});
test('cooperative default city scales to the strongest member and restores its real formation',async()=>{
    const {content}=setup(),dataset=read('data/adventure/combat.json');installExpansion(content,dataset,read('data/adventure/pets.json'),read('data/adventure/shop-candidates.json'),read('data/kids/cards.json'),read('data/kids/charms.json'),read('data/kids/card_names.json'));
    const save=createAdventure(content,{seed:42});save.zone='earth';const hero=playerSpec(save,content),peer={id:'city-peer',name:'测试伙伴',level:40,snapshot:makeSocialSnapshot({...hero,level:40},dataset)},route=generatedCityRoute(city,save,[peer]),id=generatedCityDungeonId(route),loader=createCityDungeonLoader({content,readJson:()=>{throw Error('不应请求');}});
    const dungeon=await loader.load(id,{cityFallback:route});enterCityDungeon(save,content,id);save.cityFallback=route;startCoopRun(save,[peer],dataset,dungeon,hero);save.coopRun.returnTo=structuredClone(save.dungeonReturn);
    beginEncounter(save,content,dungeon.arenas[0].id);const battle=restorePveBattle(dataset,content,save.pendingEncounter);assert.equal(battle.sides.near.length,2);assert.equal(battle.sides.far.length,2);assert.equal(battle.sides.far[0].level,38);assert.equal(parseSave(JSON.stringify(save),content).pendingEncounter.party.length,2);
    const cloud=durableSave(save),runtime=runtimeValues(save);assert.equal(cloud.coopRun,undefined);assert.equal(cloud.cityFallback,undefined);assert.equal(cloud.zone,'camp');assert.equal(parseSave(JSON.stringify(restoreRuntime(cloud,content,runtime)),content).coopRun.members.length,1);
    save.pendingEncounter=null;leaveCityDungeon(save,content);assert.equal(save.zone,'earth');assert.equal(save.coopRun,undefined);
});
