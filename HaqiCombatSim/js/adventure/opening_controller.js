import {
    createTacticsFieldBattle,
    nextTacticsFieldId,
    recordTacticsFieldVictory,
    TACTICS_FIELD_ENCOUNTERS,
} from '../tactics_field_battle_core.js';
import { openingJourney, openingJourneyTarget } from '../opening_journey_core.js';
import { renderOpeningJourney, playOpeningPetWelcome } from '../view_opening_journey.js';
import { renderForestCommission } from '../view_forest_commission.js';
import {
    forestCommissionAvailable,
    forestCommissionGoal,
    forestCommissionSites,
    FOREST_PATROL_DUNGEON,
} from '../forest_commission_core.js';
import {
    createCompanionPractice,
    selectCompanionPractice,
    castCompanionPractice,
} from '../companion_practice_core.js';
import { openCompanionWordplay } from '../companion_wordplay.js';
import { campDetourGoal } from '../camp_detour_core.js';
import { persistReward } from '../adventure_reward_persistence.js';
import { createLearningVoice } from '../audio/language_adventure_voice.js';
import { recordWordPractice } from '../language_course.js';
import { learningLesson, learningPracticeLanguage } from '../learning_language_core.js';
import { renderCompanionPractice as defaultRenderCompanionPractice } from '../views/adventure/view_panel_modal.js';
import * as W from '../adventure_world_core.js';

export function createOpeningController({
    nodes,
    getContext,
    model,
    services,
    close = services?.navigation?.close,
    openPanel = services?.navigation?.openPanel,
    persist = services?.persistence?.persist,
    saveLocal = services?.persistence?.saveLocal,
    queueCloudSave = services?.persistence?.queueCloudSave,
    paintHud = services?.navigation?.paintHud,
    paintBattle = services?.navigation?.paintBattle,
    stopBattleChatVoice,
    enterWorld = services?.navigation?.enterWorld,
    performAction,
    openJourney,
    walkTo,
    track,
    toast = services?.feedback?.toast,
    safely = services?.feedback?.safely,
    spellSound = services?.feedback?.spellSound,
    petScene,
    dialogueVoice,
    renderCompanionPractice = defaultRenderCompanionPractice,
    renderForestCommissionView = renderForestCommission,
    renderOpeningJourneyView = renderOpeningJourney,
    playOpeningPetWelcomeFn = playOpeningPetWelcome,
    persistRewardFn = persistReward,
    onOpenTacticsTraining,
    onTrackOpeningJourney,
}) {
    let tacticsPractice = null;
    let companionPractice = null;
    let wordplaySession = null;
    let wordplayDrain = null;
    let openingWelcomeKey = null;
    let openingSpeech = null;
    let forestPracticeTask = null;

    function openTacticsTraining(options) {
        const ctx = getContext();
        if (ctx.stage !== 'world' || ctx.save.pendingEncounter) return;
        const lessonId = TACTICS_FIELD_ENCOUNTERS.some(row => row.id === options?.lesson)
            ? options.lesson
            : nextTacticsFieldId(ctx.save);
        const settings = { lessonId, seed: ctx.save.seed, name: ctx.save.name };
        const create = () => createTacticsFieldBattle(ctx.assets.dataset, ctx.assets.content, settings);
        const next = create(); // Prepare fully before changing the world or current view.
        tacticsPractice = { save: ctx.save, epoch: ctx.roleEpoch, create, decisions: [], recorded: false, returnTo: options?.returnTo };
        close();
        (ctx.clearMovementPath || ctx.clearMovementInput)?.();
        ctx.setBattle(next);
        ctx.setStage('battle');
        ctx.setSelected(null);
        ctx.setDiscarded([]);
        ctx.setAnimation(null);
        ctx.setPetCardsOpen(false);
        ctx.setRuneCardsOpen(false);
        nodes.hud.hidden = true;
        paintBattle();
    }

    async function finishTacticsFight({ next = false } = {}) {
        const ctx = getContext();
        const session = tacticsPractice;
        if (!session || ctx.save !== session.save || ctx.roleEpoch !== session.epoch || !ctx.battle?.tacticsField) return;
        const lessonId = ctx.battle.tacticsField.id;
        const won = ctx.battle.finished && ctx.battle.winner === 'near';
        if (won && !session.recorded) {
            const receipt = structuredClone(ctx.save);
            recordTacticsFieldVictory(receipt, ctx.battle);
            receipt.revision++;
            saveLocal(receipt, ctx.roleStorage);
            Object.assign(ctx.save, receipt);
            session.recorded = true;
            queueCloudSave();
        }
        const index = TACTICS_FIELD_ENCOUNTERS.findIndex(row => row.id === lessonId);
        const following = won ? TACTICS_FIELD_ENCOUNTERS[(index + 1) % TACTICS_FIELD_ENCOUNTERS.length].id : lessonId;
        const returnTo = session.returnTo;
        stopBattleChatVoice();
        tacticsPractice = null;
        ctx.setAnimation(null);
        ctx.setSelected(null);
        ctx.setDiscarded([]);
        await enterWorld(ctx.save, null, { announceBeans: false });
        const latest = getContext();
        if (latest.save !== session.save || latest.roleEpoch !== session.epoch) return;
        if (next) openTacticsTraining({ lesson: following, returnTo });
        else if (returnTo) openPanel(returnTo);
    }

    function openCompanionPractice() {
        const ctx = getContext();
        const lesson = createCompanionPractice(ctx.assets.dataset, { school: ctx.save.school, seed: ctx.save.seed });
        close();
        ctx.setPanel('companion-practice');
        companionPractice = { lesson, save: ctx.save, epoch: ctx.roleEpoch };
        paintCompanionPractice();
    }

    function paintCompanionPractice() {
        const ctx = getContext();
        const session = companionPractice;
        const active = () => {
            const nowCtx = getContext();
            return session === companionPractice && nowCtx.panel === 'companion-practice' && nowCtx.stage === 'world' && nowCtx.save === session.save && nowCtx.roleEpoch === session.epoch;
        };
        if (!session || !active()) return;
        renderCompanionPractice(nodes.overlay, model(), session.lesson, {
            close: () => {
                if (active()) {
                    companionPractice = null;
                    close();
                }
            },
            select: key => {
                if (active() && selectCompanionPractice(session.lesson, key)) {
                    spellSound.play('select');
                    paintCompanionPractice();
                }
            },
            target: () => {
                if (!active()) return;
                const healed = castCompanionPractice(session.lesson, 'companion');
                if (healed) spellSound.play('heal');
                paintCompanionPractice();
            },
            complete: () =>
                safely(() => {
                    if (!active() || !session.lesson.done) return;
                    const nowCtx = getContext();
                    const committed = persistRewardFn(nowCtx.save, nowCtx.assets.content, { type: 'talk', npcId: 36200 }, {}, nowCtx.roleStorage);
                    nowCtx.setSave(committed.save);
                    nowCtx.setStorageWarning(false);
                    companionPractice = null;
                    close();
                    petScene().dialogue('resident:36200');
                    queueCloudSave();
                    paintHud();
                    track();
                }),
        });
    }

    async function drainWordplayPractice() {
        if (wordplayDrain) return wordplayDrain;
        const ctx = getContext();
        const epoch = ctx.roleEpoch;
        const owner = ctx.roleStore.owner;
        const role = ctx.roleStore.catalog.activeId;
        const valid = () => {
            const nowCtx = getContext();
            return epoch === nowCtx.roleEpoch && owner === nowCtx.roleStore.owner && role === nowCtx.roleStore.catalog.activeId;
        };
        const task = (async () => {
            while (valid()) {
                const nowCtx = getContext();
                const event = nowCtx.save.openingJourney?.wordplay?.practices?.[0];
                if (!event) break;
                const result = await recordWordPractice(
                    { ...event, language: learningPracticeLanguage(event.language), words: [event.word], source: 'companion-wordplay' },
                    valid,
                );
                const recorded = result?.persisted;
                if (!recorded || !valid()) break;
                const next = structuredClone(getContext().save);
                const events = next.openingJourney.wordplay.practices;
                next.openingJourney.wordplay.practices = events.filter(row => row.id !== event.id);
                saveLocal(next, getContext().roleStorage);
                getContext().setSave(next);
                queueCloudSave();
            }
        })();
        wordplayDrain = task;
        try {
            await task;
        } catch {
            if (valid()) toast('词语记录会在下次进入时重试，口令进度已经保存。');
        } finally {
            if (wordplayDrain === task) wordplayDrain = null;
        }
    }

    function startCompanionWordplay() {
        const ctx = getContext();
        if (ctx.stage !== 'world' || ctx.save.zone !== 'camp' || openingJourney(ctx.save)?.phase !== 'done' || ctx.save.pendingEncounter) return;
        close();
        ctx.setPanel('companion-wordplay');
        ctx.clearMovementPath();
        nodes.world.sceneViewportDirty = true;
        const epoch = ctx.roleEpoch;
        const owner = ctx.roleStore.owner;
        const role = ctx.roleStore.catalog.activeId;
        const active = () => {
            const nowCtx = getContext();
            return nowCtx.stage === 'world' && nowCtx.panel === 'companion-wordplay' && epoch === nowCtx.roleEpoch && owner === nowCtx.roleStore.owner && role === nowCtx.roleStore.catalog.activeId;
        };
        wordplaySession = openCompanionWordplay({
            root: nodes.overlay,
            getState: () => ({ ...model(), active: active() }),
            voice: createLearningVoice({ getSettings: () => getContext().save.languageLearning }),
            commit: action => {
                if (!active()) return false;
                const nowCtx = getContext();
                const committed = persistReward(nowCtx.save, nowCtx.assets.content, action, {}, nowCtx.roleStorage);
                if (!committed.result.accepted) return committed.result;
                nowCtx.setSave(committed.save);
                nowCtx.setStorageWarning(false);
                queueCloudSave();
                paintHud();
                return committed.result;
            },
            drain: drainWordplayPractice,
            onClose: close,
            onDone: () => {
                close();
                track();
            },
        });
    }

    function trackCampDetour() {
        const ctx = getContext();
        if (ctx.stage !== 'world' || ctx.save.zone !== 'camp') return;
        const goal = campDetourGoal(ctx.save);
        if (!goal) return;
        ctx.renderer.campToys.prepare(ctx.world);
        const target = ctx.renderer.campToys.rows.find(row => row.id === goal.id);
        if (!target) {
            toast('这里的歌声还在准备，稍后再来找抱抱龙。');
            return;
        }
        close();
        nodes.hud.guideOpen = false;
        paintHud();
        walkTo({ ...target, kind: 'camp-toy' }, false);
    }

    function trackOpeningJourney(plan = false) {
        const ctx = getContext();
        if (ctx.stage !== 'world' || ctx.save.zone !== 'camp') return;
        const state = openingJourney(ctx.save);
        if (state?.phase === 'showcase' && !ctx.save.formation.includes(state.petId)) {
            openOpeningJourney();
            return;
        }
        const goal = plan ? { kind: 'npc', id: 36201 } : openingJourneyTarget(ctx.save);
        if (!goal) return;
        close();
        const placed = goal.kind === 'npc' ? ctx.world.npcs.find(row => row.id === goal.id) : ctx.world.encounters.find(row => row.id === goal.id);
        if (!placed) {
            toast('暂时找不到目标，请重新进入营地。');
            return;
        }
        walkTo({ ...placed, kind: goal.kind }, true);
    }

    function openOpeningJourney() {
        close();
        openingWelcomeKey = null;
        getContext().setPanel('opening-journey');
        paintOpeningJourney();
    }

    function forestTarget() {
        const { save, world } = getContext();
        const goal = forestCommissionGoal(save);
        const rows = goal.kind === 'npc' ? world?.npcs : world?.landmarks;
        const target = rows?.find(row => row.id === goal.id);
        return target ? { ...target, kind: goal.kind, forestCommission: true } : null;
    }

    async function drainForestPractice() {
        const ctx = getContext();
        const current = ctx.save;
        const role = ctx.roleStore.catalog.activeId;
        if ((!current?.forestCommission?.practice && !current?.forestCommission?.labelPractice?.length) || forestPracticeTask) return;
        const valid = () => {
            const nowCtx = getContext();
            return nowCtx.save === current && nowCtx.roleStore.catalog.activeId === role;
        };
        forestPracticeTask = current;
        try {
            const { flushForestCommissionPractice } = await import('../forest_commission_learning.js');
            await flushForestCommissionPractice(current, {
                record: recordWordPractice,
                valid,
                persist: () => {
                    persist();
                    return !getContext().storageWarning;
                },
            });
        } catch {
            if (valid()) toast('选物记录暂未保存，稍后会重试；补给和奖励会保留。');
        } finally {
            forestPracticeTask = null;
            const nowCtx = getContext();
            if (nowCtx.save !== current && (nowCtx.save?.forestCommission?.practice || nowCtx.save?.forestCommission?.labelPractice?.length)) {
                void drainForestPractice();
            }
        }
    }

    function paintForestCommission() {
        void drainForestPractice();
        const ctx = getContext();
        if (ctx.panel !== 'forest-commission' || !forestCommissionAvailable(ctx.save)) {
            close();
            return;
        }
        if (ctx.world?.zone === 'camp' && !ctx.world.landmarks.some(row => row.forestSite)) {
            ctx.world.landmarks.push(...forestCommissionSites(ctx.world, ctx.save, (x, y) => W.walkable(ctx.world, x, y)));
            W.invalidateWorldObjects(ctx.world);
        }
        const target = forestTarget();
        const nearby = ctx.save.zone === 'camp' && target && Math.hypot(ctx.save.position.x - target.x, ctx.save.position.y - target.y) <= 110;
        renderForestCommissionView(
            nodes.overlay,
            { ...model(), nearby },
            {
                close,
                sound: name => spellSound.play(name),
                listen: (line, language) =>
                    safely(async () => {
                        openingSpeech?.abort();
                        const controller = new AbortController();
                        openingSpeech = controller;
                        await dialogueVoice().speak(line, language, controller.signal);
                    }),
                go: () => {
                    if (getContext().save.zone !== 'camp') {
                        openPanel('worldmap');
                        toast('先回营地，再找茜茜继续委托。');
                        return;
                    }
                    if (!target) {
                        toast('委托地点暂未就绪，请重新进入营地。');
                        return;
                    }
                    walkTo(target, true);
                },
                action: value => performAction({ type: 'forest-commission', ...value }, { forestTarget: target }),
                equipment: () => openPanel('equipment'),
                training: lesson => (onOpenTacticsTraining || openTacticsTraining)({ lesson, returnTo: 'forest-commission' }),
                patrol: () => openJourney(FOREST_PATROL_DUNGEON),
                nextChallenge: () => openJourney('journey:lost-spark'),
                mainline: () => track(),
            },
        );
    }

    async function drainOpeningPractice() {
        const ctx = getContext();
        const current = ctx.save;
        const role = ctx.roleStore.catalog.activeId;
        const event = openingJourney(current)?.practice;
        if (!event) return;
        const valid = () => {
            const nowCtx = getContext();
            return nowCtx.save === current && nowCtx.roleStore.catalog.activeId === role;
        };
        try {
            if (!valid()) return;
            const result = await recordWordPractice(
                { ...event, language: learningPracticeLanguage(event.language), words: [learningLesson(event.language).friendWord], source: 'opening-friend' },
                valid,
            );
            const recorded = result?.persisted;
            if (!recorded || !valid()) return;
            delete current.openingJourney.practice;
            persist();
            if (getContext().storageWarning) current.openingJourney.practice = event;
        } catch {
            if (valid()) toast('这次语言练习还没保存好，重新进入时会重试。');
        }
    }

    function paintOpeningJourney() {
        const ctx = getContext();
        if (ctx.panel !== 'opening-journey' || !openingJourney(ctx.save)) {
            close();
            return;
        }
        const leave = () => {
            const nowCtx = getContext();
            if (openingJourney(nowCtx.save)?.phase === 'showcase' && !nowCtx.save.openingJourney.welcomeSeen) {
                nowCtx.save.openingJourney.welcomeSeen = true;
                persist();
                if (getContext().storageWarning) {
                    delete nowCtx.save.openingJourney.welcomeSeen;
                    return false;
                }
                queueCloudSave();
            }
            if (openingJourney(nowCtx.save)?.phase === 'done' && !nowCtx.save.openingJourney.celebrated && performAction({ type: 'opening-journey', step: 'continue' }) === false) {
                return false;
            }
            close();
            return true;
        };
        const routeOpening = () => (onTrackOpeningJourney ? onTrackOpeningJourney() : trackOpeningJourney());
        renderOpeningJourneyView(nodes.overlay, model(), {
            close: leave,
            continue: () => {
                if (leave()) track();
            },
            wordplay: () => {
                if (leave()) startCompanionWordplay();
            },
            explore: () => {
                if (leave() && performAction({ type: 'camp-detour', step: 'start' }) !== false) trackCampDetour();
            },
            pets: () => {
                if (leave()) openPanel('pet');
            },
            listen: () =>
                safely(async () => {
                    openingSpeech?.abort();
                    const controller = new AbortController();
                    openingSpeech = controller;
                    const lesson = learningLesson(getContext().save);
                    await dialogueVoice().speak(lesson.friend, lesson.language, controller.signal);
                }),
            go: () => {
                if (leave()) routeOpening();
            },
            action: value => {
                const result = performAction({ type: 'opening-journey', ...value, receipt: crypto.randomUUID(), at: Date.now() });
                if (result === false) return false;
                if (value.step === 'accept') routeOpening();
                if (value.step === 'route' && value.route === 'battle') routeOpening();
                if (value.step === 'explain') {
                    void drainOpeningPractice();
                    paintHud();
                }
                return result;
            },
        });
        const latest = getContext();
        const welcome = openingJourney(latest.save)?.phase === 'showcase' ? latest.roleStore.catalog.activeId + ':' + openingJourney(latest.save).petId : null;
        if (welcome && welcome !== openingWelcomeKey && playOpeningPetWelcomeFn(nodes.overlay)) spellSound?.play('petJoin');
        openingWelcomeKey = welcome;
    }

    function closeAll() {
        wordplaySession?.dispose();
        wordplaySession = null;
        companionPractice = null;
        openingSpeech?.abort();
        openingSpeech = null;
    }

    function getTacticsPractice() {
        return tacticsPractice;
    }

    return {
        openTacticsTraining,
        finishTacticsFight,
        openCompanionPractice,
        setCompanionPractice: next => { companionPractice = next; },
        getCompanionPractice: () => companionPractice,
        paintCompanionPractice,
        startCompanionWordplay,
        drainWordplayPractice,
        trackCampDetour,
        trackOpeningJourney,
        openOpeningJourney,
        forestTarget,
        paintForestCommission,
        drainForestPractice,
        paintOpeningJourney,
        drainOpeningPractice,
        closeAll,
        getTacticsPractice,
    };
}
