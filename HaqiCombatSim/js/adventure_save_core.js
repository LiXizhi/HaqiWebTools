import {validateTacticsChallenges} from './tactics_challenge_core.js';
// adventure_save_core.js — 冒险存档创建、校验、迁移与角色战力属性派生。
import { validateCatalogQuests } from './adventure_catalog_quests_core.js';
import { claimCheckin, validateCheckin } from './adventure_checkin_core.js';
import { mapCoordinateVersion, migrateSaveCoordinates } from './adventure_coordinates_core.js';
import { coopParty, dungeonProgress, validateCoopRun } from './adventure_coop_core.js';
import {
    availableCardLessons,
    canEquip,
    deckLimits,
    migrateBagRules,
    migrateDefaultPocket,
    recommendedDeck,
    syncDeckLayouts,
    syncProgression,
    validateDeckLayouts,
    validDeck,
} from './adventure_deck_core.js';
import { dungeonLanguageBuff } from './adventure_dungeon_language_core.js';
import { journeyEnemyFormation, journeyParty, journeyRewardPets } from './adventure_dungeon_journeys_core.js';
import { dungeonFor, validateDungeons } from './adventure_dungeons_core.js';
import { earthEncounter } from './adventure_earth_core.js';
import { validateEarthCityProgress } from './adventure_earth_city_config_core.js';
import { createEquipmentInstanceLookup, syncEquipmentInstances, validateEquipmentInstances } from './adventure_equipment_instances_core.js';
import { validateFishingRecords } from './adventure_fishing_records_core.js';
import { customizeHero } from './adventure_hero_customize_core.js';
import { validHeroBodyId } from './hero_body_core.js';
import { mapInfo, worldDimensions } from './adventure_island_layout_core.js';
import { validateTrainingPoints } from './adventure_learning_core.js';
import { applyMagicStarCombat, validateMagicStarClaims } from './adventure_magic_star_core.js';
import { applyMountStats } from './adventure_mounts_core.js';
import { ownedPetSpecies } from './adventure_pet_files_core.js';
import { validatePetMeetings } from './adventure_pet_interactions_core.js';
import * as Pets from './adventure_pets_core.js';
import { validatePetWorld } from './adventure_pet_world_core.js';
import { chooseDragonTotem, dragonTotemStage, equipmentSetStats, progressionStatEntry } from './adventure_progression_bonuses_core.js';
import { migrateQuestPetRewards } from './adventure_rewards_core.js';
import { readStamina, encounterStaminaCost } from './adventure_stamina_core.js';
import { validateTimeScrollProgress, validateTimeScrollRuntime } from './adventure_time_scroll_core.js';
import { upgradeAt, upgradeLevels, applyUpgradeStats } from './adventure_upgrade_core.js';
import { islandFor, islandSpawn, travelStatus } from './adventure_world_map_core.js';
import { validateTacticsRecords } from './battle_tactics_journal_core.js';
import { validateCampDetour } from './camp_detour_core.js';
import { validateRelationshipEvents } from './character_relationship_core.js';
import { validateCompanionWordplay } from './companion_wordplay_core.js';
import { SCHOOLS } from './combat_params_core.js';
import { normalizeStats, statIdToEntry } from './combat_unit_core.js';
import { dungeonTacticsProfile, validDungeonTacticsCheckpoint } from './dungeon_tactics_core.js';
import { validateForestCommission } from './forest_commission_core.js';
import { validateHanziBattleSpec } from './hanzi_battle_core.js';
import { validateHanziProgress } from './hanzi_core.js';
import { validateLearningSave } from './language_adventure_core.js';
import { validateDailyBuff } from './language_daily_buff_core.js';
import { validateSpeechClaims } from './language_speech_rewards_core.js';
import { validateTreeClaims } from './language_tree_rewards_core.js';
import { normalizeLocaleSave } from './locale_core.js';
import { validateOpeningJourney } from './opening_journey_core.js';
import { OPENING_TRAINING_IDS } from './opening_training_core.js';
import { publicPhotoHead } from './photo_head_core.js';
import { hashSeed } from './rng_core.js';
import { validateTacticsTraining } from './tactics_training_core.js';
import { petLevel, questProgress, questState, rewardsFor } from './adventure_quests_core.js';

export const SAVE_VERSION = 2;
const clone = value => JSON.parse(JSON.stringify(value));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const owns = (s, id) => (s.inventory[id] || 0) > 0;

export function createAdventure(content, { name = '小哈奇', school = 'fire', appearance = 'boy', headId, bodyId, customHead, seed = 530, starter = 'dragon_green' } = {}) {
    assert(SCHOOLS.includes(school), '请选择魔法学系');
    const birthZone = 'camp';
    const save = {
        schemaVersion: SAVE_VERSION, contentVersion: content.contentVersion, seed: hashSeed(String(seed)),
        name: String(name).trim().slice(0, 16) || '小哈奇', school, appearance: appearance === 'girl' ? 'girl' : 'boy',
        xp: 0, level: 1, inventory: {}, equipment: {}, mountId: null, upgrades: {}, equipmentInstances: [], equipmentGuids: {}, nextEquipmentGuid: 1, cards: {}, deck: [], quests: {},
        pet: null, zone: birthZone, position: { ...mapInfo(birthZone, content).initialSpawn }, positionCoordinateVersion: mapCoordinateVersion(birthZone, content), facing: 3,
        dungeonRuns: {}, dungeonReturn: null, encounterSerial: 0, pendingEncounter: null, rewardedEncounters: [], graduated: false,
        visitedTown: false, tips: {}, revision: 0, bagRulesVersion: 1, defaultPocketVersion: 1, worldLayoutVersion: content.worldMapIndex.layoutVersion,
        locale: 'zh-CN', languageLearning: { enabled: true, native: 'zh-CN', target: 'en', autoSpeak: false, autoReadDialogue: true, selectionConfirmed: false, showChinese: true, model: '', voiceType: '' }, learnerMemory: '', languageAdventure: { version: 1, progress: {} },
    };
    if (typeof headId === 'string' && /^[a-z0-9-]{1,64}$/.test(headId)) save.headId = headId;
    if (customHead) save.customHead = publicPhotoHead(customHead, { id: headId, appearance });
    if (validHeroBodyId(bodyId, appearance)) save.bodyId = bodyId;
    syncProgression(save, content);
    save.deck = recommendedDeck(save, content);
    syncDeckLayouts(save, content);
    if (content.pets) Pets.initializePets(save, content, starter);
    return save;
}

export function playerSpec(save, content, starLevel = save.pendingEncounter?.magicStarLevel || 0) {
    const stats = normalizeStats(), fixed = [];
    let equipmentLookup;
    for (const iid of Object.values(save.equipment)) {
        const item = content.items[iid];
        if (!canEquip(save, item, content)) continue;
        // player_server.lua L3476–3488: socketed gem stats add to equipped item stats.
        const instance = (equipmentLookup ??= createEquipmentInstanceLookup(save, content))(iid);
        const sources = [item, ...(instance?.serverdata.gem?.ins || []).map(id => content.items[id]).filter(Boolean)];
        for (const [id, value] of sources.flatMap(source => Object.entries(source.stats))) {
            if (save.pendingEncounter && ![1, 2].includes(save.pendingEncounter.equipmentStatsVersion) && [182, 183].includes(Number(id))) continue;
            if (save.pendingEncounter && save.pendingEncounter.equipmentStatsVersion !== 2 && Number(id) >= 151 && Number(id) <= 166) continue;
            const entry = statIdToEntry(id);
            if (!entry) continue;
            if (typeof stats[entry.stat] === 'object') stats[entry.stat][entry.school] = (stats[entry.stat][entry.school] || 0) + Number(value);
            else stats[entry.stat] += Number(value);
        }
        applyUpgradeStats(stats, upgradeAt(content, iid, instance?.serverdata.addlel || 0));
        for (const id of [139, 140, 141]) {
            const key = content.cardItems[item.stats[id]];
            if (key) fixed.push({ key, count: 1 });
        }
    }
    applyMountStats(stats, save, content);
    const limits = deckLimits(save, content);
    if (!save.pendingEncounter || [1, 2, 3].includes(save.pendingEncounter.progressionRulesVersion)) {
        const config = content.progressionBonuses;
        const equipped = Object.values(save.equipment).filter(id => canEquip(save, content.items[id], content));
        const bonuses = [!save.pendingEncounter || save.pendingEncounter.progressionRulesVersion >= 2 ? equipmentSetStats(equipped, config).stats : {}];
        for (const professionId of Object.keys(config?.professions || {})) {
            if (save.inventory[professionId] > 0) {
                const expId = config.professions[professionId][0]?.expId;
                const stage = dragonTotemStage(config, professionId, expId, save.inventory[expId] || 0);
                if (stage) bonuses.push(stage.stats);
                break;
            }
        }
        for (const source of bonuses) {
            for (const [id, value] of Object.entries(source)) {
                const modern = !save.pendingEncounter || save.pendingEncounter.progressionRulesVersion >= 3;
                if (!modern && Number(id) >= 151 && Number(id) <= 166) continue;
                const entry = (modern ? progressionStatEntry : statIdToEntry)(id);
                if (!entry) continue;
                const amount = value * (entry.scale ?? 1);
                if (typeof stats[entry.stat] === 'object') stats[entry.stat][entry.school] = (stats[entry.stat][entry.school] || 0) + amount;
                else stats[entry.stat] = (stats[entry.stat] || 0) + amount;
            }
        }
    }
    applyMagicStarCombat(stats, content, starLevel);
    return {
        ...(save.pendingEncounter?.player?.hanziBattle ? { hanziBattle: structuredClone(save.pendingEncounter.player.hanziBattle) } : {}),
        id: 'hero', name: save.name, school: save.school, level: save.level, isBot: false, stats,
        deck: clone(save.deck), fixedCards: fixed, deckCapacity: limits.capacity, deckEachCapacity: limits.eachCapacity,
    };
}

export function catalogStatSnapshot(save, content) {
    const spec = playerSpec(save, content);
    const schools = ['fire', 'ice', 'storm', 'life', 'death', 'balance'];
    return {
        214: save.level, 79031: save.level, 79030: 0,
        79032: Math.floor(spec.stats.powerPipPct || 0),
        79033: Math.floor(spec.stats.damage?.[save.school] || 0),
        79034: Math.floor(Math.max(0, ...schools.map(school => spec.stats.resist?.[school] || 0))),
    };
}

export function grantEggCompanion(save, content) {
    if (!content.pets || save.pendingEncounter || save.pet || !owns(save, 17307)) return;
    save.inventory[17307]--;
    save.inventory[content.pet.itemId] = 1;
    save.pet = { itemId: content.pet.itemId, name: content.pet.name, xp: 0, level: 0 };
    Pets.addPet(save, content, 'legacy_gululu');
}

export function specialEncounter(save, content, id) {
    if (save.zone === 'earth' && String(id).startsWith('earth:')) return earthEncounter(content, id);
    if (!content.pets || typeof id !== 'string') return null;
    const wild = id.startsWith('wild:') ? content.pets[id.slice(5)] : null;
    const level = wild ? Math.max(wild.unlockLevel, save.level) : Number(id.slice(6));
    if (!wild && !id.startsWith('trial:')) return null;
    assert(Number.isInteger(level) && level >= 1 && level <= save.level, '挑战等级尚未解锁');
    const school = wild?.school || save.school, p = Pets.petParams(content);
    const lessons = (wild?.lessons || content.learn[school]).filter(x => x.level <= level);
    const pool = lessons.slice(-8).map(x => ({ key: x.key, weight: 10 }));
    const monster = {
        id: wild ? 'wild:' + wild.id : 'trial:' + level,
        name: wild?.name || `${level}级魔法试炼`,
        school, level, hp: Pets.specMaxHp({ school, level, stats: {} }),
        attributes: { ai_module: 'Genes_Attacker', power_pip_percent: 0, startup_pips_normal: 1 },
        pool, sequences: [], genes: [], cardsets: {},
        xp: p.encounterXpBase + p.encounterXpLevel * level,
        coins: p.encounterCoinsBase + p.encounterCoinsLevel * level,
    };
    if (wild) Object.assign(monster, { speciesId: wild.id, unlockLevel: wild.unlockLevel });
    return { id, zone: save.zone, monster };
}

export function parseSave(raw, content) {
    const s = typeof raw === 'string' ? JSON.parse(raw) : clone(raw);
    if (s?.schemaVersion === 1) {
        s.schemaVersion = SAVE_VERSION;
        if (content.pets) {
            Pets.initializePets(s, content);
            if (s.pet && content.pets.legacy_gululu) Pets.addPet(s, content, 'legacy_gululu', s.pet.xp);
        }
    }
    assert(s && s.schemaVersion === SAVE_VERSION && s.contentVersion === content.contentVersion, '存档版本不兼容');
    validateOpeningJourney(s);
    validateTacticsTraining(s);
    validateTacticsChallenges(s);
    validateTacticsRecords(s);
    validateCampDetour(s);
    validateForestCommission(s);
    validateCompanionWordplay(s);
    normalizeLocaleSave(s);
    validateHanziProgress(s.hanzi);
    validateTimeScrollProgress(s.timeScrollProgress);
    validateTimeScrollRuntime(s.timeScrollRuntime);
    assert(s.encounterRespawns === undefined || (s.encounterRespawns && typeof s.encounterRespawns === 'object' && !Array.isArray(s.encounterRespawns) && Object.values(s.encounterRespawns).every(n => Number.isSafeInteger(n) && n >= 0)), '怪物刷新记录无效');
    validateLearningSave(s);
    validateCoopRun(s);
    validateRelationshipEvents(s);
    assert(s.defaultPocketVersion === undefined || s.defaultPocketVersion === 1, '默认口袋规则版本无效');
    validateCheckin(s);
    validateSpeechClaims(s);
    validateTreeClaims(s);
    validateFishingRecords(s);
    validateMagicStarClaims(s, content);
    assert(SCHOOLS.includes(s.school) && (islandFor(s.zone) || dungeonFor(content, s.zone)?.playable), '存档角色无效');
    assert(typeof s.name === 'string' && s.name.length <= 16 && ['boy', 'girl'].includes(s.appearance), '存档外观无效');
    assert(s.bodyId === undefined || validHeroBodyId(s.bodyId, s.appearance), '存档身体形象无效');
    assert(s.headId === undefined || (typeof s.headId === 'string' && /^[a-z0-9-]{1,64}$/.test(s.headId)), '存档头部形象无效');
    if (s.customHead) s.customHead = publicPhotoHead(s.customHead, { id: s.headId, appearance: s.appearance });
    assert(Number.isSafeInteger(s.xp) && s.xp >= 0 && Number.isInteger(s.seed), '存档经验无效');
    validateTrainingPoints(s, content);
    assert(s.gemSerial === undefined || (Number.isSafeInteger(s.gemSerial) && s.gemSerial >= 0), '存档宝石操作记录无效');
    const oldLayout = s.worldLayoutVersion ?? 0, currentLayout = content.worldMapIndex.layoutVersion;
    assert(Number.isInteger(oldLayout) && oldLayout >= 0 && oldLayout <= currentLayout, '地图版本不兼容');
    const bounds = oldLayout === currentLayout ? worldDimensions(s.zone, content) : oldLayout === 1 && s.zone === 'town' ? { w: 5600, h: 4400 } : { w: 1800, h: 1600 };
    assert(Number.isFinite(s.position?.x) && Number.isFinite(s.position?.y) && s.position.x >= 0 && s.position.x <= bounds.w && s.position.y >= 0 && s.position.y <= bounds.h, '存档位置无效');
    if (oldLayout < currentLayout) {
        if ((oldLayout === 0 && s.zone === 'town') || !mapInfo(s.zone, content).retainPreviousPosition) s.position = islandSpawn(s.zone, content);
        s.worldLayoutVersion = currentLayout;
    }
    migrateSaveCoordinates(s, content);
    for (const field of ['inventory', 'equipment', 'upgrades', 'cards', 'quests', 'tips']) assert(s[field] && typeof s[field] === 'object' && !Array.isArray(s[field]), '存档数据不完整');
    if (content.pets) Pets.retireCaptureCrystals(s, content);
    for (const [id, n] of Object.entries(s.inventory)) assert(content.items[id] && Number.isInteger(n) && n >= 0, '存档物品无效');
    for (const [slot, id] of Object.entries(s.equipment)) assert(content.items[id]?.slot === Number(slot) && owns(s, id), '存档装备无效');
    if (s.mountId != null) assert(content.mountByItem?.[s.mountId]?.art?.cdn && owns(s, s.mountId), '存档坐骑无效');
    for (const [key, n] of Object.entries(s.cards)) assert(availableCardLessons(s, content).some(x => x.key === key) && Number.isInteger(n) && n >= 1 && n <= 3, '存档卡牌无效');
    assert(Array.isArray(s.rewardedEncounters) && Number.isInteger(s.encounterSerial) && s.encounterSerial >= 0, '存档战斗记录无效');
    assert(new Set(s.rewardedEncounters).size === s.rewardedEncounters.length && s.rewardedEncounters.every(x => typeof x === 'string'), '存档奖励记录无效');
    for (const [id, n] of Object.entries(s.upgrades)) assert(content.items[id] && upgradeLevels(content, id).length && owns(s, id) && Number.isInteger(n) && n >= 0 && (n === 0 || upgradeAt(content, id, n)), '存档强化记录无效');
    validateEquipmentInstances(s, content);
    syncProgression(s, content);
    assert(s.bagRulesVersion === undefined || s.bagRulesVersion === 1, '卡包规则版本无效');
    migrateBagRules(s, content);
    for (const id of Object.values(s.equipment)) assert(canEquip(s, content.items[id], content), '存档装备条件无效');
    let previous = true;
    for (const q of content.quests) {
        const state = s.quests[q.id];
        if (state) {
            assert(previous && typeof state.accepted === 'boolean' && typeof state.claimed === 'boolean' && state.progress && typeof state.progress === 'object', '存档任务顺序无效');
            for (const n of Object.values(state.progress)) assert(Number.isInteger(n) && n >= 0, '存档任务进度无效');
        }
        if (state?.claimed) assert(state.accepted && questProgress(s, q).every(g => g.value === g.count), '存档任务未达标');
        previous = !!state?.claimed;
    }
    assert(!s.graduated || s.quests[63013]?.claimed, '毕业记录无效');
    validateCatalogQuests(s, content);
    validateDungeons(s, content);
    assert(dungeonFor(content, s.zone)?.playable || travelStatus({ ...s, pendingEncounter: null }, content, s.zone).allowed, '存档目的地无效');
    dungeonLanguageBuff(s, content);
    if (s.pendingEncounter) {
        assert(s.pendingEncounter.openingTrainingVersion === undefined || ([1, 2, 3].includes(s.pendingEncounter.openingTrainingVersion) && s.openingJourney?.version === 1 && s.zone === 'camp' && OPENING_TRAINING_IDS.includes(s.pendingEncounter.encounterId)), '新手训练版本无效');
        assert((s.pendingEncounter.dungeonTacticsVersion === undefined || s.pendingEncounter.dungeonTacticsId === s.zone) && validDungeonTacticsCheckpoint(s.pendingEncounter, dungeonFor(content, s.zone)), '副本战术版本无效');
        assert(s.pendingEncounter.dailyLanguageVersion === undefined || s.pendingEncounter.dailyLanguageVersion === 1, '语言加成版本无效');
        if (s.pendingEncounter.player?.hanziBattle) validateHanziBattleSpec(s.pendingEncounter.player.hanziBattle);
        for (const unit of s.pendingEncounter.party || []) if (unit.hanziBattle) validateHanziBattleSpec(unit.hanziBattle);
        if (s.pendingEncounter.dailyLanguageVersion === 1) validateDailyBuff(s.pendingEncounter.languageBuff);
        if (s.pendingEncounter.languageBuff !== undefined && !s.pendingEncounter.dailyLanguageVersion) assert(JSON.stringify(s.pendingEncounter.languageBuff) === JSON.stringify(dungeonLanguageBuff(s, content)), '副本语言加成检查点无效');
        assert(s.pendingEncounter.equipmentStatsVersion === undefined || [1, 2].includes(s.pendingEncounter.equipmentStatsVersion), '装备属性规则版本无效');
        assert(s.pendingEncounter.reflectionRulesVersion === undefined || s.pendingEncounter.reflectionRulesVersion === 1, '反射规则版本无效');
        assert(s.pendingEncounter.specialCardRulesVersion === undefined || s.pendingEncounter.specialCardRulesVersion === 1, '特殊卡牌规则版本无效');
        assert(s.pendingEncounter.dispelRulesVersion === undefined || s.pendingEncounter.dispelRulesVersion === 1, '之敌规则版本无效');
        assert(s.pendingEncounter.stealthRulesVersion === undefined || s.pendingEncounter.stealthRulesVersion === 1, '隐身规则版本无效');
        assert(s.pendingEncounter.progressionRulesVersion === undefined || [1, 2, 3].includes(s.pendingEncounter.progressionRulesVersion), '成长属性规则版本无效');
        assert(s.pendingEncounter.threatRulesVersion === undefined || [1, 2, 3, 4, 5].includes(s.pendingEncounter.threatRulesVersion), '仇恨规则版本无效');
        assert(s.pendingEncounter.magicStarLevel === undefined || Number.isInteger(s.pendingEncounter.magicStarLevel) && s.pendingEncounter.magicStarLevel >= 0 && s.pendingEncounter.magicStarLevel <= 10, '魔法星战斗等级无效');
        assert(s.pendingEncounter.magicStarExperiencePercent === undefined || s.pendingEncounter.magicStarExperiencePercent === (s.pendingEncounter.magicStarLevel ? content.magicStar?.levels[s.pendingEncounter.magicStarLevel]?.exp : 100), '魔法星经验倍率无效');
        if (s.pendingEncounter.runes !== undefined) {
            const runes = s.pendingEncounter.runes;
            assert(Array.isArray(runes) && new Set(runes.map(row => row.itemId)).size === runes.length, '存档符文无效');
            for (const rune of runes) assert(content.items[rune.itemId]?.kind === 18 && content.items[rune.itemId].subtype === 2 && (content.cardItems[rune.itemId] || content.cardItems[rune.itemId - 1000]) === rune.key && (!String(rune.key).includes('CatchPet') || content.runeCatalog?.runes.some(row => row.gsid === rune.itemId && row.key === rune.key && Number.isFinite(row.baseWeight))) && Number.isSafeInteger(rune.count) && rune.count > 0 && (s.inventory[rune.itemId] || 0) <= rune.count, '存档符文无效');
        }
        assert(s.pendingEncounter.id === `${s.seed}:${s.encounterSerial}` && s.pendingEncounter.seed === hashSeed(`${s.seed}:encounter:${s.encounterSerial}`), '存档战斗种子无效');
        assert(JSON.stringify(s.pendingEncounter.player) === JSON.stringify(s.coopRun?.hero || playerSpec(s, content)), '存档战斗角色无效');
        assert((content.encounters.some(e => e.id === s.pendingEncounter.encounterId && e.zone === s.zone) || specialEncounter(s, content, s.pendingEncounter.encounterId)) && Array.isArray(s.pendingEncounter.decisions) && s.pendingEncounter.decisions.length <= 200 && Number.isInteger(s.pendingEncounter.seed), '存档战斗无效');
    }
    if (s.pet) assert(s.pet.itemId === content.pet.itemId && Number.isSafeInteger(s.pet.xp) && s.pet.xp >= 0 && s.pet.xp <= content.pet.levels.max_exp && s.pet.level === petLevel(s.pet.xp, content), '存档宠物无效');
    const petContent = content.pets ? Pets.migratePetDeckRules(s, content) : content;
    if (s.pendingEncounter) {
        assert(s.pendingEncounter.journeyPartyVersion === undefined || (s.pendingEncounter.journeyPartyVersion === 1 && !!dungeonTacticsProfile(dungeonFor(content, s.zone))?.companionSlots), '存档巡夜阵容版本无效');
        const encounter = content.encounters.find(e => e.id === s.pendingEncounter.encounterId);
        assert(JSON.stringify(s.pendingEncounter.dungeonMonsterIds) === JSON.stringify(journeyEnemyFormation(encounter, dungeonFor(content, s.zone), s.pendingEncounter.party).ids) && JSON.stringify(s.pendingEncounter.dungeonMonsterSlots) === JSON.stringify(journeyEnemyFormation(encounter, dungeonFor(content, s.zone), s.pendingEncounter.party).slots), '副本阵容记录无效');
        assert(!encounter?.blocked?.length && !dungeonProgress(s)?.[s.zone]?.cleared.includes(encounter?.id), '副本战斗记录无效');
    }
    if (content.pets) {
        validatePetMeetings(s);
        validatePetWorld(s, content);
        Pets.validatePets(s, petContent);
        if (s.pendingEncounter?.party) {
            assert(JSON.stringify(s.pendingEncounter.party) === JSON.stringify(journeyParty(s, dungeonFor(content, s.zone), coopParty(s, playerSpec(s, content)) || Pets.partySpecs(s, petContent, playerSpec(s, content), { traits: s.pendingEncounter.petTraitRulesVersion === 1 }))), '存档阵容无效');
            const encounter = content.encounters.find(e => e.id === s.pendingEncounter.encounterId) || specialEncounter(s, content, s.pendingEncounter.encounterId);
            assert(JSON.stringify(s.pendingEncounter.monster) === JSON.stringify(encounter.monster || content.monsters[encounter.monsterId]), '存档敌人无效');
            assert(s.pendingEncounter.captureStock === (s.inventory[Pets.CAPTURE_ID] || 0) && s.pendingEncounter.heroLevel === s.level, '存档捕获记录无效');
            const ownedPets = ownedPetSpecies(s);
            if (s.pendingEncounter.ownedPets !== undefined) assert(JSON.stringify(s.pendingEncounter.ownedPets) === JSON.stringify(ownedPets), '存档捕获记录无效');
            else if ((s.pendingEncounter.runes || []).some(rune => String(rune.key).includes('CatchPet'))) assert(false, '存档捕获记录无效');
        }
    }
    if (s.pendingEncounter?.party) {
        assert(JSON.stringify(s.pendingEncounter.petIds) === JSON.stringify(journeyRewardPets(s, dungeonFor(content, s.zone), s.pendingEncounter.party)), '存档宠物奖励阵容无效');
        if (s.pendingEncounter.adventureParams) {
            const expected = Pets.petParams(petContent), saved = s.pendingEncounter.adventureParams;
            const threatVersion = s.pendingEncounter.threatRulesVersion || 0;
            const optional = new Set([
                'petFoodXpMultiplier',
                ...(s.pendingEncounter.captureRulesVersion !== 1 ? ['catchMinChance', 'catchMaxChance', 'catchEnragedDifficulty'] : []),
                ...(s.pendingEncounter.specialCardRulesVersion !== 1 || threatVersion < 3 ? ['effectThreatSingleFreeze', 'effectThreatConversePositiveWard'] : []),
                ...(threatVersion < 5 ? ['iceAreaAttackThreatRatio'] : []),
                ...(threatVersion < 1 ? ['damageThreatRatio', 'splashDamageThreatRatio'] : []),
                ...(threatVersion < 2 ? ['singleHealThreatRatio'] : []),
                ...(threatVersion < 3 ? ['areaHealThreatRatio', 'effectThreatGlobal', 'effectThreatMiniAura', 'effectThreatRemovePositiveCharm', 'effectThreatRemoveNegativeCharm', 'effectThreatStealCharm', 'effectThreatCharms', 'effectThreatWards', 'effectThreatAreaCharm', 'effectThreatAreaWard', 'effectThreatAbsorb'] : []),
                'mountSpeed', 'gatherValue_flower', 'gatherValue_herb', 'gatherValue_stone', 'gatherValue_ore', 'gatherThreshold', 'gatherCellSize', 'gatherDensity', 'gatherDistance',
                'monsterRespawnMs', 'fieldEncounterRadius', 'dungeonEncounterRadius',
                ...(threatVersion < 4 ? ['splashManipulationThreatRatio', 'effectThreatStun', 'effectThreatRemovePositiveWard', 'effectThreatStealWard', 'effectThreatSymmetryWards', 'effectThreatReflectionShield', 'effectThreatAreaPowerPipBoost', 'effectThreatAreaCleanse', 'defensiveThreatWeight', 'tauntThreatWeight'] : []),
            ]);
            assert(Object.keys(saved).every(key => Object.hasOwn(expected, key)) && Object.entries(expected).every(([key, value]) => !Object.hasOwn(saved, key) ? optional.has(key) : JSON.stringify(saved[key]) === JSON.stringify(value)), '存档养成参数无效');
        }
    }
    if (s.earthProgress !== undefined) assert(s.earthProgress.version === 1 && Number.isInteger(s.earthProgress.step) && s.earthProgress.step >= 0 && s.earthProgress.step <= 5, '地球章节记录无效');
    validateEarthCityProgress(s.earthCityProgress);
    syncProgression(s, content);
    validDeck(s, content, s.deck);
    if (s.deckLayouts !== undefined) validateDeckLayouts(s, content, s.deckLayouts, s.activeDeckLayout);
    migrateDefaultPocket(s, content);
    syncDeckLayouts(s, content);
    migrateQuestPetRewards(s, content, rewardsFor);
    grantEggCompanion(s, content);
    syncEquipmentInstances(s, content);
    if (content.pets) Pets.mergeOwnedPetSpecies(s, content);
    return s;
}
