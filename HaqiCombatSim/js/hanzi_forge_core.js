// Pure rules for the Hanzi Island Compound Forge ("字源合字坊 · 会意造字炉").
// Lets players combine fundamental pictograph tiles from Hanzi Island to forge
// 12 authentic compound Chinese characters (会意字), with playful situational
// reactions for experimental pairs, one-time progression rewards, and storage
// inside the existing validated `save.islandPuzzles.solved` map.

import { syncProgression } from './adventure_deck_core.js';

const assert = (ok, message) => {
    if (!ok) throw new Error(message);
};

export const HANZI_FORGE_RADICALS = [
    { id: 'ri', glyph: '日', pinyin: 'rì', cue: '太阳' },
    { id: 'yue', glyph: '月', pinyin: 'yuè', cue: '弯月' },
    { id: 'ren', glyph: '人', pinyin: 'rén', cue: '行人' },
    { id: 'mu', glyph: '木', pinyin: 'mù', cue: '树木' },
    { id: 'shan', glyph: '山', pinyin: 'shān', cue: '山峰' },
    { id: 'shi', glyph: '石', pinyin: 'shí', cue: '岩石' },
    { id: 'shui', glyph: '水', pinyin: 'shuǐ', cue: '溪水' },
    { id: 'tian-field', glyph: '田', pinyin: 'tián', cue: '农田' },
    { id: 'tu', glyph: '土', pinyin: 'tǔ', cue: '泥土' },
    { id: 'huo', glyph: '火', pinyin: 'huǒ', cue: '火苗' },
    { id: 'men', glyph: '门', pinyin: 'mén', cue: '屋门' },
    { id: 'er', glyph: '耳', pinyin: 'ěr', cue: '耳朵' },
    { id: 'kou', glyph: '口', pinyin: 'kǒu', cue: '开口' },
    { id: 'shou', glyph: '手', pinyin: 'shǒu', cue: '手掌' },
    { id: 'mu-eye', glyph: '目', pinyin: 'mù', cue: '眼睛' },
    { id: 'xin', glyph: '心', pinyin: 'xīn', cue: '内心' },
    { id: 'da', glyph: '大', pinyin: 'dà', cue: '宽大' },
    { id: 'xiao', glyph: '小', pinyin: 'xiǎo', cue: '细小' },
];

export const HANZI_FORGE_RECIPES = [
    {
        id: 'ming',
        solvedKey: 'forge-ming',
        glyph: '明',
        pinyin: 'míng',
        title: '日月同辉',
        parts: ['ri', 'yue'],
        story: '白天的太阳与夜晚的明月并肩发光，合起来就是驱散昏暗的「明」。',
        words: ['明亮', '明天'],
        hint: '把白天的太阳和夜晚的弯月放在一起，天色立刻亮堂起来。',
    },
    {
        id: 'xiu',
        solvedKey: 'forge-xiu',
        glyph: '休',
        pinyin: 'xiū',
        title: '荫下歇脚',
        parts: ['ren', 'mu'],
        story: '赶路的人停在浓密的大树旁乘凉歇息，正是「休」字的来历。',
        words: ['休息', '午休'],
        hint: '旅人走累了，最想靠在什么高大的植物旁歇一会儿？',
    },
    {
        id: 'lin',
        solvedKey: 'forge-lin',
        glyph: '林',
        pinyin: 'lín',
        title: '双木成荫',
        parts: ['mu', 'mu'],
        story: '两棵大树并肩而立、枝叶相连，汇成一片清凉的小树林。',
        words: ['树林', '竹林'],
        hint: '一棵树太孤单，把两棵相同的树摆在一起试试看。',
    },
    {
        id: 'sen',
        solvedKey: 'forge-sen',
        glyph: '森',
        pinyin: 'sēn',
        title: '三木成海',
        parts: ['mu', 'mu', 'mu'],
        story: '三棵大树层层叠起，化作遮天蔽日、鸟鸣不断的大森林。',
        words: ['森林', '森然'],
        hint: '如果两棵树还不够茂密，再添上第三棵放进三连砚槽呢？',
    },
    {
        id: 'yan',
        solvedKey: 'forge-yan',
        glyph: '岩',
        pinyin: 'yán',
        title: '山崖巨石',
        parts: ['shan', 'shi'],
        story: '高山峻岭间突兀坚硬的大石，山在下石相依，合为「岩」。',
        words: ['岩石', '山岩'],
        hint: '高峰之上立着坚硬的石头，山与石相合会造出什么字？',
    },
    {
        id: 'kan',
        solvedKey: 'forge-kan',
        glyph: '看',
        pinyin: 'kàn',
        title: '举手远望',
        parts: ['shou', 'mu-eye'],
        story: '古人眺望远方时常抬起手掌遮在眼眉上挡住刺眼阳光，这便是「看」。',
        words: ['看见', '看望'],
        hint: '把一只手搭在眼睛上方遮住阳光，就能望得更远。',
    },
    {
        id: 'wen-hear',
        solvedKey: 'forge-wen-hear',
        glyph: '闻',
        pinyin: 'wén',
        title: '倚门细听',
        parts: ['men', 'er'],
        story: '把耳朵轻轻贴近门扉，听见门外传来的风声与归人脚步，是为「闻」。',
        words: ['见闻', '耳闻'],
        hint: '站在门里，用什么器官去听门外传来的动静？',
    },
    {
        id: 'wen-ask',
        solvedKey: 'forge-wen-ask',
        glyph: '问',
        pinyin: 'wèn',
        title: '叩门求教',
        parts: ['men', 'kou'],
        story: '来到门前轻声开口请教主人，门中藏口，正是礼貌的「问」。',
        words: ['问候', '学问'],
        hint: '走到别家门前，想要请教问题必须用什么来出声？',
    },
    {
        id: 'jian',
        solvedKey: 'forge-jian',
        glyph: '尖',
        pinyin: 'jiān',
        title: '上小下大',
        parts: ['xiao', 'da'],
        story: '底部宽大厚实、顶端收成细小一点，就像山峰与针尖一样锐利。',
        words: ['山尖', '尖角'],
        hint: '上面细细小小、下面宽宽大大，把一对反义字叠在一起！',
    },
    {
        id: 'chen',
        solvedKey: 'forge-chen',
        glyph: '尘',
        pinyin: 'chén',
        title: '微土轻扬',
        parts: ['xiao', 'tu'],
        story: '极其细小的泥土微粒在阳光里轻轻飘浮，正是「尘」字。',
        words: ['尘土', '灰尘'],
        hint: '细小到几乎看不见的泥土颗粒，会合出哪个字？',
    },
    {
        id: 'si',
        solvedKey: 'forge-si',
        glyph: '思',
        pinyin: 'sī',
        title: '心系故田',
        parts: ['tian-field', 'xin'],
        story: '心里装着远方的家田与亲人，牵挂反复萦绕，便是深情的「思」。',
        words: ['思念', '思考'],
        hint: '离家远行时，胸口那颗心一直挂念着脚下的方格农田。',
    },
    {
        id: 'yan-flame',
        solvedKey: 'forge-yan-flame',
        glyph: '炎',
        pinyin: 'yán',
        title: '双火腾跃',
        parts: ['huo', 'huo'],
        story: '两团跳动的火焰上下相叠，热浪滚滚，这就是盛夏的「炎」。',
        words: ['炎热', '烈炎'],
        hint: '一簇火苗已经够暖和了，把两簇火苗叠在一起会怎样？',
    },
];

const PLAYFUL_REACTIONS = {
    'huo+shui': '水火相逢，滋啦冒出一团白茫茫的水汽！试试把两团「火」叠在一起，或让「日」配「月」。',
    'mu+huo': '木头遇上火苗烧得劈啪作响，倒像营地篝火！想造森林可以多放几棵「木」哦。',
    'ren+shan': '人站在高山旁让人想起「仙」字意象！合字坊当前收录了「人靠木」与「山叠石」。',
    'shan+shui': '青山配绿水，好一幅山水画卷！试试把「山」和「石」合在一起造出峭壁巨岩。',
    'ri+mu': '朝阳升在树林间，这正是「东」字的古老画意！再试试「日 + 月」或「两棵木」吧。',
    'kou+xin': '嘴上说的和心里想的合在一起，诚意满满！试试把「口」放进「门」里礼貌发问吧。',
    'ri+ri': '两个太阳同时挂在天上可太晒啦！把其中一个换成夜空的「月」试试？',
    'ren+ren': '两个人一前一后并肩同行（从）！合字坊里还有「人靠木歇脚」等你发现。',
    'shou+shou': '两只手拍在一起鼓起掌来！试试把一只「手」搭在「目」上眺望远方吧。',
    'men+ri': '阳光穿过门缝洒进来（间），真暖和！试试在「门」里放「口」或「耳」。',
    'shui+tian-field': '清渠流进方田，禾苗喝饱了水！把「田」和「心」合在一起，会有思念之意哦。',
    'shi+tu': '石头拌泥土能筑出结实堤坝！把「小」和「土」合在一起看看微尘怎么来。',
};

function signature(ids) {
    return [...ids].sort().join('+');
}

export function hanziRadicalById(id) {
    return HANZI_FORGE_RADICALS.find(r => r.id === id) || null;
}

export function hanziForgeRecipeById(id) {
    return HANZI_FORGE_RECIPES.find(r => r.id === id) || null;
}

export function hanziForgeDiscovered(save, recipeOrId) {
    const recipe = typeof recipeOrId === 'string'
        ? hanziForgeRecipeById(recipeOrId)
        : recipeOrId;
    if (!recipe) return false;
    return !!save?.islandPuzzles?.solved?.[recipe.solvedKey];
}

export function hanziForgeCount(save) {
    return HANZI_FORGE_RECIPES.reduce((n, r) => n + (hanziForgeDiscovered(save, r) ? 1 : 0), 0);
}

export function hanziForgedRecipes(save) {
    return HANZI_FORGE_RECIPES.filter(r => hanziForgeDiscovered(save, r));
}

export function nextUndiscoveredForgeRecipe(save) {
    return HANZI_FORGE_RECIPES.find(r => !hanziForgeDiscovered(save, r)) || null;
}

export function matchHanziForge(partIds) {
    if (!Array.isArray(partIds) || partIds.length < 2 || partIds.length > 3) {
        return { matched: false, recipe: null, reaction: '请先往合字砚台里放入 2 至 3 枚象形字块再合字。' };
    }
    const validIds = new Set(HANZI_FORGE_RADICALS.map(r => r.id));
    if (partIds.some(id => typeof id !== 'string' || !validIds.has(id))) {
        return { matched: false, recipe: null, reaction: '砚台里混进了未知字块，清空后再试一次吧。' };
    }
    const sig = signature(partIds);
    const recipe = HANZI_FORGE_RECIPES.find(r => signature(r.parts) === sig) || null;
    if (recipe) {
        return { matched: true, recipe, reaction: '' };
    }
    if (partIds.length === 2 && PLAYFUL_REACTIONS[sig]) {
        return { matched: false, recipe: null, reaction: PLAYFUL_REACTIONS[sig] };
    }
    const glyphs = partIds.map(id => hanziRadicalById(id)?.glyph || id).join(' + ');
    if (partIds.length === 3 && partIds.every(id => id !== 'mu')) {
        return {
            matched: false,
            recipe: null,
            reaction: `「${glyphs}」三枚字块轻轻相碰却没合出新字——三连合字试试三棵「木」，其余多数只需两枚字块哦！`,
        };
    }
    return {
        matched: false,
        recipe: null,
        reaction: `「${glyphs}」碰出一缕墨香，但还没拼出图谱里的会意字。翻看下方图谱谜面寻找灵感吧！`,
    };
}

export function applyHanziForge(save, content, action) {
    assert(!save.pendingEncounter, '请先完成当前战斗');
    assert(save.zone === 'hanzi', '请先前往字源岛再使用字源合字坊');
    const parts = action?.parts;
    assert(Array.isArray(parts) && parts.length >= 2 && parts.length <= 3, '请先放入 2 至 3 枚字块');
    const validIds = new Set(HANZI_FORGE_RADICALS.map(r => r.id));
    for (const id of parts) {
        assert(typeof id === 'string' && validIds.has(id), '所选象形字块无效');
    }

    const match = matchHanziForge(parts);
    if (!match.matched || !match.recipe) {
        return {
            changed: false,
            ok: false,
            recipe: null,
            message: match.reaction,
            rewards: [],
        };
    }

    const recipe = match.recipe;
    if (hanziForgeDiscovered(save, recipe)) {
        return {
            changed: false,
            ok: true,
            alreadyDiscovered: true,
            recipe,
            totalDone: hanziForgeCount(save),
            message: `「${recipe.glyph}」（${recipe.pinyin} · ${recipe.title}）已收入合字图谱，墨香依旧温润！`,
            rewards: [],
        };
    }

    save.islandPuzzles ??= { version: 1, solved: {} };
    save.islandPuzzles.solved[recipe.solvedKey] = true;
    const totalDone = hanziForgeCount(save);
    const rewards = [];

    if (content?.items?.[100]) {
        save.inventory[100] = (save.inventory[100] || 0) + 35;
        rewards.push({ itemId: 100, count: 35, name: content.items[100].name || '奇豆' });
    }
    save.xp = (save.xp || 0) + 60;
    rewards.push({ itemId: 113, count: 60, name: '经验' });
    if (content?.progression) {
        syncProgression(save, content);
    }

    if (totalDone % 3 === 0) {
        const milestoneItem = totalDone === 6 || totalDone === 12
            ? { id: 23439, fallback: 17213, count: 1, fallbackCount: 100, name: '普通抓宠符文' }
            : { id: 17172, fallback: 17213, count: 2, fallbackCount: 80, name: '战宠口粮' };
        if (content?.items?.[milestoneItem.id]) {
            save.inventory[milestoneItem.id] = (save.inventory[milestoneItem.id] || 0) + milestoneItem.count;
            rewards.push({
                itemId: milestoneItem.id,
                count: milestoneItem.count,
                name: content.items[milestoneItem.id].name || milestoneItem.name,
            });
        } else if (content?.items?.[milestoneItem.fallback]) {
            save.inventory[milestoneItem.fallback] = (save.inventory[milestoneItem.fallback] || 0) + milestoneItem.fallbackCount;
            rewards.push({
                itemId: milestoneItem.fallback,
                count: milestoneItem.fallbackCount,
                name: content.items[milestoneItem.fallback].name || '仙豆',
            });
        }
    }

    save.revision++;
    return {
        changed: true,
        ok: true,
        alreadyDiscovered: false,
        recipe,
        totalDone,
        message: `会意成字：「${recipe.glyph}」（${recipe.pinyin}）——${recipe.story}`,
        rewards,
    };
}
