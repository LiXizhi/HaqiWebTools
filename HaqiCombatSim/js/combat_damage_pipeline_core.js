// combat_damage_pipeline_core.js — 卡牌伤害/治疗/DOT/HOT/眩晕/冰封与守护复活结算管线。
import {
    damageExpression, healExpression, applyHealPenalty, tryCriticalStrike, tryDodge, critDamageRatio,
} from './combat_formulas_core.js';
import * as U from './combat_unit_core.js';
import { numericFromSection, splitCardList as splitList } from './combat_card_targeting_core.js';

export const STUN_ABSORB_WARD_ID = 31;
export const SPECIAL_TYPES = new Set(['SingleFreeze', 'SingleGuardianWithImmolate', 'ConversePositiveWard', 'Enrage']);

export function emit(arena, ev) {
    ev.turn = arena.turn;
    if (arena.wordCardCast && arena.wordCardCast.caster === ev.caster && arena.wordCardCast.baseCardKey === ev.card) {
        ev.wordCardId = arena.wordCardCast.id;
        ev.wordCardText = arena.wordCardCast.readText;
        ev.wordCardSeq = arena.wordCardCast.seq;
    }
    arena.events.push(ev);
    if (arena.onEvent) arena.onEvent(ev);
}

export function specialCardsEnabled(arena) {
    return arena.resolved.version === 'kids' && arena.specialCardRulesVersion === 1;
}

/** card_server.lua L2355, L6235–6266: precheck includes base quality;
 * conversion itself only pops +1000/+2000/+3000/+4000, in that order. */
export function hasConvertibleWard(target, card) {
    const from = Number(card.params.fromward);
    return !!target?.wards?.some(w => !w.absorb && [0, 1000, 2000, 3000, 4000].some(offset => w.id === from + offset));
}

/** card_server.lua L1915, L2082, L3467, L4621: attack contact breaks freeze,
 * including a hit fully absorbed by shields; protection rounds remain. */
export function breakFreeze(arena, target, card) {
    if (!(target.freezeRounds > 0)) return;
    target.freezeRounds = 0;
    emit(arena, { type: 'freeze_break', target: target.id, card });
}

/** card_server.lua L6833–6857 CheckGuardian; player/mob Revive clears death
 * state and restores kids REVIVE_BASE_HP=2000, capped at the unit's max HP. */
export function reviveGuardians(arena) {
    if (!specialCardsEnabled(arena)) return;
    for (const unit of [...arena.sides.near, ...arena.sides.far]) {
        if (U.isAlive(unit) || !unit.guardian || unit.combatActive === false) continue;
        unit.guardian = false;
        const amount = U.takeHeal(unit, arena.resolved.global.guardianReviveHp);
        emit(arena, { type: 'heal', caster: unit.id, target: unit.id, amount, label: 'guardian', revived: true });
    }
}

/**
 * 计算并施加一次伤害。
 * @param opts { baseDamage, damageSchool, baseCrit, baseHit, baseSpellPen, skipResist, buffsTargetList(共享 charm 列表), damagePercent, boostAbs, label }
 * @return { damage, mark, school }
 */
export function applyDamage(arena, caster, target, card, opts) {
    const R = arena.resolved;
    const rng = arena.rng;
    const version = R.version;
    let damage = opts.baseDamage;
    let school = opts.damageSchool;
    const buffs = { list: [...(opts.buffsTargetList || [])], damagePercent: opts.damagePercent || 0 };
    let boostAbs = opts.boostAbs || 0;

    school = U.processDamageAgainstWards(target, R, buffs.list, school, {caster:caster.id,card:card.key,segment:'immediate'});
    if (!opts.skipResist) {
        buffs.resistPercent = U.getResist(target, school, R, arena);
        buffs.spellPenetration = U.getSpellPenetration(caster, school, R, arena) + (Number(opts.baseSpellPen) || 0);
        buffs.spellPenetrationReceive = U.getSpellPenetrationReceive(target);
        boostAbs += U.getResistAbs(target, school);
    }
    if (arena.aura && arena.aura.boostSchool === school && arena.aura.boostDamage) buffs.list.push(arena.aura.boostDamage);

    damage = damageExpression(damage, boostAbs, buffs, version, R.global.maxSpellPenetration);

    let mark = '';
    const dodgeCtx = {
        baseHit: opts.baseHit ?? card.hitchance ?? 100,
        hitChance: U.getHitChance(caster, R, arena), dodge: U.getDodge(target),
        casterLevel: caster.level, targetLevel: target.level, targetIsMob: !!target.isMob,
    };
    const crit = U.getCriticalStrike(caster, school, R, arena);
    const resil = U.getResilience(target, school, R, arena);
    if (version !== 'kids' || arena.mode === 'pve') {
        if (tryDodge(rng, dodgeCtx, version)) {
            damage = Math.ceil(damage * R.global.dodgeDamageRatio);
            mark = 'd';
        } else if (tryCriticalStrike(rng, crit, resil, opts.baseCrit || 0)) {
            damage = Math.ceil(damage * critDamageRatio(R.global.critDamageRatio, U.getCriticalStrikeDamageRatioBonus(caster, R, arena)));
            if (card.params.extra_damage_if_critical) damage = damage * (1 + Number(card.params.extra_damage_if_critical));
            mark = 'c';
        }
    } else {
        if (target.remedy.absoluteDefense <= 0 && tryDodge(rng, dodgeCtx, version)) {
            damage = 1;
            mark = 'd';
            target.remedy.absoluteDefense = R.global.protectRounds;
        } else if (tryCriticalStrike(rng, crit, resil, opts.baseCrit || 0)) {
            damage = Math.ceil(damage * critDamageRatio(R.global.critDamageRatio, U.getCriticalStrikeDamageRatioBonus(caster, R, arena)));
            if (card.params.extra_damage_if_critical) damage = damage * (1 + Number(card.params.extra_damage_if_critical));
            mark = 'c';
        }
    }

    const areaThreat = arena.threatRulesVersion >= 4 && opts.areaThreat;
    if (areaThreat) arena.onDamageThreat?.(caster, target, opts.halve ? Math.ceil(damage / 2) : damage, true, card.type === 'AreaAttackWithExtraThreat' ? Number(card.params.threat_ratio ?? 1) : arena.threatRulesVersion >= 5 && card.type === 'AreaAttack' && caster.school === 'ice' ? R.adventure.iceAreaAttackThreatRatio : 1);
    damage = Math.ceil(damage * U.getOutputDamageFinalWeight(caster, arena, R));
    damage = Math.ceil(damage * U.getReceiveDamageFinalWeight(target, school, R));
    if (opts.maxDamage !== undefined && damage > opts.maxDamage) damage = opts.maxDamage;
    if (opts.halve) damage = Math.ceil(damage / 2);

    if (!areaThreat) arena.onDamageThreat?.(caster, target, damage);
    damage = U.absorbUnitDamage(target, damage);
    const reflected = target.reflectAmount > 0 && damage > 0 ? damage : 0;
    if (reflected) { const absorbed = Math.min(target.reflectAmount, damage); target.reflectAmount -= absorbed; damage -= absorbed; }
    U.takeDamage(target, damage);
    breakFreeze(arena, target, card.key);
    caster.totals.damageDealt += damage;
    emit(arena, { type: 'damage', caster: caster.id, target: target.id, card: card.key, school, amount: damage, mark, label: opts.label || '' });
    if (reflected) {
        const reflectBuffs = { list: [] };
        const reflectSchool = U.processDamageAgainstWards(caster, R, reflectBuffs.list, school, {caster:target.id,card:card.key,segment:'reflection'});
        reflectBuffs.resistPercent = U.getResist(caster, reflectSchool, R, arena);
        reflectBuffs.spellPenetration = U.getSpellPenetration(caster, reflectSchool, R, arena);
        reflectBuffs.spellPenetrationReceive = U.getSpellPenetrationReceive(caster);
        if (arena.aura?.boostSchool === reflectSchool && arena.aura.boostDamage) reflectBuffs.list.push(arena.aura.boostDamage);
        let amount = damageExpression(reflected, 0, reflectBuffs, version, R.global.maxSpellPenetration);
        amount = Math.ceil(amount * U.getOutputDamageFinalWeight(caster, arena, R));
        amount = Math.ceil(amount * U.getReceiveDamageFinalWeight(caster, reflectSchool, R));
        amount = Math.max(0, Math.min(U.absorbUnitDamage(caster, amount), R.global.maxReflectDamage, caster.hp - 1));
        U.takeDamage(caster, amount); target.totals.damageDealt += amount;
        emit(arena, { type: 'damage', caster: target.id, target: caster.id, card: card.key, school: reflectSchool, amount, mark: '', label: 'reflection' });
    }
    return { damage, mark, school };
}

/** 施法者对某系的加成，含弹出 blade/weakness charm（card_server.lua L3045-3056） */
export function casterDamageBuffs(arena, caster, school) {
    const R = arena.resolved;
    const list = [];
    const damagePercent = U.getDamageBoost(caster, school, arena, R);
    const boostAbs = U.getDamageBoostAbs(caster, school);
    U.processStatAgainstCharms(caster, R, list, 'boost_damage', school);
    return { list, damagePercent, boostAbs };
}

/** DOT 序列生成（card_server.lua L3062-3119 / L4041-4140） */
export function buildDotSequence(arena, caster, target, card, dotsStr, buffsList, siblingRatio = 1, realcost = 0) {
    const R = arena.resolved;
    const school = card.params.damage_school || card.spellSchool;
    const schools = splitList(card.params.dots_damage_school);
    const seq = {
        cardKey: card.key, casterId: caster.id, damageSchool: school,
        buffsTarget: [...buffsList],
        damageBoostAbs: U.getDamageBoostAbs(caster, school),
        spellPenetration: U.getSpellPenetration(caster, school, R, arena),
        outputWeight: U.getOutputDamageFinalWeight(caster, arena, R),
        ticks: [],
    };
    const crit = U.getCriticalStrike(caster, school, R, arena);
    const resil = U.getResilience(target, school, R, arena);
    let round = 0;
    const threatTicks = [];
    for (const d of splitList(dotsStr)) {
        let dmg = numericFromSection(d, realcost);
        dmg = dmg * siblingRatio;
        const tickSchool = schools[round] || school;
        let critical = false;
        if (tryCriticalStrike(arena.rng, crit, resil, 0)) {
            dmg = Math.ceil(dmg * critDamageRatio(R.global.critDamageRatio, U.getCriticalStrikeDamageRatioBonus(caster, R, arena)));
            critical = true;
        }
        seq.ticks.push({ dmg, critical, damageSchool: tickSchool, damageBoostAbs: U.getDamageBoostAbs(caster, tickSchool), spellPenetration: U.getSpellPenetration(caster, tickSchool, R, arena) });
        const threatBase = critical ? Math.ceil(numericFromSection(d, realcost) * critDamageRatio(R.global.critDamageRatio, U.getCriticalStrikeDamageRatioBonus(caster, R, arena))) : numericFromSection(d, realcost);
        threatTicks.push(buffsList.reduce((damage, boost) => Math.ceil(damage * (100 + boost) / 100), threatBase));
        round++;
    }
    seq.ticks.reverse();
    if (['DOTAttack', 'DOTAttackWithHOT'].includes(card.type)) arena.onDotThreat?.(caster, target, seq.ticks.map(tick => buffsList.reduce((damage, boost) => Math.ceil(damage * (100 + boost) / 100), tick.dmg)));
    if (['SingleAttackWithDOT', 'AreaAttackWithDOT'].includes(card.type)) arena.onDotThreat?.(caster, target, [...threatTicks].reverse(), card.type === 'AreaAttackWithDOT', false);
    if (arena.threatRulesVersion >= 5 && card.type === 'AreaDOTAttack') arena.onDotThreat?.(caster, target, [...threatTicks].reverse(), true, false);
    return seq;
}

/** card_server.lua L1841-1930：单位行动前结算自身 DOT */
export function tickDots(arena, unit) {
    const R = arena.resolved;
    const applyTick = (victim, baseDamage, dot, label) => {
        const buffs = { list: [...(dot.buffsTarget || [])], damagePercent: 0 };
        let school = U.processDamageAgainstWards(victim, R, buffs.list, dot.damageSchool, {caster:dot.casterId,card:dot.cardKey,segment:'dot'});
        buffs.resistPercent = U.getResist(victim, school, R);
        buffs.spellPenetration = dot.spellPenetration;
        buffs.spellPenetrationReceive = U.getSpellPenetrationReceive(victim);
        if (arena.aura && arena.aura.boostSchool === school && arena.aura.boostDamage) buffs.list.push(arena.aura.boostDamage);
        let dmg = damageExpression(baseDamage, (dot.damageBoostAbs || 0) + U.getResistAbs(victim, school), buffs, R.version, R.global.maxSpellPenetration);
        dmg = Math.ceil(dmg * (dot.outputWeight || 1));
        dmg = Math.ceil(dmg * U.getReceiveDamageFinalWeight(victim, school, R));
        dmg = U.absorbUnitDamage(victim, dmg);
        if (victim.reflectAmount > 0 && dmg > 0) { const absorbed = Math.min(victim.reflectAmount, dmg); victim.reflectAmount -= absorbed; dmg -= absorbed; }
        U.takeDamage(victim, dmg);
        breakFreeze(arena, victim, dot.cardKey);
        const caster = arena.unitsById[dot.casterId];
        if (caster) caster.totals.damageDealt += dmg;
        emit(arena, { type: 'dot', caster: dot.casterId, target: victim.id, card: dot.cardKey, school, amount: dmg, mark: dot.critical ? 'c' : '', label });
    };
    for (const dot of U.popDoT(unit)) {
        if (dot.damage === 0) continue;
        if (dot.damage < 0) {
            const side = arena.sides[unit.side];
            const victims = [unit, ...side.filter(v => v !== unit && U.isAlive(v) && Math.abs(v.slot - unit.slot) === 1)];
            for (const v of victims) applyTick(v, Math.abs(dot.damage), dot, 'splash');
        } else {
            applyTick(unit, dot.damage, dot, '');
        }
        if (!U.isAlive(unit)) break;
    }
}

/** card_server.lua L2173+：单位行动前结算自身 HOT */
export function tickHots(arena, unit) {
    if (!U.isAlive(unit)) return;
    for (const hot of U.popHoT(unit)) {
        const buffs = [U.getInputHealBoost(unit, arena.resolved, arena)];
        if (arena.aura && arena.aura.boostHeal) buffs.push(arena.aura.boostHeal);
        let heal = healExpression(hot.heal, buffs, arena.resolved.version);
        heal = applyHealPenalty(Math.ceil(heal), arena.resolved.global.healPenalty);
        const done = U.takeHeal(unit, heal);
        const caster = arena.unitsById[hot.casterId];
        if (caster) caster.totals.healDone += done;
        emit(arena, { type: 'hot', caster: hot.casterId, target: unit.id, card: hot.cardKey, amount: heal });
    }
}

export function applyHeal(arena, caster, target, card, baseHeal, casterBuffs, label, collectThreat) {
    const R = arena.resolved;
    const buffs = [...casterBuffs];
    U.processHealAgainstWards(target, R, buffs);
    if (arena.aura && arena.aura.boostHeal) buffs.push(arena.aura.boostHeal);
    buffs.push(U.getInputHealBoost(target, R, arena));
    let heal = healExpression(baseHeal, buffs, R.version);
    if (card.type.startsWith('SingleHeal')) arena.onSingleHealThreat?.(caster, heal);
    collectThreat?.(heal);
    heal = applyHealPenalty(Math.ceil(heal), R.global.healPenalty);
    const done = U.takeHeal(target, heal);
    caster.totals.healDone += done;
    emit(arena, { type: 'heal', caster: caster.id, target: target.id, card: card.key, amount: heal, label: label || '' });
    return heal;
}

export function casterHealBuffs(arena, caster) {
    const R = arena.resolved;
    const buffs = [];
    U.processStatAgainstCharms(caster, R, buffs, 'boost_heal', 'skipschool');
    buffs.push(U.getOutputHealBoost(caster, R));
    return buffs;
}

export function buildHotSequence(arena, caster, card, hotsStr, casterBuffs, realcost = 0) {
    const seq = { cardKey: card.key, casterId: caster.id, ticks: [] };
    for (const h of splitList(hotsStr)) {
        let heal = healExpression(numericFromSection(h, realcost), casterBuffs, arena.resolved.version);
        seq.ticks.push(Math.ceil(heal));
    }
    seq.ticks.reverse();
    if (['SingleHealWithHOT', 'DOTAttackWithHOT'].includes(card.type)) arena.onHotThreat?.(caster, seq.ticks);
    if (card.type === 'AreaHealWithHOT') arena.onHotThreat?.(caster, seq.ticks, true);
    return seq;
}

export function aliveEnemies(arena, caster) {
    return arena.sides[caster.side === 'near' ? 'far' : 'near'].filter(U.isAlive);
}

export function aliveAllies(arena, caster) {
    return arena.sides[caster.side].filter(U.isAlive);
}

/** 眩晕：card_server.lua L3167-3200（stun absorb ward 31） */
export function applyStun(arena, caster, target, card) {
    const R = arena.resolved;
    let absorbed = false;
    for (const w of target.wards) {
        if (w.id > 0 && !w.absorb) {
            const tpl = R.wards[w.id];
            if (tpl && (tpl.stunabsorb === true || tpl.stunabsorb === 'true')) { w.id = 0; absorbed = true; break; }
        }
    }
    if (absorbed) {
        emit(arena, { type: 'stun_absorbed', caster: caster.id, target: target.id, card: card.key });
        return false;
    }
    target.stunned = true;
    arena.onEffectThreat?.(caster, target, 'Stun', false, true);
    if (!(card.params.do_not_generate_absorb === true || card.params.do_not_generate_absorb === 'true')) {
        const n = R.version === 'teen' ? 2 : 4;
        for (let i = 0; i < n; i++) U.appendWard(target, STUN_ABSORB_WARD_ID);
    }
    emit(arena, { type: 'stun', caster: caster.id, target: target.id, card: card.key });
    return true;
}
