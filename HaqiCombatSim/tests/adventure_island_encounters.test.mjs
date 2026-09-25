import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installIslandEncounters,catalogGoalEncounter} from '../js/adventure_island_encounters_core.js';
import {installCatalogQuests,catalogGoalRows} from '../js/adventure_catalog_quests_core.js';
import {monsterArtBinding} from '../js/adventure_monster_art_core.js';
import * as A from '../js/adventure_core.js';
import * as P from '../js/combat_pve_core.js';
import {SimpleBot} from '../js/combat_policy_core.js';
import {createWorld,walkable,findPath,followPath,distance} from '../js/adventure_world_core.js';
import {installNpcCatalog} from '../js/adventure_npc_core.js';
import {replaceMonsterCards} from '../js/adventure_monster_cards_core.js';
import {validateSpellEffects} from '../js/spell_effects_core.js';
const read = name => JSON.parse(fs.readFileSync(new URL(`../data/${name}.json`,import.meta.url)));
const wild = read('adventure/island-encounters'), cards = read('kids/cards');
const zones = ['fire','ice','desert','dark'];
const replacements=JSON.parse(fs.readFileSync(new URL('../config/monster-card-replacements.json',import.meta.url)));
function setup() {
    const content=read('adventure/chapter'),dataset=read('adventure/combat');
    dataset.charms=read('kids/charms');
    content.worldMaps=Object.fromEntries(Object.entries(content.worldMapIndex.islands).map(([id,row])=>[id,JSON.parse(fs.readFileSync(new URL('../'+row.file,import.meta.url)))]));
    installCatalogQuests(content,read('adventure/quest-runtime'));
    installIslandEncounters(content,dataset,wild,cards);
    return {content,dataset};
}
test('substitutions cover all AI card containers, preserve weights and leave source data intact',()=>{
    const key='Fire_SingleAttack_Level1', source={id:'original',source:'original.xml',pool:[{key,weight:7}],sequences:[[{card:key,round:'1',target_hostile:'noshield'}]],genes:[{card:key,priority:'3',target_hostile:'noshield'}],cardsets:{one:[{key,weight:4}]}};
    const before=structuredClone(source), m=replaceMonsterCards(source,replacements,cards), target=replacements.cards[key].key;
    assert.deepEqual(source,before);
    assert.equal(m.pool[0].key,target);assert.equal(m.pool[0].weight,7);
    assert.equal(m.sequences[0][0].card,target);assert.equal(m.sequences[0][0].round,'1');
    assert.equal(m.genes[0].card,target);assert.equal(m.cardsets.one[0].key,target);
    assert.equal(m.cardsets.one[0].weight,4);assert.equal(m.source,source.source);
    assert.equal(m.cardReplacements.length,1);assert.notEqual(m.id,source.id);
    assert.equal(m.sequences[0][0].target_hostile,'threat_highest');
    assert.equal(m.genes[0].target_hostile,'threat_highest');
    assert.equal(m.targetReplacements.length,1);
    assert.throws(()=>replaceMonsterCards(source,replacements,{}),/替代卡牌未支持/);
    validateSpellEffects(read('adventure/spell-effects'),Object.fromEntries(Object.values(replacements.cards).map(r=>[r.key,cards[r.key]])));
});
test('reopened island opponents remain playable and replayable after original dungeon templates load',()=>{
    const {content,dataset}=setup();
    const rows=content.encounters.filter(e=>e.zone&&zones.includes(e.zone)&&(content.monsters[e.monsterId]?.cardReplacements||content.monsters[e.monsterId]?.targetReplacements)&&!e.blocked.length);
    assert.ok(rows.length >= 13);
    const sources=read('adventure/dungeons').monsters;
    Object.assign(content.monsters,sources);
    for(const e of rows){
        assert.ok(content.monsters[e.monsterId].cardReplacements||content.monsters[e.monsterId].targetReplacements);
        const save=A.createAdventure(content,{seed:11});save.zone=e.zone;save.position={...content.worldMaps[e.zone].spawn};
        A.beginEncounter(save,content,e.id);
        const arena=P.restorePveBattle(dataset,content,save.pendingEncounter);
        for(let i=0;i<8&&!arena.finished;i++){const decision={pass:true};P.playPveRound(arena,decision);A.recordDecision(save,decision,arena);}
        const loaded=A.parseSave(save,content), replay=P.restorePveBattle(dataset,content,loaded.pendingEncounter);
        assert.deepEqual(replay.events,arena.events);
        assert.equal(arena.unsupported?.total||0,0);
    }
    assert.ok(content.encounters.filter(e=>zones.includes(e.zone)&&!e.legacyOnly&&!e.blocked.length).length >= 100);
});
test('four islands have reachable original monsters with existing WebP appearances and complete quest sources',()=>{
    const {content,dataset}=setup(), art=read('adventure/monster-art');
    installNpcCatalog(content,read('adventure/npc-catalog'));
    const before=content.encounters.length;
    installIslandEncounters(content,dataset,wild,cards);
    assert.equal(content.encounters.length,before);
    for(const zone of zones){
        const world=createWorld(zone,content),rows=world.encounters;
        assert.ok(rows.filter(e=>!e.blocked.length).length>10);
        for(const e of rows){
            assert.ok(monsterArtBinding(content.monsters[e.monsterId],art));
            assert.ok(walkable(world,e.x,e.y));
            assert.ok(world.npcs.every(n=>distance(n,e)>100));
            const end=followPath(world,world.layout.spawn,findPath(world,world.layout.spawn,e),100000);
            assert.ok(!end.blocked&&distance(end.position,e)<1);
        }
        for(const q of content.catalogQuests.quests.filter(q=>q.region===zone))for(const g of q.groups)for(const i of g.items){
            const ids=g.kind==='kill'?[i.id]:g.kind==='loot'?i.producers:[];
            for(const id of ids)assert.ok(rows.some(e=>(e.monsterIds||[e.monsterId]).some(mid=>content.catalogQuests.paths[content.monsters[mid].source.toLowerCase()]===id)),`${zone}/${q.id}/${id}`);
        }
    }
});
test('quest routing selects the correct island from camp and ignores blocked opponents',()=>{
    const {content}=setup();
    for(const zone of zones){
        const e=content.encounters.find(e=>e.zone===zone&&!e.legacyOnly&&!e.blocked.length&&content.catalogQuests.paths[e.monsterId.toLowerCase()]);
        const id=content.catalogQuests.paths[e.monsterId.toLowerCase()];
        assert.equal(catalogGoalEncounter(content,{kind:'kill',id},'camp',zone).zone,zone);
        assert.equal(catalogGoalEncounter(content,{kind:'loot',producers:[id]},zone,zone).zone,zone);
    }
    const blocked={...content.encounters.find(e=>zones.includes(e.zone)),id:'test-blocked',blocked:['未支持规则']},save=A.createAdventure(content);
    content.encounters.push(blocked);
    save.zone=blocked.zone;
    assert.throws(()=>A.beginEncounter(save,content,blocked.id),/未支持/);
});
test('island battle replay, victory quest credit and repeated encounters do not require dungeon runs',()=>{
    const {content,dataset}=setup();
    for(const zone of zones){
        const save=A.createAdventure(content,{name:'任务验证',seed:17});
        save.zone=zone;save.position={...content.worldMaps[zone].spawn};
        const e=content.encounters.filter(e=>e.zone===zone&&!e.legacyOnly&&!e.blocked.length&&content.catalogQuests.paths[e.monsterId.toLowerCase()])
            .sort((a,b)=>content.monsters[a.monsterId].hp-content.monsters[b.monsterId].hp)[0];
        const goal=content.catalogQuests.paths[e.monsterId.toLowerCase()];
        const quests=content.catalogQuests.quests.filter(q=>q.groups.some(g=>g.items.some(i=>g.kind==='kill'?i.id===goal:g.kind==='loot'&&i.producers.includes(goal))));
        assert.ok(quests.length);
        for(const q of quests)save.quests[q.id]={accepted:true,claimed:false,progress:{}};
        A.beginEncounter(save,content,e.id);
        const battle=P.restorePveBattle(dataset,content,save.pendingEncounter),bot=new SimpleBot();
        const pick=bot.pick(battle,battle.sides.near[0]);P.playPveRound(battle,pick);A.recordDecision(save,pick,battle);
        const loaded=A.parseSave(save,content), replay=P.restorePveBattle(dataset,content,loaded.pendingEncounter);
        assert.deepEqual(replay.events,battle.events);
        // Exercise victory accounting independently of the level-one fixture's combat strength.
        battle.finished=true;battle.winner='near';
        A.settleEncounter(save,content,battle);
        for(const q of quests)for(const row of catalogGoalRows(save,content,q))if(row.kind==='kill'&&row.id===goal)assert.equal(row.value,1);
        assert.equal(save.dungeonRuns?.[zone],undefined);
        assert.doesNotThrow(()=>A.beginEncounter(save,content,e.id));
    }
});


test('original island formations preserve all placements, species, duplicates and empty slots',()=>{
    const {content}=setup(), source=read('adventure/monster-catalog');
    const worlds={fire:'FlamingPhoenixIsland',ice:'FrostRoarIsland',desert:'AncientEgyptIsland',dark:'DarkForestIsland'};
    for(const [zone,world] of Object.entries(worlds)){
        const original=source.placements.filter(p=>p.world===world);
        const actual=createWorld(zone,content).encounters.filter(e=>e.sourceArenaId);
        assert.equal(actual.length,original.length);
        for(const p of original){
            const e=actual.find(e=>e.sourceArenaId===p.id);
            const slots=p.data.children.filter(n=>n.tag==='mob');
            assert.deepEqual(e.monsterIds.map(id=>content.monsters[id].source),p.templates);
            assert.deepEqual(e.monsterSlots,slots.flatMap((n,i)=>n.attributes.mob_template?[i]:[]));
        }
    }
});

test('mixed field battles replay and settle every monster without creating dungeon clear state',()=>{
    const {content,dataset}=setup();
    const rows=content.encounters.filter(e=>e.monsterIds?.length>1&&!e.blocked.length);
    assert.ok(rows.length>10);
    for(const e of rows){
        const save=A.createAdventure(content,{seed:29});save.zone=e.zone;save.position={...content.worldMaps[e.zone].spawn};
        A.beginEncounter(save,content,e.id);
        const battle=P.restorePveBattle(dataset,content,save.pendingEncounter);
        assert.equal(battle.sides.far.length,e.monsterIds.length);
        assert.deepEqual(battle.sides.far.map(u=>u.slot),e.monsterSlots);
        const decision={pass:true};P.playPveRound(battle,decision);A.recordDecision(save,decision,battle);
        const loaded=A.parseSave(save,content);
        assert.deepEqual(P.restorePveBattle(dataset,content,loaded.pendingEncounter).events,battle.events);
        const xp=save.xp,coins=save.inventory[100]||0;
        battle.finished=true;battle.winner='near';A.settleEncounter(save,content,battle);
        assert.equal(save.xp-xp,e.monsterIds.reduce((n,id)=>n+content.monsters[id].xp,0));
        assert.equal(save.inventory[100]-coins,e.monsterIds.reduce((n,id)=>n+content.monsters[id].coins,0));
        assert.equal(save.dungeonRuns?.[e.zone],undefined);
        assert.doesNotThrow(()=>A.beginEncounter(save,content,e.id));
    }
});

test('legacy single-enemy checkpoints remain readable but do not appear in world or routing',()=>{
    const {content,dataset}=setup();
    const e=content.encounters.find(e=>e.legacyOnly&&!e.blocked.length);
    const save=A.createAdventure(content);save.zone=e.zone;save.position={...content.worldMaps[e.zone].spawn};
    A.beginEncounter(save,content,e.id);
    const loaded=A.parseSave(save,content);
    assert.equal(P.restorePveBattle(dataset,content,loaded.pendingEncounter).sides.far.length,1);
    assert.ok(!createWorld(e.zone,content).encounters.some(row=>row.id===e.id));
});
