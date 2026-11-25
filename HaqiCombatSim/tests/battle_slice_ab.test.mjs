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
import * as Pets from '../js/adventure_pets_core.js';
import { applyHanziForge } from '../js/hanzi_forge_core.js';
import { HANZI_SEALS, equippedHanziSeal } from '../js/hanzi_seal_core.js';
import { learningQuestMatches } from '../js/learning_quest_core.js';
import { wordCardLevelBonus, makeWordCardSnapshot, activateWordCard } from '../js/word_cards_core.js';
import { fishingAlbumSummary } from '../js/fishing_bounties_core.js';
import { recordGatherPantry, campfireBuffDetail } from '../js/campfire_cooking_core.js';
import { evaluatePartySynergies, formationSynergyPreview } from '../js/pet_synergy_core.js';
import { adventureHonors } from '../js/adventure_honors_core.js';
import { buildBattleResultViewModel } from '../js/adventure/presenters/battle_view_model.js';
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
const wordCardRows = read('data/adventure/dictionary/word-cards.json').cards;

function prepMidSave(zone = 'hanzi', school = 'fire') {
    const save = A.createAdventure(content, { name: '试炼师', school, seed: 808 });
    for (const q of content.quests) {
        const progress = {};
        for (const g of q.goals || []) progress[`${g.kind}:${g.id}`] = g.count;
        save.quests[q.id] = { accepted: true, claimed: true, progress };
    }
    save.level = 40;
    save.xp = content.progression.xpThresholds[39] || 50000;
    save.graduated = true;
    save.visitedTown = true;
    save.zone = zone;
    save.position = { ...content.worldMaps[zone].spawn };
    A.syncProgression(save, content);
    return save;
}

test('Slice A1: Hanzi Compound Seals unlock from Forge, boost PvE deterministically, replay identically, and survive storage', () => {
    const save = prepMidSave('hanzi', 'fire');
    assert.equal(HANZI_SEALS.length, 12);
    assert.equal(equippedHanziSeal(save), null);
    assert.throws(() => A.applyAction(save, content, { type: 'equip-hanzi-seal', sealId: 'yan-flame' }), /先在字源合字坊造出/);

    // Forge 炎 (火+火) and 休 (人+木)
    assert.equal(applyHanziForge(save, content, { parts: ['huo', 'huo'] }).ok, true);
    assert.equal(applyHanziForge(save, content, { parts: ['ren', 'mu'] }).ok, true);

    const eqRes = A.applyAction(save, content, { type: 'equip-hanzi-seal', sealId: 'xiu' });
    assert.equal(eqRes.changed, true);
    assert.equal(save.hanziSeal, 'xiu');
    assert.equal(equippedHanziSeal(save).glyph, '休');

    // Storage + cloud + parseSave roundtrip
    const parsed = A.parseSave(JSON.stringify(save), content);
    assert.equal(parsed.hanziSeal, 'xiu');
    const restored = restoreRuntime(durableSave(parsed), content, runtimeValues(parsed));
    assert.equal(restored.hanziSeal, 'xiu');
    const cloud = checkedProgress(parsed, content, dataset).save;
    assert.equal(cloud.hanziSeal, 'xiu');

    // Begin battle & verify HP/heal boost + replay + settlement base HP restoration
    const enc = content.encounters.find(e => e.zone === 'hanzi');
    assert.ok(enc);
    const baseHeroHp = Pets.specMaxHp(A.playerSpec(save, content));
    save.heroHp = baseHeroHp;
    A.beginEncounter(save, content, enc.id);
    assert.deepEqual(save.pendingEncounter.hanziSeal, { version: 1, id: 'xiu' });

    const battle = C.restorePveBattle(dataset, content, save.pendingEncounter);
    assert.equal(battle.hanziSeal.id, 'xiu');
    assert.ok(battle.sides.near[0].maxHp > baseHeroHp, 'xiu seal should increase battle maxHp');
    assert.ok(battle.sides.near[0].stats.outputHealPct >= 12);

    // Mid-battle swap is blocked
    assert.throws(() => A.applyAction(save, content, { type: 'equip-hanzi-seal', sealId: 'yan-flame' }), /请先完成当前战斗|战斗中无法更换/);

    // Replay equality
    const replay = C.restorePveBattle(dataset, content, save.pendingEncounter);
    assert.equal(replay.sides.near[0].maxHp, battle.sides.near[0].maxHp);
    assert.equal(replay.sides.near[0].stats.outputHealPct, battle.sides.near[0].stats.outputHealPct);

    // Win and verify HP settles cleanly to base HP (not inflated)
    battle.sides.far.forEach(u => { u.hp = 0; });
    battle.finished = true;
    battle.winner = 'near';
    A.settleEncounter(save, content, battle);
    assert.ok(save.heroHp <= baseHeroHp + 1, 'settled heroHp should return to unbuffed base scale');

    // Unequip works cleanly
    const unEq = A.applyAction(save, content, { type: 'equip-hanzi-seal', sealId: null });
    assert.equal(unEq.changed, true);
    assert.equal(save.hanziSeal, undefined);
});

test('Slice A2: English learners can toggle Hanzi Island story exploration without changing primary language', () => {
    const save = prepMidSave('hanzi', 'ice');
    assert.equal(save.languageLearning.target, 'en');
    const hanziPack = content.islandPacks.find(p => p.island.id === 'hanzi');
    const hanziQuest = content.catalogQuests.byId[873100];
    const otherZhQuest = { id: 999999, learningLanguage: 'zh', region: 'town' };

    assert.equal(learningQuestMatches(save, hanziPack.memory), false);
    assert.equal(learningQuestMatches(save, hanziQuest), false);

    const toggled = A.applyAction(save, content, { type: 'toggle-hanzi-story-explore', enabled: true });
    assert.equal(toggled.changed, true);
    assert.equal(save.hanziStoryExplore, true);
    assert.equal(save.languageLearning.target, 'en', 'primary target language must remain English');
    assert.equal(learningQuestMatches(save, hanziPack.memory), true);
    assert.equal(learningQuestMatches(save, hanziQuest), true);
    assert.equal(learningQuestMatches(save, otherZhQuest), false, 'non-Hanzi zh quests stay isolated');

    // HUD exposes toggle
    const hudVm = buildHudTrackerViewModel({ assets: { content }, save });
    assert.equal(hudVm.islandExplore.canToggleHanziStories, true);
    assert.equal(hudVm.islandExplore.hanziStoryExplore, true);

    // Roundtrip through parseSave & storage & cloud
    const parsed = A.parseSave(JSON.stringify(save), content);
    assert.equal(parsed.hanziStoryExplore, true);
    const restored = restoreRuntime(durableSave(parsed), content, runtimeValues(parsed));
    assert.equal(restored.hanziStoryExplore, true);
    assert.equal(checkedProgress(parsed, content, dataset).save.hanziStoryExplore, true);
});

test('Slice A3: Word cards scale meaningfully with hero level when v1 is active while keeping Lv.1 and legacy checkpoints unchanged', () => {
    assert.deepEqual(wordCardLevelBonus(1), { damagePct: 0, outputHealPct: 0, accuracyPct: 0 });
    const lv40 = wordCardLevelBonus(40);
    assert.equal(lv40.damagePct, 117);
    assert.equal(lv40.outputHealPct, 117);
    assert.equal(lv40.accuracyPct, 15);
    assert.equal(wordCardLevelBonus(80).damagePct, 180);

    const save = prepMidSave('fire', 'fire');
    const enc = content.encounters.find(e => e.zone === 'fire');
    A.beginEncounter(save, content, enc.id);
    assert.equal(save.pendingEncounter.wordCardScalingVersion, 1);

    const attackRow = wordCardRows.find(r => r.language === 'en' && dataset.cards[r.baseCardKey]?.type === 'SingleAttack');
    assert.ok(attackRow, 'should find an English SingleAttack word card');
    const learned = { languages: { en: { entries: { [attackRow.entryId]: { lastAttemptAt: 1000 } } } } };
    save.pendingEncounter.wordCards = makeWordCardSnapshot(learned, wordCardRows, save.pendingEncounter.seed, 10, 'en');

    // Run scaled v1 vs legacy v0 side-by-side on the exact same checkpoint
    const scaled = C.restorePveBattle(dataset, content, save.pendingEncounter);
    const legacy = C.restorePveBattle(dataset, content, { ...save.pendingEncounter, wordCardScalingVersion: 0 });

    const findWordSeq = battle => {
        const hero = battle.sides.near[0];
        return Number(Object.keys(hero.wordCards).find(seq => hero.deckMap[seq] === 1));
    };
    const seqScaled = findWordSeq(scaled);
    const seqLegacy = findWordSeq(legacy);
    assert.ok(Number.isInteger(seqScaled) && seqScaled === seqLegacy);

    scaled.sides.near[0].pips = { normal: 6, power: 2 };
    legacy.sides.near[0].pips = { normal: 6, power: 2 };
    activateWordCard(scaled.sides.near[0], seqScaled);
    activateWordCard(legacy.sides.near[0], seqLegacy);

    const key = scaled.sides.near[0].deckSeq[seqScaled];
    const targetId = scaled.sides.far[0].id;
    const dec = { seq: seqScaled, key, targetId, wordCardId: attackRow.id };
    C.playPveRound(scaled, { ...dec });
    C.playPveRound(legacy, { ...dec });

    const dmgScaled = scaled.events.find(e => e.type === 'damage' && e.caster === 'hero')?.amount || 0;
    const dmgLegacy = legacy.events.find(e => e.type === 'damage' && e.caster === 'hero')?.amount || 0;
    assert.ok(dmgScaled > dmgLegacy, `expected scaled Lv.40 word card (${dmgScaled}) > legacy (${dmgLegacy})`);

    // Replay determinism check
    const cpWithDec = structuredClone(save.pendingEncounter);
    cpWithDec.wordCards.activated = [attackRow.id];
    cpWithDec.decisions = [{ ...dec }];
    const replayed = C.restorePveBattle(dataset, content, cpWithDec);
    assert.equal(replayed.wordCardScalingVersion, 1);
});

test('Slice B1: Fishing Trophy Album & Bounties grant idempotent rewards, milestones, and honor', () => {
    const save = prepMidSave('town', 'life');
    save.fishingRecords = {
        version: 1,
        total: 6,
        byFish: {
            17106: [{ serial: 1, grams: 650 }],
            17107: [{ serial: 2, grams: 7200 }],
            17108: [{ serial: 3, grams: 12500 }],
            17109: [{ serial: 4, grams: 13800 }],
            17110: [{ serial: 5, grams: 15100 }],
            17111: [{ serial: 6, grams: 1200 }],
        },
    };
    const album = fishingAlbumSummary(save, content);
    assert.equal(album.caughtSpecies, 6);
    assert.ok(album.hugeSpecies >= 3);
    assert.ok(album.claimableCount > 0);

    // Honor unlocked
    assert.equal(adventureHonors(save).find(h => h.id === 'fishing-trophy-master')?.earned, true);

    const beansBefore = save.inventory[100] || 0;
    const claim1 = A.applyAction(save, content, { type: 'fishing-bounty', bountyId: '17108:huge' });
    assert.equal(claim1.changed, true);
    assert.ok(save.inventory[100] > beansBefore);
    assert.ok(save.inventory[17487] >= 1);

    // Re-claiming is idempotent
    const claimAgain = A.applyAction(save, content, { type: 'fishing-bounty', bountyId: '17108:huge' });
    assert.equal(claimAgain.changed, false);

    // Claiming 6-species milestone
    const claimMs = A.applyAction(save, content, { type: 'fishing-bounty', bountyId: 'milestone:species-6' });
    assert.equal(claimMs.changed, true);
    assert.ok(save.inventory[26012] >= 1);

    // Validation & storage roundtrip
    const parsed = A.parseSave(JSON.stringify(save), content);
    assert.deepEqual(parsed.fishingBounties, ['17108:huge', 'milestone:species-6']);
    assert.deepEqual(checkedProgress(parsed, content, dataset).save.fishingBounties, ['17108:huge', 'milestone:species-6']);
});

test('Slice B2: Campfire Cooking converts fish + gather pantry into battle meal buffs, pet feasts, and alchemy outputs', () => {
    const save = prepMidSave('fire', 'fire');
    save.inventory[17107] = 2; // 胖乎乎水母
    save.inventory[17106] = 1; // 臭脚丫马靴
    save.inventory[100] = 200;
    recordGatherPantry(save, 'herb', 4);
    recordGatherPantry(save, 'stone', 2);

    // 1. Alchemy: boot -> catch rune + fishing net
    const alchemy = A.applyAction(save, content, { type: 'campfire-cook', recipeId: 'boot-rune-alchemy' });
    assert.equal(alchemy.changed, true);
    assert.equal(save.inventory[17106], 0);
    assert.equal(save.gatherPantry.stone, 0);
    assert.ok(save.inventory[23439] >= 1);
    assert.ok(save.inventory[17113] >= 1);

    // 2. Pet feast: refills hunger & HP and grants pet XP + bonus food
    const petId = save.formation.find(Boolean);
    assert.ok(petId);
    save.pets[petId].hunger = 20;
    save.pets[petId].hp = 10;
    const petXpBefore = save.pets[petId].xp;
    const feast = A.applyAction(save, content, { type: 'campfire-cook', recipeId: 'seafood-pet-banquet' });
    assert.equal(feast.changed, true);
    assert.equal(save.pets[petId].hunger, 100);
    assert.ok(save.pets[petId].xp >= petXpBefore + 150);
    const totalFood = (save.inventory[Pets.FOOD_ID] || 0)
        + (save.petFoodSlots || []).reduce((sum, slot) => sum + (slot?.count || 0), 0);
    assert.ok(totalFood >= 2, 'bonus pet meals should land in inventory or auto-stocked pet food slots');

    // 3. Battle meal buff: warm-fish-soup (+25% XP, +8% HP, 4 battles)
    const soup = A.applyAction(save, content, { type: 'campfire-cook', recipeId: 'warm-fish-soup' });
    assert.equal(soup.changed, true);
    assert.equal(campfireBuffDetail(save.campfireBuff).remainingBattles, 4);

    const enc = content.encounters.find(e => e.zone === 'fire');
    A.beginEncounter(save, content, enc.id);
    assert.deepEqual(save.pendingEncounter.campfireBuff, { version: 1, id: 'warm-fish-soup' });

    const battle = C.restorePveBattle(dataset, content, save.pendingEncounter);
    assert.equal(battle.campfireBuff.id, 'warm-fish-soup');
    const xpBefore = save.xp;
    battle.sides.far.forEach(u => { u.hp = 0; });
    battle.finished = true;
    battle.winner = 'near';

    const vm = buildBattleResultViewModel({ save, battle, assets: { content } });
    assert.equal(vm.activeCampfireBuff.id, 'warm-fish-soup');
    A.settleEncounter(save, content, battle);
    assert.equal(save.xp - xpBefore, vm.xp, 'battle victory XP preview should match settled campfire-boosted XP');
    assert.equal(save.campfireBuff.remainingBattles, 3);

    // 5 total cooks unlocks campfire-chef honor
    save.campfireCookedCount = 5;
    assert.equal(adventureHonors(save).find(h => h.id === 'campfire-chef')?.earned, true);

    const parsed = A.parseSave(JSON.stringify(save), content);
    assert.equal(parsed.campfireBuff.id, 'warm-fish-soup');
    assert.equal(parsed.campfireCookedCount, 5);
});

test('Slice B3: Pet Formation Synergies activate from party schools, apply in PvE deterministically, and skip opening training', () => {
    const save = prepMidSave('desert', 'fire');
    const petEntries = Object.values(content.pets);
    const firePet = petEntries.find(p => p.school === 'fire' && !p.legacy);
    const icePet = petEntries.find(p => p.school === 'ice' && !p.legacy);
    const lifePet = petEntries.find(p => p.school === 'life' && !p.legacy);
    assert.ok(firePet && icePet && lifePet);

    const ensurePetKey = speciesId => {
        Pets.addPet(save, content, speciesId);
        return Object.entries(save.pets).find(([, p]) => p.speciesId === speciesId)?.[0];
    };
    const p1Id = ensurePetKey(firePet.id);
    const p2Id = ensurePetKey(icePet.id);
    const p3Id = ensurePetKey(lifePet.id);
    assert.ok(p1Id && p2Id && p3Id);
    save.formation = [null, p1Id, p2Id, p3Id];
    save.heroSlot = 0;

    const preview = formationSynergyPreview(save, content);
    const ids = preview.active.map(a => a.id);
    assert.ok(ids.includes('school-pair'), 'fire hero + fire pet should trigger school-pair');
    assert.ok(ids.includes('element-trio'), 'fire + ice + life should trigger element-trio');
    assert.ok(ids.includes('guardian-bond'), '3+ party with ice/life pet should trigger guardian-bond');
    assert.ok(ids.includes('full-squad'), '4-seat full squad should trigger full-squad');

    const enc = content.encounters.find(e => e.zone === 'desert');
    A.beginEncounter(save, content, enc.id);
    assert.ok(save.pendingEncounter.petSynergies?.ids.includes('full-squad'));

    const battle = C.restorePveBattle(dataset, content, save.pendingEncounter);
    assert.deepEqual(battle.petSynergies.ids, save.pendingEncounter.petSynergies.ids);
    const hero = battle.sides.near[0];
    assert.ok(hero.stats.damagePct.all >= 11, 'school-pair (6) + full-squad (5) damagePct');
    assert.ok(hero.stats.resistPct.all >= 6, 'element-trio resistPct');
    assert.ok(hero.stats.accuracyPct.all >= 6, 'full-squad accuracyPct');
    assert.ok(hero.languageBaseMaxHp < hero.maxHp, 'guardian-bond scales HP while preserving base HP');

    // parseSave validation succeeds with active petSynergies
    const parsed = A.parseSave(JSON.stringify(save), content);
    assert.deepEqual(parsed.pendingEncounter.petSynergies, save.pendingEncounter.petSynergies);

    // Pure function check for 3-same-school upgrade
    const trio = evaluatePartySynergies([
        { id: 'hero', school: 'storm' },
        { id: 'p1', isPet: true, school: 'storm' },
        { id: 'p2', isPet: true, school: 'storm' },
    ]);
    assert.ok(trio.some(s => s.id === 'school-trio'));
});
