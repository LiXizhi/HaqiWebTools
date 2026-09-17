// combat_policy_core.js — 出牌策略（Policy）。
// 接口：policy.pick(arena, unit) → { seq, key, targetId } | { pass: true }
// - HumanPolicy：由 UI 写入 unit.picked，pick 直接返回
// - DeckAttackerBot：移植 mob_server.lua GetCardAndTarget_Deck_Attacker(L5042) + card_server.lua GetDeckAttackerAIWeightTarget(L315) / MatchCondition(L373)
// - SimpleBot：不依赖 CSV 的通用启发式（贪心伤害 / 低血治疗 / 起手 blade）
import * as U from './combat_unit_core.js';
import { castableCards, validTargets, enemiesOf, alliesOf } from './combat_arena_core.js';
import { expectedBaseDamage, expectedBaseHeal, isAttackCard, isHealCard, cardTargetKind } from './combat_cards_core.js';

export class HumanPolicy {
    constructor() { this.name = 'human'; }
    pick(arena, unit) {
        return unit.picked || { pass: true };
    }
}

// ---------------------------------------------------------------------------
// MatchCondition（card_server.lua L373-641）
// ---------------------------------------------------------------------------

function hpRate(u) { return u.maxHp ? u.hp / u.maxHp : 0; }

export function matchCondition(arena, caster, target, cond) {
    const R = arena.resolved;
    const aura = arena.aura;
    switch (cond) {
        case 'no_aura': return !aura;
        case 'caster_school_damage_aura': return Boolean(aura && aura.boostSchool === caster.school);
        case 'other_school_damage_aura': return !(aura && aura.boostSchool === caster.school);
        case 'caster_low_hp': return hpRate(caster) < 0.4;
        case 'caster_medium_hp': { const r = hpRate(caster); return r >= 0.4 && r < 0.7; }
        case 'caster_high_hp': return hpRate(caster) >= 0.7;
        case 'target_low_hp': return hpRate(target) < 0.4;
        case 'target_medium_hp': { const r = hpRate(target); return r >= 0.4 && r < 0.7; }
        case 'target_high_hp': return hpRate(target) >= 0.7;
        case 'caster_with_globalshield': return U.ifHasShield(caster, R, null);
        case 'target_with_globalshield': return U.ifHasShield(target, R, null);
        case 'caster_with_target_shield': return U.ifHasShield(caster, R, target.school, true);
        case 'target_with_caster_shield': return U.ifHasShield(target, R, caster.school, true);
        case 'caster_with_1_damageboost': return U.countCharms(caster, R, 'damageboost', caster.school) === 1;
        case 'caster_with_2+_damageboost': return U.countCharms(caster, R, 'damageboost', caster.school) >= 2;
        case 'caster_with_1_damagetrap': return U.countWards(caster, R, 'damagetrap', target.school) === 1;
        case 'caster_with_2+_damagetrap': return U.countWards(caster, R, 'damagetrap', target.school) >= 2;
        case 'caster_with_1+_healboost': return U.countCharms(caster, R, 'healboost') >= 1;
        case 'caster_with_1+_healweakness': return U.countCharms(caster, R, 'healweakness') >= 1;
        case 'caster_with_1+_damageweakness': return U.countCharms(caster, R, 'damageweakness', caster.school) >= 1;
        case 'caster_pips_10+': return U.pipValue(caster) >= 10;
        case 'target_with_1_damageboost': return U.countCharms(target, R, 'damageboost', target.school) === 1;
        case 'target_with_2+_damageboost': return U.countCharms(target, R, 'damageboost', target.school) >= 2;
        case 'target_with_1_damagetrap': return U.countWards(target, R, 'damagetrap', caster.school) === 1;
        case 'target_with_2+_damagetrap': return U.countWards(target, R, 'damagetrap', caster.school) >= 2;
        case 'target_with_1+_healboost': return U.countCharms(target, R, 'healboost') >= 1;
        case 'target_with_1+_healweakness': return U.countCharms(target, R, 'healweakness') >= 1;
        case 'target_with_1+_damageweakness': return U.countCharms(target, R, 'damageweakness', target.school) >= 1;
        case 'target_pips_6+': return U.pipValue(target) >= 6;
        default: {
            let m;
            if ((m = /^target_is_(\w+)$/.exec(cond))) return target.school === m[1];
            if ((m = /^caster_with_(\w+)_shield$/.exec(cond))) return U.ifHasShield(caster, R, m[1], true);
            if ((m = /^target_with_(\w+)_shield$/.exec(cond))) return U.ifHasShield(target, R, m[1], true);
            if ((m = /^(caster|target)_with_(\w+)_defend_miniaura$/.exec(cond))) {
                const u = m[1] === 'caster' ? caster : target;
                const school = m[2] === 'caster' ? caster.school : (m[2] === 'target' ? target.school : m[2]);
                if (!u.miniaura || u.miniaura.rounds <= 0) return false;
                const tpl = R.miniauras[u.miniaura.id];
                if (!tpl) return false;
                return (tpl._stats || U.parseMiniauraStats(tpl.stats)).some(({ id }) => {
                    const e = U.statIdToEntry(id);
                    return e && e.stat === 'resistPct' && (e.school === 'all' || e.school === school);
                });
            }
            return false;
        }
    }
}

/**
 * card_server.lua L315-371 GetDeckAttackerAIWeightTarget
 * @param table aiDecks[style] = { heads: string[], cards: { key: (string|number|null)[] } }（首列 target 类型）
 * @return { weight, target } | null（无模板 → weight -1）
 */
export function deckAttackerWeight(arena, caster, card, table) {
    if (!table || !table.cards || !table.cards[card.key]) return { weight: -1, target: null };
    const row = table.cards[card.key];
    const heads = table.heads;
    const targetType = row[0];
    let units;
    if (targetType === 'friendly') units = alliesOf(arena, caster).filter(U.isAlive);
    else if (targetType === 'hostile') units = enemiesOf(arena, caster).filter(U.isAlive);
    else if (targetType === 'self') units = [caster];
    else units = [];
    let best = { weight: -100000, target: null };
    for (const target of units) {
        let w = 1000;
        for (let i = 1; i < row.length; i++) {
            const weight = row[i];
            if (typeof weight !== 'number' || weight === 0) continue;
            const cond = heads[i];
            if (cond === 'base_weight') w = weight;
            else if (matchCondition(arena, caster, target, cond)) w += weight;
        }
        if (w > best.weight) best = { weight: w, target };
    }
    return best;
}

export class DeckAttackerBot {
    /**
     * @param style 'AggressiveFire' 等；缺省按 unit.school 推断
     * @param fallback 无模板时的后备策略（默认 SimpleBot）
     */
    constructor(opts = {}) {
        this.name = 'deck_attacker';
        this.style = opts.style || null;
        this.fallback = opts.fallback || new SimpleBot();
        this.discard = opts.discard !== false;
    }
    pick(arena, unit) {
        const R = arena.resolved;
        const style = this.style || `Aggressive${unit.school.charAt(0).toUpperCase()}${unit.school.slice(1)}`;
        const table = R.aiDecks[style];
        if (!table) return this.fallback.pick(arena, unit);
        let best = null;
        const discards = [];
        for (const entry of castableCards(arena, unit)) {
            const { weight, target } = deckAttackerWeight(arena, unit, entry.card, table);
            if (weight < 0) { discards.push(entry.seq); continue; }
            if (target && (!best || weight > best.weight)) best = { weight, target, entry };
        }
        if (!best) {
            // CSV 无可用条目：回退启发式（保证非零行动率）
            const fb = this.fallback.pick(arena, unit);
            if (this.discard && discards.length) fb.discardSeqs = discards;
            return fb;
        }
        const pick = { seq: best.entry.seq, key: best.entry.key, targetId: best.target.id, weight: best.weight };
        if (this.discard && discards.length) pick.discardSeqs = discards;
        return pick;
    }
}

// ---------------------------------------------------------------------------
// SimpleBot：不依赖数据表的通用启发式
// ---------------------------------------------------------------------------

export class SimpleBot {
    constructor(opts = {}) {
        this.name = 'simple';
        this.aggression = opts.aggression ?? 1; // >1 更倾向攒费打大招
        this.healThreshold = opts.healThreshold ?? 0.45;
    }
    pick(arena, unit) {
        const R = arena.resolved;
        const castable = castableCards(arena, unit);
        if (!castable.length) return { pass: true };
        const enemies = enemiesOf(arena, unit).filter(U.isAlive);
        const allies = alliesOf(arena, unit).filter(U.isAlive);
        const weakestEnemy = enemies.slice().sort((a, b) => a.hp - b.hp)[0];
        const weakestAlly = allies.slice().sort((a, b) => hpRate(a) - hpRate(b))[0];

        // 1. 低血治疗
        if (weakestAlly && hpRate(weakestAlly) < this.healThreshold) {
            const heals = castable.filter(c => isHealCard(c.card) && expectedBaseHeal(c.card) > 0).sort((a, b) => expectedBaseHeal(b.card) - expectedBaseHeal(a.card));
            if (heals.length) return { seq: heals[0].seq, key: heals[0].key, targetId: weakestAlly.id };
        }
        // 2. 能秒杀就秒
        const attacks = castable.filter(c => isAttackCard(c.card) && expectedBaseDamage(c.card) > 0);
        const dmgBoost = 1 + U.getDamageBoost(unit, unit.school, arena, R) / 100;
        if (weakestEnemy) {
            const lethal = attacks.filter(c => expectedBaseDamage(c.card) * dmgBoost * 0.9 >= weakestEnemy.hp).sort((a, b) => a.card.pipcost - b.card.pipcost);
            if (lethal.length) return { seq: lethal[0].seq, key: lethal[0].key, targetId: weakestEnemy.id };
        }
        // 3. 没有 blade 且有 blade 卡 → 先上 blade（0 费）
        const hasBlade = U.countCharms(unit, R, 'damageboost', unit.school) > 0;
        if (!hasBlade) {
            const blade = castable.find(c => c.card.type === 'Charms' && c.card.pipcost === 0 && cardTargetKind(c.card) === 'friendly');
            if (blade) return { seq: blade.seq, key: blade.key, targetId: unit.id };
        }
        // 4. 敌方无 trap 且有 trap 卡 → 上 trap
        if (weakestEnemy && U.countWards(weakestEnemy, R, 'damagetrap', unit.school) === 0) {
            const trap = castable.find(c => c.card.type === 'Wards' && c.card.pipcost === 0 && cardTargetKind(c.card) === 'hostile');
            if (trap) return { seq: trap.seq, key: trap.key, targetId: weakestEnemy.id };
        }
        // 5. 自身无盾且敌方有 blade → 上盾
        const enemyBladed = enemies.some(e => U.countCharms(e, R, 'damageboost', e.school) > 0);
        if (enemyBladed && enemies[0] && !U.ifHasShield(unit, R, enemies[0].school)) {
            const shield = castable.find(c => c.card.type === 'Wards' && c.card.pipcost === 0 && cardTargetKind(c.card) === 'friendly');
            if (shield) return { seq: shield.seq, key: shield.key, targetId: unit.id };
        }
        // 6. 最大期望伤害攻击（费用越高越好：pips 攒够就打）
        if (attacks.length && weakestEnemy) {
            const pv = U.pipValue(unit);
            const maxPips = R.global.maxPips;
            attacks.sort((a, b) => expectedBaseDamage(b.card) - expectedBaseDamage(a.card));
            const best = attacks[0];
            // 若手上有更贵的攻击卡且 pips 未满，则攒费（aggression 越大越愿意等）
            const pricier = U.cardsInHand(unit).map(h => R.cards[h.key]).filter(c => c && isAttackCard(c) && c.pipcost > best.card.pipcost && expectedBaseDamage(c) > expectedBaseDamage(best.card) * 1.4);
            if (pricier.length && pv < maxPips && best.card.pipcost <= 2 && this.aggression > 1 && arena.rng.float() < 0.6) {
                const zero = castable.find(c => c.card.pipcost === 0 && !isAttackCard(c.card));
                if (zero) { const tg = validTargets(arena, unit, zero.card)[0]; if (tg) return { seq: zero.seq, key: zero.key, targetId: tg.id }; }
                return { pass: true };
            }
            const isArea = /^Area|^Arena/.test(best.card.type);
            const target = isArea ? enemies[0] : weakestEnemy;
            return { seq: best.seq, key: best.key, targetId: target.id };
        }
        // 7. 任意可用 0 费辅助卡
        const misc = castable.find(c => c.card.pipcost === 0);
        if (misc) {
            const tg = validTargets(arena, unit, misc.card)[0];
            if (tg) return { seq: misc.seq, key: misc.key, targetId: tg.id };
        }
        return { pass: true };
    }
}

/** 随机策略（基线用） */
export class RandomBot {
    constructor() { this.name = 'random'; }
    pick(arena, unit) {
        const castable = castableCards(arena, unit);
        if (!castable.length) return { pass: true };
        const c = arena.rng.pick(castable);
        const targets = validTargets(arena, unit, c.card);
        if (!targets.length) return { pass: true };
        return { seq: c.seq, key: c.key, targetId: arena.rng.pick(targets).id };
    }
}

export function createPolicy(name, opts) {
    switch (name) {
        case 'human': return new HumanPolicy();
        case 'deck_attacker': return new DeckAttackerBot(opts);
        case 'random': return new RandomBot();
        case 'simple':
        default: return new SimpleBot(opts);
    }
}
