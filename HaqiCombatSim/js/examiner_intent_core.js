// Only the examiner's fixed script is predictable. Later pool and gene picks stay hidden.
export function examinerEnemyIntentInfo(battle) {
    if (battle.finished || battle.tacticalEncounter) return null;
    const monster = battle.monsterTemplates?.find(row => row.id === 'death-scout');
    const enemy = battle.sides?.far?.find(unit => unit.template?.id === 'death-scout' && unit.hp > 0);
    if (!monster || !enemy) return null;
    const script = monster.sequences?.[0];
    const round = Number(battle.turn);
    if (!Array.isArray(script) || !Number.isInteger(round) || round < 1) return null;
    const action = script.find(row => row.round === String(round));
    if (!action) return null;
    const before = script.find(row => row.round === `${round}-`);
    if (before) return {
        cardKey: before.card,
        kind: 'heavy',
        label: '先手偷袭 · 随后布陷阱',
        nextLabel: '陷阱强化后的攻击',
        detail: '提交卡牌后，它会先出手攻击，再给下一击布下陷阱。先检查生命，也可以准备防御或恢复。',
    };
    const intents = {
        Death_DeathDamageTrap: {kind: 'charge', label: '布下陷阱 · 本回合不攻击', nextLabel: '强化攻击', detail: '陷阱会加强它的下一击。现在可以抢攻，也可以准备防御或恢复。'},
        Death_DeathDamageBlade: {kind: 'charge', label: '强化下一击 · 本回合不攻击', nextLabel: '吸血攻击', detail: '它这回合先增强伤害，下回合会攻击并吸取生命。可以趁空当出手，或留好防御。'},
        Death_SingleAttackWithLifeTap_Level2: {kind: 'heavy', label: '吸血攻击', detail: '这次攻击会让它恢复生命。留意当前生命和防御牌。'},
        Death_SingleAttack_Level3: {kind: 'heavy', label: '陷阱强化的攻击', detail: '上一回合布下的陷阱会提高这次攻击的伤害。优先检查防御和生命。'},
        Death_SingleAttack_Level0_120_adv: {kind: 'attack', label: '准备攻击', detail: '普通攻击回合。可以结合生命和手牌决定抢攻或恢复。'},
    };
    const intent = intents[action.card];
    return intent ? {cardKey: action.card, ...intent} : null;
}
