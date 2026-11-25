// Read-only operation guidance for the opening lessons; never selects or plays a card.
import { castBlockedMessage } from './adventure_cast_feedback_core.js';
import { validTargets } from './combat_arena_core.js';
import { cardTargetKind } from './combat_cards_core.js';
import * as U from './combat_unit_core.js';

export function openingTurnGuidance({ battle, hero, selected, visibleHand = [], discarded = [], animating = false }) {
    if (!battle?.monsterTemplates?.some(monster => monster.openingTrainingVersion) || battle.finished || animating || !hero) return null;
    if (!U.isAlive(hero)) return { step: 'watch', text: '你已倒下，伙伴还在战斗。可以观看，也可以撤退。' };
    if (hero.stunned || hero.freezeRounds > 0) return { step: 'pass', text: '这一回合暂时无法行动。点“跳过本回合”，继续观察对手。' };
    const available = entry => {
        const card = battle.resolved.cards[entry.key];
        return !discarded.includes(entry.seq) && U.canCast(hero, card, battle.resolved) && validTargets(battle, hero, card).length > 0;
    };
    if (selected) {
        const card = battle.resolved.cards[selected.key];
        const blocked = castBlockedMessage(hero, card, battle.resolved);
        if (blocked) return { step: 'blocked', text: blocked };
        if (discarded.includes(selected.seq)) return { step: 'blocked', text: '这张牌已准备弃掉。点“重新选择”，换一张牌。' };
        const targets = validTargets(battle, hero, card);
        if (!targets.length) return { step: 'blocked', text: '这张牌没有可选目标。点“重新选择”，换一张牌。' };
        const kind = cardTargetKind(card);
        const text = kind === 'all'
            ? '② 点亮起的角色，确认施放群体魔法。'
            : targets.every(target => target.id === hero.id)
              ? '② 点自己施法，也可以点“对自己施法”。'
              : kind === 'friendly'
                ? '② 点亮起的自己或伙伴，给它施法。'
                : '② 点亮起的对手出招。选错牌可以重新选择。';
        return { step: 'target', text };
    }
    if (visibleHand.some(available)) return { step: 'card', text: '① 先选一张亮着的牌，再选择施法目标。' };
    const otherHand = [...U.cardsInHand(hero), ...U.petCardsInHand(hero)].filter(entry => !visibleHand.some(visible => visible.seq === entry.seq));
    if (otherHand.some(available)) return { step: 'switch', text: '这一页暂时没有能用的牌。切换玩家手牌或宠物卡，也可以跳过本回合。' };
    return { step: 'pass', text: '暂时没有能用的牌。点“跳过本回合”，等下一回合再选。' };
}
