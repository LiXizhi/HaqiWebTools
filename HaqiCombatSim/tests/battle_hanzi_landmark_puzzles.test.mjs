import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    HANZI_LANDMARK_PUZZLES,
    MID_LATE_ISLAND_PUZZLES,
    islandPuzzleForLandmark,
    islandPuzzleStatus,
    allHanziPuzzlesSolved,
    midLatePuzzlesCompletedCount,
} from '../js/island_puzzles_core.js';
import {
    HANZI_STELE_SCROLLS,
    steleRubbingCount,
} from '../js/hanzi_stele_scroll_core.js';
import { laterIslandScene, LATER_ISLAND_NPCS } from '../js/later_islands_scene_core.js';
import { companionWorldGuide } from '../js/companion_guide_core.js';
import { buildHudTrackerViewModel } from '../js/adventure/presenters/hud_view_model.js';
import {
    HANZI_WORD_HABITATS,
    createMemoryNodes,
    decorateSemanticMemoryNodes,
    placeSemanticMemoryNodes,
    memoryParams,
} from '../js/hanzi_memory_core.js';
import { hanziIslandScene, hanziWordBattleResonance } from '../js/hanzi_island_scene_core.js';
import { adventureHonors } from '../js/adventure_honors_core.js';
import { checkedProgress } from '../js/adventure_cloud_core.js';
import { splitRoleSave, joinRoleSave } from '../js/adventure_storage_core.js';
import { installExpansion } from '../js/adventure_expansion_core.js';
import { installIslandEncounters } from '../js/adventure_island_encounters_core.js';
import {
    installCatalogQuests,
    catalogAcceptBlock,
    catalogGoalRows,
} from '../js/adventure_catalog_quests_core.js';
import { installNpcCatalog } from '../js/adventure_npc_core.js';
import { installIslandPackActors, installIslandPackEncounters, installIslandPackQuests } from '../js/adventure_island_packs_core.js';
import { installDungeons } from '../js/adventure_dungeons_core.js';
import { createWorld } from '../js/adventure_world_core.js';
import { readIslandPacks } from '../scripts/prepare_island_packs.mjs';
import * as A from '../js/adventure_core.js';

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

test('Hanzi Island 6 landmark puzzles give gentle wrong-choice hints, grant rewards once, and roundtrip storage/cloud', () => {
    const { content, dataset } = setup();
    const save = A.createAdventure(content, { seed: 91 });
    save.zone = 'hanzi';
    const world = createWorld('hanzi', content, save);

    assert.equal(HANZI_LANDMARK_PUZZLES.length, 6);
    for (const p of HANZI_LANDMARK_PUZZLES) {
        assert.ok(world.landmarks.some(l => l.name === p.landmark), p.landmark);
        assert.equal(islandPuzzleForLandmark('hanzi', p.landmark)?.id, p.id);
    }

    // Road puzzle is immediately available on arrival; canal waits for its story quest.
    assert.equal(islandPuzzleStatus(save, 'hanzi-road').unlocked, true);
    assert.equal(islandPuzzleStatus(save, 'hanzi-canal').unlocked, false);

    // Wrong placement gives gentle situational feedback without mutating save or granting rewards.
    const coinsBefore = save.inventory[100] || 0;
    const wrong = A.applyAction(save, content, {
        type: 'island-puzzle',
        puzzleId: 'hanzi-road',
        answers: ['xia', 'xia', 'zhong'],
    });
    assert.equal(wrong.changed, false);
    assert.equal(wrong.ok, false);
    assert.equal(wrong.slotIndex, 0);
    assert.match(wrong.message, /高处/);
    assert.equal(save.inventory[100] || 0, coinsBefore);

    // Solve all 6 landmark puzzles and verify one-time reward protection + honor + scene badge.
    for (const p of HANZI_LANDMARK_PUZZLES) {
        if (!p.openWithoutQuest) {
            save.quests[p.questId] = { accepted: true, claimed: false, progress: {} };
        }
        const beforeCoins = save.inventory[100] || 0;
        const ok = A.applyAction(save, content, {
            type: 'island-puzzle',
            puzzleId: p.id,
            answers: p.slots.map(s => s.answer),
        });
        assert.equal(ok.changed, true, p.id);
        assert.equal(ok.ok, true, p.id);
        assert.ok((save.inventory[100] || 0) > beforeCoins, p.id);

        const afterFirstCoins = save.inventory[100];
        const repeat = A.applyAction(save, content, {
            type: 'island-puzzle',
            puzzleId: p.id,
            answers: p.slots.map(s => s.answer),
        });
        assert.equal(repeat.changed, false);
        assert.equal(save.inventory[100], afterFirstCoins);
    }

    assert.equal(allHanziPuzzlesSolved(save), true);
    const scene = hanziIslandScene(save, content, world);
    assert.equal(scene.allPuzzlesSolved, true);
    assert.match(scene.landmarks['溪边小村'].label, /田 · 森 · 土/);
    assert.ok(adventureHonors(save).some(h => h.id === 'hanzi-puzzle-master' && h.earned));

    // Verify split storage and cloud snapshot roundtrip preserve islandPuzzles.
    const checked = checkedProgress(save, content, dataset);
    assert.equal(allHanziPuzzlesSolved(checked.save), true);
    const split = splitRoleSave(save);
    const joined = joinRoleSave(split.state, split, content);
    assert.equal(allHanziPuzzlesSolved(joined), true);
});

test('Semantic memory nodes anchor near matching Hanzi Island landmarks and expose character resonance lines', () => {
    const { content, packs } = setup();
    const pack = packs.find(p => p.island.id === 'hanzi');
    const save = A.createAdventure(content, { seed: 33 });
    save.zone = 'hanzi';
    save.quests[873101] = { accepted: true, claimed: false, progress: {} };
    save.trackedQuestIds = [873101];
    const world = createWorld('hanzi', content, save);
    const params = memoryParams(content);
    const candidates = [];
    for (const p of world.paths) {
        candidates.push({ x: p.a.x, y: p.a.y }, { x: p.b.x, y: p.b.y });
    }
    const base = createMemoryNodes(save, pack.memory, candidates, params);
    const placed = placeSemanticMemoryNodes(save, pack.memory, base, candidates, world.landmarks, {});
    const decorated = decorateSemanticMemoryNodes(save, pack.memory, placed, {});
    assert.equal(decorated.length, base.length);
    // Active quest 873101 has 5 distinct words spread across the first 5 nodes.
    assert.deepEqual(decorated.slice(0, 5).map(n => n.hintWord), ['shui', 'tian-field', 'tu', 'mu', 'sen']);
    assert.deepEqual(decorated.slice(0, 5).map(n => n.hintGlyph), ['水', '田', '土', '木', '森']);

    for (const word of pack.memory.words) {
        assert.ok(HANZI_WORD_HABITATS[word]?.glyph, word);
        assert.ok(hanziWordBattleResonance(`zh:${word}`), word);
    }
    assert.equal(hanziWordBattleResonance('en:water'), null);
});

test('Hanzi Stele Scroll activates 9 standalone animations with one-time rubbing rewards and scholar honor', () => {
    const { content } = setup();
    const save = A.createAdventure(content, { seed: 42 });
    assert.equal(HANZI_STELE_SCROLLS.length, 9);

    const coinsStart = save.inventory[100] || 0;

    for (const [idx, stele] of HANZI_STELE_SCROLLS.entries()) {
        const htmlPath = new URL('../' + stele.animation, import.meta.url);
        assert.equal(fs.existsSync(htmlPath), true, stele.animation);

        const res = A.applyAction(save, content, { type: 'stele-rubbing', steleId: stele.id });
        assert.equal(res.changed, true, stele.id);
        assert.equal(res.totalDone, idx + 1);
        assert.equal(
            res.rewards.some(r => r.itemId === 17172 && r.count === 1),
            (idx + 1) % 3 === 0,
            `${stele.id} pet food milestone`,
        );

        const dup = A.applyAction(save, content, { type: 'stele-rubbing', steleId: stele.id });
        assert.equal(dup.changed, false);
        assert.equal(dup.alreadyDone, true);
    }

    assert.equal(steleRubbingCount(save), 9);
    assert.equal(save.inventory[100], coinsStart + 9 * 40);
    assert.ok(adventureHonors(save).some(h => h.id === 'hanzi-stele-scholar' && h.earned));
});

test('Mid/late 7 island commissions restore scene landmarks, update NPC bubbles, unlock archipelago honor, and scale guardian tiers', () => {
    const { content, packs } = setup();
    const save = A.createAdventure(content, { seed: 58 });
    assert.equal(MID_LATE_ISLAND_PUZZLES.length, 7);

    // Every puzzle binds to an actual landmark on its island map and starts unsolved on scene state.
    for (const p of MID_LATE_ISLAND_PUZZLES) {
        const world = createWorld(p.zone, content, save);
        assert.ok(world.landmarks.some(l => l.name === p.landmark), `${p.zone}:${p.landmark}`);
        assert.equal(islandPuzzleForLandmark(p.zone, p.landmark)?.id, p.id);
        const initialScene = laterIslandScene(save, p.zone);
        assert.equal(initialScene.landmarks[p.landmark].restored, false, `${p.zone} initial restored`);
        assert.equal(initialScene.landmarks[p.landmark].active, true, `${p.zone} initial active`);
    }

    // Attempting on the wrong island is rejected; wrong choice on the right island returns gentle hint.
    assert.throws(
        () => A.applyAction(save, content, {
            type: 'island-puzzle',
            puzzleId: 'fire-brazier',
            answers: ['rope', 'tinder', 'bell'],
        }),
        /前往对应的岛屿/,
    );
    save.zone = 'fire';
    const wrong = A.applyAction(save, content, {
        type: 'island-puzzle',
        puzzleId: 'fire-brazier',
        answers: ['rope', 'tinder', 'bell'],
    });
    assert.equal(wrong.changed, false);
    assert.equal(wrong.ok, false);
    assert.equal(wrong.slotIndex, 0);

    // Solve all 7 mid/late puzzles and verify scene restoration + NPC live line change + honor.
    for (const p of MID_LATE_ISLAND_PUZZLES) {
        save.zone = p.zone;
        const beforeNpc = laterIslandScene(save, p.zone).npcs;
        const coinsBefore = save.inventory[100] || 0;
        const ok = A.applyAction(save, content, {
            type: 'island-puzzle',
            puzzleId: p.id,
            answers: p.slots.map(s => s.answer),
        });
        assert.equal(ok.changed, true, p.id);
        assert.equal(ok.ok, true, p.id);
        assert.ok((save.inventory[100] || 0) > coinsBefore, p.id);

        const afterScene = laterIslandScene(save, p.zone);
        assert.equal(afterScene.landmarks[p.landmark].restored, true, `${p.zone} restored`);
        if (['fire', 'ice', 'desert', 'dark'].includes(p.zone)) {
            const guideId = LATER_ISLAND_NPCS[p.zone].guide;
            assert.notEqual(afterScene.npcs[guideId], beforeNpc[guideId], `${p.zone} guide bubble updates`);
        }
    }

    assert.equal(midLatePuzzlesCompletedCount(save), 7);
    assert.ok(adventureHonors(save).some(h => h.id === 'archipelago-steward' && h.earned));

    // Verify trilogy field guardians reward strictly increasing XP & coins as HP rises,
    // and each 4800x4800 trilogy island features 12 reachable field encounters.
    for (const islandId of ['tide', 'float', 'sail']) {
        const pack = packs.find(p => p.island.id === islandId);
        assert.equal(pack.encounters.length, 12, `${islandId} encounter density`);
        for (let i = 1; i < pack.monsters.length; i++) {
            const prev = pack.monsters[i - 1].stats;
            const curr = pack.monsters[i].stats;
            assert.ok(curr.hp > prev.hp, `${islandId} guardian-${i + 1} hp`);
            assert.ok(curr.xp > prev.xp, `${islandId} guardian-${i + 1} xp`);
            assert.ok(curr.coins > prev.coins, `${islandId} guardian-${i + 1} coins`);
        }
    }
});

test('Companion guide and HUD surface island puzzles/stele scroll, while catalog quests bridge pet capture and gate dead server goals', () => {
    const { content } = setup();
    const save = A.createAdventure(content, { seed: 64 });
    save.level = 60;

    // Camp keeps islandExplore null so camp HUD stays untouched.
    assert.equal(buildHudTrackerViewModel({ assets: { content }, save }).islandExplore, null);

    // On Hanzi Island, companion guide & HUD point to the unlocked road puzzle first.
    save.zone = 'hanzi';
    const guideHanzi = companionWorldGuide(save, content);
    assert.equal(guideHanzi.track, 'island-puzzle:hanzi-road');
    const vmHanzi = buildHudTrackerViewModel({ assets: { content }, save });
    assert.equal(vmHanzi.islandExplore?.total, 6);
    assert.equal(vmHanzi.islandExplore?.steleTotal, 9);
    assert.equal(vmHanzi.islandExplore?.next?.id, 'hanzi-road');

    // Once all 6 Hanzi puzzles are solved, companion guide suggests the Stele Scroll.
    save.islandPuzzles = {
        version: 1,
        solved: Object.fromEntries(HANZI_LANDMARK_PUZZLES.map(p => [p.id, true])),
    };
    const guideStele = companionWorldGuide(save, content);
    assert.equal(guideStele.panel, 'hanzi-stele-scroll');

    // On Fire Island, companion guide & HUD point to fire-brazier.
    save.zone = 'fire';
    assert.equal(companionWorldGuide(save, content).track, 'island-puzzle:fire-brazier');

    // Mid-game pet-capture quests (63047..63052) bridge cleanly to captured pets in save.pets.
    const fireCap = content.catalogQuests.byId[63047];
    assert.ok(fireCap);
    const rowsBefore = catalogGoalRows(save, content, fireCap);
    assert.equal(rowsBefore[0].blocked, false);
    assert.equal(rowsBefore[0].value, 0);
    content.pets['model:fire-warrior-test'] = { id: 'model:fire-warrior-test', name: '火鸟战士', school: 'fire' };
    save.pets['pet-fire-warrior'] = { id: 'pet-fire-warrior', speciesId: 'model:fire-warrior-test', level: 20 };
    const rowsAfter = catalogGoalRows(save, content, fireCap);
    assert.equal(rowsAfter[0].value, 1);

    // Server-only social/PvP quests cannot be newly accepted, while 79033 shows readable stat label.
    assert.equal(catalogAcceptBlock(save, content, content.catalogQuests.byId[61152]), '给人气需要其他玩家');
    assert.equal(catalogAcceptBlock(save, content, content.catalogQuests.byId[63104]), '拉斐尔3v3尚未开放');
    assert.match(
        catalogAcceptBlock(save, content, content.catalogQuests.byId[61207], { 79033: 50 }),
        /本系攻击力/,
    );
});
