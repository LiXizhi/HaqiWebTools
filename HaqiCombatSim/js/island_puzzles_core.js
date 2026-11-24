// Pure scene puzzle and commission rules for Hanzi Island and mid/late islands.
// Every puzzle turns story/word comprehension into an active placement or deduction
// choice with gentle situational feedback, one-time practical rewards, and never
// blocks main storyline progression.

const assert = (ok, message) => {
    if (!ok) throw new Error(message);
};

export const HANZI_LANDMARK_PUZZLES = [
    {
        id: 'hanzi-road',
        zone: 'hanzi',
        landmark: '石头路',
        npcId: 863002,
        questId: 873100,
        openWithoutQuest: true,
        title: '岔路石碑刻字',
        eyebrow: '字源岛 · 石头路现场安放',
        intro: '山脚岔路口立着三块空白石牌。请根据眼前的地势，把合适的方向字嵌回石碑，让进山和回村的人不再走错。',
        completion: '三块石碑都刻好了方向字！顺坡而下的孩子一眼就认出了回村的路。',
        restoredBadge: '石碑已刻好：上 · 下 · 中',
        options: [
            { id: 'shan', label: '山', detail: '群峰起伏的山峦' },
            { id: 'shang', label: '上', detail: '基准线之上，往高处去' },
            { id: 'xia', label: '下', detail: '基准线之下，往低处走' },
            { id: 'zhong', label: '中', detail: '不偏不倚的正中央' },
            { id: 'shi', label: '石', detail: '山崖下坚硬的岩石' },
        ],
        slots: [
            {
                id: 'uphill',
                prompt: '沿着石阶往山坡高处采药的小路，路牌该刻哪个字？',
                answer: 'shang',
                wrongHints: {
                    xia: '刻成「下」会让上山的人往坡底走反哦，再找找表示往高处去的字。',
                    shan: '「山」能指整座大山，但岔路石阶更需要标明往高处走的方向。',
                    zhong: '这条石阶一路往上爬，不在平地正中间呢。',
                },
                fallbackHint: '观察石阶向高处延伸的走势，选表示往高处去的字。',
            },
            {
                id: 'downhill',
                prompt: '顺着山坡往村口低处回家的归途，路牌该刻哪个字？',
                answer: 'xia',
                wrongHints: {
                    shang: '刻成「上」会把迷路的孩子又引回山顶，试试表示往低处走的字。',
                    shi: '路牌本身就是石头做的，这里要告诉大家顺坡往下回村。',
                },
                fallbackHint: '村子在山坡下面，选表示往低处走的字。',
            },
            {
                id: 'center',
                prompt: '立在左右两条岔路正中央、直通村心广场的界石，该刻哪个字？',
                answer: 'zhong',
                wrongHints: {
                    shan: '界石立在两条路正中间通向广场，不是进山的路标哦。',
                    shi: '虽然是石碑，但刻上位置字才能告诉大家走中间这条路。',
                },
                fallbackHint: '它正好夹在左右两条路正中间，选表示正中央的字。',
            },
        ],
        rewards: [
            { itemId: 100, count: 80, name: '奇豆' },
            { itemId: 17172, count: 2, name: '战宠口粮' },
        ],
    },
    {
        id: 'hanzi-canal',
        zone: 'hanzi',
        landmark: '溪边小村',
        npcId: 863001,
        questId: 873101,
        title: '双闸水渠分流',
        eyebrow: '字源岛 · 溪边小村现场安放',
        intro: '旧水渠的分水闸前散落着几块木牌。分清耕地、深林与堤岸，溪禾才能提闸把溪水准确引到干涸的禾苗旁。',
        completion: '分水木牌挂回原位，清澈的溪水哗啦啦流进田垄，干裂的泥土慢慢湿润了！',
        restoredBadge: '分水闸已挂牌：田 · 森 · 土',
        options: [
            { id: 'shui', label: '水', detail: '蜿蜒流淌的溪流' },
            { id: 'tian-field', label: '田', detail: '阡陌纵横的方格耕地' },
            { id: 'tu', label: '土', detail: '大地上的泥土与堤岸' },
            { id: 'mu', label: '木', detail: '单棵生根发芽的树木' },
            { id: 'sen', label: '森', detail: '众木成林的茂密深林' },
        ],
        slots: [
            {
                id: 'east-gate',
                prompt: '东侧闸口通往阡陌纵横、急着浇灌禾苗的方格耕地，该挂哪个字？',
                answer: 'tian-field',
                wrongHints: {
                    sen: '挂成「森」会把灌溉水全放进深林里，禾苗还在方格耕地里等水呢！',
                    shui: '两个闸口流的都是水，木牌需要标出东边是方格耕地。',
                },
                fallbackHint: '看看像四块方格田埂一样的那个字。',
            },
            {
                id: 'west-gate',
                prompt: '西侧闸口通往大片大树并排生长的蓄水林地，该挂哪个字？',
                answer: 'sen',
                wrongHints: {
                    mu: '单棵树是「木」，西边是一大片繁茂的大树林，用三个木组成的字更贴切。',
                    'tian-field': '西边是密林不是耕田，挂反了水就会走错路啦。',
                },
                fallbackHint: '大片树木聚在一起，选由三个「木」组成的字。',
            },
            {
                id: 'embankment',
                prompt: '渠边有一段松软易渗漏的泥岸需要培厚夯实，提醒牌该写哪个字？',
                answer: 'tu',
                wrongHints: {
                    shui: '这里提醒大家培厚渠岸的泥层，选代表泥地的字。',
                },
                fallbackHint: '需要松开或夯实的是脚下的泥地，选代表泥土的字。',
            },
        ],
        rewards: [
            { itemId: 100, count: 90, name: '奇豆' },
            { itemId: 17213, count: 80, name: '仙豆' },
        ],
    },
    {
        id: 'hanzi-weather',
        zone: 'hanzi',
        landmark: '晨光林',
        npcId: 863001,
        questId: 873102,
        title: '农事天气木牍',
        eyebrow: '字源岛 · 晨光林现场安放',
        intro: '晒谷场边的天气木牍缺了三枚字签。按一天里天象的变化补齐记录，大家晒谷和收谷就有了依据。',
        completion: '天气木牍补齐了！村民们看着「日、云、雨」的记录，再也不怕阵雨淋湿新谷。',
        restoredBadge: '天气册已记：日 · 云 · 雨',
        options: [
            { id: 'ri', label: '日', detail: '光芒四射的太阳' },
            { id: 'yue', label: '月', detail: '夜空弯弯的月亮' },
            { id: 'tian-sky', label: '天', detail: '头顶辽阔的天空' },
            { id: 'yun', label: '云', detail: '空中卷曲飘浮的云气' },
            { id: 'yu', label: '雨', detail: '从天幕落下的水滴' },
        ],
        slots: [
            {
                id: 'morning',
                prompt: '清晨金轮升起、阳光充足，正适合把谷物摊开晾晒，该记哪个字？',
                answer: 'ri',
                wrongHints: {
                    yue: '月亮升起已经是夜晚收工的时候啦，晒谷要趁白天的太阳。',
                    yu: '下雨天可不能把谷物搬出来晒呀！',
                },
                fallbackHint: '晒谷靠的是白天的太阳，选代表太阳的字。',
            },
            {
                id: 'noon',
                prompt: '午后空中飘来成团水汽遮住了阳光，提醒大家随时留神天色，该记哪个字？',
                answer: 'yun',
                wrongHints: {
                    yu: '这时水滴还没落下来，只是空中团聚的云气遮住了太阳。',
                },
                fallbackHint: '水滴还没落下，先遮住太阳的是飘浮在天上的云气。',
            },
            {
                id: 'evening',
                prompt: '水滴从云层哗哗落下，必须立刻招呼大家把谷物搬回屋里，该记哪个字？',
                answer: 'yu',
                wrongHints: {
                    yun: '水滴已经落下来打湿地面了，要记下表示降雨的字。',
                },
                fallbackHint: '看看像天空下挂着点点水滴的那个字。',
            },
        ],
        rewards: [
            { itemId: 100, count: 100, name: '奇豆' },
            { itemId: 23439, fallbackItemId: 17172, count: 1, fallbackCount: 2, name: '普通抓宠符文' },
        ],
    },
    {
        id: 'hanzi-lantern',
        zone: 'hanzi',
        landmark: '远行灯塔',
        npcId: 863003,
        questId: 873103,
        title: '夜归旅人门牌',
        eyebrow: '字源岛 · 远行灯塔现场安放',
        intro: '灯塔驿站外挂着三块夜归指引牌。帮小灯把暖焰、入口与歇脚处的字牌挂好，夜里赶路的人就能安心进屋。',
        completion: '灯塔下的三块夜归指引牌温暖亮起，小灯终于不用每晚站在寒风里苦等旅人了！',
        restoredBadge: '夜归牌已挂好：火 · 门 · 休',
        options: [
            { id: 'huo', label: '火', detail: '跳跃升腾的火苗' },
            { id: 'guang', label: '光', detail: '照亮四周的亮光' },
            { id: 'ming', label: '明', detail: '日月同辉的明亮' },
            { id: 'men', label: '门', detail: '两扇对合的屋门' },
            { id: 'xiu', label: '休', detail: '人靠在树旁歇息' },
        ],
        slots: [
            {
                id: 'brazier',
                prompt: '风灯与火盆里跳跃燃烧、提醒旅人留心看护的火苗，该挂哪个字？',
                answer: 'huo',
                wrongHints: {
                    guang: '「光」是照出去的亮意，火盆里需要添柴照看的是燃烧的火苗本身。',
                },
                fallbackHint: '看看像火苗向上跳跃升腾的那个字。',
            },
            {
                id: 'doorway',
                prompt: '两扇木扉轻轻合拢、推开就能进屋避风挡雨的入口，该挂哪个字？',
                answer: 'men',
                wrongHints: {
                    xiu: '先进了入口才能歇脚哦，先标出哪一扇是可以推开的屋门。',
                },
                fallbackHint: '形状就像左右两扇对称木扉的那个字。',
            },
            {
                id: 'rest-bench',
                prompt: '屋檐下摆着木榻与茶水、告诉赶路人走累了可以在此歇脚，该挂哪个字？',
                answer: 'xiu',
                wrongHints: {
                    ming: '「明」表示屋里亮堂，这里要告诉疲惫的旅人可以停下来歇息。',
                },
                fallbackHint: '一个人靠在木旁歇脚，正是表示休息的字。',
            },
        ],
        rewards: [
            { itemId: 100, count: 110, name: '奇豆' },
            { itemId: 17172, count: 3, name: '战宠口粮' },
        ],
    },
    {
        id: 'hanzi-letter',
        zone: 'hanzi',
        landmark: '初生码头',
        npcId: 863000,
        questId: 873104,
        title: '小手印家书破译',
        eyebrow: '字源岛 · 初生码头现场安放',
        intro: '初生码头的石台上摊开着那封浸过海风的旧家书。对照信上的图案与句意补齐三枚字印，替阿初读懂远方家人的心意。',
        completion: '旧家书上的字印全部对上了！阿初把信高声读给码头上的乡亲听，大家都红了眼眶。',
        restoredBadge: '家书已破译：手 · 目 · 心',
        options: [
            { id: 'ren', label: '人', detail: '侧身站立的人影' },
            { id: 'kou', label: '口', detail: '说话发声的嘴唇' },
            { id: 'shou', label: '手', detail: '五指伸展的手掌' },
            { id: 'mu-eye', label: '目', detail: '凝望远方的眼睛' },
            { id: 'xin', label: '心', detail: '胸口跳动的真心' },
        ],
        slots: [
            {
                id: 'palmprint',
                prompt: '信纸右下角按着一只五指张开的小小泥印，寄信的孩子想留下哪个字？',
                answer: 'shou',
                wrongHints: {
                    ren: '泥印有五根清晰的小指头，是孩子按下的小手掌印哦。',
                },
                fallbackHint: '五指伸展的掌印，对应代表手掌的那个字。',
            },
            {
                id: 'gaze',
                prompt: '信中画着伫立码头远望的窗框，盼着归来时亲眼看看彼此，对应哪个字？',
                answer: 'mu-eye',
                wrongHints: {
                    kou: '「口」用来交谈倾诉，亲眼相望靠的是眼睛。',
                },
                fallbackHint: '亲眼看望家人，选代表眼睛的那个象形字。',
            },
            {
                id: 'care',
                prompt: '信末写着无论相隔多远都把牵挂装在胸膛里，落款该盖哪个字？',
                answer: 'xin',
                wrongHints: {
                    kou: '说出口的是话语，藏在胸膛深处惦念家人的是真心。',
                },
                fallbackHint: '牵挂与关爱藏在胸口，选代表内心的字。',
            },
        ],
        rewards: [
            { itemId: 100, count: 120, name: '奇豆' },
            { itemId: 17213, count: 100, name: '仙豆' },
        ],
    },
    {
        id: 'hanzi-festival',
        zone: 'hanzi',
        landmark: '字源亭',
        npcId: 863000,
        questId: 873105,
        title: '字源庆典节目单',
        eyebrow: '字源岛 · 字源亭现场安放',
        intro: '字源亭前的庆典木架已经搭好，只差把大鼓、小鼓与压轴群舞的名牌挂上节目架，全岛就能敲响欢庆的鼓点！',
        completion: '重鼓与手鼓齐鸣，字源亭灯火辉煌，全岛居民踏着鼓点跳起了团圆之舞！',
        restoredBadge: '庆典已开席：大 · 小 · 舞',
        options: [
            { id: 'da', label: '大', detail: '张开双臂顶天立地' },
            { id: 'xiao', label: '小', detail: '细微精巧的沙粒' },
            { id: 'er', label: '耳', detail: '倾听鼓点的耳朵' },
            { id: 'guo', label: '国', detail: '四方守护的家园' },
            { id: 'wu', label: '舞', detail: '执羽踏节的欢舞' },
        ],
        slots: [
            {
                id: 'big-drum',
                prompt: '亭左木架摆着一人高的震天重鼓，由力气足的青年擂动，该挂哪块牌？',
                answer: 'da',
                wrongHints: {
                    xiao: '一人高的重鼓可不小呀，挂成「小」牌孩子们可搬不动它！',
                },
                fallbackHint: '张开双臂般宽广魁梧的重鼓，选「大」字。',
            },
            {
                id: 'small-drum',
                prompt: '亭右竹篮装着轻巧清脆的铃鼓，专门分给孩子们拍打，该挂哪块牌？',
                answer: 'xiao',
                wrongHints: {
                    da: '分给孩子们的掌心铃鼓精巧轻便，应该挂跟「大」相对的字。',
                },
                fallbackHint: '轻巧迷你、适合孩子拿在手里的鼓，选「小」字。',
            },
            {
                id: 'finale-dance',
                prompt: '鼓点敲响后，大家手执彩羽围着篝火踏节欢跳的压轴节目，该挂哪个字？',
                answer: 'wu',
                wrongHints: {
                    er: '「耳」用来倾听鼓声，全岛手执彩羽欢跳的节目单要写「舞」。',
                },
                fallbackHint: '古人双手执牛尾彩羽踏步起跳，正是「舞」字。',
            },
        ],
        rewards: [
            { itemId: 100, count: 150, name: '奇豆' },
            { itemId: 23439, fallbackItemId: 17213, count: 1, fallbackCount: 120, name: '普通抓宠符文' },
        ],
    },
];

export const MID_LATE_ISLAND_PUZZLES = [
    {
        id: 'fire-brazier',
        zone: 'fire',
        landmark: '中央岔路',
        npcId: 30513,
        openWithoutQuest: true,
        title: '余烬矿道引火台',
        eyebrow: '火鸟岛 · 中央岔路现场检修',
        intro: '火山热风吹灭了中央岔路的三座引路火台。对照菲尼克斯留下的巡山手札，为三处道口配齐正确的耐热信物，重新点亮矿道信号。',
        completion: '三座赤铜引火台轰然复燃！通往金树高地与火山环道的矿道信号重新清晰可见。',
        restoredBadge: '引火台长明：耐热石灯 · 避风火绒 · 赤铜警铃',
        options: [
            { id: 'lamp', label: '耐热石灯', detail: '不怕熔岩高温烘烤的石制路灯' },
            { id: 'tinder', label: '避风火绒', detail: '在山口强风中也能稳燃的火种囊' },
            { id: 'bell', label: '赤铜警铃', detail: '浓烟遮眼时靠清脆铃声辨认岔路' },
            { id: 'rope', label: '湿麻绳', detail: '遇热易焦干脆断的普通绳索' },
        ],
        slots: [
            {
                id: 'lava-side',
                prompt: '南侧紧挨熔岩边缘、木制灯架一靠近就会烤焦的路段，该安放哪件器具？',
                answer: 'lamp',
                wrongHints: {
                    rope: '湿麻绳很快就会被熔岩热浪烤干烧断，需要不怕高温烘烤的石制灯具。',
                    bell: '南侧视野开阔但热浪灼人，先安放耐高温照明的器具吧。',
                },
                fallbackHint: '熔岩旁温度极高，选不怕烘烤的石制路灯。',
            },
            {
                id: 'wind-pass',
                prompt: '北侧通往高地的风口阵风猛烈、明火一吹就灭，该换上哪件引火物？',
                answer: 'tinder',
                wrongHints: {
                    lamp: '普通开口灯芯在强风口容易被吹灭，需要能在风口稳燃的火种囊。',
                },
                fallbackHint: '山口风大，选专为迎风稳燃准备的避风火绒。',
            },
            {
                id: 'smoke-fork',
                prompt: '东侧火山环道常有热气浓烟遮挡视线，该挂上哪件信物提醒来往旅人？',
                answer: 'bell',
                wrongHints: {
                    tinder: '浓烟里光亮传不远，靠清脆响声引路才最稳妥。',
                },
                fallbackHint: '看不清路时用耳朵听方向，选能发出清脆声响的赤铜警铃。',
            },
        ],
        rewards: [
            { itemId: 100, count: 120, name: '奇豆' },
            { itemId: 17213, count: 120, name: '仙豆' },
            { itemId: 17172, count: 2, name: '战宠口粮' },
        ],
    },
    {
        id: 'ice-postbox',
        zone: 'ice',
        landmark: '浮冰通道',
        npcId: 30601,
        openWithoutQuest: true,
        title: '破冰航路信箱',
        eyebrow: '寒冰岛 · 浮冰通道现场分拣',
        intro: '暴风雪冻住了浮冰通道旁的驿站木箱，三份急用补给的收件牌被霜花糊住。按各处岗哨的急需将补给分入正确的投递格。',
        completion: '三格急件全部准确分好，浮冰通道旁的防冻航标灯随之点亮，雪原邮路重新畅通！',
        restoredBadge: '冰原邮路已通：防冻灯油 · 厚绒披风 · 测风星镜',
        options: [
            { id: 'oil', label: '防冻灯油', detail: '零下严寒也不凝结的航标燃料' },
            { id: 'cloak', label: '厚绒披风', detail: '抵御松林寒风巡逻的保暖外衣' },
            { id: 'lens', label: '测风星镜', detail: '在高岭观测暴雪云层的铜镜' },
            { id: 'icepick', label: '空水壶', detail: '尚未装热饮的备用空壶' },
        ],
        slots: [
            {
                id: 'harbor-beacon',
                prompt: '冰海南港的引航灯快要冻熄，守港人最急需哪一份补给？',
                answer: 'oil',
                wrongHints: {
                    cloak: '引航灯快冻灭了，当务之急是添上不会冻结的燃料。',
                },
                fallbackHint: '为了让港口的引航灯继续燃烧，选防冻灯油。',
            },
            {
                id: 'pine-patrol',
                prompt: '西部松林的巡逻员顶着刺骨寒风护送旅人，最需要哪件装备御寒？',
                answer: 'cloak',
                wrongHints: {
                    lens: '密林里视线被松枝挡住，巡逻员眼下最需要抵御寒风的保暖衣物。',
                },
                fallbackHint: '顶风巡逻需要保暖，选厚绒披风。',
            },
            {
                id: 'ridge-watch',
                prompt: '北部雪岭的观测哨要提前研判下一场风雪动向，该送去哪件器具？',
                answer: 'lens',
                wrongHints: {
                    icepick: '空水壶帮不上观测风雪的忙，选观测高空云层的器具吧。',
                },
                fallbackHint: '高岭观测星象与暴雪云层，选测风星镜。',
            },
        ],
        rewards: [
            { itemId: 100, count: 160, name: '奇豆' },
            { itemId: 17213, count: 150, name: '仙豆' },
            { itemId: 23439, fallbackItemId: 17172, count: 1, fallbackCount: 3, name: '普通抓宠符文' },
        ],
    },
    {
        id: 'desert-astrolabe',
        zone: 'desert',
        landmark: '南部绿洲',
        npcId: 30702,
        openWithoutQuest: true,
        title: '绿洲铜盘辨向',
        eyebrow: '沙漠岛 · 南部绿洲现场校准',
        intro: '热浪折射出海市蜃楼，不少商队在沙丘间迷失了水脉。转动绿洲古铜盘，排除假象，标定三处真正的水源与避风宿营地。',
        completion: '古铜盘咔哒一声锁入正位！清泉从石槽涌出，商队再也不会被正午的海市蜃楼误导。',
        restoredBadge: '铜盘已定水脉：背阴岩泉 · 胡杨根脉 · 峡谷回音壁',
        options: [
            { id: 'shade-spring', label: '背阴岩泉', detail: '高耸岩壁遮住烈日、留住清水的石隙' },
            { id: 'poplar-root', label: '胡杨根脉', detail: '绿叶繁茂的老树下必有深层地下水' },
            { id: 'canyon-wall', label: '峡谷回音壁', detail: '两侧石壁挡住沙暴、适合夜间宿营' },
            { id: 'mirage-lake', label: '滚烫沙脊', detail: '烈日下闪着白光却滴水全无的热沙坡' },
        ],
        slots: [
            {
                id: 'water-1',
                prompt: '正午烈日当空，哪一处地形能避开暴晒蒸发、真正存住清凉泉水？',
                answer: 'shade-spring',
                wrongHints: {
                    'mirage-lake': '滚烫沙脊上的白光只是热浪折射的海市蜃楼，走过去全是干沙！',
                },
                fallbackHint: '避开烈日直射的岩石阴影下才能留住泉水。',
            },
            {
                id: 'water-2',
                prompt: '在茫茫黄沙中寻找隐藏的地下暗水时，应该跟随哪一处自然标志？',
                answer: 'poplar-root',
                wrongHints: {
                    'mirage-lake': '不要被远处的反光骗啦，看看真正长出绿叶的生命痕迹。',
                },
                fallbackHint: '大树能在沙漠存活，说明胡杨根脉深处有地下水。',
            },
            {
                id: 'camp-3',
                prompt: '傍晚沙暴将至，商队和战宠应该转移到哪一处地形安营避风？',
                answer: 'canyon-wall',
                wrongHints: {
                    'shade-spring': '石隙泉眼太窄容不下整支队伍，选两侧有岩壁挡风的峡谷。',
                },
                fallbackHint: '沙暴来临时需要高大石壁遮挡狂风，选峡谷回音壁。',
            },
        ],
        rewards: [
            { itemId: 100, count: 200, name: '奇豆' },
            { itemId: 23440, fallbackItemId: 17213, count: 1, fallbackCount: 200, name: '高级抓宠符文' },
            { itemId: 17172, count: 3, name: '战宠口粮' },
        ],
    },
    {
        id: 'dark-lantern',
        zone: 'dark',
        landmark: '中央幽谷',
        npcId: 35002,
        openWithoutQuest: true,
        title: '幽谷驱雾荧光灯',
        eyebrow: '幽暗岛 · 中央幽谷现场点亮',
        intro: '中央幽谷的古道被瘴雾笼罩，三座引路石灯缺了匹配的荧光芯。按智慧星记录的古林习性装入灯芯，驱散谷口迷雾。',
        completion: '三盏幽谷石灯绽放柔和莹光，缠绕路口的浓雾缓缓退散，林间道路豁然开朗！',
        restoredBadge: '幽谷雾散灯明：青苔萤芯 · 净水月石 · 驱影松香',
        options: [
            { id: 'moss', label: '青苔萤芯', detail: '在潮湿古木旁持续散发柔和绿光' },
            { id: 'moonstone', label: '净水月石', detail: '映照高处微光、标出石桥边界' },
            { id: 'incense', label: '驱影松香', detail: '淡淡松木清香让躁动暗影退避' },
            { id: 'soot', label: '潮湿黑灰', detail: '无法发光也无法驱散湿雾的残灰' },
        ],
        slots: [
            {
                id: 'grove-lamp',
                prompt: '北侧密林湿气极重、普通火苗一进林就熄，石灯该装哪一种光源？',
                answer: 'moss',
                wrongHints: {
                    soot: '潮湿黑灰点不亮石灯，选越在湿润古林越能发光的萤芯吧。',
                },
                fallbackHint: '潮湿古林里最适合不用明火也能发光的青苔萤芯。',
            },
            {
                id: 'bridge-lamp',
                prompt: '东侧石脊断崖边需要清晰映出桥面轮廓防止踏空，该镶嵌哪一件信物？',
                answer: 'moonstone',
                wrongHints: {
                    incense: '松香能安神却照不清桥面边缘，镶嵌能折射月光的宝石更安全。',
                },
                fallbackHint: '借高处微光映亮石桥边界，选净水月石。',
            },
            {
                id: 'valley-lamp',
                prompt: '幽谷中心的雾气里常有躁动黑影窥伺，灯炉里该添上哪一味材料安稳道路？',
                answer: 'incense',
                wrongHints: {
                    soot: '残灰没有气味，添上清冽的松香才能让林间躁动生物安静退开。',
                },
                fallbackHint: '用温和清香安抚古林、驱退暗影，选驱影松香。',
            },
        ],
        rewards: [
            { itemId: 100, count: 260, name: '奇豆' },
            { itemId: 17213, count: 240, name: '仙豆' },
            { itemId: 17172, count: 4, name: '战宠口粮' },
        ],
    },
    {
        id: 'tide-letters',
        zone: 'tide',
        landmark: '回信街',
        npcId: 860002,
        openWithoutQuest: true,
        title: '两只茶杯与旧信核对',
        eyebrow: '潮汐岛 · 回信街现场核对',
        intro: '回信街的木桌上摆着旧信袋里的三张字条。帮小禾与阿澜分清哪句是当年替人代抄的套话、哪句是岑伯真正的心里话、哪句该由父女当面说出。',
        completion: '旧信与真心话终于厘清！回信街的窗灯一盏接一盏亮起，再也没有被藏起来的回答。',
        restoredBadge: '旧信已核清：告别代笔 · 留暖茶杯 · 亲口回答',
        options: [
            { id: 'copied', label: '代抄的客套话', detail: '字迹工整却冷淡，并非本人真意' },
            { id: 'teacups', label: '擦亮的两只茶杯', detail: '嘴上不说、每天却盼着女儿回家的挂念' },
            { id: 'face-to-face', label: '亲口说出的回答', detail: '想念与委屈都可以当面坦诚倾听' },
            { id: 'silence', label: '继续藏进信袋', detail: '因为怕争吵就永远不送出回信' },
        ],
        slots: [
            {
                id: 'slip-1',
                prompt: '那张字迹陌生、只写着「不必再回旧港」的冷淡字条，真相是什么？',
                answer: 'copied',
                wrongHints: {
                    silence: '再藏进信袋只会让误会延续下去，先认出它是别人代抄的套话吧。',
                },
                fallbackHint: '小禾承认当年替人抄过信，那并不是岑伯亲手写的真意。',
            },
            {
                id: 'slip-2',
                prompt: '岑伯嘴上只说别走险路，桌上却每天备好另一只干净杯子，代表什么？',
                answer: 'teacups',
                wrongHints: {
                    copied: '两只茶杯是岑伯每天亲手擦拭的，藏着他不善言辞的想念。',
                },
                fallbackHint: '每天擦干净的第二只杯子，说明他一直盼着女儿回来喝热茶。',
            },
            {
                id: 'slip-3',
                prompt: '面对既有想念又有委屈的父女俩，潮汐岛众人最终选定了怎样的解法？',
                answer: 'face-to-face',
                wrongHints: {
                    silence: '替别人做决定或藏起信件只会留下遗憾，让他们当面把话说完吧。',
                },
                fallbackHint: '不替他们删改心意，留出安静重逢的灯火听他们亲口回答。',
            },
        ],
        rewards: [
            { itemId: 100, count: 320, name: '奇豆' },
            { itemId: 17213, count: 300, name: '仙豆' },
            { itemId: 17172, count: 3, name: '战宠口粮' },
        ],
    },
    {
        id: 'float-charts',
        zone: 'float',
        landmark: '铜星测量台',
        npcId: 860100,
        openWithoutQuest: true,
        title: '两岸双海图叠合校准',
        eyebrow: '浮岸岛 · 铜星测量台现场校准',
        intro: '东岸画着高桥新路，西岸留着瀑布旧港，两边各执一词。把两张透明海图叠在铜星仪上，对齐三处关键基准点，拼出完整的浮岸航线。',
        completion: '铜星仪指针稳稳合拢！新桥与旧港在同一张大图上严丝合缝，两岸居民第一次看清了彼此守护的全貌。',
        restoredBadge: '双海图已合璧：双名井基准 · 瀑布旧锚地 · 高桥新航标',
        options: [
            { id: 'twin-well', label: '双名井碑', detail: '两岸叫法不同、实为同一口古井原点' },
            { id: 'old-harbor', label: '瀑布后旧港', detail: '旧图上保留的避风救船锚地' },
            { id: 'high-bridge', label: '高桥新航标', detail: '新图上避开暗礁的稳固通行桥道' },
            { id: 'erase-one', label: '涂掉其中一张', detail: '强行废除一边记录来换取表面一致' },
        ],
        slots: [
            {
                id: 'origin-point',
                prompt: '叠合两张海图时，哪一处地标虽然在两岸有两个名字，却是共同的测量原点？',
                answer: 'twin-well',
                wrongHints: {
                    'erase-one': '涂掉任何一张都会丢掉真实水文记录，先找两边共有的古井原点！',
                },
                fallbackHint: '名字有两个、井却只有一口，选双名井碑作为叠合原点。',
            },
            {
                id: 'west-layer',
                prompt: '大风浪天船只急需避险时，西岸旧图补上了哪一处被新图漏掉的救命港湾？',
                answer: 'old-harbor',
                wrongHints: {
                    'high-bridge': '高桥是晴天通行的陆路，大风浪避险靠的是瀑布后那处旧锚地。',
                },
                fallbackHint: '贺舟父亲当年救船的记录就在瀑布后面，选瀑布后旧港。',
            },
            {
                id: 'east-layer',
                prompt: '平时两岸往来运送物资、避开水下尖锐暗礁时，东岸新图贡献了哪条安全通道？',
                answer: 'high-bridge',
                wrongHints: {
                    'erase-one': '东岸修筑的新桥实实在在帮大家避开了暗礁，应当保留在合图上。',
                },
                fallbackHint: '日常安全通行靠的是东岸新修的桥道，选高桥新航标。',
            },
        ],
        rewards: [
            { itemId: 100, count: 360, name: '奇豆' },
            { itemId: 23440, fallbackItemId: 17213, count: 1, fallbackCount: 320, name: '高级抓宠符文' },
            { itemId: 17172, count: 4, name: '战宠口粮' },
        ],
    },
    {
        id: 'sail-signals',
        zone: 'sail',
        landmark: '旧名单室',
        npcId: 860201,
        openWithoutQuest: true,
        title: '反挂红帆旗语与归航名单',
        eyebrow: '风帆岛 · 旧名单室现场核查',
        intro: '庆典前夜，风帆塔外有人反挂了红帆。对照旧航海旗语册与缺失的一页名单，还原求救信号并补齐每一个出海人的名字。',
        completion: '缺失的守礁名单正式归档，求救引航灯直照外海！这场不删去任何求救声的庆典，才配得上真正的归航。',
        restoredBadge: '归航册已补全：外礁求救信 · 守灯人名录 · 双灯接应号',
        options: [
            { id: 'sos-reef', label: '外礁搁浅求救', detail: '反挂红帆并非捣乱，而是外海有人受困' },
            { id: 'missing-page', label: '补回守礁名单', detail: '记下当年留守外礁护航的每一位船员' },
            { id: 'twin-lamp', label: '升起双灯接应', detail: '向海面回应已收到信号并派船引航' },
            { id: 'hide-sail', label: '悄悄撤下红帆', detail: '为了庆典好看而假装无事发生' },
        ],
        slots: [
            {
                id: 'signal-meaning',
                prompt: '按照老水手的航海旗语，在夜间反挂红帆真正想传达的讯息是什么？',
                answer: 'sos-reef',
                wrongHints: {
                    'hide-sail': '悄悄撤下红帆会耽误外海受困的人！那不是恶作剧，而是求救旗语。',
                },
                fallbackHint: '反挂红帆是老船员约定的紧急呼救，选外礁搁浅求救。',
            },
            {
                id: 'archive-page',
                prompt: '旧名单室抽屉里少掉的那一页，应该怎样公正地处理？',
                answer: 'missing-page',
                wrongHints: {
                    'hide-sail': '不完美的航行也是真实历史的一部分，不能为了体面抹掉船员名字。',
                },
                fallbackHint: '让每一个出海和留守的人都被记住，选补回守礁名单。',
            },
            {
                id: 'tower-reply',
                prompt: '读懂红帆求救后，风帆塔顶应该挂出什么信号给海面上等待的人？',
                answer: 'twin-lamp',
                wrongHints: {
                    'sos-reef': '塔顶需要发出「我们听见了、这就来接应」的回应信号。',
                },
                fallbackHint: '点亮塔顶回应外海船只并引航归港，选升起双灯接应。',
            },
        ],
        rewards: [
            { itemId: 100, count: 400, name: '奇豆' },
            { itemId: 17213, count: 360, name: '仙豆' },
            { itemId: 17172, count: 5, name: '战宠口粮' },
        ],
    },
];

export const ISLAND_PUZZLES = [...HANZI_LANDMARK_PUZZLES, ...MID_LATE_ISLAND_PUZZLES];

export function registerIslandPuzzles(entries) {
    for (const entry of entries) {
        if (!ISLAND_PUZZLES.some(p => p.id === entry.id)) {
            ISLAND_PUZZLES.push(entry);
        }
    }
}

export function islandPuzzleById(id) {
    return ISLAND_PUZZLES.find(p => p.id === id) || null;
}

export function islandPuzzlesForZone(zone) {
    return ISLAND_PUZZLES.filter(p => p.zone === zone);
}

export function islandPuzzleForLandmark(zone, landmarkName) {
    return ISLAND_PUZZLES.find(p => p.zone === zone && p.landmark === landmarkName) || null;
}

export function islandPuzzlesForNpc(zone, npcId) {
    const id = Number(npcId);
    return ISLAND_PUZZLES.filter(p => p.zone === zone && Number(p.npcId) === id);
}

export function islandPuzzleSolved(save, puzzleId) {
    return !!save?.islandPuzzles?.solved?.[puzzleId];
}

export function islandPuzzleUnlocked(save, puzzle) {
    if (!puzzle || !save) return false;
    if (islandPuzzleSolved(save, puzzle.id)) return true;
    if (puzzle.openWithoutQuest) return true;
    if (puzzle.minLevel && (save.level || 1) < puzzle.minLevel) return false;
    if (puzzle.questId != null) {
        const q = save.quests?.[puzzle.questId];
        return !!(q?.accepted || q?.claimed);
    }
    return true;
}

export function islandPuzzleStatus(save, puzzleOrId) {
    const puzzle = typeof puzzleOrId === 'string' ? islandPuzzleById(puzzleOrId) : puzzleOrId;
    if (!puzzle) return null;
    const solved = islandPuzzleSolved(save, puzzle.id);
    const unlocked = islandPuzzleUnlocked(save, puzzle);
    let lockReason = '';
    if (!unlocked) {
        if (puzzle.minLevel && (save?.level || 1) < puzzle.minLevel) {
            lockReason = `建议达到 ${puzzle.minLevel} 级后再来探索此处机关。`;
        } else if (puzzle.questId != null) {
            lockReason = '先向岛上负责这段故事的居民了解来龙去脉，再来现场安放。';
        }
    }
    return { puzzle, unlocked, solved, lockReason };
}

export function hanziPuzzlesCompletedCount(save) {
    return HANZI_LANDMARK_PUZZLES.reduce((n, p) => n + (islandPuzzleSolved(save, p.id) ? 1 : 0), 0);
}

export function allHanziPuzzlesSolved(save) {
    return HANZI_LANDMARK_PUZZLES.length > 0 && HANZI_LANDMARK_PUZZLES.every(p => islandPuzzleSolved(save, p.id));
}

export function midLatePuzzlesCompletedCount(save) {
    return MID_LATE_ISLAND_PUZZLES.reduce((n, p) => n + (islandPuzzleSolved(save, p.id) ? 1 : 0), 0);
}

export function nextAvailableIslandPuzzle(save, zone) {
    if (!save || !zone) return null;
    for (const p of islandPuzzlesForZone(zone)) {
        const st = islandPuzzleStatus(save, p);
        if (st?.unlocked && !st.solved) return p;
    }
    return null;
}

export function islandPuzzleProgress(save, zone) {
    const list = islandPuzzlesForZone(zone);
    if (!list.length) return null;
    const done = list.reduce((n, p) => n + (islandPuzzleSolved(save, p.id) ? 1 : 0), 0);
    return {
        zone,
        done,
        total: list.length,
        next: nextAvailableIslandPuzzle(save, zone),
    };
}

export function resolvePuzzleRewardItems(content, puzzle) {
    const items = content?.items || {};
    return (puzzle?.rewards || []).flatMap(r => {
        if (items[r.itemId]) {
            return [{ itemId: r.itemId, count: r.count, name: items[r.itemId].name || r.name }];
        }
        if (r.fallbackItemId && items[r.fallbackItemId]) {
            return [{ itemId: r.fallbackItemId, count: r.fallbackCount || r.count, name: items[r.fallbackItemId].name || r.name }];
        }
        return [];
    });
}

export function validateIslandPuzzles(save) {
    const state = save?.islandPuzzles;
    if (state === undefined) return;
    assert(state && typeof state === 'object' && !Array.isArray(state) && state.version === 1, '岛屿现场解谜存档版本无效');
    assert(Object.keys(state).every(k => ['version', 'solved'].includes(k)), '岛屿现场解谜包含未知字段');
    assert(state.solved && typeof state.solved === 'object' && !Array.isArray(state.solved), '岛屿现场解谜记录格式无效');
    const entries = Object.entries(state.solved);
    assert(entries.length <= 64, '岛屿现场解谜记录数量异常');
    for (const [id, val] of entries) {
        assert(/^[a-z0-9-]{3,48}$/.test(id) && val === true, '岛屿现场解谜条目无效');
    }
}

export function applyIslandPuzzle(save, content, action) {
    assert(!save.pendingEncounter, '请先完成当前战斗');
    const puzzle = islandPuzzleById(action?.puzzleId);
    assert(puzzle, '找不到这处现场互动');
    assert(save.zone === puzzle.zone, '请先前往对应的岛屿现场');
    const status = islandPuzzleStatus(save, puzzle);
    assert(status.unlocked, status.lockReason || '这处现场互动尚未开启');
    if (status.solved) {
        return { changed: false, ok: true, alreadySolved: true, message: puzzle.completion, rewards: [] };
    }
    const answers = action?.answers;
    assert(Array.isArray(answers) && answers.length === puzzle.slots.length, '请先把每一处位置都选好');
    const validIds = new Set(puzzle.options.map(o => o.id));
    for (const pick of answers) {
        assert(typeof pick === 'string' && validIds.has(pick), '所选答案不在候选列表中');
    }
    for (let i = 0; i < puzzle.slots.length; i++) {
        const slot = puzzle.slots[i];
        const pick = answers[i];
        if (pick !== slot.answer) {
            const hint = slot.wrongHints?.[pick] || slot.fallbackHint || '再仔细对照现场线索试一试。';
            return {
                changed: false,
                ok: false,
                slotIndex: i,
                message: `第 ${i + 1} 处还不合适：${hint}`,
            };
        }
    }
    save.islandPuzzles ??= { version: 1, solved: {} };
    save.islandPuzzles.solved[puzzle.id] = true;
    const rewards = resolvePuzzleRewardItems(content, puzzle);
    for (const reward of rewards) {
        save.inventory[reward.itemId] = (save.inventory[reward.itemId] || 0) + reward.count;
    }
    save.revision++;
    return {
        changed: true,
        ok: true,
        puzzleId: puzzle.id,
        message: puzzle.completion,
        rewards,
    };
}
