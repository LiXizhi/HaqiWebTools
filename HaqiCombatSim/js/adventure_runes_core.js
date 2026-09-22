import { isSupportedType } from './combat_cards_core.js';

// Kids catch chance: player_server.lua TryCatchPet L1081-1107.
// chance = base_weight * (1 - hp / maxHp) + (playerLevel - mobLevel) / 80
// A mob catch_pet_force_chance_percent replaces that result with percent * 10.
export function isCatchRuneCard(card) {
    return card?.type === 'CatchPet' && Number.isFinite(Number(card.params?.base_weight));
}
export function catchChanceMilli(baseWeight, currentHp, maxHp, playerLevel, mobLevel, forcePercent = null) {
    let milli = (Number(baseWeight) * (1 - currentHp / maxHp) + (playerLevel - mobLevel) / 80) * 1000;
    if (forcePercent !== null && forcePercent !== undefined && forcePercent !== '') milli = Number(forcePercent) * 10;
    return milli;
}
export function runeCardKey(content, itemId) {
    const id = Number(itemId);
    return content.cardItems[id] || content.cardItems[id - 1000] || '';
}
export function installRuneCatalog(content, catalog) {
    if (catalog?.version !== 1 || !Array.isArray(catalog.runes) || catalog.runes.length !== catalog.listed) throw Error('符文目录无效');
    content.runeCatalog = catalog;
    for (const [id, item] of Object.entries(catalog.items || {})) {
        content.items[id] ??= { ...item, slot: 0 };
        const row = catalog.runes.find(rune => rune.gsid === Number(id));
        if (!row?.key) continue;
        if (content.cardItems[id] && content.cardItems[id] !== row.key) throw Error('符文法术映射冲突');
        content.cardItems[id] ??= row.key;
        const spellId = Number(id) - 1000;
        if (!content.cardItems[spellId]) content.cardItems[spellId] = row.key;
    }
}
export function runeObtainLines(content, itemId) {
    const row = content.runeCatalog?.runes.find(rune => rune.gsid === Number(itemId));
    if (!row) return [];
    return row.sources.map(source => {
        if (source.kind === 'shop') return source.live ? `${source.zoneName}·${source.npcName}，${source.price}` : `${source.zoneName}·${source.npcName}，原服兑换未开放`;
        if (source.kind === 'quest') {
            const reward = `原版任务《${source.title}》奖励${source.count}张`;
            if (source.playable) return `任务《${source.title}》奖励${source.count}张`;
            return source.chapter ? `${reward}，当前教学任务不发放` : `${reward}，任务尚未开放`;
        }
        const chance = Number.isInteger(source.chance) ? source.chance : String(source.chance);
        return `原版掉落：${source.name}（${chance}%），当前战斗不掉落`;
    });
}
export function runeStatus(item, content, dataset) {
    if (item?.kind !== 18 || item.subtype !== 2) return null;
    const key = runeCardKey(content, item.id);
    const card = dataset?.cards?.[key];
    if (key?.includes('CatchPet')) {
        const available = isCatchRuneCard(card);
        return { key, card, available, catch: available, reason: available ? '' : '专属抓宠符文尚未配置' };
    }
    const reason = !key ? '符文法术尚未配置' : !card || !isSupportedType(card.type) ? '此符文效果暂未开放' : '';
    return { key, card, available: !reason, reason };
}
