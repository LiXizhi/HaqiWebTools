import {isSupportedType} from './combat_cards_core.js';

// Explicit Web substitutions; never mutate the original monster/card catalogues.
export function replaceMonsterCards(source, replacements, cards) {
    const monster = structuredClone(source), applied = new Map(), targets = new Map();
    function replace(key) {
        const row = replacements.cards[key];
        if (!row) return key;
        const card = cards[row.key];
        if (!card || !isSupportedType(card.type)) throw Error('怪物替代卡牌未支持：' + row.key);
        applied.set(key, {original:key, replacement:row.key, reason:row.reason});
        return row.key;
    }
    for (const row of monster.pool) row.key = replace(row.key);
    for (const row of monster.sequences.flat()) if (row.card) row.card = replace(row.card);
    for (const row of monster.genes) if (row.card) row.card = replace(row.card);
    for (const row of Object.values(monster.cardsets).flat()) row.key = replace(row.key);
    for (const row of [...monster.sequences.flat(), ...monster.genes]) {
        for (const field of ['target_hostile', 'target_friendly']) {
            const original = row[field], replacement = replacements.targets?.[original];
            if (!replacement) continue;
            row[field] = replacement.target;
            targets.set(`${field}:${original}`, {field, original, replacement:replacement.target, reason:replacement.reason});
        }
    }
    if (applied.size || targets.size) {
        // Dungeon loading shares content.monsters: keep adapted templates separate
        // so loading an original dungeon cannot overwrite an island opponent.
        monster.id = 'island-monster:' + source.id;
        if (applied.size) monster.cardReplacements = [...applied.values()];
        if (targets.size) monster.targetReplacements = [...targets.values()];
    }
    return monster;
}
