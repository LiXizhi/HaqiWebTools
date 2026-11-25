import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    HANZI_FORGE_RADICALS,
    HANZI_FORGE_RECIPES,
    hanziForgeCount,
    hanziForgeDiscovered,
    matchHanziForge,
    nextUndiscoveredForgeRecipe,
} from '../js/hanzi_forge_core.js';
import {
    HANZI_LANDMARK_PUZZLES,
    ISLAND_PUZZLES,
    islandPuzzleStatus,
} from '../js/island_puzzles_core.js';
import { HANZI_STELE_SCROLLS } from '../js/hanzi_stele_scroll_core.js';
import { hanziIslandScene } from '../js/hanzi_island_scene_core.js';
import { companionWorldGuide } from '../js/companion_guide_core.js';
import { buildHudTrackerViewModel } from '../js/adventure/presenters/hud_view_model.js';
import { adventureHonors } from '../js/adventure_honors_core.js';
import { checkedProgress } from '../js/adventure_cloud_core.js';
import { splitRoleSave, joinRoleSave } from '../js/adventure_storage_core.js';
import { installExpansion } from '../js/adventure_expansion_core.js';
import { installIslandEncounters } from '../js/adventure_island_encounters_core.js';
import { installCatalogQuests } from '../js/adventure_catalog_quests_core.js';
import { installNpcCatalog } from '../js/adventure_npc_core.js';
import { installIslandPackActors, installIslandPackEncounters, installIslandPackQuests } from '../js/adventure_island_packs_core.js';
import { installDungeons } from '../js/adventure_dungeons_core.js';
import { createWorld } from '../js/adventure_world_core.js';
import { readIslandPacks } from '../scripts/prepare_island_packs.mjs';
import { PUZZLE_STAGE_LAYOUTS } from '../js/views/adventure/view_island_puzzle_stage.js';
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

test('Hanzi Compound Forge matches 12 ideographs regardless of order, reacts playfully to experiments, grants one-time rewards and roundtrips cloud/storage', () => {
    const { content, dataset } = setup();
    const save = A.createAdventure(content, { seed: 73 });

    assert.equal(HANZI_FORGE_RADICALS.length, 18);
    assert.equal(HANZI_FORGE_RECIPES.length, 12);

    // Order-independent matching & playful non-recipe reactions
    assert.equal(matchHanziForge(['yue', 'ri']).recipe?.id, 'ming');
    assert.equal(matchHanziForge(['mu', 'ren']).recipe?.id, 'xiu');
    assert.equal(matchHanziForge(['mu', 'mu']).recipe?.id, 'lin');
    assert.equal(matchHanziForge(['mu', 'mu', 'mu']).recipe?.id, 'sen');
    const steam = matchHanziForge(['shui', 'huo']);
    assert.equal(steam.matched, false);
    assert.match(steam.reaction, /水汽/);

    // Must be on Hanzi Island to forge
    save.zone = 'camp';
    assert.throws(
        () => A.applyAction(save, content, { type: 'hanzi-forge', parts: ['ri', 'yue'] }),
        /字源岛/,
    );

    save.zone = 'hanzi';
    const world = createWorld('hanzi', content, save);
    const coinsStart = save.inventory[100] || 0;
    const xpStart = save.xp || 0;

    // Non-recipe attempt returns playful message without mutating state
    const miss = A.applyAction(save, content, { type: 'hanzi-forge', parts: ['huo', 'shui'] });
    assert.equal(miss.changed, false);
    assert.equal(miss.ok, false);
    assert.equal(save.inventory[100] || 0, coinsStart);

    // Forge all 12 recipes (testing reversed part order!) and verify anti-duplicate + milestones
    for (const [idx, recipe] of HANZI_FORGE_RECIPES.entries()) {
        const res = A.applyAction(save, content, {
            type: 'hanzi-forge',
            parts: [...recipe.parts].reverse(),
        });
        assert.equal(res.changed, true, recipe.id);
        assert.equal(res.ok, true, recipe.id);
        assert.equal(res.recipe.id, recipe.id);
        assert.equal(res.totalDone, idx + 1);
        assert.equal(hanziForgeDiscovered(save, recipe.id), true);

        const repeat = A.applyAction(save, content, {
            type: 'hanzi-forge',
            parts: [...recipe.parts],
        });
        assert.equal(repeat.changed, false);
        assert.equal(repeat.ok, true);
        assert.equal(repeat.alreadyDiscovered, true);
    }

    assert.equal(hanziForgeCount(save), 12);
    assert.equal(nextUndiscoveredForgeRecipe(save), null);
    assert.equal(save.inventory[100], coinsStart + 12 * 35);
    assert.equal(save.xp, xpStart + 12 * 60);

    // Honors & Hanzi Pavilion scene display
    const honors = adventureHonors(save);
    assert.ok(honors.some(h => h.id === 'hanzi-alchemist' && h.earned));
    assert.ok(honors.some(h => h.id === 'hanzi-forge-master' && h.earned));
    const scene = hanziIslandScene(save, content, world);
    assert.equal(scene.forgedCount, 12);
    assert.equal(scene.landmarks['字源亭'].forgedGlyphs.length, 12);

    // Storage split & cloud validation roundtrip
    const checked = checkedProgress(save, content, dataset);
    assert.equal(hanziForgeCount(checked.save), 12);
    const split = splitRoleSave(save);
    const joined = joinRoleSave(split.state, split, content);
    assert.equal(hanziForgeCount(joined), 12);
});

test('Hanzi landmark puzzles unlock sequentially and via universal 87300x quests for English learners without soft-locking', () => {
    const { content } = setup();
    const save = A.createAdventure(content, { seed: 88 });
    assert.equal(save.languageLearning.target, 'en');
    save.zone = 'hanzi';

    // Fresh arrival: road unlocked, canal locked
    assert.equal(islandPuzzleStatus(save, 'hanzi-road').unlocked, true);
    assert.equal(islandPuzzleStatus(save, 'hanzi-canal').unlocked, false);
    assert.match(islandPuzzleStatus(save, 'hanzi-canal').lockReason, /石头路/);

    // Solving road unlocks canal sequentially even with target='en'
    const road = HANZI_LANDMARK_PUZZLES.find(p => p.id === 'hanzi-road');
    const solvedRoad = A.applyAction(save, content, {
        type: 'island-puzzle',
        puzzleId: 'hanzi-road',
        answers: road.slots.map(s => s.answer),
    });
    assert.equal(solvedRoad.ok, true);
    assert.equal(islandPuzzleStatus(save, 'hanzi-canal').unlocked, true);

    // Universal quest 873002 also unlocks hanzi-weather directly
    assert.equal(islandPuzzleStatus(save, 'hanzi-weather').unlocked, false);
    save.quests[873002] = { accepted: true, claimed: false, progress: {} };
    assert.equal(islandPuzzleStatus(save, 'hanzi-weather').unlocked, true);
});

test('All 13 island puzzles have bespoke interactive stage layouts and HUD/guide expose Hanzi Forge cleanly', () => {
    const { content } = setup();
    assert.equal(ISLAND_PUZZLES.length, 13);
    for (const p of ISLAND_PUZZLES) {
        const layout = PUZZLE_STAGE_LAYOUTS[p.id];
        assert.ok(layout, `stage layout missing for ${p.id}`);
        assert.equal(layout.hotspots.length, p.slots.length, `hotspot count mismatch for ${p.id}`);
    }

    const save = A.createAdventure(content, { seed: 95 });
    save.zone = 'hanzi';
    const vm = buildHudTrackerViewModel({ assets: { content }, save });
    assert.equal(vm.islandExplore?.forgeDone, 0);
    assert.equal(vm.islandExplore?.forgeTotal, 12);

    // After all 6 landmark puzzles + 9 stele rubbings are complete, guide suggests Hanzi Forge
    save.islandPuzzles = {
        version: 1,
        solved: {
            ...Object.fromEntries(HANZI_LANDMARK_PUZZLES.map(p => [p.id, true])),
            ...Object.fromEntries(HANZI_STELE_SCROLLS.map(s => [s.solvedKey, true])),
        },
    };
    const guide = companionWorldGuide(save, content);
    assert.equal(guide.panel, 'hanzi-forge');
});
