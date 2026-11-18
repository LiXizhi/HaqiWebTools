import {triggerHanziCard} from './hanzi_battle_core.js';
// combat_cards_core.js — 卡牌效果处理器（对应 card_server.lua Card.UseCard 内各 template.type 分支）。
// 伤害/治疗/DOT/HOT/眩晕与守护复活管线已拆至 ./combat_damage_pipeline_core.js；目标选择辅助已拆至 ./combat_card_targeting_core.js。
import {
    damageExpression, rollFizzle,
} from './combat_formulas_core.js';
import * as U from './combat_unit_core.js';
import {tauntThreat} from './combat_threat_core.js';
import {canEnrageTarget, enrageTarget} from './combat_enrage_core.js';
import {
    numericFromSection,
    splitCardList as splitList,
    cardTargetKind,
    isAreaCard,
    isAttackCard,
    isHealCard,
    canTargetStealth,
    expectedBaseDamage,
    expectedBaseHeal,
} from './combat_card_targeting_core.js';
import {
    STUN_ABSORB_WARD_ID,
    SPECIAL_TYPES,
    emit,
    specialCardsEnabled,
    hasConvertibleWard,
    reviveGuardians,
    applyDamage,
    casterDamageBuffs,
    buildDotSequence,
    tickDots,
    tickHots,
    applyHeal,
    casterHealBuffs,
    buildHotSequence,
    aliveEnemies,
    aliveAllies,
    applyStun,
} from './combat_damage_pipeline_core.js';

export {
    numericFromSection,
    cardTargetKind,
    isAreaCard,
    isAttackCard,
    isHealCard,
    canTargetStealth,
    expectedBaseDamage,
    expectedBaseHeal,
    STUN_ABSORB_WARD_ID,
    tickDots,
    tickHots,
    specialCardsEnabled,
    hasConvertibleWard,
    reviveGuardians,
};

// ---------------------------------------------------------------------------
// 分支处理器
// ---------------------------------------------------------------------------

const handlers = {};

const SINGLE_ATTACK_TYPES = [
    'SingleAttack', 'SingleAttackWithDOT', 'SingleAttackWithStandingWards', 'SingleAttackWithTrap',
    'SingleAttackWithExplode', 'SingleAttackWithLifeTap', 'SingleAttackWithImmolate', 'SingleAttackWithPercent',
    'SingleAttackWithStun', 'SingleAttackWithSelfStun', 'SingleAttackWithLifeTapAndStandingWards', 'SingleAttackHP',
];

/** card_server.lua L2998-3330 */
function singleAttack(arena, caster, card, target, realcost) {
    const R = arena.resolved;
    const p = card.params;
    const type = card.type;
    let dmin = numericFromSection(p.damage_min, realcost);
    let dmax = numericFromSection(p.damage_max, realcost);
    if (type === 'SingleAttackWithPercent') {
        const real = Math.ceil(target.hp * Number(p.damage_percent || 0) / 100);
        dmin = real; dmax = real;
    }
    if (type === 'SingleAttackWithExplode') {
        const exists = target.dots.some(s => s.ticks.some(t => t.dmg < 0));
        if (exists) {
            target.dots = target.dots.filter(s => !s.ticks.some(t => t.dmg < 0));
            dmin = numericFromSection(p.damage_min_explode, realcost);
            dmax = numericFromSection(p.damage_max_explode, realcost);
        }
    }
    const baseDamage = arena.rng.int(dmin, dmax);
    const school = p.damage_school || card.spellSchool;
    const cb = casterDamageBuffs(arena, caster, school);
    const skipResist = type === 'SingleAttackWithPercent';

    // immolate：施法者自伤（card_server.lua L3036-3043 + L3360+）
    if (type === 'SingleAttackWithImmolate' && p.immolate_damage_min !== undefined) {
        const iSchool = p.immolate_damage_school || school;
        const base = arena.rng.int(numericFromSection(p.immolate_damage_min, realcost), numericFromSection(p.immolate_damage_max, realcost));
        applyDamage(arena, caster, caster, card, { baseDamage: base, damageSchool: iSchool, buffsTargetList: [], damagePercent: U.getDamageBoost(caster, iSchool, arena, R), boostAbs: U.getDamageBoostAbs(caster, iSchool), label: 'immolate' });
    }

    if (type === 'SingleAttackWithDOT' && p.dots) {
        U.appendDoT(target, buildDotSequence(arena, caster, target, card, p.dots, cb.list, 1, realcost));
        emit(arena, { type: 'dot_applied', caster: caster.id, target: target.id, card: card.key, ticks: splitList(p.dots).length });
    }
    if ((type === 'SingleAttackWithStandingWards' || type === 'SingleAttackWithLifeTapAndStandingWards') && p.wards) {
        for (const w of splitList(p.wards)) U.appendStandingWard(target, Number(w), Number(p.rounds || 1));
    }
    if (type === 'SingleAttackWithTrap' && p.target_wards) {
        for (const w of splitList(p.target_wards)) U.appendWard(target, Number(w));
    }
    // card_server.lua L3138–3164: charging is an effect flag, not a separate card type.
    // Scope this added port to PvE so the existing simulator's PvP behavior is unchanged.
    if (arena.mode === 'pve' && (p.bCharging === true || p.bCharging === 'true')) {
        const ids = R.global.stormChargingWardIds;
        let rank = -1;
        for (const ward of target.standingWards) if (ward.rounds > 0) rank = Math.max(rank, ids.indexOf(ward.id));
        target.standingWards = target.standingWards.filter(ward => !ids.includes(ward.id));
        const id = ids[Math.min(rank + 1, ids.length - 1)];
        if (!id || !R.wards[id]) throw new Error('Missing storm charging ward');
        U.appendStandingWard(target, id, 2);
        emit(arena, { type: 'ward_applied', caster: caster.id, target: target.id, card: card.key, ward: id, rounds: 2 });
    }
    if (type === 'SingleAttackWithStun') applyStun(arena, caster, target, card);

    const res = applyDamage(arena, caster, target, card, {
        baseDamage, damageSchool: school, buffsTargetList: skipResist ? [] : cb.list,
        damagePercent: skipResist ? 0 : cb.damagePercent, boostAbs: skipResist ? 0 : cb.boostAbs,
        baseCrit: Number(p.base_criticalstrike || 0), baseSpellPen: p.base_spellpenetration, skipResist,
        // card_server.lua L3281-3290：百分比伤害上限按目标类型选择 damage_max_mob / damage_max_player
        maxDamage: type === 'SingleAttackWithPercent' ? Number((target.isMob ? p.damage_max_mob : p.damage_max_player) || p.damage_max || Infinity) : undefined,
    });

    if ((type === 'SingleAttackWithLifeTap' || type === 'SingleAttackWithLifeTapAndStandingWards') && U.isAlive(caster)) {
        // card_server.lua L3496-3497 吸血：damage * convert_rate / 100
        const conv = Math.ceil(res.damage * Number(p.convert_rate || 0) / 100);
        if (conv > 0) {
            const done = U.takeHeal(caster, conv);
            caster.totals.healDone += done;
            emit(arena, { type: 'heal', caster: caster.id, target: caster.id, card: card.key, amount: conv, label: 'lifetap' });
        }
    }
    if (type === 'SingleAttackWithSelfStun') { caster.stunned = true; emit(arena, { type: 'stun', caster: caster.id, target: caster.id, card: card.key }); }
}
for (const t of SINGLE_ATTACK_TYPES) handlers[t] = singleAttack;

/** card_server.lua L2620-2760 SingleAttackWithMultipleDamage（times 次） */
handlers.SingleAttackWithMultipleDamage = function (arena, caster, card, target, realcost) {
    const p = card.params;
    const school = p.damage_school || card.spellSchool;
    const cb = casterDamageBuffs(arena, caster, school);
    let times = Number(p.times || 1);
    if (p.random_times) {
        const m = /(\d+)\s*,\s*(\d+)/.exec(String(p.random_times));
        if (m) times = arena.rng.int(Number(m[1]), Number(m[2]));
    }
    const equal = p.damage_equal === true || p.damage_equal === 'true' || p.everyround_damage_equal === 'true';
    let base = arena.rng.int(numericFromSection(p.damage_min, realcost), numericFromSection(p.damage_max, realcost));
    for (let i = 1; i <= times; i++) {
        if (!U.isAlive(target)) break;
        let dmin, dmax, tSchool = school, baseCrit = Number(p.base_criticalstrike || 0);
        if (!equal && p[`damage_min_${i}`] !== undefined) {
            dmin = numericFromSection(p[`damage_min_${i}`], realcost);
            dmax = numericFromSection(p[`damage_max_${i}`], realcost);
            tSchool = p[`damage_school_${i}`] || school;
            baseCrit = Number(p[`base_criticalstrike_${i}`] || 0);
            base = arena.rng.int(dmin, dmax);
        } else if (!equal) {
            base = arena.rng.int(numericFromSection(p.damage_min, realcost), numericFromSection(p.damage_max, realcost));
        }
        applyDamage(arena, caster, target, card, { baseDamage: base, damageSchool: tSchool, buffsTargetList: cb.list, damagePercent: cb.damagePercent, boostAbs: cb.boostAbs, baseCrit, baseSpellPen: p.base_spellpenetration, label: `hit${i}` });
    }
};

/** card_server.lua L4041-4140 DOTAttack / DOTAttackWithHOT / DoT */
function dotAttack(arena, caster, card, target, realcost) {
    const p = card.params;
    const school = p.damage_school || card.spellSchool;
    const cb = casterDamageBuffs(arena, caster, school);
    U.appendDoT(target, buildDotSequence(arena, caster, target, card, p.dots, cb.list, 1, realcost));
    emit(arena, { type: 'dot_applied', caster: caster.id, target: target.id, card: card.key, ticks: splitList(p.dots).length });
    if (card.type === 'DOTAttackWithHOT' && p.hots) {
        U.appendHoT(caster, buildHotSequence(arena, caster, card, p.hots, casterHealBuffs(arena, caster), realcost));
        emit(arena, { type: 'hot_applied', caster: caster.id, target: caster.id, card: card.key, ticks: splitList(p.hots).length });
    }
}
handlers.DOTAttack = dotAttack;
handlers.DOTAttackWithHOT = dotAttack;
handlers.DoT = dotAttack;

/** card_server.lua L4205-4480 AreaAttack 家族；ArenaAttack 打全场（友方半伤） */
function areaAttack(arena, caster, card, target, realcost) {
    const R = arena.resolved;
    const p = card.params;
    const type = card.type;
    const school = p.damage_school || card.spellSchool;
    const cb = casterDamageBuffs(arena, caster, school);
    let targets = aliveEnemies(arena, caster);
    if (type === 'ArenaAttack') targets = [...aliveEnemies(arena, caster), ...aliveAllies(arena, caster)];
    const hasDirect = p.damage_min !== undefined;
    const base = hasDirect ? arena.rng.int(numericFromSection(p.damage_min, realcost), numericFromSection(p.damage_max, realcost)) : 0;
    let total = 0;
    for (const t of targets) {
        const sibling = t !== target;
        if (type === 'AreaAttackWithStun' || type === 'AreaStun') applyStun(arena, caster, t, card);
        if ((type === 'AreaAttackWithDOT' || type === 'AreaDOTAttack') && p.dots) {
            const ratio = sibling && R.version === 'kids' ? 0.83 : 1; // card_server.lua L66/L198 splash_damage_siblin_ratio
            U.appendDoT(t, buildDotSequence(arena, caster, t, card, p.dots, cb.list, ratio, realcost));
        }
        if (hasDirect) {
            const res = applyDamage(arena, caster, t, card, {
                baseDamage: base, damageSchool: school, buffsTargetList: cb.list, damagePercent: cb.damagePercent, boostAbs: cb.boostAbs,
                baseCrit: Number(p.base_criticalstrike || 0), baseSpellPen: p.base_spellpenetration,
                halve: type === 'ArenaAttack' && t.side === caster.side,
                areaThreat:true,
            });
            total += res.damage;
        }
    }
    if (type === 'AreaAttackWithLifeTap' && U.isAlive(caster)) {
        const conv = Math.ceil(total * Number(p.convert_rate || 0) / 100);
        if (conv > 0) { caster.totals.healDone += U.takeHeal(caster, conv); emit(arena, { type: 'heal', caster: caster.id, target: caster.id, card: card.key, amount: conv, label: 'lifetap' }); }
    }
    if (type === 'AreaAttackWithImmolate' && p.immolate_damage_min !== undefined) {
        const iSchool = p.immolate_damage_school || school;
        const b = arena.rng.int(numericFromSection(p.immolate_damage_min, realcost), numericFromSection(p.immolate_damage_max, realcost));
        applyDamage(arena, caster, caster, card, { baseDamage: b, damageSchool: iSchool, buffsTargetList: [], damagePercent: U.getDamageBoost(caster, iSchool, arena, R), boostAbs: 0, label: 'immolate' });
    }
}
for (const t of ['AreaAttack', 'AreaAttackWithDOT', 'AreaDOTAttack', 'AreaAttackWithStun', 'ArenaAttack', 'AreaAttackWithLifeTap', 'AreaAttackWithExtraThreat', 'AreaAttackWithImmolate']) handlers[t] = areaAttack;

/** card_server.lua L5614+ SingleStun / AreaStun */
handlers.SingleStun = (arena, caster, card, target) => { applyStun(arena, caster, target, card); };
handlers.AreaStun = (arena, caster, card) => { for (const t of aliveEnemies(arena, caster)) applyStun(arena, caster, t, card); };

/** card_server.lua L3711-3900 SingleHeal 家族 */
function singleHeal(arena, caster, card, target, realcost) {
    const R = arena.resolved;
    const p = card.params;
    const base = arena.rng.int(numericFromSection(p.heal_min, realcost), numericFromSection(p.heal_max, realcost));
    const cbuffs = casterHealBuffs(arena, caster);
    if (card.type === 'SingleHealWithImmolate' && p.immolate_damage_min !== undefined) {
        const iSchool = p.immolate_damage_school || card.spellSchool;
        const b = arena.rng.int(numericFromSection(p.immolate_damage_min, realcost), numericFromSection(p.immolate_damage_max, realcost));
        applyDamage(arena, caster, caster, card, { baseDamage: b, damageSchool: iSchool, buffsTargetList: [], damagePercent: U.getDamageBoost(caster, iSchool, arena, R), boostAbs: 0, label: 'immolate' });
    }
    if (card.type === 'SingleHealWithHOT' && p.hots) {
        U.appendHoT(target, buildHotSequence(arena, caster, card, p.hots, cbuffs, realcost));
        emit(arena, { type: 'hot_applied', caster: caster.id, target: target.id, card: card.key, ticks: splitList(p.hots).length });
    }
    if (card.type === 'SingleHealWithCleanse') U.popAllNegativeEffects(target, R);
    applyHeal(arena, caster, target, card, base, cbuffs);
}
for (const t of ['SingleHeal', 'SingleHealWithHOT', 'SingleHealWithImmolate', 'SingleHealWithCleanse']) handlers[t] = singleHeal;

/** card_server.lua L4985-5100 AreaHeal 家族（基础值只 roll 一次，逐目标结算） */
function areaHeal(arena, caster, card, target, realcost) {
    const R = arena.resolved;
    const p = card.params;
    const base = arena.rng.int(numericFromSection(p.heal_min, realcost), numericFromSection(p.heal_max, realcost));
    const cbuffs = casterHealBuffs(arena, caster);
    let totalThreat=0;
    for (const t of aliveAllies(arena, caster)) {
        if (card.type === 'AreaHealWithHOT' && p.hots) U.appendHoT(t, buildHotSequence(arena, caster, card, p.hots, cbuffs, realcost));
        if (card.type === 'AreaHealWithAbsorb' && p.absorb_pts !== undefined) U.appendAbsorb(t, numericFromSection(p.absorb_pts, realcost), Number(p.ward || 0));
        applyHeal(arena, caster, t, card, base, cbuffs,undefined,heal=>{
            totalThreat+=Math.ceil(heal*R.adventure.damageThreatRatio);
            if(card.type==='AreaHealWithAbsorb')totalThreat+=R.adventure.effectThreatAbsorb;
        });
    }
    arena.onAreaHealThreat?.(caster,totalThreat);
    if (card.type === 'AreaCleanse') for (const t of aliveAllies(arena, caster)) U.popAllNegativeEffects(t, R);
}
for (const t of ['AreaHeal', 'AreaHealWithHOT', 'AreaHealWithAbsorb']) handlers[t] = areaHeal;

handlers.HoT = (arena, caster, card, target, realcost) => {
    U.appendHoT(target, buildHotSequence(arena, caster, card, card.params.hots, casterHealBuffs(arena, caster), realcost));
    emit(arena, { type: 'hot_applied', caster: caster.id, target: target.id, card: card.key, ticks: splitList(card.params.hots).length });
};

/** card_server.lua L6305 Charms（含 charms="11,11"）/ L6354 AreaCharm（对敌方全体 charm=） */
handlers.Charms = (arena, caster, card, target) => {
    for (const c of splitList(card.params.charms ?? card.params.charm)) U.appendCharm(target, Number(c));
    emit(arena, { type: 'charm', caster: caster.id, target: target.id, card: card.key, ids: splitList(card.params.charms ?? card.params.charm) });
};
handlers.AreaCharm = (arena, caster, card) => {
    const ids = splitList(card.params.charm ?? card.params.charms);
    const R = arena.resolved;
    const positive = ids.length && R.charms[Number(ids[0])] && (R.charms[Number(ids[0])].positive === true || R.charms[Number(ids[0])].positive === 'true');
    const targets = positive ? aliveAllies(arena, caster) : aliveEnemies(arena, caster);
    for (const t of targets) { for (const c of ids) U.appendCharm(t, Number(c)); emit(arena, { type: 'charm', caster: caster.id, target: t.id, card: card.key, ids }); }
};

/** card_server.lua L6482 Wards / L6700 AreaWard, AreaAbsorb / L6531 StandingWards / L5516 Absorb */
handlers.Wards = (arena, caster, card, target) => {
    const ids = splitList(card.params.wards ?? card.params.ward);
    for (const w of ids) U.appendWard(target, Number(w));
    emit(arena, { type: 'ward', caster: caster.id, target: target.id, card: card.key, ids });
};
/** card_server.lua SymmetryWards：target_wards 贴敌方目标，caster_wards 贴施法者自身 */
handlers.SymmetryWards = (arena, caster, card, target) => {
    const p = card.params;
    const tids = splitList(p.target_wards ?? p.wards ?? p.ward);
    const cids = splitList(p.caster_wards);
    for (const w of tids) U.appendWard(target, Number(w));
    for (const w of cids) U.appendWard(caster, Number(w));
    emit(arena, { type: 'ward', caster: caster.id, target: target.id, card: card.key, ids: tids });
    if (cids.length) emit(arena, { type: 'ward', caster: caster.id, target: caster.id, card: card.key, ids: cids });
};
handlers.AreaWard = (arena, caster, card) => {
    const ids = splitList(card.params.ward ?? card.params.wards);
    const R = arena.resolved;
    const tpl = ids.length ? R.wards[Number(ids[0])] : null;
    const negative = tpl && (tpl.positive === false || tpl.positive === 'false');
    const targets = negative ? aliveEnemies(arena, caster) : aliveAllies(arena, caster);
    for (const t of targets) { for (const w of ids) U.appendWard(t, Number(w)); emit(arena, { type: 'ward', caster: caster.id, target: t.id, card: card.key, ids }); }
};
handlers.StandingWards = (arena, caster, card, target) => {
    const rounds = Number(card.params.rounds || 1);
    for (const w of splitList(card.params.wards ?? card.params.ward)) U.appendStandingWard(target, Number(w), rounds);
    emit(arena, { type: 'standing_ward', caster: caster.id, target: target.id, card: card.key, rounds });
};
function absorbCard(arena, caster, card, target, realcost) {
    const p = card.params;
    let pts = numericFromSection(p.absorb_pts, realcost);
    if (card.type === 'Absorb_Adv') {
        // Teen Absorb_Adv：base + scale * 等级（近似：base_absorb_pts * (1 + boost%)），受生命攻击加成
        pts = Math.ceil(Number(p.base_absorb_pts || 0) * (1 + U.getDamageBoost(caster, card.spellSchool, null, arena.resolved) / 100));
    }
    const targets = card.type === 'AreaAbsorb' ? aliveAllies(arena, caster) : [target];
    for (const t of targets) {
        U.appendAbsorb(t, pts, Number(p.ward || 0));
        emit(arena, { type: 'absorb', caster: caster.id, target: t.id, card: card.key, amount: pts });
    }
}
handlers.Absorb = absorbCard;
handlers.Absorb_Adv = absorbCard;
handlers.AreaAbsorb = absorbCard;

handlers.ReflectionShield = (arena, caster, card, target) => {
    if(arena.reflectionRulesVersion===1){
        const amount=Number(card.params.reflect_amount||0);
        target.reflectAmount=(target.reflectAmount||0)+amount;
        emit(arena,{type:'absorb',caster:caster.id,target:target.id,card:card.key,amount,label:'reflection'});
        return;
    }
    U.appendAbsorb(target, Number(card.params.reflect_amount || 0), 0);
    emit(arena, { type: 'absorb', caster: caster.id, target: target.id, card: card.key, amount: Number(card.params.reflect_amount || 0), label: 'reflect≈absorb' });
};

/** card_server.lua L5213 Global */
handlers.Global = (arena, caster, card) => {
    const p = card.params;
    arena.aura = {
        name: card.spellSchool === 'death' && p.boost_damage !== undefined ? 'death_damage' : card.spellSchool,
        boostDamage: p.boost_damage !== undefined ? Number(p.boost_damage) : null,
        boostSchool: p.school ? String(p.school).toLowerCase() : null,
        boostHeal: p.boost_heal !== undefined ? Number(p.boost_heal) : null,
        boostPowerPip: p.boost_powerpip !== undefined ? Number(p.boost_powerpip) : null,
        cardKey: card.key,
    };
    emit(arena, { type: 'aura', caster: caster.id, card: card.key, aura: { ...arena.aura } });
};

/** Global2（teen）：全场属性光环，stats 通过 GetStatsSum 计入所有单位（player_server.lua L3579-3595） */
handlers.Global2 = (arena, caster, card) => {
    arena.aura2 = { id: Number(card.params.globalaura), school: card.params.school, cardKey: card.key };
    emit(arena, { type: 'aura2', caster: caster.id, card: card.key, id: arena.aura2.id });
};

/** MiniAura：自身小光环（rounds） */
handlers.MiniAura = (arena, caster, card) => {
    caster.miniaura = { id: Number(card.params.miniaura), rounds: Number(card.params.rounds || 3) };
    emit(arena, { type: 'miniaura', caster: caster.id, card: card.key, id: caster.miniaura.id, rounds: caster.miniaura.rounds });
};

/** Stance：姿态（fire_kids/ice_kids/defensive/vampire/electric...） */
handlers.Stance = (arena, caster, card) => {
    caster.stance = { name: String(card.params.stance), rounds: Number(card.params.rounds || 5) };
    emit(arena, { type: 'stance', caster: caster.id, card: card.key, stance: caster.stance.name, rounds: caster.stance.rounds });
};

/** GainPips / AreaPowerPipBoost */
handlers.GainPips = (arena, caster, card, target) => {
    const n = Number(card.params.pips || 1);
    const max = arena.resolved.global.maxPips;
    target.pips.normal = Math.min(max - target.pips.power, target.pips.normal + n);
    emit(arena, { type: 'pips', caster: caster.id, target: target.id, card: card.key, amount: n });
};
handlers.AreaPowerPipBoost = (arena, caster, card) => {
    const n = Number(card.params.powerpips || 1);
    const max = arena.resolved.global.maxPips;
    for (const t of aliveAllies(arena, caster)) {
        if (arena.resolved.version === 'teen') t.pips.normal = Math.min(max - t.pips.power, t.pips.normal + n * 2);
        else t.pips.power = Math.min(max - t.pips.normal, t.pips.power + n);
        emit(arena, { type: 'pips', caster: caster.id, target: t.id, card: card.key, amount: n });
    }
};

/** Cleanse / Remove / Steal（card_server.lua L5300-5600 区间） */
handlers.SingleCleanse = (arena, caster, card, target) => { U.popAllNegativeEffects(target, arena.resolved); emit(arena, { type: 'cleanse', caster: caster.id, target: target.id, card: card.key }); };
handlers.AreaCleanse = (arena, caster, card) => { for (const t of aliveAllies(arena, caster)) { U.popAllNegativeEffects(t, arena.resolved); emit(arena, { type: 'cleanse', caster: caster.id, target: t.id, card: card.key }); } };
handlers.RemovePositiveCharm = (arena, caster, card, target) => {
    const n = Number(card.params.remove_count || 1);
    for (let i = 0; i < n; i++) { const id = U.popRandomCharm(target, arena.resolved, arena.rng, true); if (id == null) break; emit(arena, { type: 'remove_charm', caster: caster.id, target: target.id, card: card.key, id }); }
};
handlers.RemoveNegativeCharm = (arena, caster, card, target) => {
    const n = Number(card.params.remove_count || 1);
    for (let i = 0; i < n; i++) { const id = U.popRandomCharm(target, arena.resolved, arena.rng, false); if (id == null) break; emit(arena, { type: 'remove_charm', caster: caster.id, target: target.id, card: card.key, id }); }
};
handlers.RemovePositiveWard = (arena, caster, card, target) => {
    const n = Number(card.params.remove_count || 1);
    for (let i = 0; i < n; i++) { const id = U.popRandomWard(target, arena.resolved, arena.rng, true); if (id == null) break; emit(arena, { type: 'remove_ward', caster: caster.id, target: target.id, card: card.key, id }); }
};
handlers.StealCharm = (arena, caster, card, target) => {
    const n = Number(card.params.steal_count || 1);
    for (let i = 0; i < n; i++) { const id = U.popRandomCharm(target, arena.resolved, arena.rng, true); if (id == null) break; U.appendCharm(caster, id); emit(arena, { type: 'steal_charm', caster: caster.id, target: target.id, card: card.key, id }); }
};
handlers.StealWard = (arena, caster, card, target) => {
    const n = Number(card.params.steal_count || 1);
    for (let i = 0; i < n; i++) { const id = U.popRandomWard(target, arena.resolved, arena.rng, true); if (id == null) break; U.appendWard(caster, id); emit(arena, { type: 'steal_ward', caster: caster.id, target: target.id, card: card.key, id }); }
};

handlers.Pass = () => {};
handlers.SingleTaunt = (arena,caster,card,target) => {
    if(target?.isMob&&U.isAlive(target)&&target.combatActive!==false)tauntThreat(target,caster,Number(card.params.additional_threat||0));
};
handlers.AreaTaunt = (arena,caster,card) => {
    for(const target of aliveEnemies(arena,caster))handlers.SingleTaunt(arena,caster,card,target);
};
handlers.SingleStealth = (arena,caster,card,target) => {
    target.stealth=true;
    target.stealthRounds=card.params.rounds===undefined?null:Number(card.params.rounds);
    arena.onEffectThreat?.(caster,target,'Stun');
    emit(arena,{type:'stealth',caster:caster.id,target:target.id,card:card.key,rounds:target.stealthRounds});
};

/** card_server.lua L5932–6041, kids branch. */
handlers.SingleFreeze = (arena, caster, card, target) => {
    const g = arena.resolved.global;
    const immune = target.isMob && [true,'true'].includes(target.template?.attributes?.is_immune_to_freeze);
    const success = !immune && !(target.antiFreezeRounds > 0) && !(target.antiFreezeSiblingRounds > 0);
    if (success) {
        if (arena.applyTempAntiFreezeForPartners) {
            for (const unit of arena.sides[target.side]) if (U.isAlive(unit) && unit.combatActive !== false) unit.antiFreezeSiblingRounds = g.freezeSiblingProtectionRounds;
        }
        const offset = arena.mode === 'pve' && arena.firstActingSide === 'near' ? 0 : 1;
        target.freezeRounds = Number(card.params.rounds) + offset;
        target.antiFreezeRounds = g.freezeProtectionRounds + offset;
        target.antiFreezeSiblingRounds = 0;
        U.appendWard(target, g.freezeWardId);
    }
    // Lua applies this threat even when freeze is resisted.
    arena.onEffectThreat?.(caster, target, 'SingleFreeze');
    emit(arena, {type:'freeze', caster:caster.id, target:target.id, card:card.key, success, rounds:target.freezeRounds||0});
};

/** card_server.lua L3916–4040: self damage consumes charms/wards, includes
 * absolute stats and final weights, excludes percentage stats and crit/dodge. */
handlers.SingleGuardianWithImmolate = (arena, caster, card, target) => {
    const R = arena.resolved, p = card.params, buffs = {list:[]};
    let school = p.immolate_damage_school;
    U.processStatAgainstCharms(caster, R, buffs.list, 'boost_damage', school);
    school = U.processDamageAgainstWards(caster, R, buffs.list, school);
    if (arena.aura?.boostSchool === school && arena.aura.boostDamage) buffs.list.push(arena.aura.boostDamage);
    let amount = damageExpression(arena.rng.int(Number(p.immolate_damage_min), Number(p.immolate_damage_max)), U.getDamageBoostAbs(caster, school) + U.getResistAbs(caster, school), buffs, R.version, R.global.maxSpellPenetration);
    amount = Math.ceil(amount * U.getOutputDamageFinalWeight(caster, arena, R));
    amount = Math.ceil(amount * U.getReceiveDamageFinalWeight(caster, school, R));
    amount = U.absorbUnitDamage(caster, amount);
    U.takeDamage(caster, amount);
    emit(arena, {type:'damage', caster:caster.id, target:caster.id, card:card.key, school, amount, mark:'', label:'immolate'});
    target.guardian = true;
    arena.onEffectThreat?.(caster, target, 'AreaWard', true);
    emit(arena, {type:'guardian', caster:caster.id, target:target.id, card:card.key});
};

handlers.ConversePositiveWard = (arena, caster, card, target) => {
    for (const offset of [1000,2000,3000,4000]) {
        const id = Number(card.params.fromward) + offset;
        if (!U.popWard(target, id)) continue;
        U.appendWard(target, Number(card.params.toward));
        emit(arena, {type:'remove_ward', caster:caster.id, target:target.id, card:card.key, id});
        emit(arena, {type:'ward', caster:caster.id, target:target.id, card:card.key, id:Number(card.params.toward)});
        break;
    }
    arena.onEffectThreat?.(caster, target, 'ConversePositiveWard');
};

// Enrage changes the mob before accuracy/payment (Lua's precheck pass 10).
handlers.Enrage = () => {};

/** 未实现列表（透明记录） */
export const UNSUPPORTED_TYPES = [
    'Random', 'Fizzle', 'PickPet', 'CatchPet', 'Revive', 'Dead', 'AreaControl',
];

export function isSupportedType(type) {
    return Boolean(handlers[type]);
}

export function supportedTypes() {
    return Object.keys(handlers);
}

function registerUnsupported(arena, card) {
    const rec = arena.unsupported[card.type] || (arena.unsupported[card.type] = { count: 0, cards: {} });
    rec.count++;
    rec.cards[card.key] = (rec.cards[card.key] || 0) + 1;
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

/**
 * 施放一张卡：命中判定 → 扣费 → 分支处理。
 * 施法者行动前的 DOT/HOT 结算由 arena 调用 tickDots/tickHots。
 * @return { ok, fizzled, unsupported }
 */
export function useCard(arena, caster, card, target, seq) {
    const R = arena.resolved;
    arena.advanceCasterThreat?.(caster);
    if (!handlers[card.type] || (SPECIAL_TYPES.has(card.type) && !specialCardsEnabled(arena)) || (card.type==='SingleStealth'&&arena.stealthRulesVersion!==1)) {
        registerUnsupported(arena, card);
        emit(arena, { type: 'unsupported', caster: caster.id, card: card.key, cardType: card.type });
        return { ok: false, unsupported: true };
    }
    if (specialCardsEnabled(arena) && (caster.freezeRounds > 0 ||
        (SPECIAL_TYPES.has(card.type) && (!target || !U.isAlive(target))) ||
        (card.type === 'Enrage' && !canEnrageTarget(arena, caster, card, target)) ||
        (card.type === 'ConversePositiveWard' && !hasConvertibleWard(target, card)) ||
        (card.type === 'SingleGuardianWithImmolate' && target?.speciesId && !target.isMob))) {
        emit(arena, {type:'pass', caster:caster.id, reason:caster.freezeRounds > 0 ? 'frozen' : 'invalid_target'});
        return {ok:false};
    }
    // Stance 校验（card_server.lua L1812-1823）
    if(arena.stealthRulesVersion===1&&target&&!canTargetStealth(card,target)){
        emit(arena,{type:'pass',caster:caster.id,reason:'stealth'});
        return {ok:false};
    }
    if (card.type === 'Stance' && card.spellSchool !== caster.school && card.spellSchool !== 'balance') {
        emit(arena, { type: 'pass', caster: caster.id, reason: 'stance_school' });
        return { ok: false };
    }
    if (card.type === 'Enrage') {
        const previousHp = target.hp;
        enrageTarget(arena, caster, target);
        emit(arena, {type:'enrage', caster:caster.id, target:target.id, card:card.key, maxHp:target.maxHp});
        emit(arena, {type:'heal', caster:caster.id, target:target.id, card:card.key, amount:Math.max(0,target.hp-previousHp), label:'enrage', hp:target.hp, maxHp:target.maxHp});
    }
    // 命中（card_server.lua L2514-2560）：accuracy + accuracy charms + caster boost
    const accBuffs = [];
    U.processStatAgainstCharms(caster, R, accBuffs, 'boost_accuracy', card.spellSchool);
    let accuracy = Number(card.accuracy) + accBuffs.reduce((a, b) => a + b, 0) + U.getAccuracyBoost(caster, card.spellSchool, R);
    if (R.fairPlay && R.fairPlay.forceAccuracy !== undefined && R.fairPlay.forceAccuracy !== null) accuracy = R.fairPlay.forceAccuracy;
    caster.totals.casts++;
    // 失误发生在扣费之前（card_server.lua L2560-2578）
    const missed=rollFizzle(arena.rng, accuracy);
    // card_server.lua L2546-2559: pop one matching dispel even on a natural miss.
    let dispel=null;
    if(arena.mode!=='pve'||arena.dispelRulesVersion===1){
        for(const [id,charm] of Object.entries(R.charms)){
            if(charm.dispel_school&&String(charm.dispel_school).toLowerCase()===String(card.spellSchool).toLowerCase()&&U.popCharm(caster,Number(id))){
                dispel=Number(id);break;
            }
        }
    }
    if (missed) {
        caster.totals.fizzles++;
        if (seq !== undefined) U.markCardFizzled(caster, seq);
        emit(arena, { type: 'fizzle', caster: caster.id, card: card.key, target: target ? target.id : null, accuracy,...(dispel!==null?{dispel}: {}) });
        return { ok: false, fizzled: true };
    }
    const realcost = U.payCard(caster, card, R);
    // card_server.lua L2577-2598; mob_server.lua L3197-3200. Forced fizzle
    // happens AFTER pip payment, before cooldown/effect execution.
    const immune=caster.isMob&&[true,'true'].includes(caster.template?.attributes?.is_immune_to_dispel);
    if(dispel!==null&&!immune){
        caster.totals.fizzles++;
        if(seq!==undefined)U.markCardFizzled(caster,seq);
        emit(arena,{type:'fizzle',caster:caster.id,card:card.key,target:target?.id??null,accuracy,dispel,reason:'dispel',realcost});
        return {ok:false,fizzled:true};
    }
    if (card.params.cooldown) U.setCooldown(caster, card.spellName, Number(card.params.cooldown));
    if (seq !== undefined) U.markCardUsed(caster, seq);
    emit(arena, { type: 'cast', caster: caster.id, card: card.key, cardType: card.type, target: target ? target.id : null, school: card.spellSchool, pipcost: card.pipcost, realcost });
    arena.cardStats[card.key] = (arena.cardStats[card.key] || 0) + 1;
    handlers[card.type](arena, caster, card, target || caster, realcost);
    const effectThreat={
        Global:['Global',true],Global2:['Global',true],MiniAura:['MiniAura',false],
        RemovePositiveCharm:['RemovePositiveCharm',false],RemoveNegativeCharm:['RemoveNegativeCharm',true],StealCharm:['StealCharm',false],
        Charms:['Charms',false],Wards:['Wards',false],AreaCharm:['AreaCharm',true],AreaWard:['AreaWard',true],Absorb:['Absorb',true],
        RemovePositiveWard:['RemovePositiveWard',false],StealWard:['StealWard',false],
        SymmetryWards:['SymmetryWards',false],ReflectionShield:['ReflectionShield',false],
        AreaPowerPipBoost:['AreaPowerPipBoost',true],AreaCleanse:['AreaCleanse',true],
    }[card.type];
    if(effectThreat)arena.onEffectThreat?.(caster,target||caster,...effectThreat);
    triggerHanziCard(arena,caster,card);
    reviveGuardians(arena);
    // Optional presentation observer also sees silent secondary effects (e.g. an
    // attack attaching a trap). It is not part of the deterministic event log.
    arena.onStatusEffect?.({type:'effects_settled',caster:caster.id,card:card.key});
    return { ok: true };
}
