import { castBlockedMessage } from './adventure_cast_feedback_core.js';
// Resolve a UI swipe using the existing casting/target rules; never guess a target.
import { selectableCards } from './combat_unit_core.js';
import { validTargets } from './combat_arena_core.js';
import { runeCardsInHand } from './combat_pve_core.js';

export function resolveHandSwipe(battle, hand, discarded=[]) {
    if(!battle||battle.finished||!hand)return null;
    const hero=battle.sides.near[0];
    if(![...selectableCards(hero),...runeCardsInHand(battle)].some(h=>h.seq===hand.seq&&h.key===hand.key&&h.runeId===hand.runeId))return null;
    const card=battle.resolved.cards[hand.key];
    if(discarded.includes(hand.seq))return {message:'请先撤销弃牌'};
    const message=castBlockedMessage(hero,card,battle.resolved);
    if(message)return {message};
    const targets=validTargets(battle,hero,card);
    if(targets.length!==1)return {message:targets.length?'请选择施法目标':'当前没有可用的施法目标'};
    return {decision:{...hand,targetId:targets[0].id,discardSeqs:[...discarded]}};
}
