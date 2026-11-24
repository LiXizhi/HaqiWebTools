import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hanziIslandScene, hanziMemoryContext, HANZI_NPCS, HANZI_STELE_TRIAL_ID } from '../js/hanzi_island_scene_core.js';
import { npcPurpose, installNpcCatalog } from '../js/adventure_npc_core.js';
import { adventureHonors, dungeonHonorTitle } from '../js/adventure_honors_core.js';
import { dungeonTacticsProfile, dungeonTacticsMonsters, dungeonEnemyIntentInfo } from '../js/dungeon_tactics_core.js';
import { dungeonFirstReward, grantDungeonFirstReward } from '../js/dungeon_first_rewards_core.js';
import { installExpansion } from '../js/adventure_expansion_core.js';
import { installIslandEncounters } from '../js/adventure_island_encounters_core.js';
import { installCatalogQuests } from '../js/adventure_catalog_quests_core.js';
import { installIslandPackActors, installIslandPackEncounters, installIslandPackQuests } from '../js/adventure_island_packs_core.js';
import { installDungeons, enterDungeon } from '../js/adventure_dungeons_core.js';
import { createWorld } from '../js/adventure_world_core.js';
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

test('hanziMemoryContext maps every Hanzi Island character to its story, glimpse and restored line', () => {
    const { content, packs } = setup();
    const pack = packs.find(p => p.island.id === 'hanzi');
    for (const word of pack.memory.words) {
        const ctx = hanziMemoryContext(content, word);
        assert.ok(ctx, word);
        assert.ok(ctx.glyph);
        assert.ok(ctx.storyTitle);
        assert.ok(ctx.glimpse);
        assert.ok(ctx.restored);
        assert.ok(ctx.npcName);
    }
    assert.equal(hanziMemoryContext(content, 'nonexistent'), null);
});

test('hanziIslandScene turns recovered characters and completed stories into world signs and dynamic NPC lines without mutating save', () => {
    const { content } = setup();
    const save = A.createAdventure(content, { seed: 41 });
    save.zone = 'hanzi';
    const world = createWorld('hanzi', content, save);
    const before = JSON.stringify(save);

    const initial = hanziIslandScene(save, content, world);
    assert.equal(initial.completedStories, 0);
    assert.equal(initial.restoredWords, 0);
    assert.equal(initial.signs.length, 0);
    assert.ok(initial.npcs[HANZI_NPCS.shibo]);

    save.quests[873100] = { accepted: true, claimed: false, progress: { 'hanzi:shan': 1, 'hanzi:shi': 1 } };
    const partial = hanziIslandScene(save, content, world);
    assert.equal(partial.landmarks['石头路'].done, 2);
    assert.equal(partial.landmarks['石头路'].restored, false);
    assert.deepEqual(partial.signs.map(s => s.glyph), ['山', '石']);
    assert.match(partial.npcs[HANZI_NPCS.shibo], /山、石/);

    save.quests[873100].claimed = true;
    const restoredRoad = hanziIslandScene(save, content, world);
    assert.equal(restoredRoad.completedStories, 1);
    assert.equal(restoredRoad.landmarks['石头路'].restored, true);
    assert.equal(restoredRoad.signs.filter(s => s.restored).length, 5);

    save.quests[873105] = { accepted: true, claimed: true, progress: {} };
    for (const id of [873100, 873101, 873102, 873103, 873104, 873105]) {
        save.quests[id] = { accepted: true, claimed: true, progress: {} };
    }
    const allDone = hanziIslandScene(save, content, world);
    assert.equal(allDone.allRestored, true);
    assert.equal(allDone.signs.length, 30);
    assert.equal(allDone.landmarks['字源亭'].restored, true);
    assert.match(allDone.npcs[HANZI_NPCS.achu], /字源守碑试炼/);

    save.quests = {};
    assert.equal(JSON.stringify({ ...save, zone: 'hanzi' }), before);
});

test('Hanzi Island residents expose real service purposes and Shibo opens Chinese dictionary directly', () => {
    const { content } = setup();
    const shibo = npcPurpose(content, content.npcs[HANZI_NPCS.shibo]);
    const xihe = npcPurpose(content, content.npcs[HANZI_NPCS.xihe]);
    const xiaodeng = npcPurpose(content, content.npcs[HANZI_NPCS.xiaodeng]);
    const achu = npcPurpose(content, content.npcs[HANZI_NPCS.achu]);
    assert.equal(shibo.panel, 'dictionary');
    assert.equal(shibo.options.language, 'zh');
    assert.equal(xihe.panel, 'pet');
    assert.equal(xiaodeng.panel, 'dungeons');
    assert.equal(achu.panel, 'inventory');
});

test('Hanzi Island features 4 regional monster tiers, Stele Trial tactical waves, first-clear wands and honors', () => {
    const { content, dataset, packs } = setup();
    const pack = packs.find(p => p.island.id === 'hanzi');
    assert.equal(pack.monsters.length, 4);
    assert.equal(new Set(pack.encounters.map(e => e.monsterId)).size, 4);
    assert.equal(pack.encounters[0].monsterId, 'pack:hanzi:sprout');

    const trial = content.dungeons.find(d => d.id === HANZI_STELE_TRIAL_ID);
    assert.ok(trial && trial.playable);
    assert.equal(trial.arenas.length, 3);
    const profile = dungeonTacticsProfile(trial);
    assert.equal(profile.version, 2);
    assert.equal(profile.waves.length, 3);

    for (const school of ['fire', 'ice', 'storm', 'death', 'life']) {
        const reward = dungeonFirstReward(content, HANZI_STELE_TRIAL_ID, school);
        assert.ok(reward && reward.item, school);
        assert.equal(reward.level, 10);
    }

    const save = A.createAdventure(content, { school: 'fire', seed: 19 });
    save.zone = 'hanzi';
    save.position = { ...content.worldMaps.hanzi.spawn };
    enterDungeon(save, content, trial.id);
    A.beginEncounter(save, content, trial.arenas[0].id);
    const battle = P.restorePveBattle(dataset, content, save.pendingEncounter);
    const intent = dungeonEnemyIntentInfo(battle);
    assert.ok(intent && intent.label.includes('强化'));
    assert.equal(intent.nextLabel, '攻击');

    save.quests[873105] = { accepted: true, claimed: true, progress: {} };
    save.dungeonChallengeRecords = { [HANZI_STELE_TRIAL_ID]: { clears: 1, firstRewarded: false } };
    const granted = grantDungeonFirstReward(save, content, HANZI_STELE_TRIAL_ID, { complete: true, rewarded: true });
    assert.equal(granted.itemId, 1272);
    assert.equal(grantDungeonFirstReward(save, content, HANZI_STELE_TRIAL_ID, { complete: true, rewarded: true }), null);

    const earnedIds = adventureHonors(save).filter(r => r.earned).map(r => r.id);
    assert.ok(earnedIds.includes('hanzi-restorer'));
    assert.ok(earnedIds.includes(HANZI_STELE_TRIAL_ID));
    assert.equal(dungeonHonorTitle(HANZI_STELE_TRIAL_ID), '守碑传薪人');
});

test('later island elite dungeons expose valid tactical profiles, live intents, first-clear gear and honors', () => {
    const { content, dataset } = setup();
    const ids = [
        'journey:vault-lamp',
        'journey:dream-feather',
        'journey:gold-bell',
        'journey:frozen-letter',
        'journey:storm-compass',
        'journey:sand-echo',
        'journey:oasis-key',
        'journey:night-promise',
        'journey:marsh-beacon',
        'journey:tide:elite-1',
        'journey:tide:elite-2',
        'journey:float:elite-1',
        'journey:float:elite-2',
        'journey:sail:elite-1',
        'journey:sail:elite-2',
    ];
    for (const id of ids) {
        const dungeon = content.dungeons.find(d => d.id === id);
        assert.ok(dungeon, id);
        const profile = dungeonTacticsProfile(dungeon);
        assert.ok(profile, id);
        assert.ok(dungeonHonorTitle(id), id);
        for (const school of ['fire', 'ice', 'storm', 'death', 'life']) {
            assert.ok(dungeonFirstReward(content, id, school)?.item, `${id}:${school}`);
        }
        for (const arena of dungeon.arenas) {
            const templates = dungeonTacticsMonsters(
                arena.monsterIds.map(mid => content.monsters[mid]),
                { dungeonTacticsId: id, dungeonTacticsVersion: profile.version || 1, encounterId: arena.id },
            );
            const battle = P.createPveBattle({
                dataset,
                player: { id: 'hero', school: 'fire', level: dungeon.recommendedLevel, deck: [{ key: 'Fire_SingleAttack_Level0_60', count: 4 }] },
                monsters: templates,
                seed: 11,
            });
            assert.ok(dungeonEnemyIntentInfo(battle)?.label, `${id}:${arena.id} live intent`);
        }
    }
});
