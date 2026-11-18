// combat_card_targeting_core.js — 卡牌目标类型判定与期望伤害/治疗数值读取（纯核心，无状态）。

/** card_server.lua L1246-1263 GetNumericalValueFromSection：数字或 "600p"（每费） */
export function numericFromSection(section, realcost) {
    if (section === undefined || section === null || section === '') return 0;
    const n = Number(section);
    if (!Number.isNaN(n)) return n;
    const m = /^(\d+)p$/.exec(String(section).trim());
    if (m) return Number(m[1]) * (realcost || 0);
    return 0;
}

export function splitCardList(str) {
    if (str === undefined || str === null) return [];
    return String(str).split(',').map(s => s.trim()).filter(s => s !== '');
}

/** 卡牌目标类型：hostile（默认） / friendly / self / all */
export function cardTargetKind(card) {
    const t = card.type;
    if (card.target) return card.target;
    if (/^Single(Heal|Cleanse|Stealth|Guardian)|^Area(Heal|Cleanse|Ward|Absorb|Charm|PowerPipBoost)|^Absorb|^Charms$|^Wards$|^StandingWards$|^ReflectionShield$|^GainPips$|^Revive$|^HoT$|^SymmetryWards$/.test(t)) {
        // AreaCharm 在数据中实际是敌方减益（weakness），特殊处理
        if (t === 'AreaCharm') return 'hostile';
        return 'friendly';
    }
    // CatchPet targets the mob (card_server.lua L2388). It is resolved by the PvE catch rune, not a generic handler.
    if (/^(Global|Stance|MiniAura|Pass|Fizzle|PickPet)$/.test(t)) return 'self';
    if (t === 'ArenaAttack') return 'all';
    return 'hostile';
}

export function isAreaCard(card) {
    return /^Area|^Arena|^DoT$/.test(card.type) || card.type === 'Global';
}

export function isAttackCard(card) {
    return /Attack|^DoT$|^DOTAttack/.test(card.type) && card.type !== 'Fizzle';
}

export function isHealCard(card) {
    return /Heal|^HoT$|^Revive$/.test(card.type);
}

export function canTargetStealth(card, target) {
    return !target.stealth || /area|arena|singleheal/i.test(card.key);
}

/** 期望伤害（不含目标属性），用于 UI/简单 Bot 排序 */
export function expectedBaseDamage(card) {
    const p = card.params || {};
    let v = 0;
    if (p.damage_min !== undefined) {
        v += (numericFromSection(p.damage_min, Math.abs(card.pipcost)) + numericFromSection(p.damage_max, Math.abs(card.pipcost))) / 2;
    }
    if (p.times) v *= Number(p.times) || 1;
    for (const d of splitCardList(p.dots)) v += Math.abs(numericFromSection(d, Math.abs(card.pipcost))) || 0;
    return v;
}

export function expectedBaseHeal(card) {
    const p = card.params || {};
    let v = 0;
    if (p.heal_min !== undefined) {
        v += (numericFromSection(p.heal_min, Math.abs(card.pipcost)) + numericFromSection(p.heal_max, Math.abs(card.pipcost))) / 2;
    }
    for (const h of splitCardList(p.hots)) v += Number(h) || 0;
    if (p.absorb_pts !== undefined) v += numericFromSection(p.absorb_pts, Math.abs(card.pipcost));
    return v;
}
