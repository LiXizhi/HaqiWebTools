// Pure rules for Daily Archipelago Bounties ("每日群岛悬赏").
// Picks 3 deterministic daily goals per role & day and rewards active mid/late loops
// (combat, dungeons/towers, fishing, campfire cooking, Hanzi forge, trilogy curios, pet team).

import { createRng, hashSeed } from './rng_core.js';
import { localDayKey } from './trilogy_curios_core.js';

const assert = (ok, message) => {
    if (!ok) throw new Error(message);
};

export const DAILY_BOUNTY_POOL = [
    {
        id: 'battle-win',
        title: '群岛巡战',
        desc: '赢得 2 场正式冒险战斗',
        goal: 2,
        rewards: [{ id: 100, count: 90 }, { id: 17213, count: 1 }],
    },
    {
        id: 'dungeon-step',
        title: '秘境试锋',
        desc: '在任意副本或试炼塔中赢得 1 场战斗',
        goal: 1,
        rewards: [{ id: 100, count: 110 }, { id: 17172, count: 2 }],
    },
    {
        id: 'fishing-catch',
        title: '海滨抛竿',
        desc: '在岛屿水域成功钓起 2 次渔获',
        goal: 2,
        rewards: [{ id: 100, count: 80 }, { id: 17346, count: 1 }],
    },
    {
        id: 'campfire-cook',
        title: '营火生香',
        desc: '在营火烹饪锅完成 1 次料理或魔药炼成',
        goal: 1,
        rewards: [{ id: 100, count: 90 }, { id: 17213, count: 2 }],
    },
    {
        id: 'trilogy-explore',
        title: '群岛拾遗',
        desc: '完成 1 次后三岛彩蛋发现或每日拾贝/测绘',
        goal: 1,
        rewards: [{ id: 100, count: 100 }, { id: 17213, count: 2 }],
    },
    {
        id: 'hanzi-forge',
        title: '字源悟意',
        desc: '在字源合字坊尝试或合出 1 次会意汉字',
        goal: 1,
        rewards: [{ id: 100, count: 80 }, { id: 17172, count: 2 }],
    },
    {
        id: 'pet-care',
        title: '伙伴同行',
        desc: '携战宠赢得 1 场战斗或烹饪 1 次战宠美食',
        goal: 1,
        rewards: [{ id: 100, count: 85 }, { id: 17172, count: 2 }],
    },
];

export const DAILY_BOUNTY_BONUS_REWARDS = [
    { id: 100, count: 150 },
    { id: 17487, count: 1 },
    { id: 23439, count: 1 },
];

const BOUNTY_BY_ID = Object.fromEntries(DAILY_BOUNTY_POOL.map(b => [b.id, b]));

export function dailyBountySelection(seed, day) {
    const rng = createRng(hashSeed(`${seed || 1}:daily-bounties:${day}`));
    // Always keep at least one combat/general goal so every player can start smoothly.
    const core = ['battle-win', 'pet-care'];
    const first = rng.pick(core);
    const rest = rng.shuffle(DAILY_BOUNTY_POOL.map(b => b.id).filter(id => id !== first));
    return [first, rest[0], rest[1]];
}

export function validateDailyBounties(save) {
    const db = save?.dailyBounties;
    if (db === undefined) return;
    assert(db && typeof db === 'object' && !Array.isArray(db), '每日悬赏记录无效');
    assert(typeof db.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(db.day), '每日悬赏日期无效');
    assert(db.progress && typeof db.progress === 'object' && !Array.isArray(db.progress), '每日悬赏进度无效');
    for (const [k, v] of Object.entries(db.progress)) {
        assert(Object.hasOwn(BOUNTY_BY_ID, k) && Number.isInteger(v) && v >= 0 && v <= 999, '每日悬赏进度数值无效');
    }
    assert(
        Array.isArray(db.claimed)
            && new Set(db.claimed).size === db.claimed.length
            && db.claimed.every(id => Object.hasOwn(BOUNTY_BY_ID, id)),
        '每日悬赏领奖记录无效',
    );
    assert(typeof db.bonusClaimed === 'boolean', '每日悬赏总赏状态无效');
}

export function recordDailyBountyProgress(save, kind, amount = 1, now = Date.now()) {
    if (!save || !Object.hasOwn(BOUNTY_BY_ID, kind) || !Number.isInteger(amount) || amount <= 0) return false;
    const day = localDayKey(now);
    if (save.dailyBounties?.day !== day) {
        save.dailyBounties = { day, progress: {}, claimed: [], bonusClaimed: false };
    }
    const activeIds = dailyBountySelection(save.seed, day);
    if (!activeIds.includes(kind)) return false;
    const goal = BOUNTY_BY_ID[kind].goal;
    const prev = save.dailyBounties.progress[kind] || 0;
    const next = Math.min(goal, prev + amount);
    if (next === prev) return false;
    save.dailyBounties.progress[kind] = next;
    return true;
}

export function dailyBountySummary(save, content, now = Date.now()) {
    const day = localDayKey(now);
    const activeIds = dailyBountySelection(save?.seed || 1, day);
    const state = save?.dailyBounties?.day === day
        ? save.dailyBounties
        : { day, progress: {}, claimed: [], bonusClaimed: false };

    const tasks = activeIds.map(id => {
        const def = BOUNTY_BY_ID[id];
        const value = Math.min(def.goal, state.progress?.[id] || 0);
        const claimed = state.claimed.includes(id);
        const ready = value >= def.goal;
        return {
            ...def,
            value,
            ready,
            claimed,
            claimable: ready && !claimed,
            rewards: def.rewards.filter(r => r.id === 100 || !content?.items || content.items[r.id]),
        };
    });

    const completedCount = tasks.filter(t => t.ready).length;
    const bonusReady = completedCount >= tasks.length;
    const bonusClaimed = !!state.bonusClaimed;
    const bonusClaimable = bonusReady && !bonusClaimed;
    const claimableCount = tasks.filter(t => t.claimable).length + (bonusClaimable ? 1 : 0);

    return {
        day,
        tasks,
        completedCount,
        bonusReady,
        bonusClaimed,
        bonusClaimable,
        bonusRewards: DAILY_BOUNTY_BONUS_REWARDS.filter(r => r.id === 100 || !content?.items || content.items[r.id]),
        claimableCount,
    };
}

export function claimDailyBounty(save, content, targetId, now = Date.now()) {
    assert(!save.pendingEncounter, '战斗中无法领取每日悬赏');
    const summary = dailyBountySummary(save, content, now);
    if (save.dailyBounties?.day !== summary.day) {
        save.dailyBounties = { day: summary.day, progress: {}, claimed: [], bonusClaimed: false };
    }

    if (targetId === 'bonus') {
        assert(summary.bonusReady, '完成今日全部 3 项悬赏后才可领取总赏');
        if (summary.bonusClaimed) return { changed: false, rewards: [], message: '今日群岛总赏已经领取过了。' };
        save.dailyBounties.bonusClaimed = true;
        const granted = grantRewards(save, content, summary.bonusRewards);
        save.revision = (save.revision || 0) + 1;
        return { changed: true, targetId: 'bonus', rewards: granted, message: '已领取今日群岛总赏！' };
    }

    const task = summary.tasks.find(t => t.id === targetId);
    assert(task, '该任务不在今日悬赏列表中');
    assert(task.ready, '这项每日悬赏尚未达标');
    if (task.claimed) return { changed: false, rewards: [], message: '这项每日悬赏已经领取过了。' };
    save.dailyBounties.claimed.push(task.id);
    const granted = grantRewards(save, content, task.rewards);
    save.revision = (save.revision || 0) + 1;
    return { changed: true, targetId: task.id, rewards: granted, message: `已领取每日悬赏「${task.title}」！` };
}

function grantRewards(save, content, rows) {
    const granted = [];
    for (const r of rows) {
        if (r.id !== 100 && content?.items && !content.items[r.id]) continue;
        save.inventory[r.id] = (save.inventory[r.id] || 0) + r.count;
        granted.push({
            id: r.id,
            count: r.count,
            name: content?.items?.[r.id]?.name || (r.id === 100 ? '奇豆' : String(r.id)),
        });
    }
    return granted;
}
