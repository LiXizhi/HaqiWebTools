// Adventure language-learning rules. No DOM, network, or combat formulas.

export const WEAKEN_AT = 50;
export const WIN_AT = 100;
const MIN_TEST_MS = 10_000;
const MAX_TEST_MS = 300_000;

export const BATTLE_GOALS = [
    { id: 'happy', goal: '让这只宠物开心', hints: ['夸它可爱', '说你喜欢它', '请它一起玩'] },
    { id: 'sky', goal: '解释天空为什么是蓝色的', hints: ['说到阳光', '说到空气', '说到蓝光'] },
    { id: 'story', goal: '给它讲一个很短的故事', hints: ['有一个开始', '有一个朋友', '有一个结尾'] },
];

export function testDurationMs(price, prices) {
    const values = [...(Array.isArray(prices) ? prices : []), price].filter(n => Number.isFinite(n) && n >= 0);
    if (!values.length || !Number.isFinite(price)) return MIN_TEST_MS;
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max === min) return MIN_TEST_MS;
    const t = Math.min(1, Math.max(0, (price - min) / (max - min)));
    return Math.round(MIN_TEST_MS + t * (MAX_TEST_MS - MIN_TEST_MS));
}

export function shopPrices(content, productPrice) {
    const prices = [];
    for (const item of content?.shop || []) {
        const cost = productPrice(item, content);
        if (Number.isFinite(cost)) prices.push(cost);
    }
    const exchanges = content?.npcCatalog?.exchanges || {};
    for (const exchange of Object.values(exchanges)) {
        for (const cost of exchange?.costs || []) {
            if (cost?.id === 100 && Number.isFinite(cost.count)) prices.push(cost.count);
        }
    }
    return prices;
}

export function battleGoal(seed = 0) {
    const index = Math.abs(Number(seed) || 0) % BATTLE_GOALS.length;
    return BATTLE_GOALS[index];
}

export function speechGain({ sentences = 0, relevant = 0 } = {}) {
    const spoken = Math.max(0, Number(sentences) || 0);
    const matched = Math.max(0, Number(relevant) || 0);
    return Math.min(100, spoken * 8 + matched * 12);
}

export function speechOutcome(progress) {
    const value = Math.max(0, Math.min(100, Number(progress) || 0));
    return { progress: value, weaken: value >= WEAKEN_AT, win: value >= WIN_AT };
}

export function countSentences(text) {
    const parts = String(text || '').split(/[.!?。！？]+/).map(part => part.trim()).filter(Boolean);
    return parts.length;
}

const MEMORY_FIELDS = ['nativeLanguage', 'targetLanguage', 'level', 'strengths', 'recentMistakes', 'topics', 'updatedAt'];

export function emptyMemory(native = 'zh-CN', target = 'en') {
    return { nativeLanguage: native, targetLanguage: target, level: 0, strengths: [], recentMistakes: [], topics: [], updatedAt: '', notes: '', extra: {} };
}

export function parseMemory(text, native = 'zh-CN', target = 'en') {
    const profile = emptyMemory(native, target);
    const raw = String(text || '');
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) {
        profile.notes = raw.trim();
        return profile;
    }
    for (const line of match[1].split(/\r?\n/)) {
        const index = line.indexOf(':');
        if (index <= 0) continue;
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim();
        if (key === 'level') profile.level = Math.max(0, Math.min(100, Number(value) || 0));
        else if (key === 'strengths' || key === 'recentMistakes' || key === 'topics') profile[key] = value ? value.split(',').map(item => item.trim()).filter(Boolean) : [];
        else if (key === 'nativeLanguage' || key === 'targetLanguage' || key === 'updatedAt') profile[key] = value;
        else profile.extra[key] = value;
    }
    profile.notes = match[2].trim();
    return profile;
}

function list(values) {
    return (Array.isArray(values) ? values : []).join(', ');
}

export function serializeMemory(profile) {
    const source = { ...emptyMemory(), ...profile, extra: profile?.extra || {} };
    const lines = [
        `nativeLanguage: ${source.nativeLanguage}`,
        `targetLanguage: ${source.targetLanguage}`,
        `level: ${Math.max(0, Math.min(100, Number(source.level) || 0))}`,
        `strengths: ${list(source.strengths)}`,
        `recentMistakes: ${list(source.recentMistakes)}`,
        `topics: ${list(source.topics)}`,
        `updatedAt: ${source.updatedAt || ''}`,
    ];
    for (const [key, value] of Object.entries(source.extra)) {
        if (!MEMORY_FIELDS.includes(key) && value !== undefined && value !== null) lines.push(`${key}: ${value}`);
    }
    return `---\n${lines.join('\n')}\n---\n${String(source.notes || '').trim()}\n`;
}
