import { createRng, hashSeed } from './rng_core.js';
import { addPet } from './adventure_pets_core.js';

// ItemManager.lua L1186–1204: class 2/6 = PetTransform, 10/1 = MountPet.
// Web adaptation: grant a permanent catalog companion instead of a mount skin.
export function isPetRewardItem(item) {
    return item && ((item.kind === 2 && item.subtype === 6) || (item.kind === 10 && item.subtype === 1));
}
export function resolvePetReward(content, reward) {
    if (!content.pets || !isPetRewardItem(content.items[reward.id])) return reward;
    const ids = Object.keys(content.pets).filter(id => !content.pets[id].legacy).sort();
    if (!ids.length) throw Error('任务宠物奖励缺少图鉴');
    const preferred = content.items[reward.id].rewardPetId;
    if (preferred && !ids.includes(preferred)) throw Error('任务宠物奖励映射无效');
    const petId = preferred || createRng(hashSeed(`quest-pet:${reward.id}`)).pick(ids);
    return { ...reward, kind: 'pet', petId };
}
export function rewardLabel(content, reward) {
    return `${reward.kind === 'pet' ? `宠物·${content.pets[reward.petId].name}` : content.items[reward.id].name} ×${reward.count}`;
}
// Only exchange retained items that were actually awarded by completed quests.
// A ledger prevents remaining non-quest inventory being exchanged on later loads.
export function migrateQuestPetRewards(save, content, rewardsFor) {
    if (!content.pets || save.pendingEncounter) return;
    const counts = new Map();
    for (const quest of content.quests) if (save.quests[quest.id]?.claimed) {
        for (const reward of rewardsFor(save, content, quest)) if (reward.kind === 'pet') {
            const entry = counts.get(reward.id) || { ...reward, count: 0 };
            entry.count += reward.count;
            counts.set(reward.id, entry);
        }
    }
    const ledger = save.questPetConversions || {};
    if (typeof ledger !== 'object' || Array.isArray(ledger)) throw Error('任务宠物兑换记录无效');
    for (const [id, count] of Object.entries(ledger)) {
        if (!counts.has(Number(id)) || !Number.isSafeInteger(count) || count < 0 || count > counts.get(Number(id)).count) throw Error('任务宠物兑换记录无效');
    }
    for (const reward of counts.values()) {
        const count = Math.min(save.inventory[reward.id] || 0, reward.count - (ledger[reward.id] || 0));
        for (let i = 0; i < count; i++) addPet(save, content, reward.petId);
        if (count) save.inventory[reward.id] -= count;
        ledger[reward.id] = reward.count;
    }
    if (counts.size) save.questPetConversions = ledger;
}
