import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    parseLootTable,
    isSupportedLootItem,
    rollMonsterDrops,
} from '../js/monster_loot_core.js';
import {
    DARK_ISLAND_STORY_QUESTS,
    DARK_STORY_QUEST_IDS,
    darkIslandStoryProgress,
} from '../js/dark_island_story_core.js';
import {
    TOWER_BLESSINGS,
    isTowerBlessingFloor,
    recordTowerBlessingOffer,
    towerBlessingPendingOffer,
    activeTowerBlessingRows,
} from '../js/tower_blessings_core.js';
import { laterIslandScene } from '../js/later_islands_scene_core.js';
import { npcPurpose, installNpcCatalog } from '../js/adventure_npc_core.js';
import { adventureHonors } from '../js/adventure_honors_core.js';
import { installExpansion } from '../js/adventure_expansion_core.js';
import { installIslandEncounters } from '../js/adventure_island_encounters_core.js';
import { installCatalogQuests, catalogQuestsForNpc, catalogAcceptBlock } from '../js/adventure_catalog_quests_core.js';
import { installIslandPackActors, installIslandPackEncounters, installIslandPackQuests } from '../js/adventure_island_packs_core.js';
import { installDungeons, enterDungeon, leaveDungeon } from '../js/adventure_dungeons_core.js';
import { buildBattleResultViewModel } from '../js/adventure/presenters/battle_view_model.js';
import { buildHudTrackerViewModel } from '../js/adventure/presenters/hud_view_model.js';
import { checkedProgress } from '../js/adventure_cloud_core.js';
import { durableSave, runtimeValues, restoreRuntime } from '../js/adventure_storage_core.js';
import { readIslandPacks } from '../scripts/prepare_island_packs.mjs';
import * as A from '../js/adventure_core.js';
import * as P from '../js/combat_pve_core.js';

const read = file => JSON.parse(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'));

function setup() {
    const cards = read('data/kids/cards.json');
    const charms = read('data/kids/charms.json');
    const names = read('data/kids/card_names.json');
    const { content, dataset } = installExpansion(
        read('data/adventure/chapter.json'),
        read('data/adventure/combat.json'),
        read('data/adventure/pets.json'),
        read('data/adventure/shop-candidates.json'),
        cards,
        charms,
        names,
    );
    content.worldMaps = Object.fromEntries(Object.entries(content.worldMapIndex.islands).map(([id, m]) => [id, read(m.file)]));
    const legacy = read('data/adventure/island-encounters.json');
    installIslandEncounters(content, dataset, legacy, cards, names);
    installCatalogQuests(content, read('data/adventure/quest-runtime.json'));
    installNpcCatalog(content, read('data/adventure/npc-catalog.json'));
    const packs = readIslandPacks();
    installIslandPackActors(content, packs);
    installIslandPackEncounters(content, dataset, packs, legacy.monsters, cards, names);
    installIslandPackQuests(content, packs);
    const dj = read('data/adventure/dungeon-journeys.json');
    content.dungeonJourneys = { ...dj, entries: [...dj.entries, ...packs.flatMap(p => p.journeys)] };
    installDungeons(content, dataset, read('data/adventure/dungeons.json'), cards, names);
    return { content, dataset, packs };
}

test('Monster loot engine parses loot1, skips camp/legacy saves, drops gems/upgrade stones deterministically, and matches victory preview', () => {
    const { content, dataset } = setup();

    // Parse Lua loot1 syntax accurately
    const parsed = parseLootTable('{[17228,1]=25,[26007,2]=40,[17172,1]=100}');
    assert.deepEqual(parsed, [
        { itemId: 17228, count: 1, chance: 25 },
        { itemId: 26007, count: 2, chance: 40 },
        { itemId: 17172, count: 1, chance: 100 },
    ]);
    assert.equal(isSupportedLootItem(content, 26007), true);
    assert.equal(isSupportedLootItem(content, 17487), true);
    assert.equal(isSupportedLootItem(content, 17172), true);

    // Camp & legacy checkpoints (without monsterLootVersion) produce zero drops
    const campSave = A.createAdventure(content, { seed: 12 });
    campSave.zone = 'camp';
    assert.deepEqual(
        rollMonsterDrops(campSave, content, { id: '12:1', monsterLootVersion: 1 }, [{ level: 40, hp: 10000, attributes: { loot1: '{[17172,1]=100}' } }]),
        [],
    );
    const darkSave = A.createAdventure(content, { seed: 12 });
    darkSave.zone = 'dark';
    assert.deepEqual(
        rollMonsterDrops(darkSave, content, { id: '12:1' }, [{ level: 55, hp: 50000, attributes: { loot1: '{[17172,1]=100}' } }]),
        [],
    );

    // Mid/late boss encounter produces deterministic drops matching preview & settleEncounter
    const save = A.createAdventure(content, { seed: 55, school: 'fire' });
    save.level = 55;
    save.zone = 'dark';
    const darkEnc = content.encounters.find(e => e.zone === 'dark' && content.monsters[e.monsterId]?.level >= 45);
    assert.ok(darkEnc);
    A.beginEncounter(save, content, darkEnc.id);
    assert.equal(save.pendingEncounter.monsterLootVersion, 1);

    const battle = P.restorePveBattle(dataset, content, save.pendingEncounter);
    // Simulate a victory to test preview & settlement agreement
    battle.finished = true;
    battle.winner = 'near';
    for (const mob of battle.sides.far) mob.hp = 0;

    const preview = buildBattleResultViewModel({ save, battle, assets: { content, dataset } });
    const beforeInv = { ...save.inventory };
    const settled = A.settleEncounter(save, content, battle, { now: 1000 });
    assert.equal(settled.settled, true);
    assert.deepEqual(settled.droppedItems, preview.droppedItems);
    for (const drop of settled.droppedItems) {
        assert.ok(content.items[drop.itemId], `valid item ${drop.itemId}`);
        assert.ok((save.inventory[drop.itemId] || 0) >= (beforeInv[drop.itemId] || 0) + drop.count);
    }

    // Across 20 distinct seeds on Lv.60+ Tide Island guardians, gems & upgrade materials drop reliably
    let sawGem = false;
    let sawUpgradeOrFood = false;
    const tideBoss = content.monsters['pack:tide:guardian-4'];
    for (let s = 1; s <= 20; s++) {
        const drops = rollMonsterDrops(
            { seed: s, zone: 'tide' },
            content,
            { id: `${s}:9`, monsterLootVersion: 1, dungeonTacticsVersion: 2 },
            [tideBoss],
        );
        for (const d of drops) {
            if (d.itemId >= 26001 && d.itemId <= 26699) sawGem = true;
            if ([17213, 17487, 17172, 23439].includes(d.itemId)) sawUpgradeOrFood = true;
        }
    }
    assert.equal(sawGem, true, 'mid/late encounters should drop socketable gems');
    assert.equal(sawUpgradeOrFood, true, 'mid/late encounters should drop upgrade stones/food/runes');
});

test('Dark Island Lv.40-50 6-chapter story fills progression gap, updates landmarks/NPCs/honors without overriding shops', () => {
    const { content } = setup();
    assert.equal(DARK_ISLAND_STORY_QUESTS.length, 6);

    // Every quest is installed in catalogQuests with valid NPCs, goals, and reward items
    for (const id of DARK_STORY_QUEST_IDS) {
        const q = content.catalogQuests.byId[id];
        assert.ok(q, `dark quest ${id} installed`);
        assert.ok(content.npcs[q.startNpc], `startNpc ${q.startNpc}`);
        assert.ok(content.npcs[q.endNpc], `endNpc ${q.endNpc}`);
        for (const group of q.rewards) {
            for (const item of group.items) {
                if (item.id !== 113) assert.ok(content.items[item.id], `reward item ${item.id} exists`);
            }
        }
    }

    // Lv.40 player can immediately accept 874000 from 智慧星 (35002); Lv.35 is gated by level requirement
    const lowSave = A.createAdventure(content, { seed: 21 });
    lowSave.level = 35;
    assert.match(catalogAcceptBlock(lowSave, content, content.catalogQuests.byId[874000]) || '', /40/);

    const save = A.createAdventure(content, { seed: 22 });
    save.level = 50;
    save.zone = 'dark';
    const here = catalogQuestsForNpc(save, content, 35002);
    assert.ok(here.accept.some(q => q.id === 874000), '智慧星 offers 幽谷雾起 at Lv.40+');

    // Dark Island residents have useful purposes without overriding existing shops (35001, 35010, 35011)
    assert.equal(npcPurpose(content, content.npcs[35001])?.panel, 'npc-services');
    assert.equal(npcPurpose(content, content.npcs[35010])?.panel, 'npc-services');
    assert.equal(npcPurpose(content, content.npcs[35011])?.panel, 'npc-services');
    assert.equal(npcPurpose(content, content.npcs[35003])?.panel, 'inventory');
    assert.equal(npcPurpose(content, content.npcs[35004])?.panel, 'dungeons');
    assert.equal(npcPurpose(content, content.npcs[35006])?.panel, 'pet');

    // Completing the chain updates landmarks, NPC bubbles, progress, and unlocks 幽谷守灯人
    for (const id of DARK_STORY_QUEST_IDS) {
        save.quests[id] = { accepted: true, claimed: true, progress: {} };
    }
    assert.equal(darkIslandStoryProgress(save).complete, true);
    const scene = laterIslandScene(save, 'dark');
    assert.equal(scene.landmarks['东北石脊'].restored, true);
    assert.equal(scene.landmarks['西北禁地'].restored, true);
    assert.equal(scene.landmarks['南部旧广场'].restored, true);
    assert.ok(adventureHonors(save).some(h => h.id === 'dark-story' && h.earned));
});

test('Trial Tower roguelike 3-pick blessings apply deterministically in PvE combat, replay identically, and stay local to the tower run', () => {
    const { content, dataset } = setup();
    assert.equal(TOWER_BLESSINGS.length, 10);
    assert.equal(isTowerBlessingFloor(1, 30), true);
    assert.equal(isTowerBlessingFloor(2, 30), false);
    assert.equal(isTowerBlessingFloor(5, 30), true);
    assert.equal(isTowerBlessingFloor(30, 30), false);

    const save = A.createAdventure(content, { seed: 77, school: 'fire' });
    save.level = 30;
    save.zone = 'fire';
    save.position = { ...content.worldMaps.fire.spawn };
    save.battleSpeed = 2;

    const towerId = 'journey:tower-fire';
    const tower = content.dungeons.find(d => d.id === towerId);
    enterDungeon(save, content, towerId);

    // Win floor 1 -> triggers 3 distinct blessing choices & preview shows towerNext
    A.beginEncounter(save, content, tower.arenas[0].id);
    const floor1Battle = P.restorePveBattle(dataset, content, save.pendingEncounter);
    floor1Battle.finished = true;
    floor1Battle.winner = 'near';
    for (const mob of floor1Battle.sides.far) mob.hp = 0;

    const floor1Vm = buildBattleResultViewModel({ save, battle: floor1Battle, assets: { content, dataset } });
    assert.equal(floor1Vm.towerNext?.nextFloor, 2);
    assert.equal(floor1Vm.towerNext?.offersBlessing, true);

    A.settleEncounter(save, content, floor1Battle, { now: 2000 });
    const offer = towerBlessingPendingOffer(save, towerId);
    assert.ok(offer && offer.choices.length === 3);
    assert.equal(new Set(offer.choices.map(c => c.id)).size, 3);

    // HUD exposes pending blessing choice while inside the tower
    const hudBeforePick = buildHudTrackerViewModel({ assets: { content }, save });
    assert.ok(hudBeforePick.payload.towerBlessingPending);

    // Force-offer focus-spark + blade-edge + vital-spring to verify actual combat impact & replay
    save.towerRunBlessings.offered = ['focus-spark', 'blade-edge', 'vital-spring'];
    const pick1 = A.applyAction(save, content, { type: 'tower-blessing', blessingId: 'focus-spark' });
    assert.equal(pick1.changed, true);
    assert.equal(towerBlessingPendingOffer(save, towerId), null);

    // Offer a second milestone floor and pick vital-spring (with wounded hero to verify heal)
    save.heroHp = 200;
    recordTowerBlessingOffer(save, tower, 5);
    save.towerRunBlessings.offered = ['vital-spring', 'blade-edge', 'iron-bulwark'];
    const pick2 = A.applyAction(save, content, { type: 'tower-blessing', blessingId: 'vital-spring' });
    assert.equal(pick2.changed, true);
    assert.ok(save.heroHp > 200, 'vital-spring immediately heals wounded hero');
    assert.equal(activeTowerBlessingRows(save, towerId).length, 2);

    // Start floor 2 battle: verify focus-spark adds +1 startup power pip and vital-spring boosts maxHp
    A.beginEncounter(save, content, tower.arenas[1].id);
    assert.deepEqual(save.pendingEncounter.towerBlessings, {
        version: 1,
        picks: { 'focus-spark': 1, 'vital-spring': 1 },
    });
    const floor2Battle = P.restorePveBattle(dataset, content, save.pendingEncounter);
    const hero = floor2Battle.sides.near[0];
    assert.ok(hero.stats.startupPower >= 1, 'focus-spark adds startup power pip');
    assert.ok(hero.maxHp > hero.languageBaseMaxHp, 'vital-spring boosts battle maxHp');

    // Verify checkedProgress + exact battle replay compatibility
    const checked = checkedProgress(save, content, dataset);
    assert.deepEqual(checked.save.towerRunBlessings, save.towerRunBlessings);
    assert.equal(checked.save.battleSpeed, 2);
    assert.equal(checked.battle.sides.near[0].maxHp, hero.maxHp);
    assert.equal(checked.battle.sides.near[0].pips.power, hero.pips.power);

    // Verify durableSave strips local towerRunBlessings & battleSpeed while runtimeValues/restoreRuntime preserve them
    const durable = durableSave(save);
    assert.equal(durable.towerRunBlessings, undefined);
    assert.equal(durable.battleSpeed, undefined);
    const runtime = runtimeValues(save);
    const restored = restoreRuntime(durable, content, runtime);
    assert.deepEqual(restored.towerRunBlessings, save.towerRunBlessings);
    assert.equal(restored.battleSpeed, 2);

    // Settle floor 2 and verify heroHp does not exceed base maxHp, and leaving tower resets run blessings
    floor2Battle.finished = true;
    floor2Battle.winner = 'near';
    for (const mob of floor2Battle.sides.far) mob.hp = 0;
    A.settleEncounter(save, content, floor2Battle, { now: 3000 });
    assert.ok(save.heroHp <= hero.languageBaseMaxHp, 'settled heroHp scales back to base maxHp');

    leaveDungeon(save, content);
    assert.equal(save.towerRunBlessings, undefined);
});
