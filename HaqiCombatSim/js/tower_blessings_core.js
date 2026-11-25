// Pure roguelike 3-pick blessing rules for Trial Towers ("试炼之塔 · 塔内赐福").
// Every cleared milestone floor (floor 1, then every 5th floor before summit) offers
// 3 deterministic distinct blessings that persist for the current tower run (local runtime)
// and snapshot onto `pendingEncounter.towerBlessings` so battle replays stay 100% deterministic.

import { createRng, hashSeed } from './rng_core.js';

const assert = (ok, message) => {
    if (!ok) throw new Error(message);
};

export const TOWER_BLESSINGS = [
    {
        id: 'blade-edge',
        tag: '攻势',
        name: '破阵锋芒',
        maxStacks: 3,
        summary: '全队全系法术伤害 +12%',
        detail: '越往高层越需要一击定胜负的爆发力，每层叠加强化全队所有学派的输出。',
    },
    {
        id: 'iron-bulwark',
        tag: '防线',
        name: '磐石护壁',
        maxStacks: 3,
        summary: '全队全系伤害抗性 +10%',
        detail: '稳步压低高层守关首领的爆发重击，适合持久消耗与双人/四人推进。',
    },
    {
        id: 'vital-spring',
        tag: '续航',
        name: '生机涌泉',
        maxStacks: 3,
        summary: '全队最大生命 +15%，并立即回复 18% 最大生命',
        detail: '试炼塔内不自动回血，涌泉既能抬高血线容错，也能立刻为全队喘一口气。',
    },
    {
        id: 'pip-surge',
        tag: '魔力',
        name: '超魔涌流',
        maxStacks: 3,
        summary: '全队超级魔力生成率 +18%',
        detail: '让高费大招与强化组合更频繁上手，大幅加快每层通关节奏。',
    },
    {
        id: 'keen-sight',
        tag: '暴击',
        name: '明察秋毫',
        maxStacks: 2,
        summary: '全队暴击率 +10% · 命中率 +6%',
        detail: '减少关键回合失误，并让每次暴击都更具压制力。',
    },
    {
        id: 'focus-spark',
        tag: '先手',
        name: '先手魔晶',
        maxStacks: 1,
        summary: '全队开场额外获得 +1 点超级魔力',
        detail: '首回合就能直接打出高阶起手或双段配合，抢先建立场面优势。',
    },
    {
        id: 'mending-breeze',
        tag: '治疗',
        name: '微风愈合',
        maxStacks: 2,
        summary: '全队治疗输出 +20% · 受疗效果 +12%',
        detail: '与生命系或带治疗牌的战宠配合极佳，让队伍轻松熬过百层连战。',
    },
    {
        id: 'pierce-lance',
        tag: '破甲',
        name: '穿甲灵矛',
        maxStacks: 2,
        summary: '全队全系法术穿透 +10% · 暴击倍率 +12%',
        detail: '专克高层高抗与铁壁守关首领，强行撕开敌方防线。',
    },
    {
        id: 'agile-step',
        tag: '灵巧',
        name: '踏风闪步',
        maxStacks: 2,
        summary: '全队闪避率 +10% · 韧性 +8%',
        detail: '灵巧躲开致命重击并降低被敌人暴击的风险。',
    },
    {
        id: 'spirit-focus',
        tag: '均衡',
        name: '星辰法印',
        maxStacks: 3,
        summary: '全队全系伤害 +8% · 全系抗性 +6%',
        detail: '攻守兼备的稳健赐福，任何阵容和学派都能稳定受益。',
    },
];

export const TOWER_BLESSING_BY_ID = Object.fromEntries(TOWER_BLESSINGS.map(b => [b.id, b]));

export function isTowerBlessingFloor(floor, totalFloors) {
    if (!Number.isInteger(floor) || floor < 1) return false;
    if (Number.isInteger(totalFloors) && floor >= totalFloors) return false;
    return floor === 1 || floor % 5 === 0;
}

export function towerBlessingStacks(save, dungeonId) {
    const run = save?.towerRunBlessings;
    if (!run || run.dungeonId !== dungeonId || !run.picks) return {};
    return { ...run.picks };
}

export function activeTowerBlessingRows(save, dungeonId) {
    const picks = towerBlessingStacks(save, dungeonId);
    return Object.entries(picks)
        .filter(([, n]) => n > 0)
        .map(([id, stacks]) => {
            const meta = TOWER_BLESSING_BY_ID[id];
            return meta ? { ...meta, stacks } : null;
        })
        .filter(Boolean);
}

export function towerBlessingPendingOffer(save, dungeonId) {
    const run = save?.towerRunBlessings;
    if (!run || run.dungeonId !== dungeonId || !Number.isInteger(run.pendingFloor) || !Array.isArray(run.offered) || !run.offered.length) {
        return null;
    }
    const choices = run.offered.map(id => {
        const meta = TOWER_BLESSING_BY_ID[id];
        if (!meta) return null;
        return { ...meta, currentStacks: run.picks?.[id] || 0 };
    }).filter(Boolean);
    if (!choices.length) return null;
    return {
        dungeonId,
        floor: run.pendingFloor,
        choices,
        active: activeTowerBlessingRows(save, dungeonId),
    };
}

export function rollTowerBlessingOffer(save, dungeonId, floor) {
    const picks = towerBlessingStacks(save, dungeonId);
    const eligible = TOWER_BLESSINGS.filter(b => (picks[b.id] || 0) < b.maxStacks);
    if (!eligible.length) return [];
    const totalPicked = Object.values(picks).reduce((a, b) => a + b, 0);
    const rng = createRng(hashSeed(`${save.seed}:tower-blessing:${dungeonId}:${floor}:${totalPicked}`));
    const pool = [...eligible];
    const picked = [];
    while (pool.length && picked.length < 3) {
        const idx = rng.int(0, pool.length - 1);
        picked.push(pool.splice(idx, 1)[0].id);
    }
    return picked;
}

export function recordTowerBlessingOffer(save, dungeon, floor) {
    if (save?.coopRun || dungeon?.kind !== 'tower') return null;
    if (!isTowerBlessingFloor(floor, dungeon.floors)) return null;
    const prev = save.towerRunBlessings?.dungeonId === dungeon.id ? save.towerRunBlessings : { version: 1, dungeonId: dungeon.id, picks: {} };
    const offered = rollTowerBlessingOffer({ ...save, towerRunBlessings: prev }, dungeon.id, floor);
    if (!offered.length) return null;
    save.towerRunBlessings = {
        version: 1,
        dungeonId: dungeon.id,
        picks: { ...(prev.picks || {}) },
        pendingFloor: floor,
        offered,
    };
    return towerBlessingPendingOffer(save, dungeon.id);
}

export function towerBlessingsSnapshot(save, dungeon) {
    if (save?.coopRun || dungeon?.kind !== 'tower') return null;
    const picks = towerBlessingStacks(save, dungeon.id);
    const nonZero = Object.fromEntries(Object.entries(picks).filter(([, n]) => Number.isInteger(n) && n > 0));
    if (!Object.keys(nonZero).length) return null;
    return { version: 1, picks: nonZero };
}

export function validateTowerBlessingsSnapshot(snapshot) {
    if (snapshot === undefined || snapshot === null) return;
    assert(snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) && snapshot.version === 1, '试炼塔赐福检查点版本无效');
    assert(snapshot.picks && typeof snapshot.picks === 'object' && !Array.isArray(snapshot.picks), '试炼塔赐福列表无效');
    for (const [id, n] of Object.entries(snapshot.picks)) {
        const meta = TOWER_BLESSING_BY_ID[id];
        assert(meta && Number.isInteger(n) && n >= 1 && n <= meta.maxStacks, '试炼塔赐福条目无效');
    }
}

export function validateTowerRunBlessings(save, content) {
    const run = save?.towerRunBlessings;
    if (run === undefined || run === null) return;
    assert(run && typeof run === 'object' && !Array.isArray(run) && run.version === 1, '试炼塔赐福状态版本无效');
    const dungeon = content?.dungeons?.find(d => d.id === run.dungeonId);
    assert(dungeon?.kind === 'tower', '试炼塔赐福所属高塔无效');
    assert(run.picks && typeof run.picks === 'object' && !Array.isArray(run.picks), '试炼塔赐福记录无效');
    for (const [id, n] of Object.entries(run.picks)) {
        const meta = TOWER_BLESSING_BY_ID[id];
        assert(meta && Number.isInteger(n) && n >= 1 && n <= meta.maxStacks, '试炼塔赐福层数无效');
    }
    if (run.pendingFloor !== undefined && run.pendingFloor !== null) {
        assert(Number.isInteger(run.pendingFloor) && run.pendingFloor >= 1 && run.pendingFloor <= dungeon.floors, '试炼塔待选层数无效');
    }
    if (run.offered !== undefined) {
        assert(
            Array.isArray(run.offered)
                && run.offered.length <= 3
                && new Set(run.offered).size === run.offered.length
                && run.offered.every(id => !!TOWER_BLESSING_BY_ID[id]),
            '试炼塔赐福候选无效',
        );
    }
}

export function applyTowerBlessingChoice(save, content, action, { heroMaxHp = 0, petMaxHpFn = null } = {}) {
    assert(!save.pendingEncounter, '请先完成当前战斗');
    const run = save.towerRunBlessings;
    assert(run && run.dungeonId === save.zone, '当前不在对应的试炼之塔中');
    assert(Number.isInteger(run.pendingFloor) && Array.isArray(run.offered) && run.offered.length > 0, '当前没有待挑选的试炼塔赐福');
    const blessingId = action?.blessingId;
    const meta = TOWER_BLESSING_BY_ID[blessingId];
    assert(meta && run.offered.includes(blessingId), '所选试炼塔赐福不在本轮候选中');
    const current = run.picks?.[blessingId] || 0;
    assert(current < meta.maxStacks, '这项试炼塔赐福已达叠加上限');

    run.picks ??= {};
    run.picks[blessingId] = current + 1;
    run.pendingFloor = null;
    run.offered = [];

    // Vital Spring gives an immediate healing breather between tower floors.
    let healed = 0;
    if (blessingId === 'vital-spring') {
        if (heroMaxHp > 0 && Number.isFinite(save.heroHp) && save.heroHp > 0) {
            const gain = Math.ceil(heroMaxHp * 0.18);
            const nextHp = Math.min(heroMaxHp, save.heroHp + gain);
            healed = Math.max(0, nextHp - save.heroHp);
            save.heroHp = nextHp;
        }
        if (petMaxHpFn) {
            for (const petId of save.formation || []) {
                const pet = petId && save.pets?.[petId];
                if (!pet || !(pet.hp > 0)) continue;
                const max = petMaxHpFn(pet, content);
                if (max > 0) pet.hp = Math.min(max, pet.hp + Math.ceil(max * 0.18));
            }
        }
    }

    save.revision++;
    return {
        changed: true,
        blessingId,
        stacks: run.picks[blessingId],
        healed,
        message: `已获得试炼塔赐福「${meta.name}」（第 ${run.picks[blessingId]}/${meta.maxStacks} 层）：${meta.summary}`,
    };
}

// Deterministic PvE combat application — called inside createPveBattle before turn 1.
export function applyTowerBlessingsToParty(arena, snapshot) {
    if (!snapshot) return;
    validateTowerBlessingsSnapshot(snapshot);
    const picks = snapshot.picks || {};
    const entries = Object.entries(picks).filter(([, n]) => n > 0);
    if (!entries.length) return;

    const dmgPct = (picks['blade-edge'] || 0) * 12 + (picks['spirit-focus'] || 0) * 8;
    const resistPct = (picks['iron-bulwark'] || 0) * 10 + (picks['spirit-focus'] || 0) * 6;
    const hpPct = (picks['vital-spring'] || 0) * 15;
    const pipPct = (picks['pip-surge'] || 0) * 18;
    const critPct = (picks['keen-sight'] || 0) * 10;
    const accPct = (picks['keen-sight'] || 0) * 6;
    const startPower = picks['focus-spark'] || 0;
    const outHeal = (picks['mending-breeze'] || 0) * 20;
    const inHeal = (picks['mending-breeze'] || 0) * 12;
    const penPct = (picks['pierce-lance'] || 0) * 10;
    const critRatio = (picks['pierce-lance'] || 0) * 0.12;
    const dodgePct = (picks['agile-step'] || 0) * 10;
    const resilPct = (picks['agile-step'] || 0) * 8;

    for (const unit of arena.sides.near) {
        if (dmgPct) unit.stats.damagePct.all = (unit.stats.damagePct.all || 0) + dmgPct;
        if (resistPct) unit.stats.resistPct.all = (unit.stats.resistPct.all || 0) + resistPct;
        if (pipPct) unit.stats.powerPipPct = (unit.stats.powerPipPct || 0) + pipPct;
        if (critPct) unit.stats.critPct.all = (unit.stats.critPct.all || 0) + critPct;
        if (accPct) unit.stats.accuracyPct.all = (unit.stats.accuracyPct.all || 0) + accPct;
        if (startPower) unit.stats.startupPower = (unit.stats.startupPower || 0) + startPower;
        if (outHeal) unit.stats.outputHealPct = (unit.stats.outputHealPct || 0) + outHeal;
        if (inHeal) unit.stats.inputHealPct = (unit.stats.inputHealPct || 0) + inHeal;
        if (penPct) unit.stats.penetration.all = (unit.stats.penetration.all || 0) + penPct;
        if (critRatio) unit.stats.critRatioBonus = (unit.stats.critRatioBonus || 0) + critRatio;
        if (dodgePct) unit.stats.dodgePct = (unit.stats.dodgePct || 0) + dodgePct;
        if (resilPct) unit.stats.resiliencePct.all = (unit.stats.resiliencePct.all || 0) + resilPct;
        if (hpPct) {
            const base = unit.languageBaseMaxHp || unit.maxHp;
            const prevMax = unit.maxHp;
            const extra = Math.ceil(base * hpPct / 100);
            unit.maxHp += extra;
            if (unit.hp > 0) unit.hp = Math.min(unit.maxHp, Math.ceil(unit.hp * unit.maxHp / prevMax));
            unit.languageBaseMaxHp = base;
        }
    }
    arena.towerBlessings = structuredClone(snapshot);
}
