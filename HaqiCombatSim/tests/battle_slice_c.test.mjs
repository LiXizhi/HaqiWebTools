import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installExpansion } from '../js/adventure_expansion_core.js';
import { installIslandEncounters } from '../js/adventure_island_encounters_core.js';
import { installCatalogQuests } from '../js/adventure_catalog_quests_core.js';
import { installNpcCatalog } from '../js/adventure_npc_core.js';
import { installIslandPackActors, installIslandPackEncounters, installIslandPackQuests } from '../js/adventure_island_packs_core.js';
import { installDungeons } from '../js/adventure_dungeons_core.js';
import { installFishing } from '../js/adventure_fishing_core.js';
import { durableSave, runtimeValues, restoreRuntime } from '../js/adventure_storage_core.js';
import { checkedProgress } from '../js/adventure_cloud_core.js';
import { readIslandPacks } from '../scripts/prepare_island_packs.mjs';
import * as A from '../js/adventure_core.js';
import * as C from '../js/combat_pve_core.js';
import * as T from '../js/adventure_time_scroll_core.js';
import {
    ALL_TRILOGY_CURIOS,
    trilogyIslandSummary,
    trilogyNpcIslandId,
} from '../js/trilogy_curios_core.js';
import { earthTimeMilestoneSummary } from '../js/earth_time_rewards_core.js';
import { dailyBountySummary, recordDailyBountyProgress } from '../js/daily_bounties_core.js';
import { adventureHonors, activeAdventureHonor } from '../js/adventure_honors_core.js';
import { buildHudTrackerViewModel } from '../js/adventure/presenters/hud_view_model.js';

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
    installFishing(content, read('data/adventure/fishing.json'));
    const packs = readIslandPacks();
    installIslandPackActors(content, packs);
    installIslandPackEncounters(content, dataset, packs, legacy.monsters, cards, names);
    installIslandPackQuests(content, packs);
    const dj = read('data/adventure/dungeon-journeys.json');
    content.dungeonJourneys = { ...dj, entries: [...dj.entries, ...packs.flatMap(p => p.journeys)] };
    installDungeons(content, dataset, read('data/adventure/dungeons.json'), cards, names);
    return { content, dataset };
}

const { content, dataset } = setup();
const timeData = read('data/adventure/earth/time-scroll/common.json');

function prepLateSave(zone = 'sail', school = 'storm') {
    const save = A.createAdventure(content, { name: '远航者', school, seed: 909 });
    for (const q of content.quests) {
        const progress = {};
        for (const g of q.goals || []) progress[`${g.kind}:${g.id}`] = g.count;
        save.quests[q.id] = { accepted: true, claimed: true, progress };
    }
    save.level = 80;
    save.xp = content.progression.xpThresholds[79] || 500000;
    save.graduated = true;
    save.visitedTown = true;
    save.zone = zone;
    save.position = { ...content.worldMaps[zone].spawn };
    A.syncProgression(save, content);
    return save;
}

test('Slice C1: Trilogy curios, daily exploration activities, and local supply stalls work atomically and unlock honor', () => {
    const save = prepLateSave('tide', 'ice');
    assert.equal(trilogyNpcIslandId(860000), 'tide');
    assert.equal(trilogyNpcIslandId(860100), 'float');
    assert.equal(trilogyNpcIslandId(860200), 'sail');

    // Discover all 9 curios across Tide, Float, Sail
    for (const curio of ALL_TRILOGY_CURIOS) {
        const res = A.applyAction(save, content, { type: 'trilogy-curio', curioId: curio.id, now: 0 });
        assert.equal(res.changed, true);
    }
    // Re-discovery is idempotent
    const dup = A.applyAction(save, content, { type: 'trilogy-curio', curioId: 'tide:bottle', now: 0 });
    assert.equal(dup.changed, false);

    assert.equal(trilogyIslandSummary(save, content, 'sail').vortexUnlocked, true);
    assert.equal(adventureHonors(save).find(h => h.id === 'trilogy-explorer')?.earned, true);

    // Daily activity respects 2/day cap and resets next day
    const day1 = new Date(2026, 10, 25, 10, 0).getTime();
    const day2 = new Date(2026, 10, 26, 10, 0).getTime();
    assert.equal(A.applyAction(save, content, { type: 'trilogy-daily', islandId: 'tide', now: day1 }).changed, true);
    assert.equal(A.applyAction(save, content, { type: 'trilogy-daily', islandId: 'tide', now: day1 }).changed, true);
    assert.equal(A.applyAction(save, content, { type: 'trilogy-daily', islandId: 'tide', now: day1 }).changed, false);
    assert.equal(A.applyAction(save, content, { type: 'trilogy-daily', islandId: 'tide', now: day2 }).changed, true);

    // Buy at Trilogy stall
    save.inventory[100] = 500;
    save.inventory[17213] = 5;
    const buy = A.applyAction(save, content, { type: 'trilogy-buy', offerId: 'sail:atk-gem-3' });
    assert.equal(buy.changed, true);
    assert.equal(save.inventory[100], 180);
    assert.equal(save.inventory[17213], 3);
    assert.ok(save.inventory[26028] >= 1);

    // Storage + cloud + parseSave roundtrip
    const parsed = A.parseSave(JSON.stringify(save), content);
    assert.equal(parsed.trilogyExplore.discovered.length, 9);
    const restored = restoreRuntime(durableSave(parsed), content, runtimeValues(parsed));
    assert.equal(restored.trilogyExplore.discovered.length, 9);
    assert.equal(checkedProgress(parsed, content, dataset).save.trilogyExplore.discovered.length, 9);
});

test('Slice C2: Time Scroll & Shenzhen milestones grant real rewards without changing completeTimeStory non-minting rule', () => {
    const save = prepLateSave('sail', 'life');
    save.languageLearning = { ...save.languageLearning, enabled: true, target: 'en' };
    const beforeInv = structuredClone(save.inventory);

    // Discover 3 time clues and complete 1 time story
    assert.equal(T.discoverTimeClue(save, 'shenzhen', timeData, timeData.stations[0].id, 160), true);
    assert.equal(T.discoverTimeClue(save, 'shenzhen', timeData, timeData.stations[1].id, timeData.spacing + 160), true);
    assert.equal(T.discoverTimeClue(save, 'shenzhen', timeData, timeData.stations[2].id, timeData.spacing * 2 + 160), true);
    const story = timeData.stations[0].story;
    const storyRes = T.completeTimeStory(save, timeData, {
        locale: 'en',
        now: 2000,
        score: 100,
        answered: true,
        story: {
            id: story.id,
            turnIds: story.turns.map(t => t.id),
            hintsUsed: false,
            proof: story.turns.map(t => ({ turnId: t.id, input: 'text', quote: t.answer.en })),
        },
    });
    assert.equal(storyRes.amount, 0, 'completeTimeStory preserves non-minting rule');
    assert.deepEqual(save.inventory, beforeInv);

    // Mark a Shenzhen city dungeon battle cleared using the real earthCityProgress schema
    save.earthCityProgress = {
        version: 1,
        cities: {
            shenzhen: {
                chapters: {},
                quests: {},
                dungeons: {
                    'city:shenzhen:shekou': { version: 1, done: [], cleared: ['city:shenzhen:shekou:e1'], items: {} },
                },
            },
        },
    };

    const summary = earthTimeMilestoneSummary(save, content);
    assert.equal(summary.stats.timeScrollClues, 3);
    assert.equal(summary.stats.timeScrollStories, 1);
    assert.equal(summary.stats.earthVisited, true);
    assert.equal(summary.stats.cityDungeonClears, 1);
    assert.ok(summary.claimableCount >= 5);

    // Claim 3 milestones -> unlocks cross-world-chronicler honor
    assert.equal(A.applyAction(save, content, { type: 'earth-time-claim', milestoneId: 'time-clue-1' }).changed, true);
    assert.equal(A.applyAction(save, content, { type: 'earth-time-claim', milestoneId: 'time-story-1' }).changed, true);
    assert.equal(A.applyAction(save, content, { type: 'earth-time-claim', milestoneId: 'earth-city-clear' }).changed, true);
    assert.equal(A.applyAction(save, content, { type: 'earth-time-claim', milestoneId: 'time-clue-1' }).changed, false);

    assert.ok(save.inventory[17487] >= 1);
    assert.ok(save.inventory[26028] >= 1);
    assert.equal(adventureHonors(save).find(h => h.id === 'cross-world-chronicler')?.earned, true);

    const parsed = A.parseSave(JSON.stringify(save), content);
    assert.deepEqual(parsed.earthTimeClaims, ['time-clue-1', 'time-story-1', 'earth-city-clear']);
    assert.deepEqual(checkedProgress(parsed, content, dataset).save.earthTimeClaims, ['time-clue-1', 'time-story-1', 'earth-city-clear']);
});

test('Slice C3: Daily Archipelago Bounties track victories/actions, grant 3-of-3 bonus, and allow free equipping of any earned honor', () => {
    const save = prepLateSave('float', 'fire');
    const now = new Date(2026, 10, 25, 14, 0).getTime();

    const board = dailyBountySummary(save, content, now);
    assert.equal(board.tasks.length, 3);
    assert.equal(board.claimableCount, 0);

    // Real battle win advances battle-win (and pet-care if in today's pool)
    const enc = content.encounters.find(e => e.zone === 'float');
    assert.ok(enc);
    A.beginEncounter(save, content, enc.id);
    const battle = C.restorePveBattle(dataset, content, save.pendingEncounter);
    battle.sides.far.forEach(u => { u.hp = 0; });
    battle.finished = true;
    battle.winner = 'near';
    A.settleEncounter(save, content, battle, { now });

    // Complete all 3 tasks for today
    for (const task of board.tasks) {
        recordDailyBountyProgress(save, task.id, task.goal, now);
    }
    const readyBoard = dailyBountySummary(save, content, now);
    assert.equal(readyBoard.completedCount, 3);
    assert.equal(readyBoard.bonusClaimable, true);
    assert.equal(readyBoard.claimableCount, 4);

    // HUD exposes chronicleSummary with claimable badge
    const hudVm = buildHudTrackerViewModel({ assets: { content }, save, now });
    assert.equal(hudVm.chronicleSummary.isTrilogy, true);
    assert.equal(hudVm.chronicleSummary.dailyClaimable, 4);

    // Claim all 3 tasks + daily bonus
    for (const task of board.tasks) {
        assert.equal(A.applyAction(save, content, { type: 'daily-bounty-claim', targetId: task.id, now }).changed, true);
    }
    const bonusRes = A.applyAction(save, content, { type: 'daily-bounty-claim', targetId: 'bonus', now });
    assert.equal(bonusRes.changed, true);
    assert.ok(save.inventory[17487] >= 1);
    assert.ok(save.inventory[23439] >= 1);
    assert.equal(A.applyAction(save, content, { type: 'daily-bounty-claim', targetId: 'bonus', now }).changed, false);

    // Free honor equipping for ANY earned honor
    save.campfireCookedCount = 5;
    save.quests[874005] = { accepted: true, claimed: true, progress: {} };
    assert.throws(() => A.applyAction(save, content, { type: 'equip-honor', id: 'trilogy-explorer' }), /尚未获得/);

    const wear = A.applyAction(save, content, { type: 'equip-honor', id: 'campfire-chef' });
    assert.equal(wear.changed, true);
    assert.equal(activeAdventureHonor(save).id, 'campfire-chef');
    assert.equal(activeAdventureHonor(save).title, '营火料理师');

    const parsed = A.parseSave(JSON.stringify(save), content);
    assert.equal(parsed.equippedHonor, 'campfire-chef');
    assert.equal(checkedProgress(parsed, content, dataset).save.equippedHonor, 'campfire-chef');
    assert.equal(checkedProgress(parsed, content, dataset).save.dailyBounties.bonusClaimed, true);

    // Reset back to auto-highest
    const reset = A.applyAction(save, content, { type: 'equip-honor', id: null });
    assert.equal(reset.changed, true);
    assert.equal(save.equippedHonor, undefined);
});
