import { isLanguageCourseId, languageSceneTarget } from '../language_quest_core.js';
import { createLanguageSceneIntro } from '../view_language_scene_intro.js';
import { openIslandLanguageCourse } from '../island_language_course.js';
import { npcCharacter } from '../adventure_city_people_core.js';
import { heroPortrait } from '../hero_renderer.js';
import { learningParams } from '../language_adventure_core.js';
import { mapDialogue } from '../dialogue_mapping.js';
import { catalogGoalEncounter } from '../adventure_island_encounters_core.js';
import {
    catalogAcceptBlock,
    catalogGoalRows,
    catalogQuestReady,
    trackedQuestIds,
} from '../adventure_catalog_quests_core.js';
import { dungeonFor } from '../adventure_dungeons_core.js';
import { rewardSnapshot } from '../adventure_reward_feedback_core.js';
import * as A from '../adventure_core.js';
import * as W from '../adventure_world_core.js';
import { renderDialogue as defaultRenderDialogue } from '../views/adventure/view_npc_dialogue.js';

export function createQuestDialogueController({
    nodes,
    getContext,
    model,
    services,
    close = services?.navigation?.close,
    openPanel = services?.navigation?.openPanel,
    persist = services?.persistence?.persist,
    queueCloudSave = services?.persistence?.queueCloudSave,
    paintHud = services?.navigation?.paintHud,
    loadPet,
    missingRewardPets,
    showRewards,
    openFreeTalk,
    performAction,
    walkTo,
    travel,
    opening,
    wordLearning,
    rewardFeedback,
    languageTasks,
    languageAdventure,
    islandSocial,
    petScene,
    dialogueVoice,
    toast = services?.feedback?.toast,
    safely = services?.feedback?.safely,
    renderDialogue = defaultRenderDialogue,
    applyAction = A.applyAction,
    currentQuestFn = A.currentQuest,
    trackedQuestIdsFn = trackedQuestIds,
    onTrack,
    onStartLines,
}) {
    function finishTrackedDialogue() {
        const ctx = getContext();
        if (!ctx.dialog?.fromQuestTracking) return false;
        close();
        if (rewardFeedback.hasPendingItems) return true;
        const content = ctx.assets.content;
        const ids = trackedQuestIdsFn(ctx.save, content).filter(
            id => content.quests.some(quest => quest.id === id) || content.catalogQuests?.byId[id],
        );
        if (ids.length === 1) (onTrack || track)(ids[0], { pin: false });
        return true;
    }

    function questStartPresentation(q) {
        const { save } = getContext();
        const credited = [63002, 63003].includes(q.id) && A.questProgress(save, q).every(goal => goal.value >= goal.count);
        return credited
            ? { lines: [{ npcId: q.startNpc, text: '刚才那场切磋我看到了，这份奖励是你的。' }], label: '记下这场胜利' }
            : {
                  lines: q.startDialog,
                  label: q.id === 63001 ? '接下任务，带我去' : [63002, 63003, 63004, 63005].includes(q.id) ? '接下挑战，带我去' : '接取任务',
              };
    }

    function paintDialogue() {
        const ctx = getContext();
        if (!ctx.dialog) return;
        renderDialogue(nodes.overlay, model(), ctx.dialog, {
            close,
            chat: npc => {
                close();
                const nowSave = getContext().save;
                if (nowSave.zone === 'camp' && nowSave.languageLearning?.enabled) void languageAdventure.open(npc);
                else openFreeTalk(npc);
            },
            mapDialogue,
            readDialogue: (text, locale, signal, speaker) => dialogueVoice.speak(text, locale, signal, speaker),
            next: nextDialogue,
            startQuest: q =>
                startLines(questStartPresentation(q).lines, questStartPresentation(q).label, () => {
                    const nowCtx = getContext();
                    const result = A.applyAction(nowCtx.save, nowCtx.assets.content, { type: 'accept', questId: q.id, npcId: q.startNpc });
                    toast(result.full ? '已接取：{title}。追踪已满3个，请先取消一条。' : '已接取：{title}', { title: q.title });
                    if (!result.full && [63002, 63003, 63004, 63005].includes(q.id)) return 'follow';
                    if (q.id === 63001 || A.questReady(nowCtx.save, q)) return true;
                }),
            finishQuest: q =>
                startLines(q.endDialog, '领取奖励', () => {
                    const nowCtx = getContext();
                    const before = rewardSnapshot(nowCtx.save);
                    A.applyAction(nowCtx.save, nowCtx.assets.content, { type: 'claim', questId: q.id, npcId: q.endNpc });
                    islandSocial().activity('quest');
                    persist();
                    showRewards(before, 'claim');
                    return 'reward';
                }),
            startCatalog: q =>
                startLines(
                    q.startDialog || [],
                    '接取任务',
                    () => {
                        const nowCtx = getContext();
                        const result = applyAction(nowCtx.save, nowCtx.assets.content, { type: 'accept-catalog', questId: q.id, npcId: q.startNpc });
                        wordLearning.refreshWordGoals();
                        toast(result.full ? '已接取：{title}。追踪已满3个，请先取消一条。' : '已接取：{title}', { title: q.title });
                    },
                    true,
                ),
            finishCatalog: q =>
                startLines(
                    q.endDialog || [],
                    '领取奖励',
                    () => {
                        const nowCtx = getContext();
                        const before = rewardSnapshot(nowCtx.save);
                        applyAction(nowCtx.save, nowCtx.assets.content, { type: 'claim-catalog', questId: q.id, npcId: q.endNpc });
                        persist();
                        islandSocial().activity('quest');
                        showRewards(before, 'claim-catalog');
                        toast('已完成：{title}', { title: q.title });
                        return 'reward';
                    },
                    true,
                ),
            questTalk: (q, talk) => startQuestTalk(talk, !!getContext().assets.content.catalogQuests?.byId[q.id]),
            tactics: opening.openTacticsTraining,
            panel: openPanel,
            travel,
            track,
        });
    }

    function startQuestTalk(talk, catalog = false) {
        (onStartLines || startLines)(talk.dialog, talk.dialog.at(-1)?.buttons?.[0]?.label || '谢谢你', () => {
            const nowCtx = getContext();
            if (!catalog && talk.npcId === 36200 && currentQuestFn(nowCtx.save, nowCtx.assets.content)?.id === 63001) {
                opening.openCompanionPractice();
                return 'practice';
            }
            applyAction(nowCtx.save, nowCtx.assets.content, { type: 'talk', npcId: talk.npcId });
            return catalog ? 'catalog-talk' : true;
        });
    }

    function startLines(lines, finishLabel, done, preserveReply = false) {
        const ctx = getContext();
        ctx.dialog.lines = lines;
        ctx.dialog.index = 0;
        ctx.dialog.finishLabel = finishLabel;
        ctx.setDialogDone(done);
        ctx.dialog.questDialogue = false;
        ctx.dialog.preserveReply = preserveReply;
        if (!lines.length) void nextDialogue();
        else paintDialogue();
    }

    async function nextDialogue() {
        const ctx = getContext();
        if (!ctx.dialog) return;
        if (ctx.dialog.index + 1 < ctx.dialog.lines.length) {
            ctx.dialog.index++;
            paintDialogue();
            return;
        }
        const current = ctx.dialog;
        try {
            await Promise.all(missingRewardPets(currentQuestFn(ctx.save, ctx.assets.content)).map(loadPet));
        } catch (error) {
            toast(error.message);
            return;
        }
        if (getContext().dialog !== current) return;
        safely(() => {
            const nowCtx = getContext();
            const npcId = nowCtx.dialog.npcId;
            const advance = nowCtx.dialogDone?.();
            if (advance === 'practice') return;
            petScene().dialogue(`resident:${npcId}`);
            nowCtx.setDialogDone(null);
            persist();
            queueCloudSave();
            paintHud();
            if (finishTrackedDialogue()) return;
            if (advance) {
                close();
                if (advance === 'reward' || advance === 'catalog-talk') return;
                const latest = getContext();
                const q = currentQuestFn(latest.save, latest.assets.content);
                const goal = q && A.questProgress(latest.save, q).find(g => g.value < g.count);
                if (q && (advance === 'follow' || A.questReady(latest.save, q) || goal?.kind === 'talk')) (onTrack || track)();
                return;
            }
            nowCtx.setDialog({ npcId });
            paintDialogue();
        });
    }

    function startLanguageTask(row) {
        close();
        const ctx = getContext();
        if (ctx.save.zone !== row.region) {
            travel(row.region);
            if (getContext().save.zone !== row.region) return;
        }
        const latest = getContext();
        const target = languageSceneTarget(row, latest.world);
        if (!target) {
            toast('这个任务的场景尚未准备好，请稍后重试。');
            return;
        }
        walkTo(target, true);
    }

    function tryLanguageScene(target) {
        const ctx = getContext();
        if (target.questDialogue && !target.languageCourseId) return false;
        const rows = languageTasks.snapshot().rows;
        const row = rows.find(
            r =>
                r.region === ctx.save.zone
                && r.status !== '已完成'
                && (!target.languageCourseId || r.id === target.languageCourseId)
                && (ctx.save.languageLearning.enabled || target.languageCourseId)
                && (() => {
                    const expected = languageSceneTarget(r, ctx.world);
                    return expected?.kind === target.kind && String(expected.id) === String(target.id);
                })(),
        );
        if (!row || target.kind === 'encounter' || W.distance(ctx.save.position, target) > learningParams(ctx.assets.content).interactionRange) {
            return false;
        }
        close();
        ctx.setPanel('language-scene');
        ctx.resetMovementInput();
        const interaction = {
            ...row.interaction,
            zone: ctx.save.zone,
            distance: W.distance(ctx.save.position, target),
            ...(row.battleWon ? { won: true } : {}),
        };
        const character = target.kind === 'npc' ? npcCharacter(target, ctx.assets.hero?.manifest) : null;
        let portraitNode = character ? heroPortrait(ctx.assets, character, 180, 240) : null;
        if (!portraitNode && target.portrait) {
            portraitNode = document.createElement('canvas');
            portraitNode.width = 180;
            portraitNode.height = 240;
            ctx.assets.draw(portraitNode.getContext('2d'), target.portrait, 0, 0, 180, 240, true, false);
        }
        ctx.setCourseView(
            openIslandLanguageCourse({
                introFactory: options => createLanguageSceneIntro(nodes.overlay, model(), options),
                getState: () => {
                    const nowCtx = getContext();
                    return { save: nowCtx.save, content: nowCtx.assets.content, active: nowCtx.stage === 'world' && nowCtx.panel === 'language-scene' };
                },
                courseId: row.courseId,
                interaction,
                actor: target,
                portraitNode,
                onClose: close,
                onComplete: () => {
                    close();
                    paintHud();
                    const next = languageTasks.snapshot().rows.find(q => q.id === row.id);
                    if (next && next.status !== '已完成') startLanguageTask(next);
                },
            }),
        );
        return true;
    }

    function untrack(questId) {
        safely(() => {
            const { save, assets } = getContext();
            A.applyAction(save, assets.content, { type: 'track-catalog', questId: questId ?? null, remove: questId != null });
            paintHud();
        });
    }

    function trackCatalog(id) {
        const ctx = getContext();
        const { save, assets, world } = ctx;
        const c = assets.content;
        const quest = c.catalogQuests.byId[id];
        const snap = A.catalogStatSnapshot(save, c);
        const state = A.questState(save, id);
        const ready = catalogQuestReady(save, c, quest, snap);
        const goal = catalogGoalRows(save, c, quest, snap).find(g => g.value < g.count);
        const npcId = !state.accepted ? quest.startNpc : ready ? quest.endNpc : goal?.kind === 'talk' ? goal.id : 0;
        if (!state.accepted && catalogAcceptBlock(save, c, quest, snap)) {
            toast(catalogAcceptBlock(save, c, quest, snap));
            return;
        }
        if (!state.accepted && (!c.npcs[quest.startNpc] || quest.startNpc === -1)) {
            A.applyAction(save, c, { type: 'accept-catalog', questId: id, npcId: quest.startNpc });
            toast('已接取：{title}', { title: quest.title });
            paintHud();
            return;
        }
        if (ready && (!c.npcs[quest.endNpc] || quest.endNpc === -1)) {
            const before = rewardSnapshot(save);
            A.applyAction(save, c, { type: 'claim-catalog', questId: id, npcId: quest.endNpc });
            persist();
            showRewards(before, 'claim-catalog');
            toast('已完成：{title}', { title: quest.title });
            paintHud();
            return;
        }
        if (npcId && c.npcs[npcId]) {
            if (save.zone !== c.npcs[npcId].zone) {
                travel(c.npcs[npcId].zone);
                if (getContext().save.zone !== c.npcs[npcId].zone) return;
            }
            const placed = getContext().world.npcs.find(n => n.id === npcId);
            if (placed) {
                walkTo({ ...placed, kind: 'npc', questDialogue: true }, true);
                return;
            }
            if (!state.accepted) {
                A.applyAction(save, c, { type: 'accept-catalog', questId: id, npcId: quest.startNpc });
                toast('已接取：{title}', { title: quest.title });
                paintHud();
                return;
            }
            if (ready) {
                const before = rewardSnapshot(save);
                A.applyAction(save, c, { type: 'claim-catalog', questId: id, npcId: quest.endNpc });
                persist();
                showRewards(before, 'claim-catalog');
                toast('已完成：{title}', { title: quest.title });
                paintHud();
                return;
            }
        }
        if (goal?.kind === 'hanzi') {
            if (save.zone !== quest.region) {
                travel(quest.region);
                if (getContext().save.zone !== quest.region) return;
            }
            const target = wordLearning.hanziMemory.target();
            if (target) walkTo(target, false);
            return;
        }
        if (goal && (goal.kind === 'kill' || goal.kind === 'loot')) {
            const encounter = catalogGoalEncounter(c, goal, save.zone, quest.region);
            if (encounter && !dungeonFor(c, encounter.zone) && save.zone !== encounter.zone) {
                travel(encounter.zone);
                if (getContext().save.zone !== encounter.zone) return;
            }
            const placed = encounter && getContext().world.encounters.find(e => e.id === encounter.id);
            if (placed) {
                walkTo({ ...placed, kind: 'encounter' }, true);
                return;
            }
            if (encounter) {
                toast('前往副本挑战{name}', { name: goal.name });
                openPanel('dungeons');
                return;
            }
            const blocked = catalogGoalEncounter(c, goal, save.zone, quest.region, true);
            if (blocked?.blocked?.length) {
                toast(blocked.blocked.join('；'));
                return;
            }
            toast('{name}不在当前已开放的遭遇里。', { name: goal.name });
            return;
        }
        if (goal?.kind === 'custom' && [79016, 79025].includes(goal.id)) {
            openPanel('upgrade');
            return;
        }
        if (goal?.kind === 'custom' && [79017, 79026].includes(goal.id)) {
            openPanel('inventory');
            return;
        }
        if (goal?.kind === 'custom' && goal.id === 79019) {
            openPanel('pet');
            return;
        }
        if (goal?.kind === 'custom' && goal.id === 79037) {
            openPanel('deck');
            return;
        }
        toast(goal ? '{name}需要在冒险中继续完成。' : '任务已记录在手记中。', goal ? { name: goal.name } : undefined);
        paintHud();
    }

    function track(questId, options = {}) {
        const ctx = getContext();
        if (ctx.stage !== 'world') return;
        if (questId === 'dungeon-next') {
            if (!dungeonFor(ctx.assets.content, ctx.save.zone)) return;
            const next = ctx.world?.encounters?.find(encounter => !encounter.hidden && !encounter.blocked?.length);
            if (next) walkTo({ ...next, kind: 'encounter' }, true);
            return;
        }
        if (questId === 'camp-detour') {
            opening.trackCampDetour();
            return;
        }
        if (questId === 'camp-detour-start') {
            if (performAction({ type: 'camp-detour', step: 'start' }) !== false) opening.trackCampDetour();
            return;
        }
        if (questId === 'camp-detour-pause') {
            performAction({ type: 'camp-detour', step: 'pause' });
            return;
        }
        if (questId === 'companion-wordplay') {
            opening.startCompanionWordplay();
            return;
        }
        if (questId === 'opening-journey') {
            opening.trackOpeningJourney();
            return;
        }
        if (questId === 'opening-journey-plan') {
            opening.trackOpeningJourney(true);
            return;
        }
        if (isLanguageCourseId(questId)) {
            const row = languageTasks.snapshot().rows.find(q => q.id === questId);
            if (row && row.status !== '已完成') startLanguageTask(row);
            else openPanel('quests', { questId });
            return;
        }
        close();
        const latest = getContext();
        const c = latest.assets.content;
        const id = Number(questId);
        const quest = id && (c.catalogQuests?.byId[id] || c.quests.find(item => item.id === id));
        if (quest && options.pin !== false) {
            const result = safely(() => A.applyAction(latest.save, c, { type: 'track-catalog', questId: id }));
            if (result === false) return;
            if (result?.full) toast('最多同时追踪3个任务，请先取消一条。');
            if (result?.changed) {
                persist();
                paintHud();
            }
        }
        if (c.catalogQuests?.byId[id]) {
            trackCatalog(id);
            return;
        }
        if (dungeonFor(c, latest.save.zone) && !quest) return;
        const chapter = c.quests.find(item => item.id === id) || (!quest && A.currentQuest(latest.save, c));
        if (!chapter) {
            walkTo({ ...latest.world.portal, kind: 'portal' }, true);
            return;
        }
        if (latest.save.zone !== c.npcs[chapter.startNpc].zone) {
            travel(c.npcs[chapter.startNpc].zone);
            if (getContext().save.zone !== c.npcs[chapter.startNpc].zone) return;
        }
        const nowWorld = getContext().world;
        const nowSave = getContext().save;
        const npc = nid => ({ ...nowWorld.npcs.find(n => n.id === nid), kind: 'npc', questDialogue: true });
        const state = A.questState(nowSave, chapter.id);
        if (!state.accepted) {
            walkTo(npc(chapter.startNpc), true);
            return;
        }
        if (A.questReady(nowSave, chapter)) {
            walkTo(npc(chapter.endNpc), true);
            return;
        }
        const goal = A.questProgress(nowSave, chapter).find(g => g.value < g.count);
        if (!goal) return;
        if (goal.kind === 'talk') walkTo(npc(goal.id), true);
        if (goal.kind === 'defeat') {
            const monster = Object.values(c.monsters).find(m => m.goalId === goal.id);
            walkTo({ ...nowWorld.encounters.find(e => e.monsterId === monster.id), kind: 'encounter' }, true);
        }
        if (goal.kind === 'action') {
            openPanel(
                goal.id === 79016
                    ? 'upgrade'
                    : goal.id === 'hatch-pet' || goal.id === 79019
                      ? 'pet'
                      : goal.id === 79037 && nowSave.equipment[24] === 24003
                        ? 'deck'
                        : 'inventory',
            );
        }
    }

    return {
        finishTrackedDialogue,
        questStartPresentation,
        paintDialogue,
        startQuestTalk,
        startLines,
        nextDialogue,
        startLanguageTask,
        tryLanguageScene,
        untrack,
        trackCatalog,
        track,
    };
}
