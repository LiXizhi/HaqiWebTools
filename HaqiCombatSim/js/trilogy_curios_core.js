// Pure rules for Lv.60-80 Trilogy Islands (Tide / Float / Sail) exploration curios,
// daily island activities, and local thematic supply stalls.

import { createRng, hashSeed } from './rng_core.js';
import { recordGatherPantry } from './campfire_cooking_core.js';

const assert = (ok, message) => {
    if (!ok) throw new Error(message);
};

export const TRILOGY_ISLAND_IDS = ['tide', 'float', 'sail'];

export function localDayKey(now = Date.now()) {
    const d = new Date(Number.isFinite(now) ? now : Date.now());
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export const TRILOGY_ISLANDS = {
    tide: {
        id: 'tide',
        name: '潮汐岛',
        stallName: '阿澜的海风货栈',
        hostNpcIds: [860000, 860001],
        activityTitle: '趁退潮拾贝',
        activitySummary: '每日最多 2 次：在浅滩搜寻潮汐贝壳与漂流补给，带回奇豆、渔获与野外食材。',
        dailyLimit: 2,
        curios: [
            {
                id: 'tide:bottle',
                landmark: '月潮码头',
                title: '潮汐漂流瓶',
                story: '退潮露出的礁石缝里卡着一只蜡封旧玻璃瓶，里面卷着半张写满潮位刻度的渔船日志。',
                rewards: [{ id: 100, count: 75 }, { id: 17213, count: 2 }, { id: 17346, count: 1 }],
                pantry: { herb: 2 },
            },
            {
                id: 'tide:anchor',
                landmark: '旧船坞',
                title: '珊瑚旧铁锚',
                story: '船坞浅水下的铁锚长满发光海藻，轻拂泥沙后露出一小袋保存完好的深海渔网线。',
                rewards: [{ id: 100, count: 80 }, { id: 17213, count: 2 }, { id: 17172, count: 2 }],
                pantry: { stone: 2 },
            },
            {
                id: 'tide:shellbox',
                landmark: '长明灯塔',
                title: '灯塔贝壳匣',
                story: '灯塔石阶背风处嵌着一只贝壳小匣，记载着历代守灯人在风浪夜里互相照应的暗号。',
                rewards: [{ id: 100, count: 95 }, { id: 17487, count: 1 }],
                pantry: { flower: 2 },
            },
        ],
        offers: [
            { id: 'tide:crown-net', name: '皇冠鱼专用网 ×1', itemId: 17348, count: 1, costBeans: 120, costFairy: 0 },
            { id: 'tide:large-net', name: '特大捕鱼网 ×2', itemId: 17346, count: 2, costBeans: 90, costFairy: 0 },
            { id: 'tide:pet-food', name: '宠物营养餐 ×4', itemId: 17172, count: 4, costBeans: 70, costFairy: 0 },
            { id: 'tide:gem-lv2', name: '2 级灵石补给 ×1', itemId: 26007, count: 1, costBeans: 180, costFairy: 1 },
        ],
    },
    float: {
        id: 'float',
        name: '浮岸岛',
        stallName: '高桥集市双图工坊',
        hostNpcIds: [860100, 860103],
        activityTitle: '比对新旧海图',
        activitySummary: '每日最多 2 次：对照旧测绘稿与新航图标记暗礁，赢取奇豆、仙豆与原矿砾石。',
        dailyLimit: 2,
        curios: [
            {
                id: 'float:well-mark',
                landmark: '双名井',
                title: '旧航道水纹碑',
                story: '井沿内侧刻着两套互不相同的岛名与潮线，对着阳光看才发现它们拼成了同一条古航道。',
                rewards: [{ id: 100, count: 90 }, { id: 17213, count: 3 }],
                pantry: { stone: 2, ore: 1 },
            },
            {
                id: 'float:star-dial',
                landmark: '铜星测量台',
                title: '偏移铜星盘',
                story: '转动生锈的铜星刻度环，指针停在一处被新图略去的礁石暗湾，弹出藏在底座的测绘奖章。',
                rewards: [{ id: 100, count: 95 }, { id: 26012, count: 1 }],
                pantry: { ore: 2 },
            },
            {
                id: 'float:waterfall-ferry',
                landmark: '瀑布旧路',
                title: '瀑下隐秘渡口印',
                story: '水雾背后的石壁留着老渡工的木桩扣环，顺手清点旧缆绳时找到了遗落的祝福魔珠。',
                rewards: [{ id: 100, count: 110 }, { id: 17487, count: 1 }],
                pantry: { herb: 2, flower: 1 },
            },
        ],
        offers: [
            { id: 'float:blessing-pearl', name: '祝福魔珠 ×1', itemId: 17487, count: 1, costBeans: 160, costFairy: 0 },
            { id: 'float:catch-rune', name: '抓宠符文 ×2', itemId: 23439, count: 2, costBeans: 110, costFairy: 0 },
            { id: 'float:fairy-pack', name: '仙豆补给包 ×3', itemId: 17213, count: 3, costBeans: 150, costFairy: 0 },
            { id: 'float:atk-gem-2', name: '2 级攻击宝石 ×1', itemId: 26012, count: 1, costBeans: 200, costFairy: 1 },
        ],
    },
    sail: {
        id: 'sail',
        name: '风帆岛',
        stallName: '归帆港远航补给站',
        hostNpcIds: [860200, 860201],
        activityTitle: '校准顺风帆缆',
        activitySummary: '每日最多 2 次：协助归帆港调整风向缆绳，收获奇豆、战宠口粮与草药原矿。',
        dailyLimit: 2,
        curios: [
            {
                id: 'sail:vane',
                landmark: '白补丁广场',
                title: '旧帆风向标',
                story: '广场旗杆顶端缝着七块不同颜色的旧帆布，每块布角都记着一次平安归港的风力口诀。',
                rewards: [{ id: 100, count: 110 }, { id: 17213, count: 3 }, { id: 23439, count: 1 }],
                pantry: { flower: 2, herb: 1 },
            },
            {
                id: 'sail:relay',
                landmark: '风车道',
                title: '顺风传信台',
                story: '风车叶片借着海风带动铜铃轻响，调准风闸后，传信筒里滑出一卷远航补给凭证。',
                rewards: [{ id: 100, count: 120 }, { id: 17487, count: 1 }, { id: 17172, count: 3 }],
                pantry: { ore: 2 },
            },
            {
                id: 'sail:vortex-beacon',
                landmark: '风帆塔',
                title: '彼岸旋涡航标灯',
                story: '风帆塔顶的蓝晶航标正对海面旋涡，点亮它后星图映出另一端的现代海岸——现实世界深圳正向你敞开！',
                rewards: [{ id: 100, count: 150 }, { id: 26028, count: 1 }, { id: 17487, count: 1 }],
                pantry: { ore: 2, herb: 2 },
            },
        ],
        offers: [
            { id: 'sail:atk-gem-3', name: '3 级攻击宝石 ×1', itemId: 26028, count: 1, costBeans: 320, costFairy: 2 },
            { id: 'sail:blessing-pair', name: '祝福魔珠 ×2', itemId: 17487, count: 2, costBeans: 280, costFairy: 0 },
            { id: 'sail:catch-pack', name: '抓宠符文 ×3', itemId: 23439, count: 3, costBeans: 150, costFairy: 0 },
            { id: 'sail:sure-net', name: '皇冠鱼必中网 ×1', itemId: 17349, count: 1, costBeans: 220, costFairy: 0 },
        ],
    },
};

export const ALL_TRILOGY_CURIOS = TRILOGY_ISLAND_IDS.flatMap(id => TRILOGY_ISLANDS[id].curios);
const CURIO_BY_ID = Object.fromEntries(ALL_TRILOGY_CURIOS.map(c => [c.id, c]));
const OFFER_BY_ID = Object.fromEntries(
    TRILOGY_ISLAND_IDS.flatMap(id => TRILOGY_ISLANDS[id].offers.map(o => [o.id, { ...o, islandId: id }])),
);

export function trilogyCurioCount(save) {
    return (save?.trilogyExplore?.discovered || []).filter(id => Object.hasOwn(CURIO_BY_ID, id)).length;
}

export function validateTrilogyExplore(save) {
    const state = save?.trilogyExplore;
    if (state === undefined) return;
    assert(state && typeof state === 'object' && !Array.isArray(state), '后三岛探索记录无效');
    if (state.discovered !== undefined) {
        assert(
            Array.isArray(state.discovered)
                && new Set(state.discovered).size === state.discovered.length
                && state.discovered.every(id => typeof id === 'string' && Object.hasOwn(CURIO_BY_ID, id)),
            '后三岛彩蛋发现记录无效',
        );
    }
    if (state.daily !== undefined) {
        const d = state.daily;
        assert(d && typeof d === 'object' && !Array.isArray(d) && typeof d.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.day), '后三岛每日探索记录无效');
        for (const id of TRILOGY_ISLAND_IDS) {
            if (d[id] !== undefined) {
                assert(Number.isInteger(d[id]) && d[id] >= 0 && d[id] <= 10, '后三岛每日探索次数无效');
            }
        }
    }
}

export function trilogyDailyRemaining(save, islandId, now = Date.now()) {
    const island = TRILOGY_ISLANDS[islandId];
    if (!island) return 0;
    const today = localDayKey(now);
    const used = save?.trilogyExplore?.daily?.day === today ? (save.trilogyExplore.daily[islandId] || 0) : 0;
    return Math.max(0, island.dailyLimit - used);
}

export function trilogyIslandSummary(save, content, islandId, now = Date.now()) {
    const island = TRILOGY_ISLANDS[islandId];
    if (!island) return null;
    const discoveredSet = new Set(save?.trilogyExplore?.discovered || []);
    const curios = island.curios.map(c => ({
        ...c,
        discovered: discoveredSet.has(c.id),
        rewards: c.rewards.filter(r => r.id === 100 || !content?.items || content.items[r.id]),
    }));
    const offers = island.offers
        .filter(o => !content?.items || content.items[o.itemId])
        .map(o => ({
            ...o,
            itemName: content?.items?.[o.itemId]?.name || o.name,
            canAfford: (save?.inventory?.[100] || 0) >= o.costBeans && (save?.inventory?.[17213] || 0) >= o.costFairy,
        }));
    return {
        ...island,
        curios,
        discoveredCount: curios.filter(c => c.discovered).length,
        dailyRemaining: trilogyDailyRemaining(save, islandId, now),
        offers,
        vortexUnlocked: discoveredSet.has('sail:vortex-beacon'),
    };
}

export function discoverTrilogyCurio(save, content, curioId) {
    assert(!save.pendingEncounter, '战斗中无法探索岛屿彩蛋');
    const curio = CURIO_BY_ID[curioId];
    assert(curio, '未知的后三岛探索点');
    save.trilogyExplore ??= { discovered: [] };
    save.trilogyExplore.discovered ??= [];
    if (save.trilogyExplore.discovered.includes(curio.id)) {
        return { changed: false, curio, rewards: [], message: `你已经记录过「${curio.title}」的发现。` };
    }
    save.trilogyExplore.discovered.push(curio.id);
    const granted = [];
    for (const r of curio.rewards) {
        if (r.id !== 100 && content?.items && !content.items[r.id]) continue;
        save.inventory[r.id] = (save.inventory[r.id] || 0) + r.count;
        granted.push({
            id: r.id,
            count: r.count,
            name: content?.items?.[r.id]?.name || (r.id === 100 ? '奇豆' : String(r.id)),
        });
    }
    for (const [k, n] of Object.entries(curio.pantry || {})) recordGatherPantry(save, k, n);
    save.revision = (save.revision || 0) + 1;
    return {
        changed: true,
        curio,
        rewards: granted,
        message: `发现「${curio.title}」！${curio.story}`,
    };
}

export function performTrilogyDailyActivity(save, content, islandId, now = Date.now()) {
    assert(!save.pendingEncounter, '战斗中无法进行岛屿探索');
    const island = TRILOGY_ISLANDS[islandId];
    assert(island, '未知的后三岛区域');
    const today = localDayKey(now);
    save.trilogyExplore ??= { discovered: [] };
    if (save.trilogyExplore.daily?.day !== today) {
        save.trilogyExplore.daily = { day: today, tide: 0, float: 0, sail: 0 };
    }
    const used = save.trilogyExplore.daily[islandId] || 0;
    if (used >= island.dailyLimit) {
        return { changed: false, rewards: [], message: `今天的「${island.activityTitle}」次数已经用完了，明天再来吧。` };
    }
    const serial = used + 1;
    save.trilogyExplore.daily[islandId] = serial;
    const rng = createRng(hashSeed(`${save.seed}:trilogy-daily:${islandId}:${today}:${serial}`));
    const rewards = [];
    const grant = (id, count) => {
        if (id !== 100 && content?.items && !content.items[id]) return;
        save.inventory[id] = (save.inventory[id] || 0) + count;
        rewards.push({ id, count, name: content?.items?.[id]?.name || (id === 100 ? '奇豆' : String(id)) });
    };

    if (islandId === 'tide') {
        grant(100, 45);
        grant(rng.pick([17107, 17108, 17109, 17113]), 1);
        recordGatherPantry(save, rng.pick(['herb', 'flower']), 2);
    } else if (islandId === 'float') {
        grant(100, 55);
        grant(17213, 1);
        recordGatherPantry(save, rng.pick(['stone', 'ore']), 2);
    } else {
        grant(100, 65);
        grant(17172, 1);
        recordGatherPantry(save, rng.pick(['herb', 'ore']), 2);
    }
    save.revision = (save.revision || 0) + 1;
    return {
        changed: true,
        islandId,
        rewards,
        remaining: Math.max(0, island.dailyLimit - serial),
        message: `完成「${island.activityTitle}」！（今日剩余 ${Math.max(0, island.dailyLimit - serial)} 次）`,
    };
}

export function buyTrilogyStallOffer(save, content, offerId) {
    assert(!save.pendingEncounter, '战斗中无法在岛屿小摊兑换');
    const offer = OFFER_BY_ID[offerId];
    assert(offer, '未知的岛屿小摊商品');
    assert(!content?.items || content.items[offer.itemId], '该商品当前暂不可兑换');
    assert((save.inventory?.[100] || 0) >= offer.costBeans, `奇豆不足，需要 ${offer.costBeans} 奇豆`);
    assert((save.inventory?.[17213] || 0) >= offer.costFairy, `仙豆不足，需要 ${offer.costFairy} 仙豆`);

    if (offer.costBeans > 0) save.inventory[100] -= offer.costBeans;
    if (offer.costFairy > 0) save.inventory[17213] -= offer.costFairy;
    save.inventory[offer.itemId] = (save.inventory[offer.itemId] || 0) + offer.count;
    save.revision = (save.revision || 0) + 1;
    const itemName = content?.items?.[offer.itemId]?.name || offer.name;
    return {
        changed: true,
        offer,
        rewards: [{ id: offer.itemId, count: offer.count, name: itemName }],
        message: `在「${TRILOGY_ISLANDS[offer.islandId].stallName}」兑换了 ${itemName} ×${offer.count}！`,
    };
}

export function trilogyNpcIslandId(npcId) {
    const id = Number(npcId);
    for (const islandId of TRILOGY_ISLAND_IDS) {
        if (TRILOGY_ISLANDS[islandId].hostNpcIds.includes(id)) return islandId;
    }
    return null;
}
