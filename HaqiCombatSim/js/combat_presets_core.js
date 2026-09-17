// combat_presets_core.js — 预设卡组 / 单位模板 / 对局矩阵。
import { SCHOOLS } from './combat_params_core.js';
import { isSupportedType, isAttackCard, isHealCard, expectedBaseDamage } from './combat_cards_core.js';

export const SCHOOL_NAMES = { fire: '烈火', ice: '寒冰', storm: '风暴', life: '生命', death: '死亡', myth: '神话', balance: '平衡' };
export const SCHOOL_COLORS = { fire: '#e8562a', ice: '#3aa6e8', storm: '#8f5be8', life: '#4fc45a', death: '#7b7f8a', balance: '#d8b04a', myth: '#e8c13a' };
export const MODES = { '1v1': 1, '2v2': 2, '3v3': 3, '4v4': 4 };

function styleOf(school) {
    return `Aggressive${school.charAt(0).toUpperCase()}${school.slice(1)}`;
}

/** 官方 CSV 里同一法术的染色副本（_Green/_Blue/_Purple，teen 与本体共享单卡上限） */
const COLOR_VARIANT = /_(Green|Blue|Purple)$/;

/**
 * 从官方 AI CSV 派生某系“玩家会带的”预设卡组：CSV 中出现且数据集含有的卡，去掉染色副本。
 * 无 CSV 时回退：该系 + balance 的受支持卡中按类型抽样。
 *
 * 份数：攻击 / 治疗牌每种 copies 份（默认 3），护盾 / 符咒 / 光环等功能牌每种 ceil(copies/2) 份；
 * 输出按“轮询”顺序展开（第 1 轮每种 1 张，第 2 轮…），攻击牌按 requireLevel 降序排在前面，
 * 因此 createUnit → setDeck 按 BalanceParams.global.deckCapacity / deckEachCapacity 裁剪时，
 * 先被裁掉的是低级攻击牌的多余副本，小卡包仍保持卡种多样。
 * 带满不一定最好——卡越多越抽不到关键牌，正式结论应在配卡面板为各系配出实际卡组。
 * @param opts { copies, maxCards, maxLevel, keepVariants }
 * @return [{key, count}]（同 key 可能出现多次，交给 clampDeck 合并）
 */
export function presetDeck(dataset, school, opts = {}) {
    const copies = Math.max(1, opts.copies ?? 3);
    const utilCopies = Math.max(1, Math.ceil(copies / 2));
    const maxCards = opts.maxCards ?? 120;
    const cards = dataset.cards || {};
    const table = (dataset.aiDecks || {})[styleOf(school)];
    let keys = [];
    if (table && table.cards) {
        keys = Object.keys(table.cards).filter(k => cards[k] && isSupportedType(cards[k].type) && !/Pet|Rune|Crazy|VIP|1000Accuracy|_adv/i.test(k));
        if (!opts.keepVariants) keys = keys.filter(k => !COLOR_VARIANT.test(k));
        if (opts.maxLevel !== undefined) keys = keys.filter(k => (cards[k].requireLevel || 0) <= opts.maxLevel);
    }
    if (!keys.length) {
        keys = Object.values(cards)
            .filter(c => (c.spellSchool === school || c.spellSchool === 'balance') && isSupportedType(c.type) && c.type !== 'Pass')
            .filter(c => !/Pet|Rune|Crazy|VIP|1000Accuracy|Deleted|_adv/i.test(c.key))
            .filter(c => opts.keepVariants || !COLOR_VARIANT.test(c.key))
            .filter(c => opts.maxLevel === undefined || (c.requireLevel || 0) <= opts.maxLevel)
            .sort((a, b) => a.pipcost - b.pipcost)
            .map(c => c.key);
    }
    const isCore = k => isAttackCard(cards[k]) || isHealCard(cards[k]);
    const core = keys.filter(isCore).sort((a, b) => ((cards[b].requireLevel || 0) - (cards[a].requireLevel || 0)) || (cards[b].pipcost - cards[a].pipcost));
    const util = keys.filter(k => !isCore(k));
    const ordered = core.concat(util);
    const limit = k => (isCore(k) ? copies : utilCopies);
    const deck = [];
    let total = 0;
    for (let round = 0; round < copies && total < maxCards && ordered.length; round++) {
        for (const key of ordered) {
            if (total >= maxCards) break;
            if (round >= limit(key)) continue;
            deck.push({ key, count: 1 });
            total++;
        }
    }
    return deck;
}

/** 合并同 key 条目 → [{key,count}]（卡组编辑 / 展示用） */
export function aggregateDeck(deck) {
    const map = new Map();
    for (const e of deck || []) {
        const key = typeof e === 'string' ? e : e.key;
        const n = typeof e === 'string' ? 1 : (e.count || 1);
        if (!key || n <= 0) continue;
        map.set(key, (map.get(key) || 0) + n);
    }
    return Array.from(map, ([key, count]) => ({ key, count }));
}

/** 该系卡的简要清单（UI 卡组编辑用） */
export function schoolCardCatalog(dataset, school) {
    return Object.values(dataset.cards || {})
        .filter(c => c.spellSchool === school || c.spellSchool === 'balance')
        .map(c => ({ key: c.key, type: c.type, pipcost: c.pipcost, accuracy: c.accuracy, supported: isSupportedType(c.type), attack: isAttackCard(c), heal: isHealCard(c), dmg: expectedBaseDamage(c), level: c.requireLevel || 0 }))
        .sort((a, b) => (a.pipcost - b.pipcost) || a.key.localeCompare(b.key));
}

/** 从 MobStatsByGearScore 选一档属性（stats 字段直接映射到 unit.stats） */
export function gearStats(dataset, school, gearScore) {
    const rows = (dataset.statsByGear || {})[school] || [];
    const row = rows.find(r => gearScore >= r.from && gearScore < r.to) || null;
    if (!row) return {};
    return {
        resistAbs: row.resist_all_absolute || 0,
        damageAbs: row.damage_all_absolute || 0,
        powerPipPct: row.power_pip_percent || 0,
        outputHealPct: row.output_heal_percent || 0,
        critPct: row.criticalstrike_all_percent || 0,
        _hp: row.hp || null,
    };
}

/**
 * 单位模板
 * @param opts { level, policy:'deck_attacker'|'simple'|'random'|'human', stats, deck, gearScore, name, presetCopies }
 */
export function unitSpec(dataset, school, opts = {}) {
    const level = opts.level ?? 50;
    const stats = { ...(opts.stats || {}) };
    if (opts.gearScore !== undefined) Object.assign(stats, gearStats(dataset, school, opts.gearScore));
    return {
        school,
        level,
        name: opts.name || `${SCHOOL_NAMES[school] || school} Lv${level}`,
        stats,
        deck: opts.deck || presetDeck(dataset, school, { maxLevel: level, copies: opts.presetCopies }),
        policyName: opts.policy || 'deck_attacker',
        isBot: opts.policy !== 'human',
    };
}

/**
 * 生成 NvN 对局矩阵：五系两两（含镜像）；teamSize>1 时同系队。
 * @return [{ id, nearSchools: [], farSchools: [] }]
 */
export function matchupMatrix(teamSize, schools = SCHOOLS, opts = {}) {
    const out = [];
    const mixed = opts.mixed || false;
    for (const a of schools) {
        for (const b of schools) {
            if (opts.skipMirror && a === b) continue;
            out.push({ id: `${a}_vs_${b}`, nearSchools: Array(teamSize).fill(a), farSchools: Array(teamSize).fill(b) });
        }
    }
    if (mixed && teamSize > 1) {
        // 混编队：每队轮转不同系
        for (let i = 0; i < schools.length; i++) {
            const team = [];
            for (let k = 0; k < teamSize; k++) team.push(schools[(i + k) % schools.length]);
            out.push({ id: `mix${i}`, nearSchools: team, farSchools: team.slice().reverse() });
        }
    }
    return out;
}

export function defaultLevel(version) {
    return version === 'teen' ? 60 : 50;
}
