// adventure/presenters/hud_view_model.js — HUD 视图模型派生（剥离规则计算，保持 view_hud.js 专注 DOM 渲染）。
import {
    catalogVisibleGoalRows,
    catalogQuestReady,
    catalogQuestStatus,
    trackedQuestIds,
} from '../../adventure_catalog_quests_core.js';
import { checkinStatus } from '../../adventure_checkin_core.js';
import { dungeonProgress } from '../../adventure_coop_core.js';
import {
    playerSpec,
    questState,
    questReady,
    questProgress,
    catalogStatSnapshot,
    teachingMode,
    beginnerTeaching,
} from '../../adventure_core.js';
import { dungeonFor } from '../../adventure_dungeons_core.js';
import { earthCityChapterProgress, earthCityQuestTarget } from '../../adventure_earth_city_config_core.js';
import { specMaxHp } from '../../adventure_pets_core.js';
import { campDetourGoal, campDetour } from '../../camp_detour_core.js';
import { forestCommissionAvailable, forestCommissionPhase, forestCommissionGoal } from '../../forest_commission_core.js';
import { dailyBuffs, dailyBuffDescription } from '../../language_daily_buff_core.js';
import { recommendedLanguageQuest, withLanguageQuest } from '../../language_quest_core.js';
import {
    openingJourney,
    openingJourneyActive,
    openingJourneyTarget,
    openingJourneyMilestones,
} from '../../opening_journey_core.js';
import { tacticsNextGoal } from '../../tactics_progress_core.js';

export function computeHeroHealth(save, content) {
    const maxHp = specMaxHp(playerSpec(save, content));
    const hp = Math.max(0, Math.min(maxHp, Math.floor(save.heroHp ?? maxHp)));
    const ratio = maxHp > 0 ? (hp / maxHp) * 100 : 0;
    return { hp, maxHp, ratio };
}

export function computeHeroXpRatio(save, content) {
    const levels = content.progression.xpThresholds;
    const previous = levels[save.level - 1] ?? save.xp;
    const next = levels[save.level] ?? save.xp;
    const band = next - previous;
    return band > 0 ? Math.max(0, Math.min(1, (save.xp - previous) / band)) : 1;
}

export function buildCheckinViewModel(model) {
    return checkinStatus(model.save, model.assets.content, model.now ?? Date.now(), model.membership);
}

export function isOpeningQuiet(save) {
    return openingJourneyActive(save);
}

export function buildChapterTrackLines(save, c, quest, withName, objectiveLabel) {
    const state = questState(save, quest.id);
    if (!state.accepted) return [{ text: withName('去找{name}，接取新的任务。', c.npcs[quest.startNpc].name) }];
    if (questReady(save, quest)) return [{ text: withName('任务已完成，向{name}回报。', c.npcs[quest.endNpc].name) }];
    return questProgress(save, quest).map(goal => ({
        text: objectiveLabel(goal, c),
        done: goal.value >= goal.count,
    }));
}

export function buildCatalogTrackLines(save, c, quest, withName, translatedGoal) {
    const snap = catalogStatSnapshot(save, c);
    const state = questState(save, quest.id);
    const ready = catalogQuestReady(save, c, quest, snap);
    if (!state.accepted) {
        const name = c.npcs[quest.startNpc]?.name;
        return [{ text: name ? withName('去找{name}，接取新的任务。', name) : '接取这个任务。' }];
    }
    if (ready) {
        const name = c.npcs[quest.endNpc]?.name;
        return [{ text: name ? withName('任务已完成，向{name}回报。', name) : '任务已完成，可以交付。' }];
    }
    const goals = catalogVisibleGoalRows(save, c, quest, snap);
    if (!goals.length) return [{ text: '与居民交谈后即可交付。' }];
    return goals.map(goal => ({ text: translatedGoal(goal), done: goal.value >= goal.count }));
}

export function buildTrackerEntryState(save, c, entry, teach) {
    const chapter = c.quests.find(quest => quest.id === entry.id);
    const quest = chapter || c.catalogQuests.byId[entry.id];
    const ready = chapter ? questReady(save, quest) : catalogQuestReady(save, c, quest, catalogStatSnapshot(save, c));
    const state = questState(save, quest.id);
    const campQuest = chapter ? c.npcs[quest.startNpc]?.zone === 'camp' : quest.region === 'camp';
    const teachNow = teach.allow && (beginnerTeaching(save) || campQuest) && !state.claimed;
    if (teachNow) teach.allow = false;
    const statusLabel = chapter
        ? ready
            ? '可以交付'
            : state.accepted
                ? '进行中'
                : '可接取'
        : catalogQuestStatus(save, c, quest, catalogStatSnapshot(save, c));
    const goals = chapter && campQuest && state.accepted ? questProgress(save, quest) : null;
    return { chapter, quest, ready, state, campQuest, teachNow, statusLabel, goals };
}

export function buildHudTrackerViewModel(model) {
    const { assets, save } = model;
    const c = assets.content;
    const chapterDone = c.quests.filter(quest => save.quests[quest.id]?.claimed).length;
    const catalogClaimed = c.catalogQuests?.quests.filter(quest => save.quests[quest.id]?.claimed).length || 0;
    const dungeon = dungeonFor(c, save.zone);

    let mode = 'quests';
    let payload = {};
    if (save.zone === 'camp' && !model.localSecond && openingJourneyActive(save)) {
        mode = 'opening';
        const state = openingJourney(save);
        const goal = openingJourneyTarget(save);
        const milestones = openingJourneyMilestones(save).filter(row => row.complete).length;
        payload = { state, goal, milestones };
    } else if (campDetourGoal(save)) {
        mode = 'camp-detour';
        payload = { goal: campDetourGoal(save), step: campDetour(save).step };
    } else if (save.zone === 'earth') {
        mode = 'earth';
        const chapter = model.earthChapter;
        const city = c.earthWorld?.city;
        const step = chapter?.steps[earthCityChapterProgress(save, chapter).step];
        const side = earthCityQuestTarget(save, city);
        payload = { chapter, step, side };
    } else if (dungeon) {
        mode = 'dungeon';
        const clearedList = dungeonProgress(save)?.[save.zone]?.cleared || [];
        const cleared = clearedList.length;
        const remaining = dungeon.arenas.filter(a => !a.blocked.length && !clearedList.includes(a.id)).length;
        payload = { dungeon, cleared, remaining };
    } else {
        const ids = trackedQuestIds(save, c).filter(
            id => c.quests.some(quest => quest.id === id) || c.catalogQuests?.byId[id],
        );
        const tracked = ids.length ? ids.map(id => ({ id, pinned: true })) : [];
        const languageQuest =
            save.zone === 'camp' && openingJourney(save)
                ? null
                : recommendedLanguageQuest(save, c, model.languageTasks?.rows || [], catalogStatSnapshot(save, c));
        const entries = withLanguageQuest(tracked, languageQuest);
        payload = { entries, teachAllow: !!teachingMode(save, c) };
    }

    const tacticsGoal =
        !model.localSecond && !dungeon && !openingJourneyActive(save) && !campDetourGoal(save)
            ? tacticsNextGoal(save)
            : null;
    const forestAvailable =
        save.zone === 'camp'
        && !model.localSecond
        && forestCommissionAvailable(save)
        && !campDetourGoal(save)
        && forestCommissionPhase(save) !== 'done';
    const forestGoal = forestAvailable
        ? { phase: forestCommissionPhase(save), goal: forestCommissionGoal(save) }
        : null;
    const dailyBuffLayers = Object.values(dailyBuffs(save)).reduce((a, b) => a + b, 0);
    const dailyBuffText = dailyBuffDescription(save);

    return {
        chapterDone,
        catalogClaimed,
        mode,
        payload,
        tacticsGoal,
        forestGoal,
        dailyBuffLayers,
        dailyBuffText,
    };
}
