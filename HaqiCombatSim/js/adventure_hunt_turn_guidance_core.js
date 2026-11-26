// Read-only suggestions from advertised intents and currently playable cards.
import { HUNT_ID } from './adventure_hunt_core.js';
import { validTargets } from './combat_arena_core.js';
import { isAttackCard, expectedBaseDamage } from './combat_cards_core.js';
import { tacticalEffectDetails } from './tactical_encounter_core.js';
import * as U from './combat_unit_core.js';

const matches = (effect, school) => ['all', String(school).toLowerCase()].includes(String(effect?.school || effect?.spell_school || 'all').toLowerCase());

export function huntTurnGuidance({ save, battle, hero, selected, visibleHand = [], discarded = [], animating = false }) {
    if (save?.pendingEncounter?.encounterId !== HUNT_ID || !battle?.tacticalEncounter || battle.finished || animating || selected || !hero) return null;
    if (!U.isAlive(hero)) return null;
    if (hero.stunned || hero.freezeRounds > 0) return { text: '这一回合暂时无法行动。点“跳过本回合”，再看守卫的下一招。' };
    const available = visibleHand.filter(entry => {
        const card = battle.resolved.cards[entry.key];
        return card && !discarded.includes(entry.seq) && U.canCast(hero, card, battle.resolved) && validTargets(battle, hero, card).length;
    });
    const recommend = (entry, badge, text) => ({ seq: entry.seq, badge, text });
    const state = battle.tacticalEncounter;
    const intents = (state.intents || []).filter(intent => U.isAlive(battle.unitsById[intent.caster]));
    const heavy = intents.find(intent => intent.effect === '重击' && (intent.targetId === hero.id || intent.affectedTargetIds?.includes(hero.id)));
    if (heavy) {
        const enemy = battle.unitsById[heavy.caster];
        const attack = battle.resolved.cards[heavy.key];
        const school = attack?.params?.damage_school || attack?.spellSchool || enemy.school;
        const shielded = hero.wards.some(ward => {
            const effect = battle.resolved.wards[ward.id];
            return Number(effect?.boost_damage) < 0 && matches(effect, school);
        });
        const weakened = enemy.charms.some(id => {
            const effect = battle.resolved.charms[id];
            return Number(effect?.boost_damage) < 0 && matches(effect, school);
        });
        if (shielded || weakened) return { text: '重击将至，匹配的护盾或虚弱已就位。仍会受到伤害，先确认血量再出招。' };
        for (const [kind, target, badge] of [['ward', hero, '挡重击'], ['charm', enemy, '削弱重击']]) {
            const entry = available.find(row => {
                const card = battle.resolved.cards[row.key];
                return validTargets(battle, hero, card).includes(target) && tacticalEffectDetails(card, battle.resolved, hero).effects.modifiers.some(effect => effect.kind === kind && effect.damagePercent < 0 && matches(effect, school));
            });
            if (entry) return recommend(entry, badge, `守卫这回合要重击。先选标记的牌，${kind === 'ward' ? '给自己加盾' : '给守卫挂虚弱'}，减轻这次伤害。`);
        }
        return { text: '守卫这回合要重击；这一页没有可用的匹配护盾或虚弱。可检查其他手牌，或先治疗；治疗不会降低重击伤害。' };
    }
    const counter = battle.resolved.tacticalEncounter?.counterCharms?.[hero.school];
    if (counter !== undefined && hero.charms.includes(counter)) {
        const entry = available.filter(row => {
            const card = battle.resolved.cards[row.key];
            return isAttackCard(card) && String(card.params?.damage_school || card.spellSchool).toLowerCase() === hero.school;
        }).sort((a, b) => expectedBaseDamage(battle.resolved.cards[b.key]) - expectedBaseDamage(battle.resolved.cards[a.key]))[0];
        if (entry) return recommend(entry, '用反击', '反击加成已就位。先选标记的本系攻击牌，再点守卫出招；治疗不会消耗这次加成。');
        return { text: '反击加成已就位，但这一页没有能施放的本系攻击。可检查其他手牌，或积攒魔力后再出招。' };
    }
    if ((state.queued || []).some(intent => intent.effect === '重击' && U.isAlive(battle.unitsById[intent.caster]))) {
        return { text: '守卫正在为下一回合重击蓄力。援助护盾可留到重击当回合使用；现在可进攻或积攒魔力。' };
    }
    return null;
}
