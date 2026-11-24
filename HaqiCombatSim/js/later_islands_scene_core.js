// Pure scene-state derivation for the Lv.60/70/80 continuation trilogy
// (潮汐岛 tide / 浮岸岛 float / 风帆岛 sail).
// Turns story completion into visible landmark ambience and live resident bubbles.

export const LATER_ISLAND_NPCS = {
    tide: { alan: 860000, cenbo: 860001, xiaohe: 860002, cenning: 860003 },
    float: { lusheng: 860100, mila: 860101, hezhou: 860102, builder: 860103 },
    sail: { lifeng: 860200, keeper: 860201, xiaozhou: 860202, cenning: 860203 },
};

const claimed = (save, id) => !!save?.quests?.[id]?.claimed;
const accepted = (save, id) => !!save?.quests?.[id]?.accepted && !save?.quests?.[id]?.claimed;

function countClaimed(save, ids) {
    return ids.reduce((n, id) => n + (claimed(save, id) ? 1 : 0), 0);
}

export function laterIslandScene(save, zone) {
    if (!save || !['tide', 'float', 'sail'].includes(zone)) return null;

    if (zone === 'tide') {
        const ids = Array.from({ length: 12 }, (_, i) => 870000 + i);
        const done = countClaimed(save, ids);
        const clearTrial = (save.dungeonChallengeRecords?.['journey:tide:elite-1']?.clears || 0) > 0;
        const n = LATER_ISLAND_NPCS.tide;
        return {
            zone,
            completedQuests: done,
            totalQuests: 12,
            landmarks: {
                裂灯桥: {
                    effect: 'bridge',
                    restored: claimed(save, 870005),
                    active: accepted(save, 870005),
                    label: claimed(save, 870005) ? '桥下暗流已平 · 桥灯亮起' : accepted(save, 870005) ? '暗流涌动 · 待清开桥道' : '',
                },
                回信街: {
                    effect: 'lantern',
                    restored: claimed(save, 870009),
                    active: accepted(save, 870009),
                    label: claimed(save, 870009) ? '回信街灯火渐暖' : accepted(save, 870009) ? '等待一封亲口写下的回信' : '',
                },
                长明灯塔: {
                    effect: 'lighthouse',
                    restored: claimed(save, 870011),
                    active: accepted(save, 870010) || accepted(save, 870011),
                    label: claimed(save, 870011) ? '潮灯长明 · 回航可见' : done >= 3 ? `灯塔守信中（${done}/12）` : '',
                },
            },
            npcs: {
                [n.alan]: claimed(save, 870011)
                    ? clearTrial
                        ? '失声的潮灯也重新亮起来了，谢谢你把每一封回答都送到。'
                        : '旧信袋终于空了。准备好后，可以去挑战「失声的潮灯」与回声试炼塔。'
                    : done >= 6
                        ? '两只杯子的真相快拼齐了，别急着替他们做决定。'
                        : '灯塔里还压着一袋旧信，走近看看它们本来该寄给谁。',
                [n.cenbo]: claimed(save, 870009)
                    ? '两只杯子今天都盛着热茶，能亲口听她说完真好。'
                    : '我每天都擦两只杯子，总觉得女儿还会回来喝一口热茶。',
                [n.xiaohe]: claimed(save, 870006)
                    ? '道歉之后心里轻多了，以后不再替别人藏起回信。'
                    : '我曾经替人抄过信，也有一句对不起一直没敢当面说出口。',
                [n.cenning]: claimed(save, 870011)
                    ? '生气和想念可以同时存在，下一站听说浮岸岛藏着旧港的名字。'
                    : '风里全是旧灯油的味道，我想亲眼听见真实的回答。',
            },
        };
    }

    if (zone === 'float') {
        const ids = Array.from({ length: 12 }, (_, i) => 870100 + i);
        const done = countClaimed(save, ids);
        const clearTrial = (save.dungeonChallengeRecords?.['journey:float:elite-1']?.clears || 0) > 0;
        const n = LATER_ISLAND_NPCS.float;
        return {
            zone,
            completedQuests: done,
            totalQuests: 12,
            landmarks: {
                双名井: {
                    effect: 'water',
                    restored: claimed(save, 870101),
                    active: accepted(save, 870101),
                    label: claimed(save, 870101) ? '双名井碑已记下两个名字' : '',
                },
                铜星测量台: {
                    effect: 'compass',
                    restored: claimed(save, 870105),
                    active: accepted(save, 870105),
                    label: claimed(save, 870105) ? '铜星仪已校准 · 旧港坐标重现' : accepted(save, 870105) ? '测量台被守卫拦住' : '',
                },
                共图庭院: {
                    effect: 'festival',
                    restored: claimed(save, 870111),
                    active: accepted(save, 870110) || accepted(save, 870111),
                    label: claimed(save, 870111) ? '新海图已共绘完成' : done >= 4 ? `重绘海图中（${done}/12）` : '',
                },
            },
            npcs: {
                [n.lusheng]: claimed(save, 870111)
                    ? clearTrial
                        ? '两张图合在一起，连旧测量台的守卫都服气了。'
                        : '新地图已经画好，有空不妨去「两岸的旧测量台」试试身手。'
                    : '同一条路从两边画出来完全不同，两张图其实都是真的。',
                [n.mila]: claimed(save, 870109)
                    ? '旧账公开以后，桥上终于能坦坦荡荡地走过来了。'
                    : '井边记着一笔旧桥费，我想先把欠大家的弄清楚。',
                [n.hezhou]: claimed(save, 870108)
                    ? '瀑布后面的旧路清开了，父亲当年的救船记录还在。'
                    : '别只看新地图，瀑布后面还藏着被擦掉的旧港口。',
                [n.builder]: claimed(save, 870111)
                    ? '风帆岛那边快开庆典了，带着我们重绘的海图启航吧。'
                    : '高桥修得再稳，也得把两边的路都接上才算通。',
            },
        };
    }

    const ids = Array.from({ length: 12 }, (_, i) => 870200 + i);
    const done = countClaimed(save, ids);
    const clearTrial = (save.dungeonChallengeRecords?.['journey:sail:elite-1']?.clears || 0) > 0;
    const n = LATER_ISLAND_NPCS.sail;
    return {
        zone,
        completedQuests: done,
        totalQuests: 12,
        landmarks: {
            白补丁广场: {
                effect: 'lantern',
                restored: claimed(save, 870201),
                active: accepted(save, 870201),
                label: claimed(save, 870201) ? '白补丁旧帆重新升起' : '',
            },
            风车道: {
                effect: 'compass',
                restored: claimed(save, 870205),
                active: accepted(save, 870205),
                label: claimed(save, 870205) ? '岸上名单已完整公开' : accepted(save, 870205) ? '风车下传出异常噪声' : '',
            },
            风帆塔: {
                effect: 'festival',
                restored: claimed(save, 870211),
                active: accepted(save, 870210) || accepted(save, 870211),
                label: claimed(save, 870211) ? '归帆庆典灯火全开' : done >= 4 ? `筹备真实庆典（${done}/12）` : '',
            },
        },
        npcs: {
            [n.lifeng]: claimed(save, 870211)
                ? clearTrial
                    ? '档案室的守夜考验也通过了，这阵回航的风属于所有人。'
                    : '庆典不再删去求救声了。准备好后去「只准欢呼的档案室」赢取大天使之翼吧！'
                : '庆典前夕有人反挂了红帆，一定还有没被听见的求救声。',
            [n.keeper]: claimed(save, 870205)
                ? '每个出海人的名字都写回岸上名单了，一个也没少。'
                : '我守着旧名单室，可里面少了关键的一页。',
            [n.xiaozhou]: claimed(save, 870209)
                ? '不完美的回航也是真正的回航，谢谢你一路陪我们走完三座岛。'
                : '从潮汐岛的信、浮岸岛的旧港，到这里全都能接上了。',
            [n.cenning]: claimed(save, 870211)
                ? '风停以后，海面很安静。随时可以去百层回声试炼塔挑战极限。'
                : '听完完整的话，再决定要不要一起庆祝。',
        },
    };
}
