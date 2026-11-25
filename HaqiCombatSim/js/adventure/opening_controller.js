import {createTacticsChallenge,recordTacticsChallengeVictory,TACTICS_CHALLENGES} from '../tactics_challenge_core.js';
import { hashSeed } from '../rng_core.js';
import {renderTacticsChallenges} from '../views/adventure/view_tactics_challenges.js';
import {
    createTacticsFieldBattle,
    nextTacticsFieldId,
    recordTacticsFieldVictory,
    TACTICS_FIELD_ENCOUNTERS,
} from '../tactics_field_battle_core.js';
import { openingJourney, openingJourneyTarget } from '../opening_journey_core.js';
import { renderOpeningJourney, playOpeningPetWelcome } from '../views/adventure/view_opening_journey.js';
import { renderForestCommission } from '../views/adventure/view_forest_commission.js';
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
import {
    createMentorPractice,
    selectMentorPractice,
    castMentorPractice,
    mentorPracticeCue,
} from '../mentor_practice_core.js';
import { playMentorPracticeCast } from '../mentor_practice_effects.js';
import { currentQuest as defaultCurrentQuest } from '../adventure_core.js';
import { openCompanionWordplay } from '../learning/companion_wordplay.js';
import { campDetourGoal } from '../camp_detour_core.js';
import { createSaveCommitter, persistReward } from '../adventure_reward_persistence.js';
import {createForestExchangeRecorder} from '../forest_exchange_recorder.js';
import { createLearningVoice } from '../audio/language_adventure_voice.js';
import { recordWordPractice } from '../learning/language_course.js';
import { learningLesson, learningPracticeLanguage } from '../learning_language_core.js';
import {
    renderCompanionPractice as defaultRenderCompanionPractice,
    renderMentorPractice as defaultRenderMentorPractice,
    updateMentorPracticeHealth,
} from '../views/adventure/view_panel_modal.js';
import * as W from '../adventure_world_core.js';

export function createOpeningController({
    nodes,
    getContext,
    model,
    services,
    bus,
    close = services?.navigation?.close,
    openPanel = services?.navigation?.openPanel,
    persist = services?.persistence?.persist,
    saveLocal = services?.persistence?.saveLocal,
    queueCloudSave = services?.persistence?.queueCloudSave,
    commitSave = services?.persistence?.commitSave,
    commitReward = services?.persistence?.commitReward,
    paintHud = services?.navigation?.paintHud,
    paintBattle = services?.navigation?.paintBattle,
    stopBattleChatVoice,
    enterWorld = services?.navigation?.enterWorld,
    performAction,
    openJourney,
    walkTo,
    track,
    awardLanguageSpeech = () => {},
    toast = services?.feedback?.toast,
    safely = services?.feedback?.safely,
    spellSound = services?.feedback?.spellSound,
    petScene,
    dialogueVoice,
    renderCompanionPractice = defaultRenderCompanionPractice,
    renderMentorPractice = defaultRenderMentorPractice,
    playMentorPracticeCastFn = playMentorPracticeCast,
    currentQuestFn = defaultCurrentQuest,
    renderTacticsChallengesView = renderTacticsChallenges,
    renderForestCommissionView = renderForestCommission,
    renderOpeningJourneyView = renderOpeningJourney,
    playOpeningPetWelcomeFn = playOpeningPetWelcome,
    persistRewardFn = persistReward,
    createLearningVoiceFn = createLearningVoice,
    onOpenTacticsTraining,
    onTrackOpeningJourney,
}) {
    const saveCommitter = (commitSave && commitReward)
        ? { commitSave, commitReward }
        : createSaveCommitter({ getContext, saveLocal, persistRewardFn, queueCloudSave, paintHud });
    let tacticsPractice = null;
    let companionPractice = null;
    let mentorPractice = null;
    let wordplaySession = null;
    let wordplayDrain = null;
    let openingWelcomeKey = null;
    let openingSpeech = null;
    let forestPracticeTask = null;
    let forestPracticeRequested = false;

    function openTacticsTraining(options) {
        const ctx = getContext();
        if (ctx.stage !== 'world' || ctx.save.pendingEncounter) return;
        if (!options?.lesson && !options?.challenge) {
            close();
            ctx.setPanel('tactics-challenges');
            renderTacticsChallengesView(nodes.overlay,ctx.save,{
                close,
                lesson:id=>openTacticsTraining({lesson:id,returnTo:options?.returnTo}),
                start:(id,school,loadout)=>openTacticsTraining({challenge:id,school,loadout,returnTo:options?.returnTo}),
            },options?.retry);
            return;
        }
        const lessonId = TACTICS_FIELD_ENCOUNTERS.some(row => row.id === options?.lesson)
            ? options.lesson
            : nextTacticsFieldId(ctx.save);
        const settings = { lessonId, seed: ctx.save.seed, name: ctx.save.name };
        const wins = ctx.save.tacticsChallenges?.completed?.[options?.challenge]?.wins || 0;
        const challengeSeed = wins ? hashSeed(`${ctx.save.seed}:tactics:${options.challenge}:${wins}`) : ctx.save.seed;
        const create = options?.challenge
            ? () => createTacticsChallenge(ctx.assets.dataset,ctx.assets.content,{id:options.challenge,school:options.school||ctx.save.school,loadout:options.loadout,seed:challengeSeed,name:ctx.save.name})
            : () => createTacticsFieldBattle(ctx.assets.dataset, ctx.assets.content, settings);
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

    async function finishTacticsFight({ next = false, adjust = false } = {}) {
        const ctx = getContext();
        const session = tacticsPractice;
        if (!session || session.leaving || ctx.save !== session.save || ctx.roleEpoch !== session.epoch || !ctx.battle?.tacticsField) return;
        const lessonId = ctx.battle.tacticsField.id;
        const won = ctx.battle.finished && ctx.battle.winner === 'near';
        if (won && !session.recorded) {
            saveCommitter.commitSave(
                draft => {
                    if (ctx.battle.tacticsField.challenge) recordTacticsChallengeVictory(draft, ctx.battle);
                    else recordTacticsFieldVictory(draft, ctx.battle);
                    draft.revision++;
                },
                { mutateInPlace: true, paint: 'none', setWarning: false },
            );
            session.recorded = true;
        }
        const challenge=ctx.battle.tacticsField.challenge,school=ctx.battle.tacticsField.school,loadout=ctx.battle.tacticsField.loadout;
        const choices=challenge?TACTICS_CHALLENGES:TACTICS_FIELD_ENCOUNTERS;
        const index = choices.findIndex(row => row.id === lessonId);
        const following = won ? choices[(index + 1) % choices.length].id : lessonId;
        const returnTo = session.returnTo;
        if (!bus?.emit('audio:stop-battle-voice')) stopBattleChatVoice?.();
        ctx.setAnimation(null);
        ctx.setSelected(null);
        ctx.setDiscarded([]);
        session.leaving = true;
        try {
            await enterWorld(ctx.save, null, { announceBeans: false });
        } finally {
            session.leaving = false;
        }
        if(tacticsPractice===session)tacticsPractice=null;
        const latest = getContext();
        if (latest.save !== session.save || latest.roleEpoch !== session.epoch) return;
        if (adjust && challenge) openTacticsTraining({retry:{id:lessonId,school,loadout},returnTo});
        else if (next) openTacticsTraining(challenge?{challenge:following,school,loadout,returnTo}:{ lesson: following, returnTo });
        else if (returnTo) openPanel(returnTo);
    }

    function openMentorPractice(npcId) {
        const ctx = getContext();
        const lesson = createMentorPractice(ctx.assets.dataset, {
            npcId,
            seed: ctx.save.seed,
            language: ctx.save.languageLearning?.target,
        });
        close();
        ctx.setPanel('mentor-practice');
        mentorPractice = {
            lesson,
            save: ctx.save,
            epoch: ctx.roleEpoch,
            locale: ctx.save.languageLearning?.target,
            native: ctx.save.languageLearning?.native,
            abort: new AbortController(),
        };
        paintMentorPractice();
    }

    function paintMentorPractice() {
        const session = mentorPractice;
        const active = () => {
            const nowCtx = getContext();
            return (
                session === mentorPractice &&
                nowCtx.panel === 'mentor-practice' &&
                nowCtx.stage === 'world' &&
                nowCtx.save === session.save &&
                nowCtx.roleEpoch === session.epoch &&
                currentQuestFn(nowCtx.save, nowCtx.assets.content)?.id === 63010 &&
                nowCtx.save.languageLearning?.target === session.locale &&
                nowCtx.save.languageLearning?.native === session.native
            );
        };
        if (!session || !active()) return;
        renderMentorPractice(nodes.overlay, model(), session.lesson, {
            close: () => {
                if (active()) close();
            },
            select: key => {
                if (active() && !session.busy && selectMentorPractice(session.lesson, key)) {
                    spellSound.play('select');
                    paintMentorPractice();
                }
            },
            target: id =>
                safely(async () => {
                    if (!active() || session.busy) return;
                    const presentationPhase = session.lesson.phase;
                    if (!castMentorPractice(session.lesson, id)) {
                        paintMentorPractice();
                        return;
                    }
                    session.busy = true;
                    session.lesson.presentationPhase = presentationPhase;
                    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
                    try {
                        for (const [index, cast] of session.lesson.lastCasts.entries()) {
                            if (!active()) break;
                            const nowCtx = getContext();
                            session.lesson.presentation = cast;
                            paintMentorPractice();
                            const field = nodes.overlay.querySelector('.mentor-field');
                            await playMentorPracticeCastFn(field, nowCtx.assets, cast, {
                                signal: session.abort.signal,
                                reducedMotion,
                                onProgress: (p, card) => {
                                    if (active()) {
                                        spellSound.track(nowCtx.assets.effects, card, p, {
                                            active: !document.hidden,
                                            reducedMotion,
                                            instance: `mentor:${session.epoch}:${index}`,
                                        });
                                    }
                                },
                                onImpact: () => {
                                    if (active()) updateMentorPracticeHealth(field, session.lesson, cast);
                                },
                            });
                            spellSound.stopCast();
                        }
                    } finally {
                        session.busy = false;
                        delete session.lesson.presentation;
                        delete session.lesson.presentationPhase;
                        if (active()) {
                            spellSound.stopCast();
                            paintMentorPractice();
                        }
                    }
                }),
            hint: () => {
                if (active() && !session.busy) {
                    session.lesson.hint = !session.lesson.hint;
                    paintMentorPractice();
                }
            },
            listen: () =>
                safely(async () => {
                    if (!active()) return;
                    const nowCtx = getContext();
                    await dialogueVoice().speak(
                        mentorPracticeCue(session.lesson),
                        session.locale || 'en',
                        session.abort.signal,
                        nowCtx.assets.content.npcs[session.lesson.npcId],
                    );
                }),
            retry: () => {
                if (!active()) return;
                const nowCtx = getContext();
                session.lesson = createMentorPractice(nowCtx.assets.dataset, {
                    npcId: session.lesson.npcId,
                    seed: nowCtx.save.seed,
                    language: session.locale,
                });
                paintMentorPractice();
            },
            complete: () =>
                safely(() => {
                    if (!active() || session.busy || !session.lesson.done) return;
                    saveCommitter.commitReward({ type: 'talk', npcId: session.lesson.npcId }, {}, { paint: 'none' });
                    mentorPractice = null;
                    close();
                    paintHud();
                    track();
                    if (session.save.languageLearning?.enabled && ['en', 'ja', 'ko'].includes(session.locale)) {
                        awardLanguageSpeech(`mentor-practice:${session.lesson.npcId}`);
                    }
                }),
        });
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
                    saveCommitter.commitReward({ type: 'talk', npcId: 36200 }, {}, { paint: 'none' });
                    companionPractice = null;
                    close();
                    petScene().dialogue('resident:36200');
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
                saveCommitter.commitSave(
                    draft => {
                        const events = draft.openingJourney.wordplay.practices;
                        draft.openingJourney.wordplay.practices = events.filter(row => row.id !== event.id);
                    },
                    { expected: { owner, roleId: role, epoch }, paint: 'none', setWarning: false },
                );
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
                const committed = saveCommitter.commitReward(action, {}, { accept: r => !!r?.accepted, paint: 'hud' });
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
        if (!current?.forestCommission?.practice && !current?.forestCommission?.notePractice && !current?.forestCommission?.labelPractice?.length && !current?.forestCommission?.exchangePractice?.length) return;
        if (forestPracticeTask) {
            forestPracticeRequested = true;
            return;
        }
        const valid = () => {
            const nowCtx = getContext();
            return nowCtx.save === current && nowCtx.roleStore.catalog.activeId === role;
        };
        forestPracticeTask = current;
        try {
            const { flushForestCommissionPractice } = await import('../learning/forest_commission_learning.js');
            await flushForestCommissionPractice(current, {
                record: recordWordPractice,
                valid,
                persist: () => {
                    persist();
                    return !getContext().storageWarning;
                },
            });
        } catch {
            if (valid()) toast('语言练习记录暂未保存，重新打开森林委托时会重试；补给和奖励会保留。');
        } finally {
            forestPracticeTask = null;
            // Consume an explicit reopen request once; a failed write alone must not loop.
            const requested = forestPracticeRequested;
            forestPracticeRequested = false;
            const nowCtx = getContext();
            if ((requested || nowCtx.save !== current) && (nowCtx.save?.forestCommission?.practice || nowCtx.save?.forestCommission?.notePractice || nowCtx.save?.forestCommission?.labelPractice?.length || nowCtx.save?.forestCommission?.exchangePractice?.length)) {
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
        const current = ctx.save, role = ctx.roleStore.catalog.activeId, language = current.languageLearning?.target;
        const valid = () => {
            const now = getContext();
            return now.panel === 'forest-commission' && now.save === current && now.roleStore.catalog.activeId === role && now.save.languageLearning?.target === language;
        };
        renderForestCommissionView(
            nodes.overlay,
            { ...model(), nearby },
            {
                close,
                sound: name => spellSound.play(name),
                recorder: handlers => {
                    const voice = createLearningVoiceFn({getSettings: () => current.languageLearning});
                    return createForestExchangeRecorder({
                        ...handlers, valid,
                        voice: {
                            start: signal => { openingSpeech?.abort(); return voice.start(signal); },
                            finish: () => voice.finish(), cancel: () => voice.cancel(),
                        },
                    });
                },
                listen: (line, language) =>
                    safely(async () => {
                        nodes.overlay.cancelForestRecording?.();
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
                try { persist(); } catch {
                    delete nowCtx.save.openingJourney.welcomeSeen;
                    return false;
                }
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
                if (!leave()) return false;
                track();
            },
            wordplay: () => {
                if (!leave()) return false;
                startCompanionWordplay();
            },
            explore: () => {
                if (!leave()) return false;
                if (performAction({ type: 'camp-detour', step: 'start' }) !== false) trackCampDetour();
            },
            pets: () => {
                if (!leave()) return false;
                openPanel('pet');
            },
            listen: async ({ onPlaying } = {}) => {
                openingSpeech?.abort();
                const controller = new AbortController();
                openingSpeech = controller;
                const currentContext = getContext();
                const epoch = currentContext.roleEpoch, owner = currentContext.roleStore?.owner, role = currentContext.roleStore?.catalog?.activeId;
                const lesson = learningLesson(currentContext.save);
                const active = () => {
                    const current = getContext();
                    return !controller.signal.aborted && openingSpeech === controller && current.stage === 'world' && current.panel === 'opening-journey' && current.roleEpoch === epoch && current.roleStore?.owner === owner && current.roleStore?.catalog?.activeId === role;
                };
                try {
                    await dialogueVoice().speak(lesson.friend, lesson.language, controller.signal, undefined, {
                        onPlaying: () => { if (active()) onPlaying?.(); }
                    });
                    return active();
                } catch {
                    return false;
                } finally {
                    if (openingSpeech === controller) openingSpeech = null;
                }
            },
            go: () => {
                if (!leave()) return false;
                routeOpening();
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
        if (mentorPractice?.busy) spellSound?.stopCast();
        mentorPractice?.abort?.abort();
        mentorPractice = null;
        wordplaySession?.dispose();
        wordplaySession = null;
        nodes.overlay.disposeForestCommission?.();
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
        openMentorPractice,
        setMentorPractice: next => { mentorPractice = next; },
        getMentorPractice: () => mentorPractice,
        paintMentorPractice,
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
