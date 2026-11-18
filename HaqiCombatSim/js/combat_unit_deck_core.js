// combat_unit_deck_core.js — 战斗单位卡组、手牌、弃牌与冷却状态操作。
import { prepareWordHand } from './word_cards_core.js';

export const PET_CARD_SEQ_BASE = 10000;

/**
 * 纯函数：按容量裁剪 [{key,count}]。
 * @param opts { capacity, eachCapacity, cards?: resolved.cards（teen 同名共享用）, version }
 * @return { deck: [{key,count}], trimmed: number（被裁掉的张数）, total }
 */
export function clampDeck(deck, opts = {}) {
    const capacity = opts.capacity || 0;
    const each = opts.eachCapacity || 0;
    const cards = opts.cards || {};
    const teen = opts.version === 'teen';
    const out = [];
    const byName = {};
    let total = 0, trimmed = 0;
    for (const { key, count } of deck) {
        let n = Math.max(0, count | 0);
        if (each > 0) {
            const card = cards[key];
            const groupKey = teen && card && card.spellName ? card.spellName : key;
            const used = byName[groupKey] || 0;
            const allow = Math.max(0, each - used);
            if (n > allow) { trimmed += n - allow; n = allow; }
            byName[groupKey] = used + n;
        }
        if (capacity > 0 && total + n > capacity) { trimmed += total + n - capacity; n = Math.max(0, capacity - total); }
        if (n > 0) {
            const prev = out.find(e => e.key === key);
            if (prev) prev.count += n; else out.push({ key, count: n });
            total += n;
        }
    }
    return { deck: out, trimmed, total };
}

export function setDeck(unit, deck, resolved) {
    const norm = [];
    for (const entry of deck) {
        if (typeof entry === 'string') norm.push({ key: entry, count: 1 });
        else if (entry && entry.key) norm.push({ key: entry.key, count: entry.count || 1 });
    }
    const { deck: clamped, trimmed } = clampDeck(norm, {
        capacity: unit.deckCapacity || 0,
        eachCapacity: unit.deckEachCapacity || 0,
        cards: resolved ? resolved.cards : null,
        version: resolved ? resolved.version : 'kids',
    });
    unit.deckSpec = clamped;
    unit.deckTrimmed = trimmed;
}

export function deckSize(unit) {
    return unit.deckSpec.reduce((a, e) => a + e.count, 0);
}

export function shuffleDeck(unit, rng) {
    const singles = [];
    for (const { key, count } of unit.deckSpec) {
        for (let i = 0; i < count; i++) singles.push({ key, weight: rng.int(1, 999999) });
    }
    singles.sort((a, b) => b.weight - a.weight);
    unit.deckSeq = singles.map(s => s.key);
    unit.deckMap = singles.map(() => 0);
}

/** 补牌到 handSize（默认 8） */
export function prepareCard(unit, handSize = 8) {
    if (unit.wordCards) return prepareWordHand(unit, handSize);
    let inHand = 0;
    for (let i = 0; i < unit.deckMap.length; i++) {
        const st = unit.deckMap[i];
        if (st === 1) inHand++;
        else if (st === 0 && inHand < handSize) { unit.deckMap[i] = 1; inHand++; }
        if (inHand >= handSize) break;
    }
}

export function cardsInHand(unit) {
    const out = [];
    for (let i = 0; i < unit.deckMap.length; i++) {
        if (unit.deckMap[i] === 1) out.push({ seq: i, key: unit.deckSeq[i] });
    }
    return out;
}

export function preparePetCards(unit, deck, rng) {
    const singles = [];
    for (const { key, count } of deck) for (let i = 0; i < count; i++) singles.push({ key, weight: rng.int(1, 999999) });
    singles.sort((a, b) => b.weight - a.weight);
    unit.petDeckSeq = singles.map(row => row.key);
    unit.petDeckMap = singles.map(() => 1);
}

export function petCardsInHand(unit) {
    return (unit.petDeckSeq || []).flatMap((key, i) => unit.petDeckMap[i] === 1 ? [{ seq: PET_CARD_SEQ_BASE + i, key }] : []);
}

export function selectableCards(unit) { return [...cardsInHand(unit), ...petCardsInHand(unit)]; }

export function deckRemaining(unit) {
    return unit.deckMap.filter(s => s === 0 || s === 1 || s === -1).length;
}

/**
 * player_server.lua L855-884 GetDeckRemainingAndTotalCount 的细分版：
 * remaining = 手牌 + 待弃 + 未抽；total 不含失误补入的 -3 占位。
 */
export function deckCounts(unit) {
    const c = { inHand: 0, discarding: 0, unused: 0, used: 0, fizzled: 0, remaining: 0, total: 0 };
    for (const st of unit.deckMap) {
        if (st === 1) c.inHand++;
        else if (st === -1) c.discarding++;
        else if (st === 0) c.unused++;
        else if (st === -2) c.used++;
        else if (st === -3) { c.fizzled++; continue; }
        c.total++;
    }
    c.remaining = c.inHand + c.discarding + c.unused;
    return c;
}

/** 卡包耗尽：没有手牌也没有可抽的牌 */
export function isDeckExhausted(unit) {
    return deckRemaining(unit) === 0;
}

/** player_server.lua L914-930 RestoreDiscardedCard：撤销弃牌标记 */
export function restoreDiscardedCard(unit, seq) {
    if (unit.deckMap[seq] === -1) unit.deckMap[seq] = 1;
}

export function markCardUsed(unit, seq) {
    if (seq >= PET_CARD_SEQ_BASE) {
        const i = seq - PET_CARD_SEQ_BASE;
        if (unit.petDeckMap?.[i] === 1) unit.petDeckMap[i] = -1;
        return;
    }
    if (unit.deckMap[seq] === 1) unit.deckMap[seq] = -2;
}

/** 失误：Lua 标记 -3 并把同卡追加到卡尾（可再抽到） */
export function markCardFizzled(unit, seq) {
    if (unit.wordCards?.[seq]) { markCardUsed(unit, seq); return; }
    if (seq >= PET_CARD_SEQ_BASE) return;
    if (unit.deckMap[seq] === 1) {
        unit.deckMap[seq] = -3;
        unit.deckSeq.push(unit.deckSeq[seq]);
        unit.deckMap.push(0);
    }
}

export function discardCard(unit, seq) {
    if (unit.deckMap[seq] === 1) unit.deckMap[seq] = -1;
}

/** player_server.lua L1962+ ValidateDiscardedCards：弃牌变为已用 */
export function validateDiscardedCards(unit) {
    for (let i = 0; i < unit.deckMap.length; i++) if (unit.deckMap[i] === -1) unit.deckMap[i] = -2;
}

export function setCooldown(unit, spellName, rounds) {
    if (rounds > 0) unit.cooldowns[spellName] = rounds;
}

/** player_server.lua L1952-1959 ValidateCoolDown */
export function validateCooldown(unit) {
    for (const k of Object.keys(unit.cooldowns)) if (unit.cooldowns[k] > 0) unit.cooldowns[k] -= 1;
}
