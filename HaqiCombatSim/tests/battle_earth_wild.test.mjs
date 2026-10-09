import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {earthWildSpecies,earthWildLevel,createEarthWildEncounter,restoreEarthWildEncounter} from '../js/adventure_earth_wild_core.js';
import {createEarthService} from '../js/adventure_earth.js';
import {earthEncounter,earthSafe,earthPoint,terrainBounds} from '../js/adventure_earth_core.js';
import {createMonsterArtRenderer} from '../js/adventure_monster_art.js';
import {createAdventure,beginEncounter,parseSave,recordDecision,settleEncounter} from '../js/adventure_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {restorePveBattle,playPveRound} from '../js/combat_pve_core.js';
import {SimpleBot} from '../js/combat_policy_core.js';
import {baseMaxHp} from '../js/combat_formulas_core.js';
const read=file=>JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url)));
const pets=read('data/adventure/pets.json').pets;
const content={pets};

test('Earth wilderness draws all 359 four-stage species, independently of player unlock levels',()=>{
    const pool=earthWildSpecies(content);assert.equal(pool.length,359);
    assert.equal(earthWildSpecies({pets:{...pets,portrait:{id:'portrait',staticAppearance:true}}}).length,359);
    const seen=new Set(),stages=new Set();
    for(let x=0;x<6000;x++){
        const options={chunkX:x,chunkY:1,slot:0,level:1,species:pool};
        const e=createEarthWildEncounter(content,options);seen.add(e.monster.speciesId);stages.add(e.monster.appearanceStage);
        assert.deepEqual(createEarthWildEncounter(content,options),e);
        assert.equal(e.monster.level,1);assert.ok(e.monster.pool.length);assert.equal(e.monster.hp,baseMaxHp(e.monster.school,1,'kids'));
        const high=createEarthWildEncounter(content,{...options,level:50});
        assert.equal(high.monster.speciesId,e.monster.speciesId);assert.equal(high.monster.appearanceStage,e.monster.appearanceStage);
        assert.equal(high.monster.level,50);assert.ok(high.monster.xp>e.monster.xp);
    }
    assert.deepEqual([...seen].sort(),pool);assert.deepEqual([...stages].sort(),[0,1,2,3]);
});

test('Earth wild identities restore without streamed world and reject malformed or out-of-range values',()=>{
    const e=createEarthWildEncounter(content,{chunkX:12,chunkY:13,slot:0,level:27});
    assert.deepEqual(earthEncounter(content,e.id),e);
    for(const id of ['earth:wild:missing:1:0:1:1:0',e.id.replace(':27:',':51:'),e.id.replace(':27:',':0:'),e.id.replace(':12:13:0',':12:13:9'),e.id.replace(':12:13:0',':999999:13:0')])assert.equal(restoreEarthWildEncounter(content,id),null);
});

function harness(terrain='grass',cityCsv='wikiDataId,name,country_name,lat,lon,native_name\n',power=undefined){
    let level=12;
    const source={pets:structuredClone(pets)};
    const service=createEarthService({content:source,getPlayerLevel:()=>level,getPlayerPower:()=>power,
        fetcher:async url=>url.startsWith('data/')?{ok:true,json:async()=>read(url)}:url.includes('.csv')?{ok:true,text:async()=>cityCsv}:{ok:true,blob:async()=>({})},
        decode:async(blob,palette,key)=>{
            if(typeof terrain!=='function')return {key,width:2,height:2,indices:new Uint8Array(4),types:[terrain],bytes:20};
            const size=128,b=terrainBounds(key),indices=new Uint8Array(size*size);
            for(let y=0;y<size;y++)for(let x=0;x<size;x++){const point=earthPoint(b.west+(x+.5)*2/size,b.north-(y+.5)*2/size);indices[y*size+x]=terrain(point.x,point.y)==='urban'?1:0;}
            return {key,width:size,height:size,indices,types:['grass','urban'],bytes:indices.byteLength};
        }});
    return {source,service,setLevel:value=>level=value,setPower:value=>power=value};
}

test('Earth streams visible level-matched wilderness mobs, avoids city and water, and follows level changes while stationary',async()=>{
    const {source,service,setLevel}=harness();
    try{
        const {world,position}=await service.prepare({lon:10,lat:10});assert.ok(world.encounters.length>0);assert.ok(world.encounters.length<=25);
        const first=structuredClone(world.encounters);
        for(const e of first){assert.equal(e.monster.level,17);assert.equal(earthSafe(world,e,service.rules.wildSpawnClearance),false);assert.deepEqual(earthEncounter(source,e.id).monster,e.monster);}
        setLevel(26);await service.update(position,1000);
        assert.ok(world.encounters.length>0);assert.ok(world.encounters.every(e=>e.monster.level===31));
        assert.deepEqual(world.encounters.map(e=>[e.x,e.y,e.monster.speciesId,e.monster.appearanceStage]),first.map(e=>[e.x,e.y,e.monster.speciesId,e.monster.appearanceStage]));
        await service.update(earthPoint(10.1,10),2000);assert.ok(world.encounters.length<=25);
    }finally{service.cancel();}
    for(const terrain of ['urban','water','ocean']){
        const {service}=harness(terrain);
        try{if(terrain==='urban'){const {world}=await service.prepare({lon:10,lat:10});assert.equal(world.encounters.length,0);}else await assert.rejects(service.prepare({lon:10,lat:10}));}
        finally{service.cancel();}
    }
    const {service:cityService}=harness('forest','wikiDataId,name,country_name,lat,lon,native_name\nQ1,测试城市,测试,10,10,测试城市');
    try{const {world}=await cityService.prepare({lon:10,lat:10});assert.ok(world.encounters.some(e=>Math.hypot(e.x-earthPoint(10,10).x,e.y-earthPoint(10,10).y)<cityService.rules.settlementRadiusSmall),'city CSV radius must not suppress forest mobs');}
    finally{cityService.cancel();}
});

test('random stage selects the same sprite row in world and battle instead of deriving it from level',()=>{
    const drawn=[],draw=createMonsterArtRenderer({version:1,entries:{},bindings:{},models:{}},content,()=>false,(...args)=>{drawn.push(args);return true;});
    for(let stage=0;stage<4;stage++)assert.equal(draw({}, {speciesId:'dragon_green',level:1,appearanceStage:stage},0,0,100,100),true);
    assert.deepEqual(drawn.map(args=>args[2]),[0,1,2,3]);
});

test('Earth wild battle survives cold save restore, finishes and awards existing repeatable rewards',()=>{
    const source=read('data/adventure/chapter.json'),dataset=read('data/adventure/combat.json');
    installExpansion(source,dataset,read('data/adventure/pets.json'),read('data/adventure/shop-candidates.json'),read('data/kids/cards.json'),read('data/kids/charms.json'));
    const save=createAdventure(source,{seed:42});save.zone='earth';save.position=earthPoint(10,10);
    const e=createEarthWildEncounter(source,{chunkX:4560,chunkY:1920,slot:0,level:save.level,species:['dragon_green']});
    beginEncounter(save,source,e.id);const restored=parseSave(JSON.stringify(save),source);
    assert.deepEqual(restored.pendingEncounter.monster,e.monster);
    const battle=restorePveBattle(dataset,source,restored.pendingEncounter),bot=new SimpleBot();
    assert.equal(battle.monsterTemplates[0].appearanceStage,e.monster.appearanceStage);
    while(!battle.finished){const decision=bot.pick(battle,battle.sides.near[0]);playPveRound(battle,decision);recordDecision(restored,decision,battle);}
    assert.equal(battle.winner,'near');const xp=restored.xp,coins=restored.inventory[100]||0;
    settleEncounter(restored,source,battle,{now:1000});assert.equal(restored.xp-xp,e.monster.xp);assert.equal(restored.inventory[100]-coins,e.monster.coins);
    assert.ok(restored.encounterRespawns[e.id]>1000);assert.throws(()=>beginEncounter(restored,source,e.id,{now:1000}),/刷新/);
    beginEncounter(restored,source,e.id,{now:restored.encounterRespawns[e.id]+1});assert.ok(restored.pendingEncounter);
});

test('Earth difficulty rises with nearest-city distance, wraps longitude and obeys BalanceParams and level limits',()=>{
    const city=earthPoint(10,10),at=distance=>({...city,x:city.x+distance});
    assert.equal(earthWildLevel(content,20,at(1000),[city]),17);
    assert.equal(earthWildLevel(content,20,at(1500),[city]),17);
    assert.equal(earthWildLevel(content,20,at(12000),[city]),25);
    assert.equal(earthWildLevel(content,20,at(24000),[city]),25);
    assert.equal(earthWildLevel(content,20,at(12000),[]),25);
    const levels=Array.from({length:121},(_,i)=>earthWildLevel(content,20,at(i*100),[city]));
    for(let i=1;i<levels.length;i++)assert.ok(levels[i]>=levels[i-1]);
    assert.equal(earthWildLevel(content,20,at(12000),[city,at(12500)]),17,'nearest city wins');
    assert.equal(earthWildLevel(content,1,at(1500),[city]),1);
    assert.equal(earthWildLevel(content,50,at(12000),[city]),50);
    assert.equal(earthWildLevel(content,20,earthPoint(-179.99,10),[earthPoint(179.99,10)]),17);
    const custom={balanceParams:{earth:{wildNearDistance:100,wildFarDistance:200,wildNearLevelOffset:-1,wildFarLevelOffset:2}}};
    assert.equal(earthWildLevel(custom,20,at(100),[city]),19);assert.equal(earthWildLevel(custom,20,at(200),[city]),22);
});

test('Earth ignores city CSV names for difficulty and keeps active overlaps stable',async()=>{
    const city=earthPoint(10,10),{service}=harness('grass','wikiDataId,name,country_name,lat,lon,native_name\nQ1,测试城市,测试,10,10,测试城市');
    try{
        const {world,position}=await service.prepare({lon:10.2,lat:10});
        assert.equal(world.mapCities.length,0,'nearest city lies beyond the scene');assert.ok(world.encounters.length>0);
        assert.ok(world.encounters.every(e=>e.monster.level===17),'only urban terrain affects difficulty');
        const before=new Map(world.encounters.map(e=>[e.id,e]));await service.update({...position,x:position.x+1000},1000);
        const overlap=world.encounters.filter(e=>before.has(e.id));assert.ok(overlap.length>0);
        for(const e of overlap)assert.equal(e,before.get(e.id));
    }finally{service.cancel();}
});

test('Earth gear scaling responds to equipment power while stationary and preserves species and stage',async()=>{
    const {source,service,setPower}=harness('grass',undefined,400);
    try{
        const {world,position}=await service.prepare({lon:10,lat:10});const before=structuredClone(world.encounters);
        assert.ok(before.length>0);assert.ok(before.every(e=>e.monster.gearScore>=520&&e.monster.gearScore<=521));
        setPower(800);await service.update(position,1000);
        assert.ok(world.encounters.every(e=>e.monster.gearScore>=1040&&e.monster.gearScore<=1041));
        assert.deepEqual(world.encounters.map(e=>[e.x,e.y,e.monster.level,e.monster.speciesId,e.monster.appearanceStage]),before.map(e=>[e.x,e.y,e.monster.level,e.monster.speciesId,e.monster.appearanceStage]));
        for(const e of world.encounters)assert.deepEqual(earthEncounter(source,e.id).monster,e.monster);
    }finally{service.cancel();}
});

test('a grassland pocket inside urban terrain spawns visible monsters without any city entries; terrain distance controls difficulty',async()=>{
    const center=earthPoint(10,10),terrain=(x,y)=>Math.abs(x-center.x)<650&&Math.abs(y-center.y)<450?'grass':'urban';
    const {service}=harness(terrain,undefined,400);
    try{
        const {world,position}=await service.prepare({lon:10,lat:10});
        assert.ok(world.wildSpawns.length>0);assert.ok(world.encounters.length>0&&world.encounters.length<=service.rules.wildMaxActors);
        for(const e of world.encounters){assert.equal(world.terrainAt(e.x,e.y),'grass');assert.equal(e.monster.level,9);assert.ok(e.monster.gearScore>=340&&e.monster.gearScore<=341);}
        assert.ok(world.encounters.every(e=>e.sceneState.opacity===0));
        for(let i=0;i<10;i++)service.updateVisible(position,{x:center.x-650,y:center.y-450,w:1300,h:900},.1);
        assert.ok(world.encounters.every(e=>e.sceneState.opacity===1));
    }finally{service.cancel();}
    // A distant urban patch raises difficulty even without city names or centers.
    const farTerrain=(x,y)=>Math.abs(x-(center.x-6000))<900&&Math.abs(y-center.y)<900?'urban':'grass';
    const {service:farService}=harness(farTerrain,undefined,400);
    try{
        const {world}=await farService.prepare({lon:10,lat:10});assert.ok(world.encounters.length>0);
        assert.ok(world.encounters.every(e=>e.monster.level>9&&e.monster.level<17));
        assert.ok(world.encounters.every(e=>e.monster.gearScore>341&&e.monster.gearScore<520));
    }finally{farService.cancel();}
});
