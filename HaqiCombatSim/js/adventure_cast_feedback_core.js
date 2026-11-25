// Explain existing cast restrictions without changing combat rules or spending pips.
import { canAffordCard, isOwnSchoolCost } from './combat_formulas_core.js';
import { canCast, isAlive } from './combat_unit_core.js';

function feedback(key, vars = {}) {
    let message = key;
    for (const [name, value] of Object.entries(vars)) message = message.replaceAll('{'+name+'}', String(value));
    return { key, vars, message };
}

export function castBlockedFeedback(hero, card, resolved) {
    if (!card || !isAlive(hero)) return feedback('当前无法施法，请重新选择或跳过本回合。');
    if (hero.stunned || hero.freezeRounds > 0) return feedback('这一回合暂时无法行动。请跳过本回合，继续观察对手。');
    const own = isOwnSchoolCost(card.spellSchool, hero.school, resolved.version);
    if (!canAffordCard(hero.pips, card.pipcost, own, resolved.version)) {
        const available = hero.pips.normal + hero.pips.power * (own ? 2 : 1);
        const required = card.pipcost * (!own && resolved.version === 'teen' ? 2 : 1);
        return feedback('魔力点不足：需要 {required} 点，当前可用 {available} 点。请重新选择低消耗卡牌，或跳过本回合积攒魔力。', { required, available });
    }
    const cooldown = hero.cooldowns[card.spellName] || 0;
    if (cooldown > 0) return feedback('卡牌冷却中：还需 {cooldown} 回合。请重新选择卡牌或跳过本回合。', { cooldown });
    return canCast(hero, card, resolved) ? null : feedback('当前无法施放这张卡牌，请重新选择。');
}

export function castBlockedMessage(hero, card, resolved) {
    return castBlockedFeedback(hero, card, resolved)?.message || '';
}
