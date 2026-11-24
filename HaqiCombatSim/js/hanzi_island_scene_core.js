// Pure scene-state derivation for Hanzi Island (字源岛).
// Turns recovered characters and completed stories into visible world restorations
// and context-aware resident reactions without adding save fields.

export const HANZI_NPCS = {
    achu: 863000,
    xihe: 863001,
    shibo: 863002,
    xiaodeng: 863003,
};

export const HANZI_STELE_TRIAL_ID = 'journey:hanzi:stele-trial';

const LANDMARK_SITES = {
    873100: {
        landmark: '石头路',
        effect: 'signpost',
        pendingLabel: '空白石碑 · 待找回方向字',
        restoredLabel: '路牌已复原',
    },
    873101: {
        landmark: '溪边小村',
        effect: 'canal',
        pendingLabel: '干涸旧水渠 · 待辨认农事字',
        restoredLabel: '水渠已通水',
    },
    873102: {
        landmark: '晨光林',
        effect: 'weather',
        pendingLabel: '空白天气册 · 待记天象字',
        restoredLabel: '天气册已补全',
    },
    873103: {
        landmark: '远行灯塔',
        effect: 'lantern',
        pendingLabel: '夜归告示牌 · 待点亮留灯字',
        restoredLabel: '夜归明灯已亮',
    },
    873104: {
        landmark: '初生码头',
        effect: 'letter',
        pendingLabel: '旧家书石台 · 待读懂心意字',
        restoredLabel: '家书心意已读懂',
    },
    873105: {
        landmark: '字源亭',
        effect: 'festival',
        pendingLabel: '庆典节目单 · 待补齐欢庆字',
        restoredLabel: '字源庆典灯火通明',
    },
};

function hanziPack(content) {
    return content?.islandPacks?.find(p => p.island?.id === 'hanzi') || null;
}

export function hanziMemoryContext(content, wordId) {
    const pack = hanziPack(content);
    const stories = pack?.memory?.stories;
    if (!Array.isArray(stories) || !wordId) return null;
    for (const story of stories) {
        if (!story.words?.includes(wordId)) continue;
        const memory = story.memories?.[wordId];
        if (!memory) continue;
        const npc = pack.npcs?.find(n => n.id === story.npcId) || content?.npcs?.[story.npcId];
        return {
            wordId,
            glyph: memory.glyph || '',
            questId: story.questId,
            storyTitle: story.title,
            problem: story.problem,
            completion: story.completion,
            glimpse: memory.glimpses?.[0] || memory.restored || '',
            restored: memory.restored || '',
            npcId: story.npcId,
            npcName: npc?.name || '岛屿居民',
        };
    }
    return null;
}

function storyRestoredWords(save, story) {
    const record = save?.quests?.[story.questId];
    if (record?.claimed) return [...story.words];
    const progress = record?.progress || {};
    return story.words.filter(id => (progress[`hanzi:${id}`] || 0) >= 1);
}

export function hanziIslandProgress(save, content) {
    const pack = hanziPack(content);
    const stories = pack?.memory?.stories || [];
    const rows = stories.map(story => {
        const record = save?.quests?.[story.questId];
        const doneWords = storyRestoredWords(save, story);
        const claimed = !!record?.claimed;
        const accepted = !!record?.accepted;
        const ready = accepted && !claimed && doneWords.length >= story.words.length;
        return {
            story,
            claimed,
            accepted,
            ready,
            doneWords,
            glyphs: doneWords.map(id => story.memories?.[id]?.glyph).filter(Boolean),
        };
    });
    const completedStories = rows.filter(r => r.claimed).length;
    const restoredWords = rows.reduce((sum, r) => sum + r.doneWords.length, 0);
    const trialClears = save?.dungeonChallengeRecords?.[HANZI_STELE_TRIAL_ID]?.clears || 0;
    return {
        rows,
        completedStories,
        totalStories: stories.length,
        restoredWords,
        totalWords: pack?.memory?.words?.length || 30,
        allRestored: stories.length > 0 && completedStories >= stories.length,
        trialClears,
    };
}

export function hanziIslandScene(save, content, world = null) {
    const pack = hanziPack(content);
    if (!pack?.memory?.stories?.length || !save) return null;
    const progress = hanziIslandProgress(save, content);
    const landmarks = {};
    const signs = [];
    const byQuest = new Map(progress.rows.map(r => [r.story.questId, r]));

    for (const row of progress.rows) {
        const site = LANDMARK_SITES[row.story.questId];
        if (!site) continue;
        const active = row.accepted && !row.claimed;
        const restored = row.claimed;
        const label = restored
            ? `${site.restoredLabel}：${row.glyphs.join(' · ')}`
            : row.doneWords.length > 0
                ? `${row.story.title}（${row.doneWords.length}/${row.story.words.length}）`
                : active
                    ? site.pendingLabel
                    : '';
        landmarks[site.landmark] = {
            questId: row.story.questId,
            title: row.story.title,
            effect: site.effect,
            active,
            ready: row.ready,
            restored,
            done: row.doneWords.length,
            total: row.story.words.length,
            glyphs: row.glyphs,
            label,
        };
        const worldMark = world?.landmarks?.find(m => m.name === site.landmark);
        if (worldMark && row.glyphs.length > 0) {
            const count = row.glyphs.length;
            const spread = 34;
            const startX = worldMark.x - ((count - 1) * spread) / 2;
            row.glyphs.forEach((glyph, idx) => {
                signs.push({
                    x: startX + idx * spread,
                    y: worldMark.y + 42,
                    glyph,
                    restored,
                    effect: site.effect,
                });
            });
        }
    }

    const qRoad = byQuest.get(873100);
    const qWater = byQuest.get(873101);
    const qWeather = byQuest.get(873102);
    const qLamp = byQuest.get(873103);
    const qLetter = byQuest.get(873104);
    const qFest = byQuest.get(873105);

    const npcs = {
        [HANZI_NPCS.shibo]: qRoad?.claimed
            ? '石碑上的方向字亮起来了，山里的孩子再也不怕迷路。'
            : qRoad?.ready
                ? '五个方向字都找齐了！快来一起把路牌刻好。'
                : qRoad?.doneWords.length
                    ? `已经记起「${qRoad.glyphs.join('、')}」，再找找路旁的文字光点吧。`
                    : '石头路上的路牌空了，找回「山、上、下、中、石」就能指路。',
        [HANZI_NPCS.xihe]: qWeather?.claimed
            ? '水渠通了，天气册也有了字，连岛上的小灵兽都精神多了。'
            : qWater?.claimed
                ? qWeather?.ready
                    ? '天象字都齐了！快来记下今天的第一行天气记录。'
                    : '田里喝饱了水，接下来帮我找回记晴雨的字吧。'
                : qWater?.ready
                    ? '水渠木牌的字全找回来了！快把水流进田里。'
                    : '旧水渠的木牌字迹模糊了，帮我找回水和田的名字吧。',
        [HANZI_NPCS.xiaodeng]: progress.trialClears > 0
            ? '守碑试炼已破，夜归明灯永远为你亮着。'
            : qLamp?.claimed
                ? '门前明灯已经点亮！准备好后，可以去挑战「字源守碑试炼」。'
                : qLamp?.ready
                    ? '亮光的字都找回来了，快来点亮门前的夜归告示！'
                    : '天黑前总有人找不到门，也可以先去看看岛上的「字源守碑试炼」。',
        [HANZI_NPCS.achu]: progress.allRestored
            ? progress.trialClears > 0
                ? '字源岛的故事和守碑试炼都被你点亮了，欢迎随时回来看看！'
                : '六段故事都回来了！听说小灯那边的「字源守碑试炼」藏着传世法杖。'
            : qFest?.ready
                ? '庆典的字都集齐了，快回来敲响大鼓一起庆祝！'
                : qLetter?.claimed
                    ? '家书已经读懂，只差最后一组庆典的字就能开宴啦。'
                    : '每个汉字都藏着一段生活故事，先找石伯看看空白路牌吧。',
    };

    return {
        ...progress,
        landmarks,
        signs,
        npcs,
    };
}
