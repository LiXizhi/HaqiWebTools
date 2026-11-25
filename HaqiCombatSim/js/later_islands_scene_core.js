// Pure scene-state derivation for the mid-game elemental islands (fire / ice /
// desert / dark) and the Lv.60/70/80 continuation trilogy (tide / float / sail).
// Turns story completion and landmark commissions into visible ambience and live bubbles.

import { islandPuzzleSolved } from './island_puzzles_core.js';

export const LATER_ISLAND_NPCS = {
    fire: { guide: 30513 },
    ice: { guide: 30601 },
    desert: { guide: 30702 },
    dark: { guide: 35002 },
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
    if (!save || !['fire', 'ice', 'desert', 'dark', 'tide', 'float', 'sail'].includes(zone)) return null;

    if (zone === 'fire') {
        const solved = islandPuzzleSolved(save, 'fire-brazier');
        const clearBell = (save.dungeonChallengeRecords?.['journey:gold-bell']?.clears || 0) > 0;
        return {
            zone,
            landmarks: {
                中央岔路: {
                    effect: 'ember',
                    restored: solved,
                    active: !solved,
                    label: solved ? '引火台长明 · 矿道信号清晰' : '熄灭的引火台 · 点击检修',
                },
            },
            npcs: {
                30513: solved
                    ? clearBell
                        ? '矿道引火台与金库风铃都妥当了，去冲击赤焰试炼塔吧！'
                        : '引火台重新燃起来了！15 级可以去闯「金库失窃的风铃」赢 30 格精良口袋。'
                    : '火山风吹灭了「中央岔路」的引火台，路过时帮我检修一下吧。',
            },
        };
    }

    if (zone === 'ice') {
        const solved = islandPuzzleSolved(save, 'ice-postbox');
        const clearIce = (save.dungeonChallengeRecords?.['journey:frozen-letter']?.clears || 0) > 0;
        return {
            zone,
            landmarks: {
                浮冰通道: {
                    effect: 'compass',
                    restored: solved,
                    active: !solved,
                    label: solved ? '冰原邮路已通 · 航标长亮' : '冻住的驿站信箱 · 点击分拣',
                },
            },
            npcs: {
                30601: solved
                    ? clearIce
                        ? '冰原邮路和冰封回信都打通了，35 级记得试试四人风眼罗盘！'
                        : '浮冰通道的急件全送到啦！28 级可去挑战「冰封的回信」。'
                    : '「浮冰通道」的驿站信箱被风雪冻住了，能去帮守港人分拣急件吗？',
            },
        };
    }

    if (zone === 'desert') {
        const solved = islandPuzzleSolved(save, 'desert-astrolabe');
        const clearSand = (save.dungeonChallengeRecords?.['journey:sand-echo']?.clears || 0) > 0;
        return {
            zone,
            landmarks: {
                南部绿洲: {
                    effect: 'water',
                    restored: solved,
                    active: !solved,
                    label: solved ? '古铜盘已校准 · 绿洲泉涌' : '蒙尘的绿洲铜盘 · 点击辨向',
                },
            },
            npcs: {
                30702: solved
                    ? clearSand
                        ? '绿洲水脉与沙海回声都已探明，40 级去闯「绿洲的最后一把钥匙」赢 50 格口袋吧！'
                        : '铜盘校准后商队再也不怕海市蜃楼了！准备好就去试试「沙海回声」。'
                    : '正午热浪容易让人看错水脉，先去「南部绿洲」校准一下古铜盘吧。',
            },
        };
    }

    if (zone === 'dark') {
        const solved = islandPuzzleSolved(save, 'dark-lantern');
        const clearDark = (save.dungeonChallengeRecords?.['journey:night-promise']?.clears || 0) > 0;
        const storyDone = claimed(save, 874005);
        const ridgeSafe = claimed(save, 874003);
        const tombSafe = claimed(save, 874004);
        return {
            zone,
            landmarks: {
                中央幽谷: {
                    effect: 'mist-lantern',
                    restored: solved,
                    active: !solved,
                    label: solved ? '驱雾石灯已亮 · 幽谷朗澈' : '暗淡的驱雾石灯 · 点击配芯',
                },
                东北石脊: {
                    effect: 'lantern',
                    restored: ridgeSafe,
                    active: accepted(save, 874003),
                    label: ridgeSafe ? '石脊烽火长明 · 补给畅通' : accepted(save, 874003) ? '石脊雾重 · 待巡查哨点' : '',
                },
                西北禁地: {
                    effect: 'ember',
                    restored: tombSafe,
                    active: accepted(save, 874004),
                    label: tombSafe ? '古墓余烬已平 · 暗雾退散' : accepted(save, 874004) ? '禁地暗影涌动 · 待迎战强敌' : '',
                },
                南部旧广场: {
                    effect: 'festival',
                    restored: storyDone,
                    active: accepted(save, 874005),
                    label: storyDone ? '幽月誓约灯火通明' : '',
                },
            },
            npcs: {
                35002: solved
                    ? clearDark
                        ? '幽谷灯明、夜约已守，去挑战四人秘境「沼泽中的航标」赢 70 格斗士大卡包吧！'
                        : storyDone
                            ? '全岛防线已经点亮！55 级可挑战「梦魇尽头的约定」与百层幽月塔。'
                            : '幽谷的瘴雾散开多了！40 级起可接「幽谷雾起」六章防线故事，55 级挑战「梦魇尽头的约定」与百层幽月塔。'
                    : '「中央幽谷」的引路石灯灭了，配齐荧光芯就能驱散谷口浓雾。',
                35003: claimed(save, 874001)
                    ? '安卓婆婆的萤光灯油真管用，谷口夜晚明亮多了。'
                    : '北边林子雾气很重，记得先帮智慧星把驱雾石灯与灯油备齐。',
                35006: tombSafe
                    ? '古墓强敌已退，沼泽深处的航标正等着最强小队去点亮。'
                    : '西北禁地潜伏着一万血的古墓强敌，整备好战宠再出发。',
                35011: storyDone
                    ? '星光重新照进幽暗岛了，谢谢你一直守到这里。'
                    : '干苔草配萤光孢子，能让石灯在浓雾里稳稳亮到天明。',
            },
        };
    }

    if (zone === 'tide') {
        const ids = Array.from({ length: 12 }, (_, i) => 870000 + i);
        const done = countClaimed(save, ids);
        const clearTrial = (save.dungeonChallengeRecords?.['journey:tide:elite-1']?.clears || 0) > 0;
        const clearTrial2 = (save.dungeonChallengeRecords?.['journey:tide:elite-2']?.clears || 0) > 0;
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
                    restored: claimed(save, 870009) || islandPuzzleSolved(save, 'tide-letters'),
                    active: accepted(save, 870009) || !islandPuzzleSolved(save, 'tide-letters'),
                    label: islandPuzzleSolved(save, 'tide-letters')
                        ? '旧信已核清 · 回信街灯火渐暖'
                        : claimed(save, 870009)
                            ? '回信街灯火渐暖 · 可核对旧信'
                            : '回信街木桌 · 点击核对旧信与茶杯',
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
                    ? clearTrial2
                        ? '「失声的潮灯」与「被风吹散的回信」都已平安通关，谢谢你把每一封回答都送到。'
                        : clearTrial
                            ? '失声的潮灯重新亮起来了！接下来可以挑战五波终极本「被风吹散的回信」赢取潘多拉终极灵盾。'
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
        const clearTrial2 = (save.dungeonChallengeRecords?.['journey:float:elite-2']?.clears || 0) > 0;
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
                    restored: claimed(save, 870105) || islandPuzzleSolved(save, 'float-charts'),
                    active: accepted(save, 870105) || !islandPuzzleSolved(save, 'float-charts'),
                    label: islandPuzzleSolved(save, 'float-charts')
                        ? '双海图已合璧 · 旧港新桥同现'
                        : claimed(save, 870105)
                            ? '铜星仪已校准 · 可叠合双海图'
                            : '铜星测量台 · 点击叠合两岸海图',
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
                    ? clearTrial2
                        ? '旧测量台与瀑布空白图都被你彻底勘明了，两岸海图从此再无遗漏。'
                        : clearTrial
                            ? '两张图合在一起，连旧测量台的守卫都服气了；去闯五波「瀑布下的空白图」赢取亚瑟君王战甲吧！'
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
    const clearTrial2 = (save.dungeonChallengeRecords?.['journey:sail:elite-2']?.clears || 0) > 0;
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
            旧名单室: {
                effect: 'lantern',
                restored: islandPuzzleSolved(save, 'sail-signals'),
                active: !islandPuzzleSolved(save, 'sail-signals'),
                label: islandPuzzleSolved(save, 'sail-signals') ? '归航名单已补全 · 双灯接应' : '旧名单室 · 点击破译红帆旗语',
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
                ? clearTrial2
                    ? '档案室与白帆最后的守夜都已圆满通关，这阵回航的风属于所有人！'
                    : clearTrial
                        ? '档案室的守夜考验已经通过，去向终极五波「白帆最后的守夜」发起冲刺、赢取潘多拉毕业法杖吧！'
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
