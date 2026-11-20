// adventure_quests_core.js — 冒险主线任务、教学引导判定、目标同步与任务奖励发放。
import { noteCatalogSignal } from './adventure_catalog_quests_core.js';
import { ownedPetSpecies } from './adventure_pet_files_core.js';
import * as Pets from './adventure_pets_core.js';
import { resolvePetReward } from './adventure_rewards_core.js';
import { openingTrainingCredit } from './opening_journey_core.js';

export const SCHOOL_NAMES = { fire: '烈火', ice: '寒冰', storm: '风暴', life: '生命', death: '死亡' };

export function currentQuest(save, content) {
    return content.quests.find(q => !save.quests[q.id]?.claimed) || null;
}

// 低于10级时所有区域开启新手UI指引；10级起保留原魔法营地教学规则。
export function beginnerTeaching(save) {
    return Number.isFinite(save?.level) && save.level >= 1 && save.level < 10;
}

// 新手岛教学模式（2026-09-26 用户约定）：身处魔法营地且营地任务链
// （章节任务按发布 NPC 所在区域、目录任务按 region）尚有未交付的即开启；
// 低等级直接返回 true；其余等级返回未交付营地任务或 null，供面板与追踪统一判定。
export function teachingMode(save, content) {
    if (save && content && beginnerTeaching(save)) return true;
    if (!save || save.zone !== 'camp' || !content) return null;
    const chapter = content.quests?.find(q => !save.quests[q.id]?.claimed && content.npcs[q.startNpc]?.zone === 'camp');
    if (chapter) return chapter;
    return content.catalogQuests?.quests.find(q => q.region === 'camp' && !save.quests[q.id]?.claimed) || null;
}

export function questState(save, id) {
    return save.quests[id] || { accepted: false, claimed: false, progress: {} };
}

export function questProgress(save, quest) {
    const state = questState(save, quest.id);
    // Existing accepted saves keep the original strengthening-only objective.
    const goals = quest.id === 63007 && state.equipmentTutorialVersion !== 2
        ? quest.goals.filter(g => g.id !== 'equip-staff')
        : quest.goals;
    return goals.map(g => ({
        ...g,
        value: Math.min(g.count, Math.max(state.progress[`${g.kind}:${g.id}`] || 0, openingTrainingCredit(save, quest.id, g))),
    }));
}

export function pendingQuestTalk(save, quest, npcId) {
    if (!quest || !questState(save, quest.id).accepted || questState(save, quest.id).claimed) return null;
    const pending = questProgress(save, quest).some(g => g.kind === 'talk' && g.id === npcId && g.value < g.count);
    return pending ? quest.talks.find(t => t.npcId === npcId) || null : null;
}

export function questReady(save, quest) {
    return !!quest && questState(save, quest.id).accepted && questProgress(save, quest).every(g => g.value >= g.count);
}

export function signal(save, content, kind, id, count = 1) {
    const q = currentQuest(save, content);
    if (q && questState(save, q.id).accepted) {
        const state = save.quests[q.id];
        for (const goal of q.goals) {
            if (goal.kind === kind && String(goal.id) === String(id)) {
                const key = `${kind}:${id}`;
                state.progress[key] = Math.min(goal.count, (state.progress[key] || 0) + count);
            }
        }
    }
    if (kind === 'talk') noteCatalogSignal(save, content, 'talk', id, count);
    if (kind === 'action' && Number.isInteger(Number(id))) noteCatalogSignal(save, content, 'custom', Number(id), count);
}

export function syncGoals(save, content) {
    if (save.equipment[11] === 1912) signal(save, content, 'action', 'equip-staff');
    if (content.pets ? ownedPetSpecies(save).includes('legacy_gululu') : save.pet) signal(save, content, 'action', 'hatch-pet');
    if (save.tips.petFed || (!content.pets && save.pet?.xp > 0)) {
        const q = currentQuest(save, content);
        if (q && save.quests[q.id]?.accepted) {
            for (const goal of q.goals) {
                if (goal.kind === 'action' && Number(goal.id) === 79019) save.quests[q.id].progress['action:79019'] = goal.count;
            }
        }
    }
    if (save.equipment[24] === 24003 && save.tips.deckEditedWithBag) signal(save, content, 'action', 79037);
}

// CombatPetProvider.lua GetLevelInfo L749–780: XML max_level is zero-based.
export function petLevel(xp, content) {
    const levels = content.pet.levels;
    if (xp >= levels.max_exp) return levels.max_level + 1;
    let total = 0, level = 0;
    for (let i = 1; i <= levels.max_level; i++) {
        total += levels[`exp_level_${i}`];
        if (xp < total) break;
        level = i;
    }
    return level;
}

export function rewardsFor(save, content, quest) {
    const rewards = [];
    for (const group of quest.rewards) {
        const rows = group.items.filter(e => {
            const school = Number(content.items[e.id]?.stats?.[137] || 0);
            return !group.schoolFilter || !school || school === content.schools[save.school];
        });
        rewards.push(...(group.choice > 0 ? rows.slice(0, group.choice) : rows));
    }
    return rewards.map(reward => {
        const adapted = reward.id === 113 && content.progression.questXpOverrides?.[quest.id]
            ? { ...reward, count: content.progression.questXpOverrides[quest.id] }
            : reward;
        return resolvePetReward(content, adapted);
    });
}

export function grantQuestRewards(save, content, quest) {
    const rewards = rewardsFor(save, content, quest);
    for (const r of rewards) {
        if (r.kind === 'pet') {
            for (let i = 0; i < r.count; i++) Pets.addPet(save, content, r.petId);
        } else if (r.id === 113) save.xp += r.count;
        else save.inventory[r.id] = (save.inventory[r.id] || 0) + r.count;
    }
    if (content.pets) {
        for (const r of rewards) {
            if (r.kind === 'pet') {
                save.questPetConversions ??= {};
                save.questPetConversions[r.id] = (save.questPetConversions[r.id] || 0) + r.count;
            }
        }
    }
}
