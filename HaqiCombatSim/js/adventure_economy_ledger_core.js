// Resource accounting follows committed mutations; existing stock is never income.
const PANTRY = ['flower', 'herb', 'stone', 'ore'];
const LIMIT = 60;
const assert = (ok, message) => { if (!ok) throw Error(message); };
const FIRST = new Set(['claim', 'quest-claim', 'forest-commission', 'forge-commission', 'opening-journey', 'trilogy-curio', 'dungeon-first', 'earth-time-claim']);
export const ECONOMY_SOURCE_LABELS = {
    adventure: '冒险活动', battle: '战斗结算', 'hunt-victory': '余烬讨伐',
    'campfire-cook': '营火烹饪', 'hunt-forge': '猎印锻造',
    'forge-commission': '修复委托', 'forge-gather': '营地草圃', 'forest-commission': '森林委托',
    'trilogy-curio': '首次探索', 'trilogy-daily': '区域日常',
    'daily-bounty': '每日悬赏', 'checkin': '签到', 'claim': '任务奖励',
    'quest-claim': '任务奖励', 'opening-journey': '新手任务',
    'dungeon-first': '副本首次奖励', 'fishing': '钓鱼', 'fishing-bounty': '钓鱼悬赏',
    'upgrade': '装备强化', 'shop-buy': '商店购买', 'buy': '商店购买',
    'daily-bounty-claim': '每日悬赏', 'npc-purchase': '商店购买',
    fish: '钓鱼', 'trilogy-buy': '区域商店', 'magic-star-claim': '阶段奖励',
    'claim-catalog': '图鉴奖励', 'earth-time-claim': '语言探索奖励',
    'ground-pickup': '拾取采集奖励', 'gather-smelt': '采集冶炼',
    gift: '伙伴赠礼', 'pet-care': '宠物照料',
};
function amounts(save) {
    const values = {};
    for (const [id, n] of Object.entries(save?.inventory || {})) if (Number.isSafeInteger(n) && n > 0) values[id] = n;
    for (const key of PANTRY) if (save?.gatherPantry?.[key] > 0) values[`pantry:${key}`] = save.gatherPantry[key];
    return values;
}
export function economySnapshot(save) {
    return { values: amounts(save), serial: save?.economyLedger?.serial || 0 };
}
export function recordEconomyChange(save, before, source = 'adventure', { firstTime = FIRST.has(source) } = {}) {
    // An inner action already accounted for this transaction (e.g. settlement).
    if (!before || (save.economyLedger?.serial || 0) !== before.serial) return false;
    const after = amounts(save), changes = [];
    for (const key of new Set([...Object.keys(before.values), ...Object.keys(after)])) {
        const delta = (after[key] || 0) - (before.values[key] || 0);
        if (delta) changes.push({ key, delta });
    }
    if (!changes.length) return false;
    const ledger = save.economyLedger ??= { version: 1, serial: 0, entries: [], totals: {} };
    const entry = { serial: ++ledger.serial, source: Object.hasOwn(ECONOMY_SOURCE_LABELS, source) ? source : 'adventure', firstTime: !!firstTime, changes };
    for (const { key, delta } of changes) {
        const total = ledger.totals[key] ??= { gained: 0, spent: 0, firstGained: 0 };
        if (delta > 0) { total.gained += delta; if (firstTime) total.firstGained += delta; }
        else total.spent -= delta;
    }
    ledger.entries.push(entry);
    if (ledger.entries.length > LIMIT) ledger.entries.splice(0, ledger.entries.length - LIMIT);
    return true;
}
export function economyResourceName(key, content) {
    return ({ 'pantry:flower': '花朵', 'pantry:herb': '草药', 'pantry:stone': '石块', 'pantry:ore': '矿石' })[key] || content?.items?.[key]?.name || (key === '100' ? '奇豆' : key);
}
export function validateEconomyLedger(save, content) {
    const ledger = save.economyLedger;
    if (ledger === undefined) return;
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const validKey = key => PANTRY.some(p => key === `pantry:${p}`) || (/^[1-9]\d*$/.test(key) && (key === '100' || !!content.items[key]));
    const nat = n => Number.isSafeInteger(n) && n >= 0;
    assert(object(ledger) && ledger.version === 1 && nat(ledger.serial) && Array.isArray(ledger.entries) && ledger.entries.length <= LIMIT && object(ledger.totals), '资源账本无效');
    for (const [key, total] of Object.entries(ledger.totals)) {
        assert(validKey(key) && object(total) && nat(total.gained) && nat(total.spent) && nat(total.firstGained) && total.firstGained <= total.gained, '资源账本汇总无效');
    }
    assert(ledger.entries.length === Math.min(LIMIT, ledger.serial), '资源流水记录不完整');
    let previous = ledger.serial - ledger.entries.length;
    const recent = {};
    for (const entry of ledger.entries) {
        assert(object(entry) && entry.serial === previous + 1 && Object.hasOwn(ECONOMY_SOURCE_LABELS, entry.source) && typeof entry.firstTime === 'boolean' && Array.isArray(entry.changes) && entry.changes.length > 0, '资源流水无效');
        previous = entry.serial;
        const seen = new Set();
        for (const row of entry.changes) {
            assert(object(row) && validKey(row.key) && !seen.has(row.key) && Number.isSafeInteger(row.delta) && row.delta !== 0 && Object.hasOwn(ledger.totals, row.key), '资源流水数量无效');
            seen.add(row.key);
            const sum = recent[row.key] ??= { gained: 0, spent: 0, firstGained: 0 };
            if (row.delta > 0) { sum.gained += row.delta; if (entry.firstTime) sum.firstGained += row.delta; }
            else sum.spent -= row.delta;
        }
    }
    for (const [key, total] of Object.entries(ledger.totals)) {
        const sum = recent[key] || { gained: 0, spent: 0, firstGained: 0 };
        for (const field of ['gained', 'spent', 'firstGained']) {
            assert(ledger.serial <= LIMIT ? total[field] === sum[field] : total[field] >= sum[field], '资源账本与流水不一致');
        }
    }
}
