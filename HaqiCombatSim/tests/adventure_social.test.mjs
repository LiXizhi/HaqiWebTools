import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {socialCapacity,recordInteraction,selectSocialRoster,boardGroup,markSocialActivity,makeSocialSnapshot,validatePublicProfile,DAY_MS,pickAutoJoinPartner,autoJoinDelayMs} from '../js/adventure_social_core.js';
import {startCoopRun,dungeonProgress} from '../js/adventure_coop_core.js';
import {createSocialActors,stepSocialActors,socialBubble,pickSocialBubble,socialActivityHubs,onActivityRoad} from '../js/adventure_social_motion_core.js';
import {SOCIAL_DEFAULTS} from '../js/adventure_social_core.js';
import {startSocialPvp,playSocialPvp,restoreSocialPvp,recordPvpWin} from '../js/adventure_social_pvp_core.js';
import {durableSave,runtimeValues,restoreRuntime} from '../js/adventure_storage_core.js';
import {installDungeons,enterDungeon,leaveDungeon} from '../js/adventure_dungeons_core.js';
import {createWorld,walkable} from '../js/adventure_world_core.js';
import {checkedProgress} from '../js/adventure_cloud_core.js';
import * as A from '../js/adventure_core.js';
import * as P from '../js/combat_pve_core.js';
import {presetDeck,aggregateDeck} from '../js/combat_presets_core.js';
import {SimpleBot} from '../js/combat_policy_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
const now=Date.parse('2026-09-26T12:00:00Z');
const profile=(id,extra={})=>({version:1,userId:String(id),username:`user${id}`,name:`伙伴${id}`,visible:true,appearance:'boy',school:'fire',level:1,native:'en',target:'zh',activity:{camp:['2026-09-26']},...extra});
test('public profile keeps optional VIP flag and ignores invalid values',()=>{
    assert.equal(validatePublicProfile(profile(1,{isVip:true})).isVip,true);
    assert.equal(validatePublicProfile(profile(1,{isVip:false})).isVip,false);
    assert.equal(validatePublicProfile(profile(1,{isVip:'yes'})).isVip,false);
    assert.equal(validatePublicProfile(profile(1)).isVip,false);
});
test('recent communicating friends override activity/language and sort by last interaction; no retention quota',()=>{
    const candidates=[profile(1),profile(2,{native:'zh',target:'en',activity:{}}),profile(3,{activity:{}})];
    const options={candidates,friends:['2','3'],interactions:{2:{at:now-2*DAY_MS},3:{at:now-DAY_MS}},now,capacity:3};
    assert.deepEqual(selectSocialRoster(options).map(p=>p.userId),['3','2','1']);
    assert.deepEqual(selectSocialRoster({...options,friends:[]}).map(p=>p.userId),['1']);
    assert.deepEqual(selectSocialRoster({...options,blocked:['3'],selfId:'2'}).map(p=>p.userId),['1']);
    assert.deepEqual(selectSocialRoster({...options,now:now+31*DAY_MS}),[]);
});
test('confirmed real communication only; received and sent events both count; latest time wins',()=>{
    const event={source:'mail',status:'confirmed',peerId:'2',messageId:'m1',at:now-1};let rows=recordInteraction({},event,now);
    assert.equal(rows['2'].at,now-1);
    for(const patch of [{status:'failed'},{generated:true},{system:true},{source:'ai'},{at:now+1},{at:now-31*DAY_MS}])assert.equal(recordInteraction(rows,{...event,...patch},now),rows);
    assert.equal(recordInteraction(rows,{...event,source:'chat',at:now},now)['2'].source,'chat');
});
test('camp capacities, deterministic selection, deduplication and explicit period keys',()=>{
    assert.equal(socialCapacity('camp'),6);assert.equal(socialCapacity('camp',{capacity:30}),8);assert.equal(socialCapacity('camp',{capacity:1}),5);
    const options={now,candidates:[profile(1),profile(1),profile(2)],capacity:6};assert.deepEqual(selectSocialRoster(options),selectSocialRoster(options));assert.equal(selectSocialRoster(options).length,2);
    const q={world:'camp',native:'zh',target:'en',now};assert.notEqual(boardGroup(q),boardGroup({...q,now:now+DAY_MS}));
    assert.deepEqual(markSocialActivity(markSocialActivity({},'camp','battle',now),'camp','quest',now),{camp:['2026-09-26']});
});
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p+'.json',import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter'),read('adventure/combat'),read('adventure/pets'),read('adventure/shop-candidates'),read('kids/cards'),read('kids/charms'));
content.worldMaps=Object.fromEntries(Object.entries(content.worldMapIndex.islands).map(([id,row])=>[id,JSON.parse(fs.readFileSync(new URL('../'+row.file,import.meta.url)))]));
installDungeons(content,dataset,read('adventure/dungeons'),read('kids/cards'));
const dungeon=content.dungeons.find(d=>d.id==='dungeon:HaqiTown_FireCavern');
function setup(count,level=1){const save=A.createAdventure(content);if(level>1){save.xp=content.progression.xpThresholds[level-1];A.syncProgression(save,content);save.deck=aggregateDeck(presetDeck(dataset,save.school,{maxLevel:level,maxCards:A.deckLimits(save,content).capacity,copies:A.deckLimits(save,content).eachCapacity}));for(const row of save.deck)save.cards[row.key]=Math.max(save.cards[row.key]||0,row.count);save.deckLayouts[0].deck=structuredClone(save.deck);}const hero=A.playerSpec(save,content);if(level>1)hero.stats.hpFlat=5000;const people=Array.from({length:count-1},(_,i)=>({...profile(i+2),id:`user:${i+2}`,snapshot:makeSocialSnapshot(hero,dataset)}));startCoopRun(save,people,dataset,dungeon,hero);enterDungeon(save,content,dungeon.id);return save;}
for(const count of [2,3,4])test(`${count} player PvE restores frozen party and local-only progress, does not change pets or solo clears`,()=>{
    const save=setup(count),solo=structuredClone(save.dungeonRuns),pets=structuredClone(save.pets),e=content.encounters.find(e=>e.id===dungeon.arenas[0].id);
    A.beginEncounter(save,content,e.id);const battle=P.restorePveBattle(dataset,content,save.pendingEncounter);assert.equal(battle.sides.near.length,count);
    P.playPveRound(battle,{pass:true});A.recordDecision(save,{pass:true},battle);
    const runtime=runtimeValues(save),durable=durableSave(save);assert.equal(durable.coopRun,undefined);assert.equal(durable.pendingEncounter,undefined);assert.equal(durable.zone,'camp');
    const restored=restoreRuntime(durable,content,runtime);const verified=checkedProgress(restored,content,dataset);assert.deepEqual(verified.battle.events,battle.events);
    battle.sides.near[1].hp=Math.floor(battle.sides.near[1].maxHp/2);battle.finished=true;battle.winner='near';A.settleEncounter(save,content,battle);
    assert.equal(save.coopRun.members[0].unit.hp,battle.sides.near[1].hp);assert.deepEqual(save.dungeonRuns,solo);assert.deepEqual(save.pets,pets);assert.equal(dungeonProgress(save)[dungeon.id].cleared.length,1);
    assert.throws(()=>A.settleEncounter(save,content,battle));leaveDungeon(save,content);assert.equal(save.coopRun,undefined);assert.equal(save.zone,'camp');
});
test('social actors use paths, stay walkable and are deterministic; paused scenes do not move',()=>{
    const save=A.createAdventure(content),world=createWorld('camp',content,save),people=Array.from({length:6},(_,i)=>({...profile(i),id:`p${i}`}));
    const a=createSocialActors(world,people,1),b=createSocialActors(world,people,1),initial=a.map(p=>({...p.position}));
    for(let i=0;i<1600;i++){stepSocialActors(a,world,.1);stepSocialActors(b,world,.1);}
    assert.deepEqual(a.map(p=>p.position),b.map(p=>p.position));assert.notDeepEqual(initial,a.map(p=>p.position));assert.ok(a.every(p=>walkable(world,p.position.x,p.position.y)));
    const before=a.map(p=>({...p.position}));stepSocialActors(a,world,20,{paused:true});assert.deepEqual(before,a.map(p=>p.position));
});
test('social actors spawn and linger on roads near quest hubs, with residents at the spawn',()=>{
    const save=A.createAdventure(content),world=createWorld('camp',content,save),people=Array.from({length:6},(_,i)=>({...profile(i),id:`road${i}`}));
    const hubs=socialActivityHubs(world),reach=SOCIAL_DEFAULTS.hotspotRadius+SOCIAL_DEFAULTS.hotspotSpread;
    assert.ok(hubs.some(h=>h.kind==='portal'));
    assert.ok(hubs.some(h=>h.kind==='npc'));
    const actors=createSocialActors(world,people,11);
    assert.ok(actors.every(a=>onActivityRoad(world,a.position)),'spawn on road');
    assert.ok(actors.every(a=>hubs.some(h=>Math.hypot(a.position.x-h.x,a.position.y-h.y)<=reach)),'spawn near hub');
    const spawnNear=actors.filter(a=>Math.hypot(a.position.x-hubs.find(h=>h.kind==='spawn').x,a.position.y-hubs.find(h=>h.kind==='spawn').y)<=reach).length;
    assert.ok(spawnNear>=SOCIAL_DEFAULTS.spawnMinActors,`spawn cluster ${spawnNear}`);
    const open={x:0,y:0,w:world.w,h:world.h};
    for(let i=0;i<2000;i++)stepSocialActors(actors,world,.1,{view:open});
    const idle=actors.filter(a=>!a.moving&&!a.path.length);
    assert.ok(idle.length,'some idle after travel');
    assert.ok(idle.every(a=>onActivityRoad(world,a.position)),'idle on road');
    assert.ok(idle.every(a=>hubs.some(h=>Math.hypot(a.position.x-h.x,a.position.y-h.y)<=reach+40)),'idle near hubs');
});
test('PvP replay deterministic and filler opponents never score',()=>{
    const save=A.createAdventure(content),unit=A.playerSpec(save,content),opponent={...profile(2),kind:'companion',snapshot:makeSocialSnapshot(unit,dataset)};
    const battle=startSocialPvp(dataset,unit,opponent,12);for(let i=0;i<5&&!battle.arena.finished;i++)playSocialPvp(battle,{pass:true});
    assert.deepEqual(restoreSocialPvp(dataset,battle.replay).arena.events,battle.arena.events);
    battle.arena.finished=true;battle.arena.winner='near';assert.deepEqual(recordPvpWin({},battle,now),{});battle.replay.opponent.kind='account';const ledger=recordPvpWin({},battle,now);assert.deepEqual(recordPvpWin(ledger,battle,now),ledger);
});

for(const count of [2,3,4])test(`${count} player complete dungeon uses real rounds and replay checkpoints`,()=>{
    const save=setup(count,50),bot=new SimpleBot();
    for(const encounter of dungeon.arenas){
        A.beginEncounter(save,content,encounter.id);const battle=P.restorePveBattle(dataset,content,save.pendingEncounter);
        for(let i=0;i<200&&!battle.finished;i++){const decision=bot.pick(battle,battle.unitsById.hero);P.playPveRound(battle,decision);A.recordDecision(save,decision,battle);}
        assert.equal(battle.finished,true);assert.equal(battle.winner,'near');
        const restored=checkedProgress(restoreRuntime(durableSave(save),content,runtimeValues(save)),content,dataset);
        assert.deepEqual(restored.battle.events,battle.events);A.settleEncounter(save,content,battle,{now});
    }
    assert.equal(dungeonProgress(save)[dungeon.id].cleared.length,dungeon.arenas.length);
    assert.equal(save.coopRun.battles.length,dungeon.arenas.length);
    assert.equal(save.relationshipEvents.length,count-1);assert.ok(save.relationshipEvents.every(e=>e.kind==='dungeon'&&e.at===now));
    assert.deepEqual(checkedProgress(save,content,dataset).save.relationshipEvents,save.relationshipEvents);
});


for(const count of [5,6,8])test(`camp ${count} residents avoid NPCs and cap simultaneous motion`,()=>{
    const save=A.createAdventure(content),world=createWorld('camp',content,save),people=Array.from({length:count},(_,i)=>({...profile(i),id:`p${i}`})),actors=createSocialActors(world,people,19);
    assert.ok(actors.every(a=>world.npcs.every(n=>Math.hypot(n.x-a.position.x,n.y-a.position.y)>65)));
    for(let i=0;i<1000;i++){stepSocialActors(actors,world,.1,{team:people.slice(0,3).map(p=>p.id),leader:save.position});assert.ok(actors.filter(a=>a.moving).length<=Math.ceil(count/4));}
});
test('off-camera social actors stay put while on-camera peers may walk',()=>{
    const save=A.createAdventure(content),world=createWorld('camp',content,save),people=Array.from({length:4},(_,i)=>({...profile(i),id:`vis${i}`}));
    const actors=createSocialActors(world,people,7),before=actors.map(a=>({...a.position}));
    const empty={x:-10000,y:-10000,w:10,h:10};
    for(let i=0;i<400;i++)stepSocialActors(actors,world,.1,{view:empty,leader:save.position});
    assert.deepEqual(actors.map(a=>({...a.position})),before);
    assert.ok(actors.every(a=>!a.moving));
    const open={x:0,y:0,w:world.w,h:world.h};
    for(let i=0;i<800;i++)stepSocialActors(actors,world,.1,{view:open});
    assert.notDeepEqual(actors.map(a=>({...a.position})),before);
});

test('opened empty seats pick unused roster companions deterministically',()=>{
    const roster=[profile(1),profile(2),profile(3)].map((p,i)=>({...p,id:`user:${i+1}`}));
    const a=pickAutoJoinPartner(roster,[roster[0]],{seed:7,slotIndex:1,dungeonId:'dungeon:x'});
    const b=pickAutoJoinPartner(roster,[roster[0]],{seed:7,slotIndex:1,dungeonId:'dungeon:x'});
    assert.equal(a.id,b.id);assert.notEqual(a.id,roster[0].id);
    assert.equal(pickAutoJoinPartner(roster,roster,{seed:1,slotIndex:0}),null);
    assert.ok(autoJoinDelayMs({autoJoinMinMs:1500,autoJoinMaxMs:1500})===1500);
});
test('only the nearest nearby bubble is clickable, never the body or a distant actor',()=>{
    const actors=[{profile:{id:'a'},position:{x:100,y:200}},{profile:{id:'b'},position:{x:140,y:200}}],leader={x:90,y:200};
    const b=socialBubble(actors,leader);assert.equal(b.profile.id,'a');
    assert.equal(pickSocialBubble(actors,leader,{x:b.x+20,y:b.y+15}).id,'a');
    assert.equal(pickSocialBubble(actors,leader,{x:100,y:180}),null);
    assert.equal(socialBubble(actors,{x:600,y:600}),null);
    assert.equal(pickSocialBubble(actors,{x:600,y:600},{x:b.x+20,y:b.y+15}),null);
});
test('walking residents finish the path on brush-by; idle near the player holds until they leave',()=>{
    const save=A.createAdventure(content),world=createWorld('camp',content,save),[a]=createSocialActors(world,[{...profile(1),id:'p1'}],1);
    const start={...a.position},goal={x:start.x+50,y:start.y};a.path=[{...goal}];a.moving=true;a.wait=0;
    const brushing={x:start.x+10,y:start.y};stepSocialActors([a],world,.1,{leader:brushing});
    assert.ok(a.path.length||Math.hypot(a.position.x-start.x,a.position.y-start.y)>.01,'brush-by must not cancel travel');
    for(let i=0;i<1000&&a.path.length;i++)stepSocialActors([a],world,.1,{leader:brushing});
    assert.deepEqual(a.path,[]);
    const arrived={...a.position};
    for(let i=0;i<1000;i++)stepSocialActors([a],world,.1,{leader:brushing});
    assert.deepEqual(a.position,arrived);assert.equal(a.moving,false);
    stepSocialActors([a],world,.1,{leader:{x:arrived.x+160,y:arrived.y}});assert.equal(a.approached,true);
    stepSocialActors([a],world,.1,{leader:{x:arrived.x+200,y:arrived.y}});assert.equal(a.approached,false);
    for(let i=0;i<1000;i++)stepSocialActors([a],world,.1);assert.notDeepEqual(a.position,arrived);
});

test('visit seeds change positions while the plaza/spawn receives the reserved residents',()=>{
    const people=Array.from({length:16},(_,i)=>({...profile(i),id:`visit${i}`}));
    for(const zone of ['camp','town','firebird','frost','desert','red-mushroom']){
        if(!content.worldMaps[zone])continue;
        const world=createWorld(zone,content),hub=socialActivityHubs(world).find(h=>h.kind==='spawn');
        assert.deepEqual({x:hub.x,y:hub.y},world.layout.spawn);
        const first=createSocialActors(world,people,'visit:1');
        assert.deepEqual(first.map(a=>a.position),createSocialActors(world,people,'visit:1').map(a=>a.position));
        for(let visit=2;visit<=20;visit++){
            const next=createSocialActors(world,people,`visit:${visit}`);
            assert.notDeepEqual(next.map(a=>a.position),first.map(a=>a.position));
            assert.ok(next.every(a=>walkable(world,a.position.x,a.position.y)));
            assert.ok(next.slice(0,SOCIAL_DEFAULTS.spawnMinActors).every(a=>a.hotspot.kind==='spawn'));
        }
    }
    const world=createWorld('town',content);
    world.landmarks=[...world.landmarks,{id:'plaza',name:'小镇广场',x:3500,y:3000}];
    assert.deepEqual(socialActivityHubs(world).find(h=>h.kind==='spawn'),{x:3500,y:3000,weight:4,kind:'spawn',id:'spawn'});
});

test('every non-camp island fills sixteen unique companions and keeps them on walkable terrain',async()=>{
    const {installNpcCatalog}=await import('../js/adventure_npc_core.js');
    const {installNpcArt}=await import('../js/adventure_npc_art_core.js');
    const fullContent=structuredClone(content),config=read('adventure/social');
    installNpcCatalog(fullContent,read('adventure/npc-catalog'));installNpcArt(fullContent,read('adventure/npc-art'));
    const fillers=config.personas.flatMap((p,i)=>['en','zh','ja','ko'].map((native,d)=>({...p,id:`companion:${i}:${d}`,native})));
    for(const zone of Object.keys(fullContent.worldMapIndex.islands).filter(id=>!id.startsWith('dungeon:'))){
        assert.equal(config.worlds[zone].enabled,true);
        const options={world:zone,now,seed:42,capacity:socialCapacity(zone,config.worlds[zone]),fillers};
        const roster=selectSocialRoster(options),world=createWorld(zone,fullContent);
        assert.equal(roster.length,zone==='camp'?6:16,zone);
        assert.equal(new Set(roster.map(p=>p.name)).size,roster.length);
        assert.deepEqual(roster,selectSocialRoster(options));
        const actors=createSocialActors(world,roster,42);
        assert.ok(actors.every(a=>walkable(world,a.position.x,a.position.y)),`${zone} spawn`);
        assert.ok(actors.every(a=>onActivityRoad(world,a.position)),`${zone} road spawn`);
        const hubs=socialActivityHubs(world),reach=SOCIAL_DEFAULTS.hotspotRadius+SOCIAL_DEFAULTS.hotspotSpread;
        const spawnNear=actors.filter(a=>Math.hypot(a.position.x-hubs.find(h=>h.kind==='spawn').x,a.position.y-hubs.find(h=>h.kind==='spawn').y)<=reach).length;
        assert.ok(spawnNear>=Math.min(SOCIAL_DEFAULTS.spawnMinActors,roster.length),`${zone} spawn cluster`);
        for(let i=0;i<1200;i++)stepSocialActors(actors,world,.1);
        assert.ok(actors.every(a=>walkable(world,a.position.x,a.position.y)),`${zone} movement`);
        const idle=actors.filter(a=>!a.moving&&!a.path.length);
        assert.ok(idle.every(a=>onActivityRoad(world,a.position)),`${zone} idle on road`);
    }
});
