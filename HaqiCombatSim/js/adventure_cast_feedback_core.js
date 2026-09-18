// Explain existing cast restrictions without changing combat rules or spending pips.
import { canAffordCard, isOwnSchoolCost } from './combat_formulas_core.js';
import { canCast, isAlive } from './combat_unit_core.js';

export function castBlockedMessage(hero, card, resolved) {
    if (!card || !isAlive(hero)) return '当前无法施法，请重新选择或跳过本回合。';
    const own = isOwnSchoolCost(card.spellSchool, hero.school, resolved.version);
    if (!canAffordCard(hero.pips, card.pipcost, own, resolved.version)) {
        const available = hero.pips.normal + hero.pips.power * (own ? 2 : 1);
        const required = card.pipcost * (!own && resolved.version === 'teen' ? 2 : 1);
        return `魔力点不足：需要 ${required} 点，当前可用 ${available} 点。请重新选择低消耗卡牌，或跳过本回合积攒魔力。`;
    }
    const cooldown = hero.cooldowns[card.spellName] || 0;
    if (cooldown > 0) return `卡牌冷却中：还需 ${cooldown} 回合。请重新选择卡牌或跳过本回合。`;
    return canCast(hero, card, resolved) ? '' : '当前无法施放这张卡牌，请重新选择。';
}
