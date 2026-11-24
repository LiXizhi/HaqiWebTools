import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    towerFloorNumber,
    towerFloorTactic,
    nextTowerMilestone,
    validDungeonTacticsCheckpoint,
    dungeonTacticsMonsters,
    dungeonTacticPick,
    dungeonEnemyIntentInfo,
} from '../js/dungeon_tactics_core.js';
import {
    towerMilestoneBonus,
    claimTowerReward,
    towerRewardSteps,
    towerRewardAmount,
} from '../js/adventure_dungeon_journeys_core.js';
import { laterIslandScene, LATER_ISLAND_NPCS } from '../js/later_islands_scene_core.js';
import { adventureHonors } from '../js/adventure_honors_core.js';
import { npcPurpose, npcServices, installNpcCatalog } from '../js/adventure_npc_core.js';
import {
    installCatalogQuests,
    catalogAcceptBlock,
    catalogQuestStatus,
    catalogQuestsForNpc,
} from '../js/adventure_catalog_quests_core.js';
import { installExpansion } from '../js/adventure_expansion_core.js';
import { installIslandEncounters } from '../js/adventure_island_encounters_core.js';
import {
    installIslandPackActors,
    installIslandPackEncounters,
    installIslandPackQuests,
} from '../js/adventure_island_packs_core.js';
import { installDungeons, enterDungeon } from '../js/adventure_dungeons_core.js';
import { parseSave } from '../js/adventure_save_core.js';
import {
    validateLanguageCourses,
    courseAcceptedAnswer,
    completeCourseStep,
} from '../js/language_course_core.js';
import {
    WORD_LANGUAGES,
    parseWordLexicon,
    buildWordIndex,
} from '../js/word_lexicon_core.js';
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
    content.worldMaps = Object.fromEntries(
        Object.entries(content.worldMapIndex.islands).map(([id, m]) => [id, read(m.file)]),
    );
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

test('Trial tower 5th/10th floor tactics work deterministically on every tower and keep legacy checkpoints valid', () => {
    const { content, dataset } = setup();
    const towers = content.dungeons.filter(d => d.kind === 'tower');
    assert.ok(towers.length >= 9, 'expected at least 9 trial towers');

    // Pure milestone rotation & floor parsing
    assert.equal(towerFloorNumber('journey:tower-fire:floor-15'), 15);
    assert.equal(towerFloorNumber('random-id'), 0);
    const fireTower = towers.find(d => d.id === 'journey:tower-fire');
    assert.equal(towerFloorTactic(fireTower, 4), null);
    assert.equal(towerFloorTactic(fireTower, 5).role, 'charger');
    assert.equal(towerFloorTactic(fireTower, 5).tier, 'elite');
    assert.equal(towerFloorTactic(fireTower, 10).role, 'warden');
    assert.equal(towerFloorTactic(fireTower, 10).tier, 'boss');
    assert.equal(towerFloorTactic(fireTower, 15).role, 'hexer');
    assert.equal(towerFloorTactic(fireTower, 20).role, 'breaker');
    assert.equal(nextTowerMilestone(fireTower, 0).floor, 5);
    assert.equal(nextTowerMilestone(fireTower, 5).floor, 10);
    assert.equal(nextTowerMilestone(fireTower, 30), null);

    // Exhaustive safety check: EVERY 5th/10th floor across ALL towers picks valid cards for 4 rounds
    for (const tower of towers) {
        for (let floor = 5; floor <= tower.floors; floor += 5) {
            const arena = tower.arenas[floor - 1];
            const templates = arena.monsterIds.map(id => content.monsters[id]);
            const checkpoint = {
                encounterId: arena.id,
                dungeonTacticsVersion: 3,
                dungeonTacticsId: tower.id,
            };
            assert.equal(validDungeonTacticsCheckpoint(checkpoint, tower), true);
            const scripted = dungeonTacticsMonsters(templates, checkpoint);
            for (const m of scripted) {
                for (let round = 1; round <= 4; round++) {
                    const pick = dungeonTacticPick(m, round, dataset.cards);
                    assert.ok(pick?.key && dataset.cards[pick.key], `${tower.id} floor ${floor} round ${round}`);
                }
            }
        }
    }

    // End-to-end save checkpoint, replay & live enemy intent
    const save = A.createAdventure(content, { seed: 77 });
    save.zone = 'fire';
    save.position = { ...content.worldMaps.fire.spawn };
    save.towerRecords = { 'journey:tower-fire': { floor: 3, claimed: [] } };
    enterDungeon(save, content, 'journey:tower-fire');

    // Floor 4 stays standard (no dungeonTacticsVersion)
    A.beginEncounter(save, content, 'journey:tower-fire:floor-4');
    assert.equal(save.pendingEncounter.dungeonTacticsVersion, undefined);
    assert.ok(parseSave(JSON.stringify(save), content));
    save.pendingEncounter = null;

    // Floor 5 stamps dungeonTacticsVersion: 3 and surfaces live enemy intent
    save.towerRecords['journey:tower-fire'].floor = 4;
    enterDungeon(save, content, 'journey:tower-fire');
    A.beginEncounter(save, content, 'journey:tower-fire:floor-5');
    assert.equal(save.pendingEncounter.dungeonTacticsVersion, 3);
    assert.equal(save.pendingEncounter.dungeonTacticsId, 'journey:tower-fire');
    const loaded = parseSave(JSON.stringify(save), content);
    const battle = P.restorePveBattle(dataset, content, loaded.pendingEncounter);
    const intent = dungeonEnemyIntentInfo(battle);
    assert.ok(intent && intent.label && intent.detail);

    // Legacy floor-5 checkpoint without dungeonTacticsVersion remains valid
    const legacyCheckpoint = { ...loaded.pendingEncounter };
    delete legacyCheckpoint.dungeonTacticsVersion;
    delete legacyCheckpoint.dungeonTacticsId;
    assert.equal(validDungeonTacticsCheckpoint(legacyCheckpoint, fireTower), true);
    const legacySave = { ...loaded, pendingEncounter: legacyCheckpoint };
    assert.ok(parseSave(JSON.stringify(legacySave), content));
});

test('Mid/late trial tower milestone bonuses and honors grant verified items while preserving camp tower coins', () => {
    const { content } = setup();
    const campTower = content.dungeons.find(d => d.id === 'journey:tower-camp');
    const fireTower = content.dungeons.find(d => d.id === 'journey:tower-fire');
    const sailTower = content.dungeons.find(d => d.id === 'journey:sail:tower');

    // Camp tower remains pure coins
    assert.equal(towerMilestoneBonus(content, campTower, 10), null);

    // Every non-camp tower milestone step resolves to a valid item
    for (const tower of content.dungeons.filter(d => d.kind === 'tower' && d.id !== 'journey:tower-camp')) {
        for (const step of towerRewardSteps(tower)) {
            const bonus = towerMilestoneBonus(content, tower, step);
            assert.ok(bonus && content.items[bonus.itemId], `${tower.id} floor ${step} bonus`);
            assert.equal(bonus.summit, step === tower.floors);
        }
    }

    // Alternating pet food (floor 10) -> fairy beans (floor 20) -> summit gear (floor 30)
    const b10 = towerMilestoneBonus(content, fireTower, 10);
    const b20 = towerMilestoneBonus(content, fireTower, 20);
    const b30 = towerMilestoneBonus(content, fireTower, 30);
    assert.equal(b10.itemId, 17172);
    assert.equal(b20.itemId, 17213);
    assert.equal(b30.itemId, 1345);
    assert.equal(b30.summit, true);
    assert.equal(towerMilestoneBonus(content, sailTower, 100).itemId, 2223);

    const save = A.createAdventure(content, { seed: 88 });
    save.towerRecords = { 'journey:tower-fire': { floor: 30, claimed: [] } };
    const coinsBefore = save.inventory[100] || 0;
    const foodBefore = save.inventory[17172] || 0;
    const beansBefore = save.inventory[17213] || 0;
    const crownBefore = save.inventory[1345] || 0;

    const c10 = claimTowerReward(save, content, 'journey:tower-fire', 10);
    assert.equal(c10, towerRewardAmount(content, fireTower, 10));
    assert.equal(save.inventory[17172], foodBefore + b10.count);
    assert.throws(() => claimTowerReward(save, content, 'journey:tower-fire', 10), /已经领取/);

    claimTowerReward(save, content, 'journey:tower-fire', 20);
    assert.equal(save.inventory[17213], beansBefore + b20.count);

    claimTowerReward(save, content, 'journey:tower-fire', 30);
    assert.equal(save.inventory[1345], crownBefore + 1);
    assert.ok(save.inventory[100] > coinsBefore);
    assert.ok(parseSave(JSON.stringify(save), content));

    const honors = Object.fromEntries(adventureHonors(save).map(h => [h.id, h.earned]));
    assert.equal(honors['tower-climber-20'], true);
    assert.equal(honors['tower-summit-late'], true);
});

test('Continuation trilogy (tide/float/sail) has live scene restoration, upgraded rewards, honors and non-conflicting NPC guides', () => {
    const { content, packs } = setup();
    const save = A.createAdventure(content, { seed: 99 });
    const snapshot = JSON.stringify(save);

    assert.equal(laterIslandScene(save, 'camp'), null);

    // Tide restoration progression
    const tideInitial = laterIslandScene(save, 'tide');
    assert.equal(tideInitial.completedQuests, 0);
    assert.equal(tideInitial.landmarks['长明灯塔'].restored, false);
    assert.ok(tideInitial.npcs[LATER_ISLAND_NPCS.tide.alan]);
    assert.equal(JSON.stringify(save), snapshot);

    save.quests[870005] = { accepted: true, claimed: true, progress: {} };
    save.quests[870011] = { accepted: true, claimed: true, progress: {} };
    const tideRestored = laterIslandScene(save, 'tide');
    assert.equal(tideRestored.landmarks['裂灯桥'].restored, true);
    assert.equal(tideRestored.landmarks['长明灯塔'].restored, true);
    assert.match(tideRestored.npcs[LATER_ISLAND_NPCS.tide.alan], /失声的潮灯/);

    // Float & Sail restoration
    save.quests[870105] = { accepted: true, claimed: true, progress: {} };
    save.quests[870111] = { accepted: true, claimed: true, progress: {} };
    const floatRestored = laterIslandScene(save, 'float');
    assert.equal(floatRestored.landmarks['铜星测量台'].restored, true);
    assert.equal(floatRestored.landmarks['共图庭院'].restored, true);

    save.quests[870205] = { accepted: true, claimed: true, progress: {} };
    save.quests[870211] = { accepted: true, claimed: true, progress: {} };
    const sailRestored = laterIslandScene(save, 'sail');
    assert.equal(sailRestored.landmarks['风车道'].restored, true);
    assert.equal(sailRestored.landmarks['风帆塔'].restored, true);

    // Trilogy story honors
    const honors = Object.fromEntries(adventureHonors(save).map(h => [h.id, h.earned]));
    assert.equal(honors['tide-story'], true);
    assert.equal(honors['float-story'], true);
    assert.equal(honors['sail-story'], true);

    // Milestone quests (indices 2, 5, 8, 11) in tide/float/sail carry real item rewards
    const expectedMilestones = {
        tide: [17172, 17213, 1801, 1800],
        float: [17172, 17213, 1934, 1803],
        sail: [17172, 17213, 1866, 2074],
    };
    for (const [islandId, itemIds] of Object.entries(expectedMilestones)) {
        const pack = packs.find(p => p.island.id === islandId);
        [2, 5, 8, 11].forEach((questIdx, i) => {
            const rewardItems = pack.quests[questIdx].rewards.flatMap(g => g.items.map(it => it.id));
            assert.ok(rewardItems.includes(itemIds[i]), `${islandId} quest ${questIdx} should reward ${itemIds[i]}`);
            assert.ok(content.items[itemIds[i]], `item ${itemIds[i]} exists in catalog`);
        });
    }

    // NPC guides exist for tide/float/sail and fire/ice/desert/dark without overriding mentors/shops
    for (const [id, expectedPanel] of [
        [LATER_ISLAND_NPCS.tide.alan, 'dungeons'],
        [LATER_ISLAND_NPCS.tide.cenbo, 'inventory'],
        [LATER_ISLAND_NPCS.tide.cenning, 'pet'],
        [LATER_ISLAND_NPCS.float.lusheng, 'dungeons'],
        [LATER_ISLAND_NPCS.float.mila, 'inventory'],
        [LATER_ISLAND_NPCS.float.hezhou, 'pet'],
        [LATER_ISLAND_NPCS.sail.lifeng, 'dungeons'],
        [LATER_ISLAND_NPCS.sail.keeper, 'inventory'],
        [LATER_ISLAND_NPCS.sail.xiaozhou, 'pet'],
        [30513, 'dungeons'],
        [30601, 'dungeons'],
        [30702, 'dungeons'],
        [35002, 'dungeons'],
    ]) {
        const npc = content.npcs[id];
        assert.ok(npc, `npc ${id} exists`);
        const purpose = npcPurpose(content, npc);
        assert.equal(purpose?.panel, expectedPanel, `npc ${id} panel`);
        assert.equal(npcServices(content, npc).length, 0, `guide npc ${id} has no conflicting mentor/shop service`);
    }
});

test('Dead legacy recharge quests (63053/63054/63055) cannot be newly accepted while existing saves stay readable', () => {
    const { content } = setup();
    const save = A.createAdventure(content, { seed: 101 });
    save.level = 60;
    for (const id of [63053, 63054, 63055]) {
        const quest = content.catalogQuests.byId[id];
        assert.ok(quest, `legacy quest ${id} exists in catalog`);
        assert.equal(catalogAcceptBlock(save, content, quest), '原服充值活动暂未开放');
        assert.equal(catalogQuestStatus(save, content, quest), '未开启');
        const offers = catalogQuestsForNpc(save, content, quest.startNpc);
        assert.equal(offers.accept.some(q => q.id === id), false);

        // Already accepted in a legacy save remains readable as 无法推进
        const legacySave = structuredClone(save);
        legacySave.quests[id] = { accepted: true, claimed: false, progress: {} };
        assert.equal(catalogQuestStatus(legacySave, content, quest), '无法推进');
        assert.ok(parseSave(JSON.stringify(legacySave), content));
    }
});

test('Rewritten mid/late island language courses use natural situational prompts and accept conversational alternatives', () => {
    const courses = read('data/adventure/island-language-courses.json');
    const indexes = {};
    for (const lang of WORD_LANGUAGES) {
        const text = fs.readFileSync(new URL(`../data/adventure/locale/word_${lang}.txt`, import.meta.url), 'utf8');
        indexes[lang] = buildWordIndex(parseWordLexicon(text, lang), lang);
    }
    validateLanguageCourses(courses, indexes);

    const rewrittenIds = [
        'en-ice-01', 'en-desert-01', 'en-dark-01', 'en-tide-01', 'en-sail-01',
        'zh-town-01', 'zh-fire-01', 'zh-ice-01', 'zh-desert-01', 'zh-dark-01',
        'zh-tide-01', 'zh-float-01', 'zh-sail-01',
    ];
    for (const id of rewrittenIds) {
        const course = courses.courses.find(c => c.id === id);
        assert.ok(course, `course ${id} exists`);
        for (const step of course.steps) {
            assert.doesNotMatch(step.prompt, /^Say "/i, `${id} should not use parrot English prompt`);
            assert.doesNotMatch(step.prompt, /^读出“/, `${id} should not use parrot Chinese prompt`);
            assert.ok(Array.isArray(step.alternatives) && step.alternatives.length >= 1, `${id} step ${step.id} alternatives`);
            assert.ok(courseAcceptedAnswer(step, step.answer), `${id}/${step.id} accepts main answer`);
            for (const alt of step.alternatives) {
                assert.ok(courseAcceptedAnswer(step, alt.answer), `${id}/${step.id} accepts alt ${alt.id}`);
            }
        }
    }

    // Verify full conversational answer AND concise alternative both advance a rewritten course
    const practice = { words: {}, courses: {}, practiceReceipts: {} };
    const iceCourse = courses.courses.find(c => c.id === 'en-ice-01');
    const stepEvent = (id, course, step, at, input = 'text') => ({
        id,
        at,
        input,
        ...(step.interaction
            ? {
                interaction: {
                    zone: course.island,
                    kind: step.interaction.kind,
                    id: step.interaction.id,
                    distance: 10,
                    ...(step.interaction.kind === 'encounter' ? { won: true } : {}),
                },
            }
            : {}),
    });
    assert.equal(
        completeCourseStep(
            practice,
            iceCourse,
            iceCourse.steps[0].id,
            iceCourse.steps[0].answer,
            stepEvent('ev-1', iceCourse, iceCourse.steps[0], 1_700_000_000_000, 'text'),
            indexes.en,
        ),
        true,
    );
    assert.equal(
        completeCourseStep(
            practice,
            iceCourse,
            iceCourse.steps[1].id,
            iceCourse.steps[1].alternatives[0].answer,
            stepEvent('ev-2', iceCourse, iceCourse.steps[1], 1_700_000_060_000, 'speech'),
            indexes.en,
        ),
        true,
    );

    const tideZh = courses.courses.find(c => c.id === 'zh-tide-01');
    assert.equal(
        completeCourseStep(
            practice,
            tideZh,
            tideZh.steps[0].id,
            tideZh.steps[0].alternatives[0].answer,
            stepEvent('ev-3', tideZh, tideZh.steps[0], 1_700_000_120_000, 'text'),
            indexes.zh,
        ),
        true,
    );
});
