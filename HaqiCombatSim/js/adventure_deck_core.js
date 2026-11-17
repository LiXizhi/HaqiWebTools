// adventure_deck_core.js — 玩家卡包配卡、学习技能、卡包布局与装备穿戴校验（纯核心）。
import { clampDeck } from './combat_unit_core.js';
import { equipmentRequirements } from './adventure_item_rules_core.js';
import { syncTrainingPoints, skillLearningStatus } from './adventure_learning_core.js';

const clone = value => JSON.parse(JSON.stringify(value));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const owns = (s, id) => (s.inventory[id] || 0) > 0;

export function deckLimits(save, content) {
    const bag = content.items[save.equipment[24]];
    const legacy = save.defaultPocketVersion === undefined;
    return {
        capacity: Number(bag?.stats[167] || (legacy ? 14 : 10)),
        eachCapacity: Number(bag?.stats[170] || (legacy ? 3 : 2)),
        handSize: 8,
    };
}

export function deckCardCopies(save, content, key) {
    if (!save.cards[key]) return 0;
    return content.cardLibrary ? deckLimits(save, content).eachCapacity : save.cards[key];
}

export function syncProgression(save, content) {
    save.level = Math.min(content.progression.levelCap, content.progression.xpThresholds.filter(x => save.xp >= x).length);
    syncTrainingPoints(save);
    for (const lesson of content.learn[save.school]) {
        if (lesson.level <= save.level && !save.cards[lesson.key]) save.cards[lesson.key] = lesson.copies;
    }
}

export function availableCardLessons(save, content) {
    return content.cardLibrary || content.learn[save.school].map(row => ({ ...row, school: save.school, supported: true }));
}

export function learnDeckCards(save, content, keys = []) {
    assert(Array.isArray(keys) && keys.length <= Object.keys(content.cardLibrary || {}).length, '学习卡牌列表无效');
    const lessons = new Map(availableCardLessons(save, content).map(row => [row.key, row]));
    const draft = { ...save, cards: { ...save.cards } };
    for (const key of keys) {
        const lesson = lessons.get(key);
        const status = skillLearningStatus(draft, content, lesson);
        assert(status.allowed, status.reason);
        draft.trainingPointsSpent = (draft.trainingPointsSpent || 0) + status.cost;
        draft.cards[key] = Math.max(draft.cards[key] || 0, lesson.copies);
    }
    save.cards = draft.cards;
    save.trainingPointsSpent = draft.trainingPointsSpent ?? save.trainingPointsSpent ?? 0;
}

export function recommendedDeck(save, content) {
    const lessons = content.learn[save.school].filter(x => save.cards[x.key]);
    const priority = lessons.length > 7 ? [...lessons].reverse() : [3, 5, 1, 0, 2, 4, 6].map(i => lessons[i]).filter(Boolean);
    const limits = deckLimits(save, content), result = [];
    let n = 0;
    for (const lesson of priority) {
        const count = Math.min(deckCardCopies(save, content, lesson.key), limits.eachCapacity, limits.capacity - n);
        if (count) result.push({ key: lesson.key, count });
        n += count;
    }
    return result;
}

export function validDeck(save, content, deck) {
    const limits = deckLimits(save, content);
    assert(Array.isArray(deck) && deck.length > 0, '卡包至少需要一张卡牌');
    const seen = new Set();
    let total = 0;
    for (const entry of deck) {
        assert(!seen.has(entry.key) && Number.isInteger(entry.count) && entry.count > 0, '卡牌份数无效');
        seen.add(entry.key);
        assert(!content.cardLibrary || content.cardLibrary.some(row => row.key === entry.key && row.supported !== false), '此卡牌效果暂未开放');
        assert(entry.count <= deckCardCopies(save, content, entry.key) && entry.count <= limits.eachCapacity, '超过拥有数量或单卡上限');
        total += entry.count;
    }
    assert(total <= limits.capacity, '卡包已满');
    return true;
}

export function equipmentBlockReason(save, item, content) {
    if (!item || !(item.kind === 1 || item.slot === 24) || !Number.isInteger(item.slot) || item.slot <= 0) return '这不是可穿戴的装备';
    if (!owns(save, item.id)) return '尚未获得这件装备';
    const requirements =
        item.slot === 24 && save.pendingEncounter && save.bagRulesVersion === undefined
            ? { level: Number(item.stats[138] || 1), school: Number(item.stats[137] || 0) }
            : equipmentRequirements(item);
    if (requirements.level > save.level) return `需要等级 ${requirements.level}`;
    if (requirements.school && requirements.school !== content.schools[save.school]) return '不符合学系要求';
    return '';
}

export function canEquip(save, item, content) {
    return !equipmentBlockReason(save, item, content);
}

export function syncDeckLayouts(save, content) {
    const equipped = Number(save.equipment[24]) || 0;
    const bags = Object.values(content.items).filter(item => item.slot === 24 && canEquip(save, item, content));
    const ids = [...new Set([equipped, ...bags.map(item => Number(item.id))])].filter(id => id || !equipped);
    const previous = save.deckLayouts || [], current = previous[save.activeDeckLayout || 0];
    const legacy = previous.filter(row => row.bagItemId === undefined && row !== current);
    save.deckLayouts = ids.map(bagItemId => {
        const existing = previous.find(row => row.bagItemId === bagItemId);
        const source = existing
            ? existing === current && existing.bagItemId === equipped
                ? save.deck
                : existing.deck
            : bagItemId === equipped
              ? save.deck
              : legacy.shift()?.deck || save.deck;
        const draft = { ...save, equipment: { ...save.equipment, 24: bagItemId } };
        const limits = { ...deckLimits(draft, content), version: 'kids' };
        let deck = clampDeck(
            source.map(row => ({ ...row, count: Math.min(row.count, deckCardCopies(draft, content, row.key)) })).filter(row => row.count > 0),
            limits,
        ).deck;
        if (!deck.length) deck = recommendedDeck(draft, content);
        return { bagItemId, name: content.items[bagItemId]?.name || '基础卡包', deck };
    });
    save.activeDeckLayout = save.deckLayouts.findIndex(row => row.bagItemId === equipped);
    save.deck = clone(save.deckLayouts[save.activeDeckLayout].deck);
}

export function deckLayoutCapacity(save, content) {
    return Math.max(1, Object.values(content.items).filter(item => item.slot === 24 && canEquip(save, item, content)).length);
}

export function validateDeckLayouts(save, content, layouts, active) {
    assert(Array.isArray(layouts) && layouts.length >= 1 && layouts.length <= Object.keys(content.items).length, '请保留有效卡包');
    assert(Number.isInteger(active) && active >= 0 && active < layouts.length, '请选择有效卡包');
    const seen = new Set();
    for (const row of layouts) {
        assert(row && typeof row.name === 'string' && row.name.trim().length > 0 && row.name.length <= 16, '卡包名称需为一至十六字');
        if (row.bagItemId !== undefined) {
            assert(Number.isInteger(row.bagItemId) && !seen.has(row.bagItemId), '每个卡包只能有一个实例');
            seen.add(row.bagItemId);
            assert(row.bagItemId === 0 || (content.items[row.bagItemId]?.slot === 24 && canEquip(save, content.items[row.bagItemId], content)), '卡包尚未拥有或不符合使用条件');
        }
        validDeck(row.bagItemId === undefined ? save : { ...save, equipment: { ...save.equipment, 24: row.bagItemId } }, content, row.deck);
    }
}

export function migrateDefaultPocket(save, content) {
    if (save.defaultPocketVersion === 1 || save.pendingEncounter) return;
    save.defaultPocketVersion = 1;
    syncDeckLayouts(save, content);
}

export function migrateBagRules(save, content) {
    if (save.bagRulesVersion === 1 || save.pendingEncounter) return;
    const bag = content.items[save.equipment[24]];
    if (bag && !canEquip(save, bag, content)) {
        delete save.equipment[24];
        save.tips.bagRulesAdjusted = true;
        syncDeckLayouts(save, content);
    }
    save.bagRulesVersion = 1;
}
