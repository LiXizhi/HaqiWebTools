// Pure rules for equippable Hanzi Compound Seals ("字源战印").
// Links the 12 compound ideographs forged in 字源合字坊 directly into mid/late
// PvE combat without touching original Lua damage/heal formulas or legacy replays.

import { applyHpStats } from './combat_formulas_core.js';

const assert = (ok, message) => {
    if (!ok) throw new Error(message);
};

export const HANZI_SEALS = [
    {
        id: 'ming',
        solvedKey: 'forge-ming',
        glyph: '明',
        name: '明·光华战印',
        effectText: '全系伤害 +6% · 命中 +6%',
        stats: { damagePct: 6, accuracyPct: 6 },
    },
    {
        id: 'xiu',
        solvedKey: 'forge-xiu',
        glyph: '休',
        name: '休·调息战印',
        effectText: '最大生命 +8% · 治疗效果 +12%',
        stats: { hpPct: 8, outputHealPct: 12 },
    },
    {
        id: 'lin',
        solvedKey: 'forge-lin',
        glyph: '林',
        name: '林·连枝战印',
        effectText: '全系减伤 +6% · 最大生命 +5%',
        stats: { resistPct: 6, hpPct: 5 },
    },
    {
        id: 'sen',
        solvedKey: 'forge-sen',
        glyph: '森',
        name: '森·深林战印',
        effectText: '全系减伤 +9% · 最大生命 +8%',
        stats: { resistPct: 9, hpPct: 8 },
    },
    {
        id: 'yan',
        solvedKey: 'forge-yan',
        glyph: '岩',
        name: '岩·磐石战印',
        effectText: '全系减伤 +10% · 闪避 +4%',
        stats: { resistPct: 10, dodgePct: 4 },
    },
    {
        id: 'kan',
        solvedKey: 'forge-kan',
        glyph: '看',
        name: '看·明察战印',
        effectText: '暴击 +8% · 命中 +8%',
        stats: { critPct: 8, accuracyPct: 8 },
    },
    {
        id: 'wen-hear',
        solvedKey: 'forge-wen-hear',
        glyph: '闻',
        name: '闻·听风战印',
        effectText: '闪避 +8% · 超级魔力 +8%',
        stats: { dodgePct: 8, powerPipPct: 8 },
    },
    {
        id: 'wen-ask',
        solvedKey: 'forge-wen-ask',
        glyph: '问',
        name: '问·求知战印',
        effectText: '超级魔力 +12% · 命中 +5%',
        stats: { powerPipPct: 12, accuracyPct: 5 },
    },
    {
        id: 'jian',
        solvedKey: 'forge-jian',
        glyph: '尖',
        name: '尖·锋芒战印',
        effectText: '全系穿透 +10% · 暴击 +5%',
        stats: { piercePct: 10, critPct: 5 },
    },
    {
        id: 'chen',
        solvedKey: 'forge-chen',
        glyph: '尘',
        name: '尘·轻扬战印',
        effectText: '闪避 +10% · 全系减伤 +4%',
        stats: { dodgePct: 10, resistPct: 4 },
    },
    {
        id: 'si',
        solvedKey: 'forge-si',
        glyph: '思',
        name: '思·凝神战印',
        effectText: '开局 +1 强力魔力球 · 治疗效果 +6%',
        stats: { startupPower: 1, outputHealPct: 6 },
    },
    {
        id: 'yan-flame',
        solvedKey: 'forge-yan-flame',
        glyph: '炎',
        name: '炎·烈焰战印',
        effectText: '全系伤害 +10% · 暴击 +5%',
        stats: { damagePct: 10, critPct: 5 },
    },
];

export const HANZI_SEAL_BY_ID = Object.fromEntries(HANZI_SEALS.map(s => [s.id, s]));

export function hanziSealById(id) {
    return typeof id === 'string' && Object.hasOwn(HANZI_SEAL_BY_ID, id) ? HANZI_SEAL_BY_ID[id] : null;
}

export function isHanziSealUnlocked(save, id) {
    const seal = hanziSealById(id);
    return !!(seal && save?.islandPuzzles?.solved?.[seal.solvedKey] === true);
}

export function equippedHanziSeal(save) {
    if (!save?.hanziSeal) return null;
    return isHanziSealUnlocked(save, save.hanziSeal) ? hanziSealById(save.hanziSeal) : null;
}

export function validateHanziSealSave(save) {
    if (save?.hanziSeal === undefined || save?.hanziSeal === null) return;
    assert(typeof save.hanziSeal === 'string' && Object.hasOwn(HANZI_SEAL_BY_ID, save.hanziSeal), '字源战印无效');
    assert(isHanziSealUnlocked(save, save.hanziSeal), '尚未在合字坊造出这枚字源战印');
}

export function equipHanziSeal(save, sealId) {
    assert(!save?.pendingEncounter, '战斗中无法更换字源战印');
    if (sealId === null || sealId === undefined || sealId === '' || save.hanziSeal === sealId) {
        const previous = save.hanziSeal ? hanziSealById(save.hanziSeal) : null;
        delete save.hanziSeal;
        save.revision = (save.revision || 0) + 1;
        return {
            changed: !!previous,
            seal: null,
            message: previous ? `已卸下「${previous.name}」。` : '当前未佩戴字源战印。',
        };
    }
    const seal = hanziSealById(sealId);
    assert(seal, '未知字源战印');
    assert(isHanziSealUnlocked(save, seal.id), '请先在字源合字坊造出这个汉字');
    save.hanziSeal = seal.id;
    save.revision = (save.revision || 0) + 1;
    return {
        changed: true,
        seal,
        message: `已佩戴「${seal.name}」：${seal.effectText}。`,
    };
}

export function hanziSealSnapshot(save) {
    const seal = equippedHanziSeal(save);
    if (!seal) return null;
    return { version: 1, id: seal.id };
}

export function validateHanziSealSnapshot(snapshot) {
    if (snapshot === undefined || snapshot === null) return;
    assert(
        snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
            && snapshot.version === 1
            && typeof snapshot.id === 'string'
            && Object.hasOwn(HANZI_SEAL_BY_ID, snapshot.id),
        '字源战印战斗快照无效',
    );
}

export function applyHanziSealToHero(arena, snapshot) {
    if (!snapshot) return;
    validateHanziSealSnapshot(snapshot);
    const seal = HANZI_SEAL_BY_ID[snapshot.id];
    const hero = arena?.sides?.near?.[0];
    if (!seal || !hero) return;
    const s = seal.stats || {};
    if (s.damagePct) hero.stats.damagePct.all = (hero.stats.damagePct.all || 0) + s.damagePct;
    if (s.resistPct) hero.stats.resistPct.all = (hero.stats.resistPct.all || 0) + s.resistPct;
    if (s.piercePct) {
        hero.stats.penetration ??= {};
        hero.stats.penetration.all = (hero.stats.penetration.all || 0) + s.piercePct;
    }
    if (s.accuracyPct) {
        hero.stats.accuracyPct ??= {};
        hero.stats.accuracyPct.all = (hero.stats.accuracyPct.all || 0) + s.accuracyPct;
    }
    if (s.critPct) {
        hero.stats.critPct ??= {};
        hero.stats.critPct.all = (hero.stats.critPct.all || 0) + s.critPct;
    }
    if (s.dodgePct) hero.stats.dodgePct = (hero.stats.dodgePct || 0) + s.dodgePct;
    if (s.powerPipPct) hero.stats.powerPipPct = (hero.stats.powerPipPct || 0) + s.powerPipPct;
    if (s.outputHealPct) hero.stats.outputHealPct = (hero.stats.outputHealPct || 0) + s.outputHealPct;
    if (s.startupPower) hero.stats.startupPower = (hero.stats.startupPower || 0) + s.startupPower;
    if (s.hpPct) {
        const baseMax = hero.languageBaseMaxHp ?? hero.maxHp;
        const baseHp = hero.languageBaseMaxHp ? Math.round((hero.hp / (hero.maxHp || 1)) * baseMax) : hero.hp;
        hero.languageBaseMaxHp = baseMax;
        const newMax = applyHpStats(hero.maxHp, s.hpPct, 0, 'kids');
        const ratio = hero.maxHp > 0 ? hero.hp / hero.maxHp : 1;
        hero.maxHp = newMax;
        hero.hp = hero.hp > 0 ? Math.max(1, Math.min(newMax, Math.round(newMax * ratio))) : 0;
        if (!Number.isFinite(hero.hp)) hero.hp = Math.min(newMax, baseHp);
    }
    arena.hanziSeal = { version: 1, id: seal.id };
}
