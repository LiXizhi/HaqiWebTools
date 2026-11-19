function protectionFor(event, heroId) {
    if (event.consumed.some(e => e.target === heroId && e.kind === 'ward' && e.boost < 0)) return '护盾';
    if (event.consumed.some(e => e.target === event.caster && e.kind === 'charm' && e.boost < 0)) return '虚弱';
    return '';
}

function creditedProtection(battle, hit, hero, recipient = hero) {
    const name = protectionFor(hit, recipient.id);
    const shield = name === '护盾';
    const status = hit.consumed.find(e => e.boost < 0 && (shield
        ? e.kind === 'ward' && e.target === recipient.id : e.kind === 'charm' && e.target === hit.caster));
    const limit = battle.events.findIndex(e => e.type === 'tactic_resolution' && e.turn === hit.turn && e.caster === hit.caster);
    const prior = limit < 0 ? battle.events.filter(e => e.turn <= hit.turn) : battle.events.slice(0, limit);
    const sources = new Set();
    for (const event of prior) {
        if (event.target !== status.target || status.id == null) continue;
        if (shield && event.type === 'tactic_clue_ward' && event.id === status.id) sources.add('口令获得的');
        if (event.type !== status.kind || !(event.ids || [event.id]).some(id => Number(id) === status.id)) continue;
        const caster = battle.unitsById[event.caster];
        if (caster) sources.add(caster.id === hero.id ? '你施加的' : caster.name + '施加的');
    }
    return (sources.size === 1 ? [...sources][0] : '') + name;
}

function attackHighlight(battle, hero, cardCatalog) {
    const opponents = new Set(battle.sides.far.map(unit => unit.id));
    const hit = battle.events.findLast(event => event.caster === hero.id && opponents.has(event.target) &&
        event.amount > 0 && (event.type === 'damage' || event.type === 'dot'));
    if (!hit) return '';
    const spell = hit.label === 'reflection' ? '反弹' : cardCatalog[hit.card]?.name || battle.resolved.cards[hit.card]?.name || '攻击';
    const target = battle.unitsById[hit.target]?.name || '敌人';
    const damage = hit.type === 'dot' ? '持续伤害' : '伤害';
    return `第 ${hit.turn} 回合，你的${spell}对${target}造成了 ${hit.amount} 点${damage}。`;
}

// Use the actual hand at the skipped decision. The hand shown after combat can differ.
function missedFatalDefense(battle, hero, hit, cardCatalog) {
    if (hit?.type !== 'damage' || hit.label === 'reflection') return null;
    const threat = battle.tacticalEncounter.history.find(event => event.turn === hit.turn &&
        event.caster === hit.caster && event.key === hit.card && event.outcome === 'resolved' &&
        ['重击', '群攻'].includes(event.effect) && event.damage.some(d => d.target === hero.id && d.amount === hit.amount));
    if (!threat || protectionFor(threat, hero.id)) return null;
    const decision = battle.events.find(event => event.turn === hit.turn && event.type === 'tactic_resources' && event.caster === hero.id);
    if (!decision?.pass || battle.events.indexOf(decision) >= battle.events.indexOf(hit)) return null;
    const playable = decision.hand.find(row => row.castable && ['Ice_GlobalShield', 'Death_AreaDamageWeakness'].includes(row.key));
    if (!playable) return null;
    const target = battle.unitsById[hit.caster]?.name || '敌人';
    const card = cardCatalog[playable.key]?.name || battle.resolved.cards[playable.key]?.name;
    const action = playable.key === 'Ice_GlobalShield' ? '给自己上盾' : '削弱' + target;
    return [`第 ${hit.turn} 回合，你跳过后，${target}的${threat.effect}对你造成 ${hit.amount} 点伤害。`,
        `当时手里的「${card}」可以施放。下次看到这次预告时，可以用它${action}。`];
}

export function tacticalReview(battle, cardCatalog = {}) {
    const hero = battle.sides.near[0];
    const hits = battle.tacticalEncounter.history.filter(e => e.outcome === 'resolved' && e.damage.some(d => d.target === hero.id && d.amount > 0));
    const largest = hits.reduce((best, e) => {
        const amount = e.damage.filter(d => d.target === hero.id).reduce((total, d) => total + d.amount, 0);
        return amount > (best?.amount || 0) ? { event: e, amount } : best;
    }, null);
    const defense = hits.find(e => protectionFor(e, hero.id));
    let victorySummary = '';
    if (battle.winner === 'near') {
        const breakEvent = battle.events.find(e => e.type === 'tactic_shield_break' && e.segment === 'immediate' &&
            e.caster === hero.id && Number(battle.resolved.cards[e.key]?.pipcost) <= 1);
        const lines = [];
        if (breakEvent) {
            const spell = cardCatalog[breakEvent.key]?.name || battle.resolved.cards[breakEvent.key]?.name || '小攻击';
            lines.push('第 ' + breakEvent.turn + ' 回合，你用' + spell + '击破了' + (battle.unitsById[breakEvent.targetId]?.name || '敌人') + '的护盾。');
        }
        if (defense) lines.push('第 ' + defense.turn + ' 回合，' + creditedProtection(battle, defense, hero) + '削弱了打向你的' + defense.effect + '。');
        for (const ally of battle.sides.near.slice(1)) {
            const save = battle.tacticalEncounter.history.find(hit => hit.outcome === 'resolved' &&
                hit.damage.some(d => d.target === ally.id && d.amount > 0) &&
                protectionFor(hit, ally.id) === '护盾' && creditedProtection(battle, hit, hero, ally) === '你施加的护盾');
            if (save) lines.push(`第 ${save.turn} 回合，你给${ally.name}的护盾挡下了部分${save.effect}伤害。`);
        }
        const closeWin = hero.hp > 0 && hero.hp <= hero.maxHp * 0.2;
        const highlight = attackHighlight(battle, hero, cardCatalog);
        victorySummary = `用了 ${battle.completedDecisions} 回合拿下挑战。`;
        if (closeWin) victorySummary = `以 ${hero.hp} 点剩余生命拿下挑战。`;
        if (lines.length) {
            if (highlight) lines.push(victorySummary + highlight);
            return lines;
        }
        if (!closeWin || !largest) return [victorySummary, highlight].filter(Boolean);
    }
    const lastHit = hero.hp <= 0 && battle.events.findLast(e => e.target === hero.id && e.amount > 0 && (e.type === 'damage' || e.type === 'dot'));
    if (battle.winner !== 'near' && lastHit?.type === 'dot') return ['最后 ' + lastHit.amount + ' 点来自' + (cardCatalog[lastHit.card]?.name || '先前法术') + '的持续伤害。',
        '敌人收势时灼伤仍会结算。下次可在施法前给敌人上虚弱，或给自己留盾抵挡下一段。'];
    const missedDefense = battle.winner !== 'near' && missedFatalDefense(battle, hero, lastHit, cardCatalog);
    if (missedDefense) return missedDefense;
    const attackIntoShield = battle.events.findLast(e => e.type === 'tactic_shield_break' && (!e.segment || e.segment === 'immediate') &&
        e.caster === hero.id && Number(battle.resolved.cards[e.key]?.pipcost) >= 2);
    if (attackIntoShield && battle.winner !== 'near') return ['第 ' + attackIntoShield.turn + ' 回合，你用' + (cardCatalog[attackIntoShield.key]?.name || '高费攻击') + '打在了敌方护盾上。', '下次可以用小攻击开盾，把强化和重击留给盾破后的目标。'];
    const scarce = battle.events.findLast(e => e.type === 'tactic_resources' && e.caster === hero.id && e.pass &&
        e.hand.some(h => h.attack && !h.affordable) && !e.hand.some(h => h.attack && h.castable));
    if (scarce && battle.winner !== 'near') return ['第 ' + scarce.turn + ' 回合，你选择了跳过。当时手里的攻击都无法施放，至少一张需要更多魔力。', '下次可以保留一次零费进攻，或提前把魔力留给重击。'];
    if (largest) {
        const { event, amount } = largest;
        const protectedHit = protectionFor(event, hero.id);
        const lingering = (event.effects?.dot || []).some(amount => Number(amount) > 0);
        const timing = '下次到第 ' + event.turn + ' 回合选牌时，先核对重击预告；';
        const response = lingering
            ? '有可用虚弱时先给施法者上虚弱，降低这次施法及后续灼伤；已经中的灼伤仍会在收势回合结算，可留治疗续航，护盾只抵挡后续一次伤害。'
            : '有可用护盾时给自己上盾，或给预告中的施法者上虚弱，再按下一回合预告决定是否进攻。';
        return [victorySummary + '第 ' + event.turn + ' 回合，' + (battle.unitsById[event.caster]?.name || '敌人') + '的' + event.effect + '对你造成 ' + amount + ' 点伤害。',
            (protectedHit ? '这一击已经触发减伤。' : '这次命中时没有触发护盾或虚弱。') + timing + response +
            '若当前配卡没有这些牌，可在战前换用守势配卡。'];
    }
    return ['这次坚持了 ' + battle.completedDecisions + ' 回合。',
        battle.tacticsField.id === 'elite' ? '再试一种顺序，先压守护位，或先消耗主攻位的护盾。' : '看到蓄力后，可以提前布置强化抢攻，也可以保留护盾。'];
}

