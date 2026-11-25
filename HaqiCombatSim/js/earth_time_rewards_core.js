// Pure rules for Time Scroll & Earth (Shenzhen) exploration milestone bounties.
// Keeps completeTimeStory strictly non-minting (preserving battle_time_scroll.test.mjs)
// while rewarding players with meaningful adventure items for exploring both worlds.

const assert = (ok, message) => {
    if (!ok) throw new Error(message);
};

export function earthTimeStats(save) {
    const cities = save?.timeScrollProgress?.cities || {};
    const timeScrollClues = Object.values(cities).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);

    const storyMap = save?.languageAdventure?.stories || {};
    const doneStories = new Set();
    for (const byLang of Object.values(storyMap)) {
        for (const [id, row] of Object.entries(byLang || {})) {
            if (id.startsWith('time-scroll:') && row?.completed) doneStories.add(id);
        }
    }
    const timeScrollStories = doneStories.size;

    const earthCities = save?.earthCityProgress?.cities || {};
    let cityDungeonClears = 0;
    let citySteps = 0;
    for (const city of Object.values(earthCities)) {
        for (const run of Object.values(city?.dungeons || {})) {
            cityDungeonClears += Array.isArray(run?.cleared) ? run.cleared.length : 0;
        }
        for (const ch of Object.values(city?.chapters || {})) {
            citySteps += Number(ch?.step) || 0;
        }
    }
    for (const [id, run] of Object.entries(save?.dungeonRuns || {})) {
        if (id.startsWith('city:')) cityDungeonClears += Array.isArray(run?.cleared) ? run.cleared.length : 0;
    }

    const earthVisited = !!(
        save?.zone === 'earth'
        || String(save?.zone || '').startsWith('city:')
        || timeScrollClues > 0
        || cityDungeonClears > 0
        || citySteps > 0
        || Object.keys(save?.earthProgress || {}).length > 0
        || Object.keys(earthCities).length > 0
    );

    return {
        timeScrollClues,
        timeScrollStories,
        earthVisited,
        cityDungeonClears,
        citySteps,
    };
}

export const EARTH_TIME_MILESTONES = [
    {
        id: 'time-clue-1',
        title: '时光初痕（发现 1 条时光长卷线索）',
        hint: '在现实世界城市打开「时光长卷」，沿时光道路走到线索旁探索。',
        check: stats => stats.timeScrollClues >= 1,
        rewards: [{ id: 100, count: 80 }, { id: 17213, count: 2 }],
    },
    {
        id: 'time-clue-3',
        title: '岁月拾遗（累计发现 3 条时光长卷线索）',
        hint: '在时光长卷中收集 3 个不同年代的线索记录。',
        check: stats => stats.timeScrollClues >= 3,
        rewards: [{ id: 100, count: 160 }, { id: 23439, count: 1 }, { id: 17213, count: 3 }],
    },
    {
        id: 'time-story-1',
        title: '跨时对话（完成 1 段时光旅人故事）',
        hint: '在时光长卷中与任意一位旅人交谈并完成三轮语言对话。',
        check: stats => stats.timeScrollStories >= 1,
        rewards: [{ id: 100, count: 140 }, { id: 17487, count: 1 }],
    },
    {
        id: 'time-story-3',
        title: '光阴知音（完成 3 段时光旅人故事）',
        hint: '在时光长卷中完成 3 位不同年代旅人的故事对话。',
        check: stats => stats.timeScrollStories >= 3,
        rewards: [{ id: 100, count: 260 }, { id: 26012, count: 1 }, { id: 17487, count: 1 }],
    },
    {
        id: 'earth-visit',
        title: '穿越旋涡（抵达现实世界 · 深圳）',
        hint: '打开世界地图切换至现实世界，踏上深圳海湾与街区。',
        check: stats => stats.earthVisited,
        rewards: [{ id: 100, count: 120 }, { id: 17172, count: 3 }],
    },
    {
        id: 'earth-city-clear',
        title: '街区历练（完成 1 处现实城市街区挑战）',
        hint: '在深圳的蛇口、华强北、深圳湾或南头街区完成至少 1 场城市副本战斗。',
        check: stats => stats.cityDungeonClears >= 1,
        rewards: [{ id: 100, count: 240 }, { id: 26028, count: 1 }, { id: 17213, count: 5 }],
    },
];

const VALID_IDS = new Set(EARTH_TIME_MILESTONES.map(m => m.id));

export function validateEarthTimeClaims(save) {
    if (save?.earthTimeClaims === undefined) return;
    assert(
        Array.isArray(save.earthTimeClaims)
            && new Set(save.earthTimeClaims).size === save.earthTimeClaims.length
            && save.earthTimeClaims.every(id => typeof id === 'string' && VALID_IDS.has(id)),
        '双世界时光赏金记录无效',
    );
}

export function earthTimeMilestoneSummary(save, content) {
    const stats = earthTimeStats(save);
    const claimed = new Set(save?.earthTimeClaims || []);
    const rows = EARTH_TIME_MILESTONES.map(def => {
        const unlocked = def.check(stats);
        const isClaimed = claimed.has(def.id);
        return {
            id: def.id,
            title: def.title,
            hint: def.hint,
            unlocked,
            claimed: isClaimed,
            claimable: unlocked && !isClaimed,
            rewards: def.rewards.filter(r => r.id === 100 || !content?.items || content.items[r.id]),
        };
    });
    return {
        stats,
        rows,
        claimedCount: rows.filter(r => r.claimed).length,
        claimableCount: rows.filter(r => r.claimable).length,
    };
}

export function claimEarthTimeMilestone(save, content, milestoneId) {
    assert(!save.pendingEncounter, '战斗中无法领取双世界赏金');
    assert(typeof milestoneId === 'string' && VALID_IDS.has(milestoneId), '未知双世界里程碑编号');
    const summary = earthTimeMilestoneSummary(save, content);
    const row = summary.rows.find(r => r.id === milestoneId);
    assert(row, '找不到对应双世界里程碑');
    assert(row.unlocked, '尚未达成该双世界探索条件');
    if (row.claimed) {
        return { changed: false, rewards: [], message: '这项双世界里程碑已经领取过了。' };
    }
    save.earthTimeClaims ??= [];
    save.earthTimeClaims.push(milestoneId);
    const granted = [];
    for (const r of row.rewards) {
        if (r.id !== 100 && content?.items && !content.items[r.id]) continue;
        save.inventory[r.id] = (save.inventory[r.id] || 0) + r.count;
        granted.push({
            id: r.id,
            count: r.count,
            name: content?.items?.[r.id]?.name || (r.id === 100 ? '奇豆' : String(r.id)),
        });
    }
    save.revision = (save.revision || 0) + 1;
    return {
        changed: true,
        milestoneId,
        rewards: granted,
        message: `已领取「${row.title}」赏金！`,
    };
}
