// Chinese source strings are the dictionary keys. zh-CN has no file.

export const LOCALES = [
    { id: 'zh-CN', name: '中文', englishName: 'Chinese', speech: 'zh-CN' },
    { id: 'en', name: 'English', englishName: 'English', speech: 'en-US' },
    { id: 'ja', name: '日本語', englishName: 'Japanese', speech: 'ja-JP' },
    { id: 'ko', name: '한국어', englishName: 'Korean', speech: 'ko-KR' },
];

const IDS = new Set(LOCALES.map(row => row.id));

export function localeById(id) {
    return LOCALES.find(row => row.id === id) || LOCALES[0];
}

export function speechCode(id) {
    return localeById(id).speech;
}

export function lookup(sourceZh, locale, dictionaries = {}) {
    const source = String(sourceZh ?? '');
    if (!source || locale === 'zh-CN' || !IDS.has(locale)) return source;
    const table = dictionaries[locale];
    if (!table || !Object.hasOwn(table, source)) return source;
    const value = table[source];
    return typeof value === 'string' && value ? value : source;
}

export function pairAllowed(native, target) {
    return IDS.has(native) && IDS.has(target) && native !== target;
}

// The longest run of "|" on the line is the separator. A tie is skipped.
export function splitLocaleLine(line) {
    const runs = [...String(line).matchAll(/\|+/g)];
    if (!runs.length) return null;
    const longest = Math.max(...runs.map(run => run[0].length));
    const winners = runs.filter(run => run[0].length === longest);
    if (winners.length !== 1) return null;
    const at = winners[0].index;
    const key = line.slice(0, at);
    const value = line.slice(at + longest);
    if (!key || !value) return null;
    return { key, value };
}

export function parseLocaleFile(text) {
    const table = {};
    for (const raw of String(text || '').split(/\r?\n/)) {
        if (!raw.trim()) continue;
        const pair = splitLocaleLine(raw);
        if (!pair || Object.hasOwn(table, pair.key)) continue;
        table[pair.key] = pair.value;
    }
    return table;
}

export function diffLocaleLines(baseText, otherText) {
    const base = parseLocaleFile(baseText);
    const other = parseLocaleFile(otherText);
    const missing = Object.keys(base).filter(key => !Object.hasOwn(other, key));
    const extra = Object.keys(other).filter(key => !Object.hasOwn(base, key));
    return { missing, extra };
}

export function normalizeLocaleSave(save) {
    if (!IDS.has(save.locale)) save.locale = 'zh-CN';
    const learning = save.languageLearning && typeof save.languageLearning === 'object' ? save.languageLearning : {};
    const native = IDS.has(learning.native) ? learning.native : 'zh-CN';
    let target = IDS.has(learning.target) ? learning.target : 'en';
    if (native === target) target = native === 'en' ? 'ja' : 'en';
    save.languageLearning = { enabled: learning.enabled === true, native, target };
    if (typeof save.learnerMemory !== 'string') save.learnerMemory = '';
    return save;
}
