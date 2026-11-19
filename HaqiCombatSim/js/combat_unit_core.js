import {validateHanziBattleSpec} from './hanzi_battle_core.js';
// combat_unit_core.js — 战斗单位状态与属性查询（对应 player_server.lua 的 Player 对象）。
// 属性查询与卡组/手牌操作分别拆至 ./combat_unit_stats_core.js 与 ./combat_unit_deck_core.js 并于此重导出。
import {
    powerPipChanceByLevel, generatePip, canAffordCard, costPips, isOwnSchoolCost, absorbDamage,
} from './combat_formulas_core.js';
import {
    statIdToEntry,
    normalizeStats,
    parseMiniauraStats,
    computeMaxHp,
    getDamageBoost,
    getDamageBoostAbs,
    getResist,
    getResistAbs,
    getAccuracyBoost,
    getCriticalStrike,
    getResilience,
    getHitChance,
    getDodge,
    getSpellPenetration,
    getSpellPenetrationReceive,
    getOutputHealBoost,
    getInputHealBoost,
    getCriticalStrikeDamageRatioBonus,
    getPowerPipChance,
    getOutputDamageFinalWeight,
    getReceiveDamageFinalWeight,
} from './combat_unit_stats_core.js';
import {
    PET_CARD_SEQ_BASE,
    clampDeck,
    setDeck,
    deckSize,
    shuffleDeck,
    prepareCard,
    cardsInHand,
    preparePetCards,
    petCardsInHand,
    selectableCards,
    deckRemaining,
    deckCounts,
    isDeckExhausted,
    restoreDiscardedCard,
    markCardUsed,
    markCardFizzled,
    discardCard,
    validateDiscardedCards,
    setCooldown,
    validateCooldown,
} from './combat_unit_deck_core.js';

export {
    statIdToEntry,
    normalizeStats,
    parseMiniauraStats,
    computeMaxHp,
    getDamageBoost,
    getDamageBoostAbs,
    getResist,
    getResistAbs,
    getAccuracyBoost,
    getCriticalStrike,
    getResilience,
    getHitChance,
    getDodge,
    getSpellPenetration,
    getSpellPenetrationReceive,
    getOutputHealBoost,
    getInputHealBoost,
    getCriticalStrikeDamageRatioBonus,
    getPowerPipChance,
    getOutputDamageFinalWeight,
    getReceiveDamageFinalWeight,
    PET_CARD_SEQ_BASE,
    clampDeck,
    setDeck,
    deckSize,
    shuffleDeck,
    prepareCard,
    cardsInHand,
    preparePetCards,
    petCardsInHand,
    selectableCards,
    deckRemaining,
    deckCounts,
    isDeckExhausted,
    restoreDiscardedCard,
    markCardUsed,
    markCardFizzled,
    discardCard,
    validateDiscardedCards,
    setCooldown,
    validateCooldown,
};

// ---------------------------------------------------------------------------
// 创建
// ---------------------------------------------------------------------------

let unitAutoId = 1;

/**
 * @param spec { id?, name?, side, school, level, stats?, deck: [{key,count}] | string[], isBot?, policy?, tags? }
 * @param resolved resolveParams() 的结果
 */
export function createUnit(spec, resolved) {
    const version = resolved.version;
    const school = spec.school;
    const unit = {
        id: spec.id || `u${unitAutoId++}`,
        name: spec.name || `${school}-${spec.level}`,
        side: spec.side,
        slot: spec.slot ?? 0,
        school,
        level: spec.level || 1,
        isMob: false,
        isBot: spec.isBot !== false,
        policy: spec.policy || null,
        stats: normalizeStats(spec.stats),
        maxHp: 0,
        hp: 0,
        pips: { normal: 0, power: 0 },
        charms: [],
        wards: [],          // [{id, pts?}]  id=0 表示已弹出
        standingWards: [],  // [{id, rounds}]
        dots: [],
        hots: [],
        miniaura: null,
        stance: null,       // {name, rounds}
        stunned: false,
        cooldowns: {},
        remedy: { absoluteDefense: 0, deadlyAttack: 0 },
        deckSeq: [],
        deckMap: [],        // 0 未用 1 手牌 -1 弃 -2 已用 -3 失误
        picked: null,       // {cardKey, seq, targetId}
        hasStartupPips: false,
        turnsPlayed: 0,
        totals: { damageDealt: 0, healDone: 0, damageTaken: 0, casts: 0, fizzles: 0, passes: 0, noCardPasses: 0 },
    };
    if (spec.hanziBattle) { validateHanziBattleSpec(spec.hanziBattle); unit.hanziBattle = { ...structuredClone(spec.hanziBattle), triggers: 0 }; }
    unit.maxHp = computeMaxHp(unit, resolved);
    unit.hp = unit.maxHp;
    unit.deckCapacity = spec.deckCapacity ?? resolved.global.deckCapacity ?? 0;
    unit.deckEachCapacity = spec.deckEachCapacity ?? resolved.global.deckEachCapacity ?? 0;
    setDeck(unit, spec.deck || [], resolved);
    return unit;
}

// ---------------------------------------------------------------------------
// HP / pips
// ---------------------------------------------------------------------------

export function isAlive(unit) {
    return unit.hp > 0;
}

/** player_server.lua L3684-3757 TakeDamage：死亡时清空全部状态 */
export function takeDamage(unit, points) {
    points = Math.max(0, points || 0);
    unit.hp -= points;
    unit.totals.damageTaken += Math.min(points, points + Math.min(0, unit.hp));
    if (unit.hp <= 0) {
        unit.hp = 0;
        unit.dots = [];
        unit.hots = [];
        unit.charms = [];
        unit.wards = [];
        unit.standingWards = [];
        unit.miniaura = null;
        unit.stance = null;
        unit.stunned = false;
        if (unit.freezeRounds !== undefined) {
            unit.freezeRounds = 0; unit.antiFreezeRounds = 0; unit.antiFreezeSiblingRounds = 0;
        }
        // bWithGuardian survives death until Card.CheckGuardian revives the unit.
        if(unit.reflectAmount!==undefined)unit.reflectAmount=0;
        if(unit.stealth!==undefined){unit.stealth=false;unit.stealthRounds=null;}
        unit.pips.normal = 0;
        unit.pips.power = 0;
        unit.picked = null;
        unit.remedy.absoluteDefense = 0;
        unit.remedy.deadlyAttack = 0;
    }
}

/** player_server.lua L3766-3772 TakeHeal */
export function takeHeal(unit, points) {
    const before = unit.hp;
    unit.hp = Math.min(unit.maxHp, unit.hp + Math.max(0, points || 0));
    return unit.hp - before;
}

/** player_server.lua L1831-1860 SetStartupPips */
export function setStartupPips(unit, resolved) {
    const maxPips = resolved.global.maxPips;
    let normal = (unit.stats.startupNormal || 0) + (resolved.global.startupPipsNormal || 0);
    let power = (unit.stats.startupPower || 0) + (resolved.global.startupPipsPower || 0);
    if (resolved.version === 'teen') { normal = power * 2 + normal; power = 0; }
    unit.pips.normal = Math.max(0, Math.min(maxPips, normal));
    unit.pips.power = Math.max(0, Math.min(maxPips, power));
    unit.hasStartupPips = true;
}

export function generateUnitPip(unit, arena, resolved, rng) {
    return generatePip(rng, unit.pips, getPowerPipChance(unit, arena, resolved), resolved.global.maxPips, resolved.version);
}

export function pipValue(unit) {
    return unit.pips.normal + unit.pips.power * 2;
}

export function canCast(unit, card, resolved) {
    if (!card) return false;
    const own = isOwnSchoolCost(card.spellSchool, unit.school, resolved.version);
    if (!canAffordCard(unit.pips, card.pipcost, own, resolved.version)) return false;
    if (card.type === 'Stance' && card.spellSchool !== unit.school && card.spellSchool !== 'balance') return false;
    if ((unit.cooldowns[card.spellName] || 0) > 0) return false;
    return true;
}

export function payCard(unit, card, resolved) {
    const own = isOwnSchoolCost(card.spellSchool, unit.school, resolved.version);
    return costPips(unit.pips, card.pipcost, own, resolved.version);
}

// ---------------------------------------------------------------------------
// charms / wards（player_server.lua L3774-4100）
// ---------------------------------------------------------------------------

export function appendCharm(unit, id) { unit.charms.push(Number(id)); }
export function appendWard(unit, id) { unit.wards.push({ id: Number(id) }); }
export function appendAbsorb(unit, pts, wardId) { unit.wards.push({ id: Number(wardId) || 0, pts: Number(pts) || 0, absorb: true }); }
export function appendStandingWard(unit, id, rounds) { unit.standingWards.push({ id: Number(id), rounds }); }

export function popCharm(unit, id) {
    for (let i = 0; i < unit.charms.length; i++) {
        if (unit.charms[i] === id) { unit.charms[i] = 0; return true; }
    }
    return false;
}

/** player_server.lua L3956-3977 PopWard：先看 standing wards（不消耗），再弹普通 ward */
export function popWard(unit, id) {
    for (const sw of unit.standingWards) {
        if (sw.id === id && sw.rounds > 0) return true;
    }
    for (const w of unit.wards) {
        if (w.id === id && !w.absorb) { w.id = 0; return true; }
    }
    return false;
}

function isPositive(tpl) {
    return tpl && (tpl.positive === true || tpl.positive === 'true');
}

export function hasPositiveCharm(unit, resolved) {
    return unit.charms.some(id => id > 0 && isPositive(resolved.charms[id]));
}
export function hasNegativeCharm(unit, resolved) {
    return unit.charms.some(id => id > 0 && resolved.charms[id] && !isPositive(resolved.charms[id]));
}

/**
 * player_server.lua L3898-3933 ProcessStatAgainstCharms：从后往前，每个 base id（id % 1000）只生效一次，
 * 系匹配（或 all / skipschool）则弹出并把数值加入 buffs
 */
export function processStatAgainstCharms(unit, resolved, buffs, statName, school, buffs2) {
    // Optional read-only presentation notifications preserve the exact consumption
    // order; they never add events, change buffs, or consume random numbers.
    const effected = {};
    for (let order = unit.charms.length - 1; order >= 0; order--) {
        const id = unit.charms[order];
        if (!id) continue;
        const tpl = resolved.charms[id];
        if (!tpl || tpl[statName] === undefined || tpl[statName] === null) continue;
        const baseId = id % 1000;
        if (effected[baseId]) continue;
        const tplSchool = String(tpl.school || 'all').toLowerCase();
        if (school === 'skipschool' || tplSchool === String(school).toLowerCase() || tplSchool === 'all') {
            unit.charms[order] = 0;
            unit._arena?.onStatusEffect?.({type:'effect_used',target:unit.id,kind:'charm',id,order});
            buffs.push(Number(tpl[statName]));
            if (buffs2) buffs2.push(Number(tpl[statName]));
            effected[baseId] = true;
        }
    }
    return school;
}

/**
 * player_server.lua L4001-4039 ProcessDamageAgainstWards：从后往前弹 boost_damage ward 与 prism ward
 * @return 最终 damage_school
 */
export function processDamageAgainstWards(unit, resolved, buffs, damageSchool, source = {}) {
    const effected = {};
    for (let order = unit.wards.length - 1; order >= 0; order--) {
        const w = unit.wards[order];
        if (!w.id || w.absorb) continue;
        const tpl = resolved.wards[w.id];
        if (!tpl) continue;
        const baseId = w.id % 1000;
        if (tpl.boost_damage !== undefined && tpl.boost_damage !== null) {
            if (effected[baseId]) continue;
            const tplSchool = String(tpl.school || 'all').toLowerCase();
            if (tplSchool === String(damageSchool).toLowerCase() || tplSchool === 'all') {
                const id=w.id;
                w.id = 0;
                unit._arena?.onStatusEffect?.({type:'effect_used',target:unit.id,kind:'ward',id,order,...source});
                buffs.push(Number(tpl.boost_damage));
                effected[baseId] = true;
            }
        } else if (tpl.prism_from && tpl.prism_to) {
            if (String(tpl.prism_from).toLowerCase() === String(damageSchool).toLowerCase()) {
                const id=w.id;
                w.id = 0;
                unit._arena?.onStatusEffect?.({type:'effect_used',target:unit.id,kind:'ward',id,order});
                damageSchool = String(tpl.prism_to).toLowerCase();
            }
        }
    }
    return damageSchool;
}

/** 弹出 heal ward（card_server.lua SingleHeal 分支：wards.boost_heal） */
export function processHealAgainstWards(unit, resolved, buffs) {
    for (let order = unit.wards.length - 1; order >= 0; order--) {
        const w = unit.wards[order];
        if (!w.id || w.absorb) continue;
        const tpl = resolved.wards[w.id];
        if (tpl && tpl.boost_heal !== undefined && tpl.boost_heal !== null) {
            const id=w.id;
            w.id = 0;
            unit._arena?.onStatusEffect?.({type:'effect_used',target:unit.id,kind:'ward',id,order});
            buffs.push(Number(tpl.boost_heal));
        }
    }
}

/** card_server.lua L1265-1283 AbsorbDamage */
export function absorbUnitDamage(unit, damage) {
    const layers = unit.wards.filter(w => w.absorb && w.pts > 0);
    damage = absorbDamage(layers, damage, unit._arena?.onStatusEffect
        ? layer=>unit._arena.onStatusEffect({type:'effect_used',target:unit.id,kind:'ward',id:layer.id})
        : null);
    for (const w of unit.wards) if (w.absorb && w.pts <= 0) w.id = 0;
    return damage;
}

/** player_server.lua L4985+ IfHasShield：是否持有对该系（或 all）的负 boost_damage ward */
export function ifHasShield(unit, resolved, school, skipGlobal = false) {
    for (const w of unit.wards) {
        if (!w.id || w.absorb) continue;
        const tpl = resolved.wards[w.id];
        if (!tpl || tpl.boost_damage === undefined || Number(tpl.boost_damage) >= 0) continue;
        const s = String(tpl.school || 'all').toLowerCase();
        if (school == null) { if (s === 'all') return true; continue; }
        if (s === school) return true;
        if (!skipGlobal && s === 'all') return true;
    }
    return false;
}

export function hasWard(unit, id) {
    return unit.wards.some(w => w.id === id) || unit.standingWards.some(s => s.id === id && s.rounds > 0);
}

export function popRandomCharm(unit, resolved, rng, onlyPositive) {
    const idx = [];
    unit.charms.forEach((id, i) => {
        if (id <= 0) return;
        const tpl = resolved.charms[id];
        if (onlyPositive === true && !isPositive(tpl)) return;
        if (onlyPositive === false && isPositive(tpl)) return;
        idx.push(i);
    });
    if (!idx.length) return null;
    const i = idx[rng.int(0, idx.length - 1)];
    const id = unit.charms[i];
    unit.charms[i] = 0;
    return id;
}

export function popRandomWard(unit, resolved, rng, onlyPositive) {
    const idx = [];
    unit.wards.forEach((w, i) => {
        if (w.id <= 0 || w.absorb) return;
        const tpl = resolved.wards[w.id];
        if (!tpl || tpl.can_manipulate === false || tpl.can_manipulate === 'false') return;
        if (onlyPositive === true && !isPositive(tpl)) return;
        if (onlyPositive === false && isPositive(tpl)) return;
        idx.push(i);
    });
    if (!idx.length) return null;
    const i = idx[rng.int(0, idx.length - 1)];
    const id = unit.wards[i].id;
    unit.wards[i].id = 0;
    return id;
}

/** player_server.lua L4255-4293 PopAllNegativeEffects */
export function popAllNegativeEffects(unit, resolved) {
    unit.charms = unit.charms.map(id => (id > 0 && resolved.charms[id] && !isPositive(resolved.charms[id])) ? 0 : id);
    for (const w of unit.wards) {
        if (w.id > 0 && !w.absorb) {
            const tpl = resolved.wards[w.id];
            if (tpl && tpl.can_manipulate !== false && !isPositive(tpl)) w.id = 0;
        }
    }
    for (const sw of unit.standingWards) {
        const tpl = resolved.wards[sw.id];
        if (tpl && !isPositive(tpl)) sw.rounds = 0;
    }
    unit.dots = [];
}

/** Deck_Attacker 条件用：统计某类 charm 数量（card_server.lua GetSpecificCharmCount 语义近似） */
export function countCharms(unit, resolved, kind, school) {
    let n = 0;
    for (const id of unit.charms) {
        if (id <= 0) continue;
        const tpl = resolved.charms[id];
        if (!tpl) continue;
        const s = String(tpl.school || 'all').toLowerCase();
        const schoolOk = !school || s === school || s === 'all';
        if (kind === 'damageboost' && Number(tpl.boost_damage) > 0 && schoolOk) n++;
        else if (kind === 'damageweakness' && Number(tpl.boost_damage) < 0 && schoolOk) n++;
        else if (kind === 'healboost' && Number(tpl.boost_heal) > 0) n++;
        else if (kind === 'healweakness' && Number(tpl.boost_heal) < 0) n++;
    }
    return n;
}

export function countWards(unit, resolved, kind, school) {
    let n = 0;
    for (const w of unit.wards) {
        if (w.id <= 0 || w.absorb) continue;
        const tpl = resolved.wards[w.id];
        if (!tpl) continue;
        const s = String(tpl.school || 'all').toLowerCase();
        const schoolOk = !school || s === school || s === 'all';
        if (kind === 'damagetrap' && Number(tpl.boost_damage) > 0 && schoolOk) n++;
        else if (kind === 'shield' && Number(tpl.boost_damage) < 0 && schoolOk) n++;
    }
    return n;
}

// ---------------------------------------------------------------------------
// DOT / HOT（player_server.lua L4154-4253）
// ---------------------------------------------------------------------------

export function appendDoT(unit, sequence) { if (sequence) unit.dots.push(sequence); }
export function appendHoT(unit, sequence) { if (sequence) unit.hots.push(sequence); }

/** PopDoT：每个序列从尾部取一段；负值（爆炸标记）优先 */
export function popDoT(unit) {
    const applied = [];
    const take = (pred) => {
        for (const seq of unit.dots) {
            const last = seq.ticks[seq.ticks.length - 1];
            if (last && pred(last.dmg)) {
                seq.ticks.pop();
                applied.push({
                    damageSchool: last.damageSchool || seq.damageSchool,
                    buffsTarget: seq.buffsTarget,
                    damageBoostAbs: last.damageBoostAbs ?? seq.damageBoostAbs,
                    spellPenetration: last.spellPenetration ?? seq.spellPenetration,
                    outputWeight: seq.outputWeight,
                    casterId: seq.casterId,
                    damage: last.dmg,
                    critical: last.critical,
                    cardKey: seq.cardKey,
                });
            }
        }
    };
    take(d => d < 0);
    take(d => d >= 0);
    unit.dots = unit.dots.filter(seq => seq.ticks.length > 0);
    return applied;
}

export function popHoT(unit) {
    const applied = [];
    for (const seq of unit.hots) {
        if (seq.ticks.length > 0) {
            applied.push({ heal: seq.ticks.pop(), casterId: seq.casterId, cardKey: seq.cardKey });
        }
    }
    unit.hots = unit.hots.filter(seq => seq.ticks.length > 0);
    return applied;
}

export function dotRoundsRemaining(unit) {
    return unit.dots.reduce((m, s) => Math.max(m, s.ticks.length), 0);
}
export function hotRoundsRemaining(unit) {
    return unit.hots.reduce((m, s) => Math.max(m, s.ticks.length), 0);
}

/** ValidateMiniAura / ValidateStandingEffects / ValidateStance / ValidateProtectRounds */
export function validateRounds(unit) {
    for (const key of ['freezeRounds', 'antiFreezeRounds', 'antiFreezeSiblingRounds']) if (unit[key] > 0) unit[key]--;
    if(unit.stealthRounds>0&&--unit.stealthRounds===0){unit.stealth=false;unit.stealthRounds=null;}
    if (unit.miniaura) {
        unit.miniaura.rounds -= 1;
        if (unit.miniaura.rounds <= 0) unit.miniaura = null;
    }
    for (const sw of unit.standingWards) if (sw.rounds > 0) sw.rounds -= 1;
    unit.standingWards = unit.standingWards.filter(sw => sw.rounds > 0);
    if (unit.stance) {
        unit.stance.rounds -= 1;
        if (unit.stance.rounds <= 0) unit.stance = null;
    }
    if (unit.remedy.absoluteDefense > 0) unit.remedy.absoluteDefense -= 1;
    if (unit.remedy.deadlyAttack > 0) unit.remedy.deadlyAttack -= 1;
}

/** 状态摘要（UI / 事件流用） */
export function summarizeUnit(unit, resolved) {
    return {
        id: unit.id, name: unit.name, side: unit.side, slot: unit.slot, school: unit.school, level: unit.level,
        hp: unit.hp, maxHp: unit.maxHp, pips: { ...unit.pips }, stunned: unit.stunned,
        ...Object.fromEntries(['freezeRounds','antiFreezeRounds','antiFreezeSiblingRounds','guardian','enragedBy'].filter(key=>unit[key]!==undefined).map(key=>[key,unit[key]])),
        charms: unit.charms.filter(id => id > 0).map(id => ({ id, ...(resolved.charms[id] || {}) })),
        wards: unit.wards.filter(w => w.id > 0).map(w => ({ id: w.id, pts: w.pts, ...(resolved.wards[w.id] || {}) })),
        standingWards: unit.standingWards.filter(s => s.rounds > 0).map(s => ({ ...s })),
        dots: dotRoundsRemaining(unit), hots: hotRoundsRemaining(unit),
        dotList: unit.dots.map(d => ({ cardKey: d.cardKey, school: d.damageSchool, ticks: d.ticks.slice().reverse().map(t => Math.abs(t.dmg)) })),
        hotList: unit.hots.map(d => ({ cardKey: d.cardKey, ticks: d.ticks.slice().reverse() })),
        miniaura: unit.miniaura ? { ...unit.miniaura, ...(resolved.miniauras && resolved.miniauras[unit.miniaura.id] ? { desc: resolved.miniauras[unit.miniaura.id].desc } : {}) } : null,
        stance: unit.stance ? { ...unit.stance } : null,
        cooldowns: Object.fromEntries(Object.entries(unit.cooldowns).filter(([, v]) => v > 0)),
        deck: deckCounts(unit),
        deckCapacity: unit.deckCapacity, deckTrimmed: unit.deckTrimmed || 0,
        isBot: unit.isBot,
    };
}
