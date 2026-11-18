// combat_unit_stats_core.js — 战斗单位属性归一化与战斗属性查询（对应 player_server.lua Get*）。
import {
    baseMaxHp, applyHpStats, powerPipChanceByLevel, arenaDamageBoost,
} from './combat_formulas_core.js';
import { schoolFactor } from './combat_params_core.js';

/** 装备 stat id → 属性名与系（player_server.lua GetAccuracyBoost/GetDamageBoost/GetResist 注释） */
const STAT_ID_SCHOOL = ['all', 'fire', 'ice', 'storm', 'myth', 'life', 'death', 'balance'];
export function statIdToEntry(id) {
    id = Number(id);
    if (id === 101) return { stat: 'hpFlat', school: 'all' };
    if (id === 102) return { stat: 'powerPipPct', school: 'all' };
    if (id >= 103 && id <= 110) return { stat: 'accuracyPct', school: STAT_ID_SCHOOL[id - 103] };
    if (id >= 111 && id <= 118) return { stat: 'damagePct', school: STAT_ID_SCHOOL[id - 111] };
    if (id >= 119 && id <= 126) return { stat: 'resistPct', school: STAT_ID_SCHOOL[id - 119] };
    if (id >= 151 && id <= 158) return { stat: 'damageAbs', school: STAT_ID_SCHOOL[id - 151] };
    if (id >= 159 && id <= 166) return { stat: 'resistAbs', school: STAT_ID_SCHOOL[id - 159] };
    if (id >= 196 && id <= 203) return { stat: 'critPct', school: STAT_ID_SCHOOL[id - 196] };
    if (id >= 204 && id <= 211) return { stat: 'resiliencePct', school: STAT_ID_SCHOOL[id - 204] };
    if (id >= 212 && id <= 219) return { stat: 'penetration', school: STAT_ID_SCHOOL[id - 212] };
    if (id === 242) return { stat: 'hpPct', school: 'all' };
    if (id === 182) return { stat: 'outputHealPct', school: 'all' };
    if (id === 183) return { stat: 'inputHealPct', school: 'all' };
    if (id === 184) return { stat: 'startupNormal', school: 'all' };
    if (id === 185) return { stat: 'startupPower', school: 'all' };
    return null;
}

const SCHOOL_STATS = ['damagePct', 'damageAbs', 'resistPct', 'resistAbs', 'accuracyPct', 'critPct', 'resiliencePct', 'penetration'];
const SCALAR_STATS = ['penetrationReceive', 'hitPct', 'dodgePct', 'powerPipPct', 'outputHealPct', 'inputHealPct', 'hpPct', 'hpFlat', 'startupNormal', 'startupPower', 'critRatioBonus'];

/** 把用户给的部分属性补全为完整结构。按系属性可给数字（视为 all）或 {all, fire, ...} */
export function normalizeStats(partial = {}) {
    const stats = {};
    for (const name of SCHOOL_STATS) {
        const v = partial[name];
        if (typeof v === 'number') stats[name] = { all: v };
        else stats[name] = { ...(v || {}) };
    }
    for (const name of SCALAR_STATS) stats[name] = Number(partial[name] || 0);
    if (partial.magicStarHpPct) stats.magicStarHpPct = Number(partial.magicStarHpPct);
    return stats;
}

/**
 * 解析 miniaura 模板 stats 字符串 "(120,70)(104,20)" → [{id, value}]
 */
export function parseMiniauraStats(str) {
    const out = [];
    if (!str) return out;
    const re = /\((\d+)\s*,\s*(-?\d+)\)/g;
    let m;
    while ((m = re.exec(String(str)))) out.push({ id: Number(m[1]), value: Number(m[2]) });
    return out;
}

function statsFromTemplate(tpl, statName, school) {
    let sum = 0;
    // Analysis snapshots share resolved templates. Lazy cache writes would change
    // their state identity in the Worker and silently discard the player's cast.
    for (const { id, value } of tpl._stats || parseMiniauraStats(tpl.stats)) {
        const e = statIdToEntry(id);
        if (!e || e.stat !== statName) continue;
        if (e.school === 'all' || e.school === school) sum += value;
    }
    return sum;
}

function schoolStat(unit, name, school) {
    const table = unit.stats[name] || {};
    let v = (table.all || 0) + (school ? (table[school] || 0) : 0);
    const arena = unit._arena;
    if (arena) {
        const R = arena.resolved;
        for (const sw of unit.standingWards) {
            if (sw.rounds <= 0) continue;
            const tpl = R.wards[sw.id];
            if (tpl && tpl.stats) v += statsFromTemplate(tpl, name, school);
        }
        if (arena.aura2) {
            const tpl = R.globalauras[arena.aura2.id];
            if (tpl && tpl.stats) v += statsFromTemplate(tpl, name, school);
        }
    }
    return v;
}

function scalarStat(unit, name) {
    let v = unit.stats[name] || 0;
    const arena = unit._arena;
    if (arena) {
        const R = arena.resolved;
        for (const sw of unit.standingWards) {
            if (sw.rounds <= 0) continue;
            const tpl = R.wards[sw.id];
            if (tpl && tpl.stats) v += statsFromTemplate(tpl, name, 'all');
        }
        if (arena.aura2) {
            const tpl = R.globalauras[arena.aura2.id];
            if (tpl && tpl.stats) v += statsFromTemplate(tpl, name, 'all');
        }
    }
    return v;
}

function miniauraStat(unit, resolved, statName, school) {
    if (!unit.miniaura || unit.miniaura.rounds <= 0) return 0;
    const tpl = resolved.miniauras[unit.miniaura.id];
    if (!tpl) return 0;
    let sum = 0;
    for (const { id, value } of tpl._stats || parseMiniauraStats(tpl.stats)) {
        const e = statIdToEntry(id);
        if (!e || e.stat !== statName) continue;
        if (e.school === 'all' || e.school === school) sum += value;
    }
    return sum;
}

/**
 * player_server.lua L1741-1815 GetUpdatedMaxHP + BalanceParams perSchool.hp 乘子 + fairPlay.maxHp
 */
export function computeMaxHp(unit, resolved) {
    const fair = resolved.fairPlay;
    if (fair && fair.maxHp && fair.maxHp[unit.school]) return Math.ceil(fair.maxHp[unit.school]);
    let hp = baseMaxHp(unit.school, unit.level, resolved.version);
    hp = Math.ceil(hp * (schoolFactor(resolved, unit.school).hp || 1));
    hp = applyHpStats(hp, unit.stats.hpPct, unit.stats.hpFlat, resolved.version);
    if (resolved.version === 'kids' && unit.stats.magicStarHpPct) hp = Math.ceil(hp * (100 + unit.stats.magicStarHpPct) / 100);
    return Math.max(1, hp);
}

/** kids 姿态同队判定：任一同侧存活单位（含自己）持有该姿态即生效（player_server.lua 各 Get* 的 friendlys 循环） */
function stanceSibling(unit, arena, name) {
    if (!arena || !arena.sides || !arena.sides[unit.side]) return false;
    for (const ally of arena.sides[unit.side]) {
        if (ally.stance && ally.stance.rounds > 0 && ally.stance.name === name) return true;
    }
    return false;
}

/** player_server.lua L2231-2301 GetDamageBoost（百分比） */
export function getDamageBoost(unit, school, arena, resolved) {
    if (resolved.fairPlay && resolved.fairPlay.forceDamageBoost !== undefined && resolved.fairPlay.forceDamageBoost !== null) {
        return resolved.fairPlay.forceDamageBoost;
    }
    let stat = schoolStat(unit, 'damagePct', school);
    if (arena) stat += arenaDamageBoost(resolved.global.arenaDamageBoostPerRound, resolved.global.maxRounds, arena.remainingRounds);
    stat += Math.round(((schoolFactor(resolved, unit.school).damage || 1) - 1) * 100);
    return stat;
}

/** player_server.lua L2307+ GetDamageBoost_absolute */
export function getDamageBoostAbs(unit, school) {
    return schoolStat(unit, 'damageAbs', school);
}

/** player_server.lua L2406+ GetResist：返回负值（-R） */
export function getResist(unit, school, resolved) {
    if (resolved.fairPlay && resolved.fairPlay.forceResist !== undefined && resolved.fairPlay.forceResist !== null) {
        return -resolved.fairPlay.forceResist;
    }
    let stat = schoolStat(unit, 'resistPct', school) + (schoolFactor(resolved, unit.school).resist || 0);
    if (unit.freezeRounds > 0) stat = 100 - (100 - stat) * (100 - resolved.global.freezeResistPercent) / 100;
    return -stat;
}

/** player_server.lua L2476+ GetResist_absolute（返回负值） */
export function getResistAbs(unit, school) {
    return -schoolStat(unit, 'resistAbs', school);
}

/** player_server.lua L2171-2226 GetAccuracyBoost（含 miniaura 命中） */
export function getAccuracyBoost(unit, school, resolved) {
    if (resolved.fairPlay && resolved.fairPlay.forceAccuracyBoost !== undefined && resolved.fairPlay.forceAccuracyBoost !== null) {
        return resolved.fairPlay.forceAccuracyBoost;
    }
    return schoolStat(unit, 'accuracyPct', school) + miniauraStat(unit, resolved, 'accuracyPct', school)
        + (schoolFactor(resolved, unit.school).accuracy || 0);
}

/** player_server.lua L2605+ GetCriticalStrike */
export function getCriticalStrike(unit, school, resolved, arena) {
    return schoolStat(unit, 'critPct', school) + (schoolFactor(resolved, unit.school).crit || 0)
        + (resolved.version === 'kids' && stanceSibling(unit, arena, 'storm_kids') ? 20 : 0);
}

/** player_server.lua L2715+ GetResilience */
export function getResilience(unit, school, resolved, arena) {
    return schoolStat(unit, 'resiliencePct', school)
        + (resolved && resolved.version === 'kids' && stanceSibling(unit, arena, 'death_kids') ? 20 : 0);
}

/** player_server.lua L2811+ GetHitChance（已换算为百分比） */
export function getHitChance(unit, resolved, arena) {
    return (unit.stats.hitPct || 0)
        + (resolved && resolved.version === 'kids' && stanceSibling(unit, arena, 'death_kids') ? 10 : 0);
}

/** player_server.lua L2858+ GetDodge（已换算为百分比） */
export function getDodge(unit) {
    return unit.stats.dodgePct || 0;
}

/** player_server.lua L2908+ GetSpellPenetration */
export function getSpellPenetration(unit, school, resolved, arena) {
    return schoolStat(unit, 'penetration', school)
        + (resolved && resolved.version === 'kids' && stanceSibling(unit, arena, 'life_kids') ? 15 : 0);
}

/** player_server.lua L2975+ GetSpellPenetrationReceive */
export function getSpellPenetrationReceive(unit) {
    return unit.stats.penetrationReceive || 0;
}

/** player_server.lua L2988 / L3015 */
export function getOutputHealBoost(unit, resolved) {
    return (unit.stats.outputHealPct || 0) + Math.round(((schoolFactor(resolved, unit.school).heal || 1) - 1) * 100);
}
export function getInputHealBoost(unit, resolved, arena) {
    return (unit.stats.inputHealPct || 0)
        + (resolved && resolved.version === 'kids' && stanceSibling(unit, arena, 'death_kids') ? 30 : 0);
}

/** player_server.lua L2705-2711 GetCriticalStrikeDamageRatioBonus */
export function getCriticalStrikeDamageRatioBonus(unit, resolved, arena) {
    return (unit.stats.critRatioBonus || 0)
        + (resolved && resolved.version === 'kids' && stanceSibling(unit, arena, 'storm_kids') ? 0.2 : 0);
}

/** player_server.lua L2108-2166 GetPowerPipChance */
export function getPowerPipChance(unit, arena, resolved) {
    let bonus = 0;
    if (arena && arena.aura && arena.aura.boostPowerPip) bonus = arena.aura.boostPowerPip;
    const fair = resolved.fairPlay;
    const forced = fair && fair.forcePowerPipChance !== undefined && fair.forcePowerPipChance !== null;
    if (!forced) bonus += powerPipChanceByLevel(unit.level, resolved.version);
    bonus += miniauraStat(unit, resolved, 'powerPipPct', 'all');
    bonus += schoolFactor(resolved, unit.school).powerPip || 0;
    const base = scalarStat(unit, 'powerPipPct');
    if (forced) return base + fair.forcePowerPipChance + bonus;
    return base + bonus;
}

/** player_server.lua L4596-4655 GetOutputDamageFinalWeight（stance） */
export function getOutputDamageFinalWeight(unit, arena, resolved) {
    let weight = 1;
    const st = unit.stance && unit.stance.rounds > 0 ? unit.stance.name : null;
    if (st === 'defensive') weight = 0.75;
    else if (st === 'vampire') weight = 1 + (1 - unit.hp / unit.maxHp) / 2;
    else if (st === 'electric') weight = 1 + 0.22;
    else if (st === 'ice_kids') weight = 0.9;
    if (resolved.version === 'kids' && arena) {
        for (const ally of arena.sides[unit.side]) {
            if (ally.stance && ally.stance.rounds > 0 && ally.stance.name === 'fire_kids') { weight *= 1.15; break; }
        }
    }
    return weight;
}

/** player_server.lua L4658-4722 GetReceiveDamageFinalWeight（miniaura 抗性 + stance） */
export function getReceiveDamageFinalWeight(unit, school, resolved) {
    let weight = 1;
    const extra = miniauraStat(unit, resolved, 'resistPct', school);
    if (extra) {
        weight = weight * (100 - extra) / 100;
        if (weight < 0) weight = 0;
    }
    const st = unit.stance && unit.stance.rounds > 0 ? unit.stance.name : null;
    if (st === 'defensive') weight *= (1 - (resolved.version === 'teen' ? 0.3 : 0.25));
    else if (st === 'fire_kids' || st === 'storm_kids' || st === 'life_kids' || st === 'death_kids') weight *= 1.1;
    return weight;
}
