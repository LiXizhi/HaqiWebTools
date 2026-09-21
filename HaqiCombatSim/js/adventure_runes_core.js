import { isSupportedType } from './combat_cards_core.js';

export function runeStatus(item, content, dataset) {
    if (item?.kind !== 18 || item.subtype !== 2) return null;
    const key = content.cardItems[Number(item.id) - 1000];
    const card = dataset?.cards?.[key];
    const reason = !key ? '符文法术尚未配置'
        : key.includes('CatchPet') ? '专属抓宠符文暂未开放'
        : !card || !isSupportedType(card.type) ? '此符文效果暂未开放' : '';
    return { key, card, available: !reason, reason };
}