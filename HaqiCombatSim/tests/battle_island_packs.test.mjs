import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readIslandPacks} from '../scripts/prepare_island_packs.mjs';
import {validateIslandPacks,installIslandPackActors,installIslandPackEncounters,installIslandPackQuests,islandPackJournal} from '../js/adventure_island_packs_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {installCatalogQuests,catalogAcceptBlock,catalogQuestReady,noteCatalogKills} from '../js/adventure_catalog_quests_core.js';
import {installIslandEncounters} from '../js/adventure_island_encounters_core.js';
import {installNpcCatalog} from '../js/adventure_npc_core.js';
import {installNpcArt} from '../js/adventure_npc_art_core.js';
import {installDungeons,enterDungeon,leaveDungeon} from '../js/adventure_dungeons_core.js';
import {createWorld,findPath,followPath,distance,walkable} from '../js/adventure_world_core.js';
import {monsterArtBinding} from '../js/adventure_monster_art_core.js';
import {projectRuntimeData} from '../scripts/package_runtime_data.mjs';
import * as A from '../js/adventure_core.js';
import * as B from '../js/combat_pve_core.js';
import {SimpleBot} from '../js/combat_policy_core.js';
import {segmentDistance} from '../js/adventure_island_layout_core.js';
import {onAnyBridge} from '../js/adventure_bridge_core.js';
const read=file=>JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'));
const packs=readIslandPacks(),cards=read('data/kids/cards.json'),names=read('data/kids/card_names.json');
function setup(){
    const {content,dataset}=installExpansion(read('data/adventure/chapter.json'),read('data/adventure/combat.json'),read('data/adventure/pets.json'),read('data/adventure/shop-candidates.json'),cards,read('data/kids/charms.json'),names);
    content.worldMaps=Object.fromEntries(Object.entries(content.worldMapIndex.islands).map(([id,m])=>[id,read(m.file)]));
    const legacy=read('data/adventure/island-encounters.json');
    installIslandEncounters(content,dataset,legacy,cards,names);installCatalogQuests(content,read('data/adventure/quest-runtime.json'));
    validateIslandPacks(packs,content);
    installNpcCatalog(content,read('data/adventure/npc-catalog.json'));installNpcArt(content,read('data/adventure/npc-art.json'));
    installIslandPackActors(content,packs);installIslandPackEncounters(content,dataset,packs,legacy.monsters,cards,names);installIslandPackQuests(content,packs);
    return {content,dataset};
}
test('60/70/80 content plays through existing quest actions, persists and rewards only once',()=>{
    const {content,dataset}=setup();
    for(const pack of packs){
        const save=A.createAdventure(content,{seed:91});save.xp=content.progression.xpThresholds[pack.island.recommendedLevel-1];A.syncProgression(save,content);
        A.applyAction(save,content,{type:'travel',zone:pack.island.id});
        for(const q of pack.quests){
            assert.equal(catalogAcceptBlock(save,content,q),'');A.applyAction(save,content,{type:'accept-catalog',questId:q.id,npcId:q.startNpc});
            assert.equal(catalogQuestReady(save,content,q),false);
            for(const group of q.groups)for(const goal of group.items){
                if(group.kind==='talk')A.applyAction(save,content,{type:'talk',npcId:goal.id});
                else noteCatalogKills(save,content,pack.monsters.filter(m=>pack.goalPaths[m.id]===goal.id).map(m=>content.monsters[m.id]),91);
            }
            assert.equal(catalogQuestReady(save,content,q),true);
            const xp=save.xp,coins=save.inventory[100]||0;A.applyAction(save,content,{type:'claim-catalog',questId:q.id,npcId:q.endNpc});
            assert.ok(save.xp>xp);assert.ok(save.inventory[100]>coins);assert.equal(save.quests[q.id].claimed,true);
            const before=JSON.stringify(save);assert.throws(()=>A.applyAction(save,content,{type:'accept-catalog',questId:q.id,npcId:q.startNpc}));assert.equal(JSON.stringify(save),before);
        }
        const restored=A.parseSave(JSON.stringify(save),content);assert.equal(restored.zone,pack.island.id);assert.equal(restored.quests[pack.quests.at(-1).id].claimed,true);
    }
});
test('new levels are reachable; old 50-level progress survives and no island story requires another island',()=>{
    const {content}=setup();assert.equal(content.progression.levelCap,80);
    const save=A.createAdventure(content);save.xp=content.progression.xpThresholds[49];A.syncProgression(save,content);assert.equal(save.level,50);
    for(const pack of packs){const q=pack.quests[0];assert.deepEqual(q.prerequisites,[]);assert.match(catalogAcceptBlock(save,content,q),/需要等级/);}
    save.xp=content.progression.xpThresholds[79];A.syncProgression(save,content);assert.equal(save.level,80);assert.ok(Number.isFinite(content.progression.xpThresholds[80]));
});
test('all new field targets, real-world observation NPCs and nine dungeon entrances are reachable',()=>{
    const {content,dataset}=setup();const source=read('data/adventure/dungeon-journeys.json');content.dungeonJourneys={...source,entries:[...source.entries,...packs.flatMap(p=>p.journeys)]};installDungeons(content,dataset,read('data/adventure/dungeons.json'),cards,names);
    for(const pack of packs){const world=createWorld(pack.island.id,content),start=world.layout.spawn;assert.equal(world.landmarks.filter(m=>m.dungeonId).length,3);assert.ok(world.npcs.some(n=>n.worldObservation));
        for(const e of world.encounters){const clearance=Math.min(...world.paths.map(p=>segmentDistance(e,p.a,p.b)-(p.width||60)/2));assert.ok(clearance>=world.monsterSceneParams.territoryRadius+16,e.id+' overlaps road');assert.ok(clearance<=280);assert.equal(onAnyBridge(world,e.x,e.y,64),false);}
        for(const target of [...world.npcs,...world.encounters,...world.landmarks,world.portal]){assert.ok(walkable(world,target.x,target.y));const end=followPath(world,start,findPath(world,start,target),100000);assert.ok(!end.blocked&&distance(end.position,target)<=1,pack.island.id+':'+target.id);}
    }
});
test('field battles replay deterministically and appearance uses verified kids templates',()=>{
    const {content,dataset}=setup(),art=read('data/adventure/monster-art.json');
    for(const pack of packs)for(const encounter of pack.encounters){
        const m=content.monsters[encounter.monsterId];assert.ok(monsterArtBinding(m,art),m.id);
        const save=A.createAdventure(content,{seed:321});save.xp=content.progression.xpThresholds[pack.island.recommendedLevel-1];A.syncProgression(save,content);save.zone=pack.island.id;save.position={...content.worldMaps[save.zone].spawn};
        A.beginEncounter(save,content,encounter.id);const first=B.restorePveBattle(dataset,content,save.pendingEncounter),second=B.restorePveBattle(dataset,content,save.pendingEncounter);
        B.playPveRound(first,{pass:true});B.playPveRound(second,{pass:true});assert.deepEqual(first.events,second.events);
        A.recordDecision(save,{pass:true},first);assert.doesNotThrow(()=>B.restorePveBattle(dataset,content,save.pendingEncounter));
    }
});
test('each island can complete a real field fight, restore its decisions and settle its kill goal',()=>{
    const {content,dataset}=setup();
    for(const pack of packs){
        const save=A.createAdventure(content,{seed:731,school:'fire'});save.xp=content.progression.xpThresholds[pack.island.recommendedLevel-1];A.syncProgression(save,content);save.deck=A.recommendedDeck(save,content);save.zone=pack.island.id;save.position={...content.worldMaps[save.zone].spawn};
        // A returning high-level player uses obtainable, supported shop equipment.
        // Keep real item stats, level/school requirements and combat rules intact.
        const score=item=>(item.stats[101]||0)+Object.entries(item.stats).reduce((s,[id,n])=>s+([102,105,110,111,112,113,114,116,117,118,119,120].includes(Number(id))?Number(n)*10:0),0);
        for(const item of Object.values(content.items).filter(i=>i.slot&&i.slot!==24&&!i.vipOnly&&!i.isInternalTest&&A.canEquip({...save,inventory:{...save.inventory,[i.id]:1}},i,content))){
            const old=content.items[save.equipment[item.slot]];if(old&&score(old)>=score(item))continue;save.inventory[item.id]=1;save.equipment[item.slot]=item.id;
        }
        const encounter=pack.encounters[0],quest=pack.quests.find(q=>q.groups.some(g=>g.kind==='kill'&&g.items.some(i=>i.id===pack.goalPaths[encounter.monsterId])));
        save.quests[quest.id]={accepted:true,claimed:false,progress:{}};
        A.beginEncounter(save,content,encounter.id);const battle=B.restorePveBattle(dataset,content,save.pendingEncounter),bot=new SimpleBot();
        for(let i=0;i<200&&!battle.finished;i++){const decision=bot.pick(battle,battle.sides.near[0]);B.playPveRound(battle,decision);A.recordDecision(save,decision,battle);}
        assert.ok(battle.finished);assert.equal(battle.winner,'near',pack.island.id+' geared level '+save.level);
        const restored=A.parseSave(save,content),replayed=B.restorePveBattle(dataset,content,restored.pendingEncounter);assert.deepEqual(replayed.events,battle.events);
        const xp=restored.xp;A.settleEncounter(restored,content,replayed);assert.ok(restored.xp>xp);assert.ok(catalogQuestReady(restored,content,quest));assert.equal(restored.pendingEncounter,null);
    }
});
test('all pack dungeons use high-level opponents and enter/leave through unchanged saves',()=>{
    const {content,dataset}=setup(),source=read('data/adventure/dungeon-journeys.json');content.dungeonJourneys={...source,entries:[...source.entries,...packs.flatMap(p=>p.journeys)]};installDungeons(content,dataset,read('data/adventure/dungeons.json'),cards,names);
    for(const pack of packs)for(const row of pack.journeys){const d=content.dungeons.find(d=>d.id===row.id);assert.ok(d.playable);assert.equal(d.arenas.length,row.kind==='tower'?row.floors:row.arenaCount);assert.ok(d.arenas.every(a=>a.monsterIds.every(id=>content.monsters[id].level>=pack.island.recommendedLevel)));
        const save=A.createAdventure(content);save.zone=pack.island.id;save.position={...content.worldMaps[save.zone].spawn};enterDungeon(save,content,d.id);assert.ok(walkable(createWorld(d.id,content,save),save.position.x,save.position.y));leaveDungeon(save,content);assert.equal(save.zone,pack.island.id);
    }
});
test('pack projection retains dialogue, reward and map-observation configuration',()=>{
    for(const pack of packs){assert.deepEqual(projectRuntimeData('adventure/island-packs/'+pack.island.id+'.json',pack),pack);assert.equal(islandPackJournal([pack]).length,12);}
    const {content}=setup();const bad=structuredClone(packs);bad[0].quests[0].id=content.quests[0].id;assert.throws(()=>validateIslandPacks(bad,{...content,npcs:read('data/adventure/chapter.json').npcs}),/编号/);
});
test('future pack edits reject dependency loops and missing combat targets before installation',()=>{
    const {content}=installExpansion(read('data/adventure/chapter.json'),read('data/adventure/combat.json'),read('data/adventure/pets.json'),read('data/adventure/shop-candidates.json'),cards,read('data/kids/charms.json'),names);
    const cycle=structuredClone(packs);cycle[0].quests[0].prerequisites=[{id:cycle[0].quests.at(-1).id,value:1}];assert.throws(()=>validateIslandPacks(cycle,content),/循环/);
    const missing=structuredClone(packs);missing[1].encounters[0].monsterId='missing-template';assert.throws(()=>validateIslandPacks(missing,content),/遭遇怪物/);
});
