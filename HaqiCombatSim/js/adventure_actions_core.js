// Pure adventure action handler registry. Keeps adventure_core free of the 34-way switch.
import { mapCoordinateVersion } from './adventure_coordinates_core.js';
import { earthNearest } from './adventure_earth_core.js';
import { purchaseNpcOffer } from './adventure_npc_core.js';
import { claimMagicStar } from './adventure_magic_star_core.js';
import { chooseDragonTotem, useDragonTotemItem } from './adventure_progression_bonuses_core.js';
import { equipTacticsHonor } from './tactics_challenge_core.js';
import { customizeHero } from './adventure_hero_customize_core.js';
import { applyOpeningJourney, openingJourneyActive } from './opening_journey_core.js';
import { applyCampDetour } from './camp_detour_core.js';
import { applyForestCommission } from './forest_commission_core.js';
import { applyIslandPuzzle } from './island_puzzles_core.js';
import { applySteleRubbing } from './hanzi_stele_scroll_core.js';
import { applyCompanionWordplay } from './companion_wordplay_core.js';
import { islandSpawn, travelStatus } from './adventure_world_map_core.js';
import { mapInfo } from './adventure_island_layout_core.js';
import { createWorld, retreatBeside } from './adventure_world_core.js';
import { recordLearningCompletion } from './language_adventure_core.js';
import { clampDeck } from './combat_unit_core.js';
import * as Pets from './adventure_pets_core.js';
import { createRng, hashSeed } from './rng_core.js';
import { castFishing, useStaminaPotion } from './adventure_fishing_core.js';
import { mountGem, removeGems } from './adventure_gems_core.js';
import { upgradeAt, upgradeLevels } from './adventure_upgrade_core.js';
import { findEquipmentInstance, syncEquipmentInstances } from './adventure_equipment_instances_core.js';
import { claimCheckin } from './adventure_checkin_core.js';
import { claimSpeechReward } from './language_speech_rewards_core.js';
import {
    deckLimits,
    syncProgression,
    learnDeckCards,
    validDeck,
    syncDeckLayouts,
    deckLayoutCapacity,
    validateDeckLayouts,
    canEquip,
    equipmentBlockReason,
    migrateDefaultPocket,
    migrateBagRules,
} from './adventure_deck_core.js';
import {
    currentQuest,
    questState,
    questReady,
    signal,
    syncGoals,
    petLevel,
    grantQuestRewards,
} from './adventure_quests_core.js';
import { catalogStatSnapshot } from './adventure_save_core.js';
import {
    acceptCatalogQuest,
    claimCatalogQuest,
    pinTrackedQuest,
    unpinTrackedQuest,
    showCurrentChapter,
    trackedQuestIds,
    supplementIslandTrack,
    noteQuestAccepted,
} from './adventure_catalog_quests_core.js';

const clone = value => JSON.parse(JSON.stringify(value));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const owns = (s, id) => (s.inventory[id] || 0) > 0;

function offsetBeside(player, target, spawn) {
    let dx = player.x - target.x;
    let dy = player.y - target.y;
    let len = Math.hypot(dx, dy);
    if (len < 8) {
        dx = spawn.x - target.x;
        dy = spawn.y - target.y;
        len = Math.hypot(dx, dy) || 1;
    }
    return { x: target.x + dx / len * 120, y: target.y + dy / len * 120 };
}

export function retreatLanding(save, content) {
    const pending = save.pendingEncounter;
    if (save.zone === 'earth') {
        const w = content.earthWorld;
        const position = w ? earthNearest(w, save.position.x, save.position.y, { safe: true }) : save.position;
        return { position: position || save.position, message: '你回到了附近的安全地点。' };
    }
    const safe = { position: { ...mapInfo(save.zone, content).initialSpawn }, message: '你回到了安全地点。已保留物品与任务进度。' };
    if (!pending) return safe;
    const encounter = content.encounters.find(e => e.id === pending.encounterId);
    const laid = content.worldMaps?.[save.zone]?.encounterPositions?.[encounter?.id];
    const target = laid
        ? { x: laid[0], y: laid[1] }
        : (Number.isFinite(encounter?.x) && Number.isFinite(encounter?.y) ? { x: encounter.x, y: encounter.y } : null);
    if (!target) return { position: { ...save.position }, message: '你离开了战斗。已保留物品与任务进度。' };
    const info = mapInfo(save.zone, content);
    const spot = content.worldMaps?.[save.zone]
        ? retreatBeside(createWorld(save.zone, content, { ...save, position: { ...save.position } }), save.position, target)
        : offsetBeside(save.position, target, info.spawn);
    return {
        position: { x: Math.min(info.w, Math.max(0, spot.x)), y: Math.min(info.h, Math.max(0, spot.y)) },
        message: '你撤到了怪物附近。已保留物品与任务进度。',
    };
}

export const ADVENTURE_ACTION_HANDLERS = {
    'companion-wordplay': ({ save, content, action }) => {
        const result = applyCompanionWordplay(save, content, action);
        if (result.accepted) save.revision++;
        return { early: result };
    },
    'camp-detour': ({ save, content, action, access }) => {
        const result = applyCampDetour(save, content, action, access);
        if (result.changed === false) return { early: result };
        return { notice: result.message };
    },
    'forest-commission': ({ save, content, action, access }) => {
        const result = applyForestCommission(save, content, action, access);
        if (result.changed === false) return { early: result };
        return { notice: result.message };
    },
    'island-puzzle': ({ save, content, action }) => {
        const result = applyIslandPuzzle(save, content, action);
        if (result.changed) syncEquipmentInstances(save, content);
        return { early: result };
    },
    'stele-rubbing': ({ save, content, action }) => {
        const result = applySteleRubbing(save, content, action);
        return { early: result };
    },
    'language-complete': ({ save, content, action, access }) => {
        const result = recordLearningCompletion(save, content, action.completion, access);
        save.revision++;
        return { early: result };
    },
    'npc-purchase': ({ save, content, action, access }) => {
        purchaseNpcOffer(save, content, action, access);
    },
    fish: ({ save, content, action }) => {
        const result = castFishing(save, content, action, createRng(hashSeed(`${save.revision}:fish:${action.netId}`)));
        save.revision++;
        return { early: { ...result, changed: true } };
    },
    'stamina-potion': ({ save, content, action }) => {
        const result = useStaminaPotion(save, content, action.itemId);
        save.revision++;
        return { early: { ...result, changed: true } };
    },
    'magic-star-claim': ({ save, content, action, access }) => {
        claimMagicStar(save, content, action, access);
        syncEquipmentInstances(save, content);
    },
    'choose-totem': ({ save, content, action }) => {
        chooseDragonTotem(save, content, action.professionId);
    },
    'equip-tactics-honor': ({ save, action }) => {
        equipTacticsHonor(save, action.id);
    },
    'customize-hero': ({ save, action }) => {
        const quote = customizeHero(save, action);
        return {
            notice: quote.nameChanged && quote.lookChanged
                ? '名字和形象已更新。'
                : quote.nameChanged
                    ? '名字已更新。'
                    : '形象已更新。',
        };
    },
    'use-totem-item': ({ save, content, action }) => {
        useDragonTotemItem(save, content, action.itemId);
    },
    checkin: ({ save, content, action, access }) => {
        claimCheckin(save, content, action.now, action.index, access, action.bonus === true);
    },
    'speech-reward': ({ save, content, action }) => {
        claimSpeechReward(save, content, action.index, action.now);
        return { notice: '领取成功，奖励已放入背包！' };
    },
    'opening-journey': ({ save, content, action, quest: q, applyAction }) => {
        const result = applyOpeningJourney(save, content, action);
        if (action.step === 'accept' && q?.id === 63000 && !questState(save, 63000).accepted) {
            applyAction(save, content, { type: 'accept', questId: 63000, npcId: 36211 });
        }
        if (action.step === 'rescue' && q?.id === 63000 && questReady(save, q)) {
            applyAction(save, content, { type: 'claim', questId: 63000, npcId: 36211 });
        }
        return { notice: result.message };
    },
    accept: ({ save, content, action, quest: q }) => {
        assert(q && q.id === Number(action.questId) && q.startNpc === Number(action.npcId), '当前没有可接取的任务');
        if (!save.quests[q.id]) {
            save.quests[q.id] = { accepted: true, claimed: false, progress: {} };
            if (q.id === 63007) save.quests[q.id].equipmentTutorialVersion = 2;
            noteQuestAccepted(save, q.id);
        }
        save.trackedQuestIds = trackedQuestIds(save, content);
        delete save.trackedQuestId;
        syncGoals(save, content);
    },
    talk: ({ save, content, action }) => {
        assert(content.npcs[action.npcId], '找不到这位居民');
        signal(save, content, 'talk', action.npcId);
    },
    'accept-catalog': ({ save, content, action }) => ({
        trackFull: acceptCatalogQuest(save, content, action.questId, action.npcId, catalogStatSnapshot(save, content))?.full === true,
    }),
    'claim-catalog': ({ save, content, action }) => {
        const target = claimCatalogQuest(save, content, action.questId, action.npcId, catalogStatSnapshot(save, content));
        if (!target) return { early: { changed: false } };
        grantQuestRewards(save, content, target);
        // Legacy card rewards retired; old quest claims remain readable.
        save.quests[target.id].claimed = true;
        unpinTrackedQuest(save, target.id);
        if (target.region === 'hanzi') supplementIslandTrack(save, content, save.zone);
        syncProgression(save, content);
        return undefined;
    },
    'abandon-quest': ({ save, content, action, quest: q }) => {
        const id = Number(action.questId);
        const chapter = content.quests.find(quest => quest.id === id);
        const catalog = content.catalogQuests?.byId[id];
        const state = save.quests[id];
        assert(chapter || catalog, '找不到这个任务');
        assert(state?.accepted === true && !state.claimed, '只能放弃进行中的任务');
        if (chapter) assert(q?.id === id, '只能放弃当前教学任务');
        delete save.quests[id];
        unpinTrackedQuest(save, id);
        if (chapter) showCurrentChapter(save, content);
        return { notice: `已放弃：${(chapter || catalog).title}` };
    },
    'track-catalog': ({ save, content, action }) => {
        if (action.remove) {
            unpinTrackedQuest(save, action.questId);
            return { notice: '已取消追踪' };
        }
        if (action.questId == null) {
            unpinTrackedQuest(save, null);
            return undefined;
        }
        const pinned = pinTrackedQuest(save, content, action.questId);
        if (pinned.already || pinned.full) return { early: { changed: false, ...pinned } };
        return undefined;
    },
    claim: ({ save, content, action, quest: q }) => {
        const target = content.quests.find(x => x.id === Number(action.questId));
        if (save.quests[target?.id]?.claimed) return { early: { changed: false } };
        assert(target?.id !== 63000 || !openingJourneyActive(save) || save.openingJourney.phase === 'showcase', '先和莫尼一起帮咕噜噜解围');
        assert(target === q && questReady(save, q) && q.endNpc === Number(action.npcId), '任务尚未完成');
        grantQuestRewards(save, content, q);
        save.quests[q.id].claimed = true;
        unpinTrackedQuest(save, q.id);
        showCurrentChapter(save, content);
        syncProgression(save, content);
        if (q.id === 63013) save.graduated = true;
        return undefined;
    },
    equip: ({ save, content, action }) => {
        const item = content.items[action.itemId];
        assert(canEquip(save, item, content), equipmentBlockReason(save, item, content));
        const instance = findEquipmentInstance(save, content, item.id, action.guid);
        assert(instance, '找不到这件装备');
        syncEquipmentInstances(save, content);
        save.equipment[item.slot] = item.id;
        save.equipmentGuids[item.slot] = instance.guid;
        save.deck = clampDeck(save.deck, { ...deckLimits(save, content), version: 'kids' }).deck;
        syncGoals(save, content);
    },
    unequip: ({ save, content, action }) => {
        const slot = Number(action.slot);
        assert(Number.isInteger(slot) && save.equipment[slot], '这个部位没有装备');
        delete save.equipment[slot];
        if (save.equipmentGuids) delete save.equipmentGuids[slot];
        save.deck = clampDeck(save.deck, { ...deckLimits(save, content), version: 'kids' }).deck;
    },
    ride: ({ save, content, action }) => {
        const itemId = Number(action.itemId);
        const mount = content.mountByItem?.[itemId];
        assert(mount?.art?.cdn && owns(save, itemId), '尚未获得这只坐骑');
        save.mountId = itemId;
    },
    dismount: ({ save }) => {
        assert(save.mountId, '当前没有骑乘坐骑');
        save.mountId = null;
    },
    'mount-gem': ({ save, content, action }) => {
        const result = mountGem(save, content, action);
        if (result.success) {
            signal(save, content, 'action', 79017);
            signal(save, content, 'action', 79026);
        }
        syncGoals(save, content);
        syncEquipmentInstances(save, content);
        save.revision++;
        return { early: { ...result, changed: true } };
    },
    'remove-gems': ({ save, content, action }) => {
        const result = removeGems(save, content, action);
        save.revision++;
        return { early: { ...result, changed: true } };
    },
    upgrade: ({ save, content, action }) => {
        const instance = findEquipmentInstance(save, content, action.itemId, action.guid);
        const iid = instance?.gsid;
        const level = instance?.serverdata.addlel || 0;
        assert(content.items[iid] && owns(save, iid) && upgradeLevels(content, iid).length, '请选择已拥有且支持强化的装备');
        const upgrade = upgradeAt(content, iid, level + 1);
        assert(upgrade, '装备已达到强化上限');
        const [currency, cost] = upgrade.cost;
        assert((save.inventory[currency] || 0) >= cost, `${content.items[currency]?.name || '强化材料'}不足`);
        syncEquipmentInstances(save, content);
        save.inventory[currency] -= cost;
        save.equipmentInstances.find(row => row.guid === instance.guid).serverdata.addlel = level + 1;
        // PowerAPI_client.lua L191–199: goal 79016 only follows a successful upgrade.
        signal(save, content, 'action', 79016);
        signal(save, content, 'action', 79025);
        syncGoals(save, content);
    },
    hatch: ({ save, content }) => {
        assert(owns(save, 17307) && !save.pet, '需要一枚出奇蛋');
        save.inventory[17307]--;
        save.inventory[content.pet.itemId] = 1;
        save.pet = { itemId: content.pet.itemId, name: content.pet.name, xp: 0, level: 0 };
        if (content.pets?.legacy_gululu) Pets.addPet(save, content, 'legacy_gululu');
        syncGoals(save, content);
    },
    feed: ({ save, content }) => {
        assert(save.pet && owns(save, content.pet.foodId), '需要宠物和战宠口粮');
        assert(save.pet.xp < content.pet.levels.max_exp, '宠物已经长大了！');
        save.inventory[content.pet.foodId]--;
        const foodXp = Pets.foodInfo(content, content.pet.foodId).xp;
        save.pet.xp = Math.min(content.pet.levels.max_exp, save.pet.xp + foodXp);
        save.pet.level = petLevel(save.pet.xp, content);
        const legacy = Object.values(save.pets || {}).find(p => p.speciesId === 'legacy_gululu');
        if (legacy) {
            legacy.xp += foodXp;
            legacy.level = Pets.petXpLevel(legacy.xp, content);
        }
        syncGoals(save, content);
    },
    'deck-layouts': ({ save, content, action }) => {
        const next = { ...save, cards: { ...save.cards }, equipment: { ...save.equipment } };
        if (action.bagItemId !== undefined) {
            const bag = content.items[action.bagItemId];
            assert(bag?.slot === 24 && canEquip(save, bag, content), '卡包尚未拥有或不符合使用条件');
            next.equipment[24] = bag.id;
        }
        if (action.learnedKeys?.length) learnDeckCards(next, content, action.learnedKeys);
        validateDeckLayouts(next, content, action.layouts, action.active);
        const selected = action.layouts[action.active].bagItemId;
        if (selected !== undefined) {
            assert(action.bagItemId === undefined || action.bagItemId === selected, '请选择一致的卡包');
            if (selected) next.equipment[24] = selected;
            else delete next.equipment[24];
        } else {
            assert(action.layouts.length <= deckLayoutCapacity(next, content), '没有多余的可用卡包，请先到商店购买');
        }
        save.cards = next.cards;
        save.trainingPointsSpent = next.trainingPointsSpent;
        save.equipment = next.equipment;
        save.deckLayouts = clone(action.layouts);
        save.activeDeckLayout = action.active;
        save.deck = clone(save.deckLayouts[action.active].deck);
        save.tips.deckEdited = true;
        save.tips.deckEditedWithBag = save.equipment[24] === 24003;
        syncGoals(save, content);
    },
    deck: ({ save, content, action }) => {
        validDeck(save, content, action.deck);
        save.deck = clone(action.deck);
        save.tips.deckEdited = true;
        save.tips.deckEditedWithBag = save.equipment[24] === 24003;
        syncGoals(save, content);
    },
    travel: ({ save, content, action }) => {
        const previous = save.zone;
        assert(travelStatus(save, content, action.zone).allowed, travelStatus(save, content, action.zone).reason);
        save.zone = action.zone;
        save.position = islandSpawn(action.zone, content);
        save.positionCoordinateVersion = mapCoordinateVersion(action.zone, content);
        save.worldLayoutVersion = content.worldMapIndex.layoutVersion;
        if (action.zone === 'town') save.visitedTown = true;
        if (previous !== action.zone) supplementIslandTrack(save, content, action.zone, catalogStatSnapshot(save, content));
    },
    retreat: ({ save, content, settleRunes }) => {
        settleRunes(save);
        const landing = retreatLanding(save, content);
        save.pendingEncounter = null;
        if (content.pets) Pets.migratePetDeckRules(save, content);
        save.position = landing.position;
        return { notice: landing.message };
    },
};

export function dispatchAdventureAction(save, content, action, access = {}, { applyAction, settleRunes } = {}) {
    assert(!action.paidByTest, '语言课程仅发放限额奖励，请使用货币购买');
    assert(!save.pendingEncounter || ['settle-encounter', 'retreat', 'language-complete'].includes(action.type), '请先完成当前战斗');
    if (content.pets && Pets.petAction(save, content, action, access)) {
        syncEquipmentInstances(save, content);
        save.revision++;
        return { changed: true };
    }
    const handler = ADVENTURE_ACTION_HANDLERS[action.type];
    if (!handler) throw new Error('未知操作');
    const quest = currentQuest(save, content);
    const outcome = handler({ save, content, action, access, quest, applyAction, settleRunes });
    if (outcome?.early) return outcome.early;
    migrateBagRules(save, content);
    migrateDefaultPocket(save, content);
    syncDeckLayouts(save, content);
    syncEquipmentInstances(save, content);
    save.revision++;
    return {
        changed: true,
        quest: currentQuest(save, content),
        level: save.level,
        ...(outcome?.notice ? { message: outcome.notice } : {}),
        ...(outcome?.trackFull ? { full: true } : {}),
    };
}
