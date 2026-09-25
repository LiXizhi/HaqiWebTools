import {monsterBlockReasons} from './adventure_dungeons_core.js';
import {isSupportedType} from './combat_cards_core.js';

// Original arena formations retain template order, duplicate mobs and empty slots.
// Legacy solo IDs remain readable only for pre-restoration checkpoints.
export function installIslandEncounters(content, dataset, catalog, cards, names = {}) {
    if (catalog?.version !== 1) throw Error('岛屿怪物数据版本无效');
    for (const monster of Object.values(catalog.monsters)) {
        content.monsters[monster.id] = structuredClone(monster);
        const keys = [...monster.pool.map(r => r.key), ...monster.sequences.flat().map(r => r.card),
            ...monster.genes.map(r => r.card), ...Object.values(monster.cardsets).flat().map(r => r.key)];
        for (const key of keys) if (cards[key] && isSupportedType(cards[key].type)) {
            dataset.cards[key] ??= {...cards[key], name: names[key] || key};
        }
    }
    for (const encounter of catalog.encounters) {
        const blocked = [...new Set((encounter.monsterIds || [encounter.monsterId]).flatMap(id => monsterBlockReasons(content.monsters[id], cards)))];
        const a = encounter.arenaAttributes || {};
        if (a.ai_module === 'Deck_Attacker') blocked.push('法阵脚本尚未迁移');
        if (['true','1'].includes(a.is_always_mob_first)) blocked.push('怪物先手尚未迁移');
        if (['true','1'].includes(a.is_postlog_usecard)) blocked.push('场景施法脚本尚未迁移');
        if (encounter.monsterSlots?.some(slot => slot > 3)) blocked.push('超过四个怪物卡位');
        const row = {...encounter, blocked};
        const index = content.encounters.findIndex(e => e.id === row.id);
        if (index < 0) content.encounters.push(row);
        else content.encounters[index] = row;
    }
}

export function catalogGoalEncounter(content, goal, zone, region, includeBlocked = false) {
    const ids = goal.kind === 'kill' ? [goal.id] : goal.producers || [];
    return content.encounters.filter(e => !e.legacyOnly && (includeBlocked || !e.blocked?.length) && (e.monsterIds || [e.monsterId]).some(id =>
        ids.includes(content.catalogQuests.paths[String(content.monsters[id]?.source || '').toLowerCase()])))
        .sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))[0];
    function rank(e) { return e.zone === zone ? 0 : e.zone === region ? 1 : e.zone.startsWith('dungeon:') ? 3 : 2; }
}
