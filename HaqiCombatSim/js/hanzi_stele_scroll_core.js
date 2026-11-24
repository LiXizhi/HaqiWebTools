// Pure catalog and one-time rubbing reward rules for the 9 standalone bonus
// Hanzi animations in hanzi/ ("字源碑林传拓册"), keeping zh.json's 30-word island
// contract untouched while letting players watch, trace and earn rewards in-game.

const assert = (ok, message) => {
    if (!ok) throw new Error(message);
};

export const HANZI_STELE_SCROLLS = [
    {
        id: 'chuan',
        solvedKey: 'stele-chuan',
        glyph: '传',
        pinyin: 'chuán',
        title: '驿灯相传',
        summary: '风雪山道上一驿接一驿，把温暖的灯火传下去。',
        animation: 'hanzi/hanzi_chuan.html',
    },
    {
        id: 'jing',
        solvedKey: 'stele-jing',
        glyph: '径',
        pinyin: 'jìng',
        title: '曲径通幽',
        summary: '烟雨竹林里踩着青石寻路，拨开翠竹忽见幽亭。',
        animation: 'hanzi/hanzi_jing.html',
    },
    {
        id: 'quan',
        solvedKey: 'stele-quan',
        glyph: '泉',
        pinyin: 'quán',
        title: '石上清泉',
        summary: '明月松间叩开山岩细缝，看白水涓涓涌成清泉。',
        animation: 'hanzi/hanzi_quan.html',
    },
    {
        id: 'xi',
        solvedKey: 'stele-xi',
        glyph: '西',
        pinyin: 'xī',
        title: '倦鸟归巢',
        summary: '日落西山时，小雀顺着晚霞飞回枝头温暖的巢。',
        animation: 'hanzi/hanzi_xi.html',
    },
    {
        id: 'zhi',
        solvedKey: 'stele-zhi',
        glyph: '知',
        pinyin: 'zhī',
        title: '矢口为知',
        summary: '细察风向后引弓发矢一语中的，领悟求知之理。',
        animation: 'hanzi/hanzi_zhi.html',
    },
    {
        id: 'li',
        solvedKey: 'stele-li',
        glyph: '李',
        pinyin: 'lǐ',
        title: '桃李成蹊',
        summary: '春花如雪、夏果满枝，树下自然踏出一条小路。',
        animation: 'hanzi/hanzi_li.html',
    },
    {
        id: 'zhi-peak',
        solvedKey: 'stele-zhi-peak',
        glyph: '峙',
        pinyin: 'zhì',
        title: '双峰对峙',
        summary: '两座青峰隔海相望，稳稳立在翻涌的沧海之上。',
        animation: 'hanzi/hanzi_zhi_peak.html',
    },
    {
        id: 'sun',
        solvedKey: 'stele-sun',
        glyph: '孙',
        pinyin: 'sūn',
        title: '灯下系丝',
        summary: '暖灯下缫丝不断，一根细丝连起代代相传的牵挂。',
        animation: 'hanzi/hanzi_sun.html',
    },
    {
        id: 'wu-martial',
        solvedKey: 'stele-wu-martial',
        glyph: '武',
        pinyin: 'wǔ',
        title: '止戈守护',
        summary: '迈步巡守四方安宁，领会古人止息干戈的本意。',
        animation: 'hanzi/hanzi_wu.html',
    },
];

export function steleRubbingDone(save, steleOrId) {
    const entry = typeof steleOrId === 'string'
        ? HANZI_STELE_SCROLLS.find(s => s.id === steleOrId)
        : steleOrId;
    if (!entry) return false;
    return !!save?.islandPuzzles?.solved?.[entry.solvedKey];
}

export function steleRubbingCount(save) {
    return HANZI_STELE_SCROLLS.reduce((n, s) => n + (steleRubbingDone(save, s) ? 1 : 0), 0);
}

export function applySteleRubbing(save, content, action) {
    assert(!save.pendingEncounter, '请先完成当前战斗');
    const entry = HANZI_STELE_SCROLLS.find(s => s.id === action?.steleId);
    assert(entry, '找不到这篇碑林传拓');
    if (steleRubbingDone(save, entry)) {
        return {
            changed: false,
            alreadyDone: true,
            steleId: entry.id,
            message: `「${entry.glyph}」字碑帖已收入传拓册。`,
            rewards: [],
        };
    }
    save.islandPuzzles ??= { version: 1, solved: {} };
    save.islandPuzzles.solved[entry.solvedKey] = true;
    const totalDone = steleRubbingCount(save);
    const rewards = [];
    if (content?.items?.[100]) {
        save.inventory[100] = (save.inventory[100] || 0) + 40;
        rewards.push({ itemId: 100, count: 40, name: content.items[100].name || '奇豆' });
    }
    if (totalDone % 3 === 0 && content?.items?.[17172]) {
        save.inventory[17172] = (save.inventory[17172] || 0) + 1;
        rewards.push({ itemId: 17172, count: 1, name: content.items[17172].name || '战宠口粮' });
    }
    save.revision++;
    return {
        changed: true,
        steleId: entry.id,
        totalDone,
        message: `已完成「${entry.glyph}」字碑帖描红传拓（${totalDone}/${HANZI_STELE_SCROLLS.length}）！`,
        rewards,
    };
}
