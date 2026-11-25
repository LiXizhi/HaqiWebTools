// Pure rules for the Fishing Trophy Album & Claimable Bounties ("钓鱼巨物图鉴赏金").
// Builds on save.fishingRecords (top-10 weights per species 17106..17111) without
// changing fishing RNG or weight formulas.

import { fishingSpecies, fishingTuning, fishSize } from './adventure_fishing_records_core.js';

const assert = (ok, message) => {
    if (!ok) throw new Error(message);
};

export const FISHING_BOUNTY_TIERS = [
    {
        tier: 'catch',
        label: '首次上岸',
        minGrams: 1,
        rewards: [
            { id: 100, count: 35 },
            { id: 17113, count: 1 },
        ],
    },
    {
        tier: 'large',
        label: '大鱼纪录',
        minGrams: fishingTuning.fishingLargeGrams,
        rewards: [
            { id: 100, count: 80 },
            { id: 17213, count: 2 },
            { id: 17346, count: 1 },
        ],
    },
    {
        tier: 'huge',
        label: '巨物纪录',
        minGrams: fishingTuning.fishingHugeGrams,
        rewards: [
            { id: 100, count: 160 },
            { id: 17213, count: 5 },
            { id: 17487, count: 1 },
        ],
    },
];

export const FISHING_ALBUM_MILESTONES = [
    {
        id: 'milestone:species-3',
        title: '初识海味（收集 3 种渔获）',
        check: summary => summary.caughtSpecies >= 3,
        rewards: [
            { id: 100, count: 120 },
            { id: 17348, count: 1 },
        ],
    },
    {
        id: 'milestone:species-6',
        title: '全海图鉴（集齐 6 种渔获）',
        check: summary => summary.caughtSpecies >= fishingSpecies.length,
        rewards: [
            { id: 100, count: 260 },
            { id: 26012, count: 1 },
            { id: 17487, count: 1 },
        ],
    },
    {
        id: 'milestone:huge-3',
        title: '传奇钓手（达成 3 种巨物纪录）',
        check: summary => summary.hugeSpecies >= 3,
        rewards: [
            { id: 100, count: 360 },
            { id: 26028, count: 1 },
            { id: 17487, count: 2 },
        ],
    },
];

const VALID_BOUNTY_IDS = new Set([
    ...fishingSpecies.flatMap(id => FISHING_BOUNTY_TIERS.map(t => `${id}:${t.tier}`)),
    ...FISHING_ALBUM_MILESTONES.map(m => m.id),
]);

export function validateFishingBounties(save) {
    if (save?.fishingBounties === undefined) return;
    assert(
        Array.isArray(save.fishingBounties)
            && new Set(save.fishingBounties).size === save.fishingBounties.length
            && save.fishingBounties.every(id => typeof id === 'string' && VALID_BOUNTY_IDS.has(id)),
        '钓鱼图鉴赏金记录无效',
    );
}

export function fishingAlbumSummary(save, content) {
    const byFish = save?.fishingRecords?.byFish || {};
    const claimed = new Set(save?.fishingBounties || []);
    let caughtSpecies = 0;
    let largeSpecies = 0;
    let hugeSpecies = 0;

    const speciesRows = fishingSpecies.map(id => {
        const rows = byFish[id] || [];
        const bestGrams = rows[0]?.grams || 0;
        const size = bestGrams > 0 ? fishSize(bestGrams) : 'none';
        if (bestGrams > 0) caughtSpecies++;
        if (size === 'large' || size === 'huge') largeSpecies++;
        if (size === 'huge') hugeSpecies++;
        const tiers = FISHING_BOUNTY_TIERS.map(def => {
            const bountyId = `${id}:${def.tier}`;
            const unlocked = bestGrams >= def.minGrams;
            const isClaimed = claimed.has(bountyId);
            return {
                id: bountyId,
                tier: def.tier,
                label: def.label,
                minGrams: def.minGrams,
                unlocked,
                claimed: isClaimed,
                claimable: unlocked && !isClaimed,
                rewards: def.rewards.filter(r => r.id === 100 || !content?.items || content.items[r.id]),
            };
        });
        return {
            id,
            name: content?.items?.[id]?.name || `海产 ${id}`,
            bestGrams,
            size,
            countInBag: save?.inventory?.[id] || 0,
            tiers,
        };
    });

    const summary = { caughtSpecies, largeSpecies, hugeSpecies, totalSpecies: fishingSpecies.length };
    const milestones = FISHING_ALBUM_MILESTONES.map(def => {
        const unlocked = def.check(summary);
        const isClaimed = claimed.has(def.id);
        return {
            id: def.id,
            title: def.title,
            unlocked,
            claimed: isClaimed,
            claimable: unlocked && !isClaimed,
            rewards: def.rewards.filter(r => r.id === 100 || !content?.items || content.items[r.id]),
        };
    });

    const claimableCount =
        speciesRows.reduce((n, row) => n + row.tiers.filter(t => t.claimable).length, 0)
        + milestones.filter(m => m.claimable).length;

    return { ...summary, speciesRows, milestones, claimableCount };
}

export function claimFishingBounty(save, content, bountyId) {
    assert(typeof bountyId === 'string' && VALID_BOUNTY_IDS.has(bountyId), '未知钓鱼赏金编号');
    const summary = fishingAlbumSummary(save, content);
    const target =
        summary.speciesRows.flatMap(r => r.tiers).find(t => t.id === bountyId)
        || summary.milestones.find(m => m.id === bountyId);
    assert(target, '找不到对应钓鱼赏金');
    assert(target.unlocked, '尚未达到该钓鱼纪录要求');
    if (target.claimed) {
        return { changed: false, rewards: [], message: '这项钓鱼赏金已经领取过了。' };
    }
    save.fishingBounties ??= [];
    save.fishingBounties.push(bountyId);
    const granted = [];
    for (const reward of target.rewards) {
        if (reward.id !== 100 && content?.items && !content.items[reward.id]) continue;
        save.inventory[reward.id] = (save.inventory[reward.id] || 0) + reward.count;
        granted.push({
            id: reward.id,
            count: reward.count,
            name: content?.items?.[reward.id]?.name || (reward.id === 100 ? '奇豆' : String(reward.id)),
        });
    }
    save.revision = (save.revision || 0) + 1;
    return {
        changed: true,
        bountyId,
        rewards: granted,
        message: '已领取钓鱼图鉴赏金！',
    };
}
