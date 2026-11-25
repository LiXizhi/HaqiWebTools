// Authored Lv.40–50 Dark Island ("幽暗岛 · 迷雾守望志") 6-chapter story chain.
// Bridges the Lv.40–51 content gap before Dark Island's Lv.55 bosses, dungeons,
// and 100-floor Moonlit Trial Tower, rewarding gems, upgrade orbs, pet food and runes.

export const DARK_STORY_QUEST_IDS = [874000, 874001, 874002, 874003, 874004, 874005];

const line = (npcId, speakerName, text, action, label) => ({
    npcId,
    speakerName,
    text,
    buttons: [{ action, label }],
});

export const DARK_ISLAND_STORY_QUESTS = [
    {
        id: 874000,
        title: '幽谷雾起',
        region: 'dark',
        startNpc: 35002,
        endNpc: 35002,
        repeat: false,
        startDialog: [
            line(35002, '智慧星', '幽暗岛的瘴雾比往年更早沉到山谷里，连南部旧广场的哨灯都快看不清了。', 'gotonext', '发生什么事了？'),
            line(35002, '智慧星', '前线的艾琳和莫利亚一直在记录雾气蔓延的走向，先替我去问问她们的发现吧。', 'doaccept', '我去前线看看'),
        ],
        endDialog: [
            line(35002, '智慧星', '原来雾气是从西北禁地顺着潮气溢出来的……辛苦你把情报带回来了！', 'dofinished', '收下谢礼'),
        ],
        talks: [
            {
                npcId: 35003,
                label: '询问瘴雾走向',
                dialog: [
                    line(35003, '艾琳', '昨天夜里起，谷口的石灯一熄灭，北边林子里的毒藤就开始往大路边挪动。', 'donpcdialoged', '我记下了'),
                ],
            },
            {
                npcId: 35006,
                label: '打听谷底异动',
                dialog: [
                    line(35006, '莫利亚', '沼泽潮位一涨，迷路的异域强敌也混进了暗影林带。去告诉智慧星，必须先把驱雾灯油备齐。', 'donpcdialoged', '马上回报智慧星'),
                ],
            },
        ],
        prerequisites: [],
        requirements: [{ id: 214, name: '214', min: 40, max: null }],
        groups: [
            {
                kind: 'talk',
                condition: 0,
                mode: 0,
                items: [
                    { id: 35003, name: '艾琳', count: 1 },
                    { id: 35006, name: '莫利亚', count: 1 },
                ],
            },
        ],
        rewards: [
            {
                choice: -1,
                schoolFilter: false,
                items: [
                    { id: 113, name: '经验', count: 6500 },
                    { id: 100, name: '奇豆', count: 260 },
                    { id: 17172, name: '战宠口粮', count: 3 },
                ],
            },
        ],
    },
    {
        id: 874001,
        title: '古灯驱瘴',
        region: 'dark',
        startNpc: 35003,
        endNpc: 35002,
        repeat: false,
        startDialog: [
            line(35003, '艾琳', '普通火油在幽暗岛的湿雾里撑不过半宿，只有安卓婆婆藏着祖传的萤光灯油方子。', 'gotonext', '我去拜访安卓婆婆'),
            line(35003, '艾琳', '请你去找安卓婆婆抄下灯油配方，再交给智慧星备好石灯芯材。', 'doaccept', '这就出发'),
        ],
        endDialog: [
            line(35002, '智慧星', '有了安卓婆婆的萤光苔配方，中央幽谷的驱雾石灯就能长明不熄了！这枚晶石请你镶在称手的装备上。', 'dofinished', '谢谢智慧星'),
        ],
        talks: [
            {
                npcId: 35011,
                label: '请教萤光灯油配方',
                dialog: [
                    line(35011, '安卓婆婆', '哈哈，还是年轻魔法师腿脚快！记住：干苔草配萤光孢子，再加一枚清音铜铃，雾气就近不了身。', 'donpcdialoged', '记牢配方了'),
                ],
            },
        ],
        prerequisites: [{ id: 874000, value: 1 }],
        requirements: [{ id: 214, name: '214', min: 42, max: null }],
        groups: [
            {
                kind: 'talk',
                condition: 0,
                mode: 0,
                items: [{ id: 35011, name: '安卓婆婆', count: 1 }],
            },
        ],
        rewards: [
            {
                choice: -1,
                schoolFilter: false,
                items: [
                    { id: 113, name: '经验', count: 7200 },
                    { id: 100, name: '奇豆', count: 280 },
                    { id: 17213, name: '仙豆', count: 200 },
                    { id: 26007, name: '2级黄晶石', count: 1 },
                ],
            },
        ],
    },
    {
        id: 874002,
        title: '林畔异影',
        region: 'dark',
        startNpc: 35011,
        endNpc: 35011,
        repeat: false,
        startDialog: [
            line(35011, '安卓婆婆', '采药的路上闯进了一只迷失在雾里的风眼守护兽，把大家晒在林边的干苔草全吹散了。', 'gotonext', '我去赶走它'),
            line(35011, '安卓婆婆', '去幽暗林畔击退那只风眼守护兽，顺手也可以带上抓宠符文试试身手。', 'doaccept', '交给我就好'),
        ],
        endDialog: [
            line(35011, '安卓婆婆', '林边的风总算停啦！这两张抓宠符文留给你，幽暗岛上藏着不少强力伙伴呢。', 'dofinished', '收下符文'),
        ],
        talks: [],
        prerequisites: [{ id: 874001, value: 1 }],
        requirements: [{ id: 214, name: '214', min: 44, max: null }],
        groups: [
            {
                kind: 'kill',
                condition: 0,
                mode: 0,
                items: [{ id: 40141, name: '风眼守护兽', count: 1 }],
            },
        ],
        rewards: [
            {
                choice: -1,
                schoolFilter: false,
                items: [
                    { id: 113, name: '经验', count: 8000 },
                    { id: 100, name: '奇豆', count: 320 },
                    { id: 23439, name: '普通抓宠符文', count: 2 },
                ],
            },
        ],
    },
    {
        id: 874003,
        title: '石脊烽烟',
        region: 'dark',
        startNpc: 35010,
        endNpc: 35010,
        repeat: false,
        startDialog: [
            line(35010, '哈瑞斯', '东北石脊的补给线被浓雾隔断了半天，不知道驻守在哨点的米娜和米妮怎么样了。', 'gotonext', '我替你去巡查'),
            line(35010, '哈瑞斯', '请分别去看看米娜和米妮，确认她们手上的灯火与干粮还够不够。', 'doaccept', '立刻前往哨点'),
        ],
        endDialog: [
            line(35010, '哈瑞斯', '两位哨兵都平安无事，石脊防线稳住了！这些口粮与蓝晶石你一定用得上。', 'dofinished', '辛苦守护前线'),
        ],
        talks: [
            {
                npcId: 35004,
                label: '核对前线补给',
                dialog: [
                    line(35004, '米娜', '放心吧！驱雾灯亮起来以后，石脊这边的视野清楚多了，干粮还能撑上好几天。', 'donpcdialoged', '这就回报哈瑞斯'),
                ],
            },
            {
                npcId: 35005,
                label: '查看哨点信号',
                dialog: [
                    line(35005, '米妮', '东北石脊的信号灯已经调好了，告诉哈瑞斯，随时可以接应进军沼泽的冒险小队！', 'donpcdialoged', '明白，一定转达'),
                ],
            },
        ],
        prerequisites: [{ id: 874002, value: 1 }],
        requirements: [{ id: 214, name: '214', min: 46, max: null }],
        groups: [
            {
                kind: 'talk',
                condition: 0,
                mode: 0,
                items: [
                    { id: 35004, name: '米娜', count: 1 },
                    { id: 35005, name: '米妮', count: 1 },
                ],
            },
        ],
        rewards: [
            {
                choice: -1,
                schoolFilter: false,
                items: [
                    { id: 113, name: '经验', count: 8800 },
                    { id: 100, name: '奇豆', count: 340 },
                    { id: 17172, name: '战宠口粮', count: 4 },
                    { id: 26012, name: '2级蓝晶石', count: 1 },
                ],
            },
        ],
    },
    {
        id: 874004,
        title: '古墓余烬',
        region: 'dark',
        startNpc: 35006,
        endNpc: 35006,
        repeat: false,
        startDialog: [
            line(35006, '莫利亚', '西北禁地边缘游荡着一尊躁动不安的法老王图坦卡蒙，它散发出的暗影魔力正不断加厚谷口的瘴雾。', 'gotonext', '它的实力如何？'),
            line(35006, '莫利亚', '它足有一万点生命，是踏入 55 级深沼秘境前最好的试金石！带上战宠伙伴去迎战它吧。', 'doaccept', '我去击退古墓强敌'),
        ],
        endDialog: [
            line(35006, '莫利亚', '了不起！连法老王图坦卡蒙都败在你手下。这两颗珍贵的祝福魔珠正好拿去强化主力装备！', 'dofinished', '收下祝福魔珠'),
        ],
        talks: [],
        prerequisites: [{ id: 874003, value: 1 }],
        requirements: [{ id: 214, name: '214', min: 48, max: null }],
        groups: [
            {
                kind: 'kill',
                condition: 0,
                mode: 0,
                items: [{ id: 40081, name: '法老王图坦卡蒙', count: 1 }],
            },
        ],
        rewards: [
            {
                choice: -1,
                schoolFilter: false,
                items: [
                    { id: 113, name: '经验', count: 10000 },
                    { id: 100, name: '奇豆', count: 400 },
                    { id: 17487, name: '祝福魔珠', count: 2 },
                    { id: 17213, name: '仙豆', count: 240 },
                ],
            },
        ],
    },
    {
        id: 874005,
        title: '幽月誓约',
        region: 'dark',
        startNpc: 35002,
        endNpc: 35002,
        repeat: false,
        startDialog: [
            line(35002, '智慧星', '多亏你一路清开瘴雾、稳住石脊防线，幽暗岛总算重见星光了。', 'gotonext', '接下来要守住沼泽吗？'),
            line(35002, '智慧星', '去向补给官古格与安卓婆婆道一声平安，随后就能集结小队去挑战「梦魇尽头的约定」「沼泽中的航标」和百层幽月塔！', 'doaccept', '我这就去转告大家'),
        ],
        endDialog: [
            line(35002, '智慧星', '全岛的灯火都为你点亮了！收下这枚 3 级紫晶石与「幽谷守灯人」的敬意，向幽暗深处与更远的续章群岛进发吧！', 'dofinished', '愿灯火常明'),
        ],
        talks: [
            {
                npcId: 35001,
                label: '核对夜防补给',
                dialog: [
                    line(35001, '古格', '营地物资已经全部归仓，随时欢迎冒险小队出发前过来补给。', 'donpcdialoged', '多谢古格'),
                ],
            },
            {
                npcId: 35011,
                label: '汇报禁地平安',
                dialog: [
                    line(35011, '安卓婆婆', '好孩子，幽暗岛很久没有这么安静温暖的夜晚了，以后去潮汐岛和风帆岛也别忘了常回来看看。', 'donpcdialoged', '一定常回来'),
                ],
            },
        ],
        prerequisites: [{ id: 874004, value: 1 }],
        requirements: [{ id: 214, name: '214', min: 50, max: null }],
        groups: [
            {
                kind: 'talk',
                condition: 0,
                mode: 0,
                items: [
                    { id: 35001, name: '古格', count: 1 },
                    { id: 35011, name: '安卓婆婆', count: 1 },
                ],
            },
        ],
        rewards: [
            {
                choice: -1,
                schoolFilter: false,
                items: [
                    { id: 113, name: '经验', count: 12000 },
                    { id: 100, name: '奇豆', count: 500 },
                    { id: 26028, name: '3级紫晶石', count: 1 },
                    { id: 17172, name: '战宠口粮', count: 5 },
                ],
            },
        ],
    },
];

export function darkIslandStoryProgress(save) {
    const claimed = DARK_STORY_QUEST_IDS.reduce((n, id) => n + (save?.quests?.[id]?.claimed ? 1 : 0), 0);
    return {
        done: claimed,
        total: DARK_STORY_QUEST_IDS.length,
        complete: claimed >= DARK_STORY_QUEST_IDS.length,
    };
}
