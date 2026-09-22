// Web rule, 2026-09-23: Keepwork membership days become magic beans (item 984).
// The first grant counts Beijing calendar days from today through the expiry date.
// That baseline is stored once. Later grants start at the stored date, never today.
export const MAGIC_BEAN_ID = 984;
const DAY = 86400000;
const BEIJING = 8 * 3600000;

export function beijingYmd(ms) {
    if (!Number.isFinite(ms)) throw Error('日期无效');
    const shifted = new Date(ms + BEIJING);
    const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const day = String(shifted.getUTCDate()).padStart(2, '0');
    return `${shifted.getUTCFullYear()}-${month}-${day}`;
}
function ymdUtc(ymd) {
    if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw Error('魔豆兑换记录无效');
    const year = Number(ymd.slice(0, 4)), month = Number(ymd.slice(5, 7)), day = Number(ymd.slice(8, 10));
    const utc = Date.UTC(year, month - 1, day);
    const back = new Date(utc);
    if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) throw Error('魔豆兑换记录无效');
    return utc;
}
export function validateMagicBeanExchange(record) {
    if (record == null) return null;
    if (typeof record !== 'object' || Array.isArray(record)) throw Error('魔豆兑换记录无效');
    ymdUtc(record.exchangedUntil);
    return { exchangedUntil: record.exchangedUntil };
}
export function formatExchangeDate(ymd) {
    ymdUtc(ymd);
    return `${ymd.slice(0, 4)}年${Number(ymd.slice(5, 7))}月${Number(ymd.slice(8, 10))}日`;
}
export function magicBeanExchangeQuote(member, record, now) {
    const stored = validateMagicBeanExchange(record);
    const end = Date.parse(member?.expiresAt);
    if (member?.isVip !== true || !Number.isFinite(now) || !Number.isFinite(end) || end <= now) return { days: 0, beans: 0, until: null };
    const until = beijingYmd(end);
    const baseline = stored?.exchangedUntil || beijingYmd(now);
    const days = Math.round((ymdUtc(until) - ymdUtc(baseline)) / DAY);
    if (days <= 0) return { days: 0, beans: 0, until };
    const beans = days * 10;
    if (!Number.isSafeInteger(beans)) throw Error('魔豆数量超出上限');
    return { days, beans, until };
}
export function exchangeMagicBeans(save, content, member, record, now) {
    if (save.pendingEncounter) throw Error('请先完成当前战斗');
    const quote = magicBeanExchangeQuote(member, record, now);
    if (!quote.beans) return null;
    if (!content.items?.[MAGIC_BEAN_ID]) throw Error('魔豆尚未配置');
    const total = (save.inventory[MAGIC_BEAN_ID] || 0) + quote.beans;
    if (!Number.isSafeInteger(total)) throw Error('魔豆数量超出上限');
    save.inventory[MAGIC_BEAN_ID] = total;
    return quote;
}
export function magicBeanExchangeText(member, record, now, { inBattle = false } = {}) {
    validateMagicBeanExchange(record);
    if (member?.status === 'loading') return '正在查询会员到期日…';
    if (member?.status === 'error') return '会员状态暂时无法确认，本次不会兑换魔豆。';
    if (member?.status !== 'ready') return '登录会员后，剩余有效期会自动兑换为魔豆，每天 10 颗。同一段日期只兑换一次。';
    if (member.isVip !== true) return '开通会员后，剩余有效期会在登录时自动兑换为魔豆，每天 10 颗。';
    if (!Number.isFinite(Date.parse(member.expiresAt || ''))) return '会员有效日期待确认，暂时无法兑换魔豆。';
    const quote = magicBeanExchangeQuote(member, record, now);
    if (quote.beans) return inBattle ? `战斗结束后自动兑换 ${quote.days} 天，获得 ${quote.beans} 魔豆。` : `可兑换 ${quote.days} 天，共 ${quote.beans} 魔豆。登录后会自动放入背包。`;
    if (record?.exchangedUntil) return `会员天数已兑换至 ${formatExchangeDate(record.exchangedUntil)}。之后只兑换更晚的到期日，每天 10 魔豆。`;
    return '当前没有可兑换的会员天数。';
}
