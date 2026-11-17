// adventure/battle_controller.js — 战斗回合、入场/计时与结算控制器（AI 提示桥接由 battle_advisor_bridge 管理）。
import { BATTLE_CHAT } from '../battle_chat_core.js';
import { createBattleIntro } from '../adventure_battle_intro.js';
import { createArenaClock } from '../adventure_arena_clock.js';
import { ownedPetRecords } from '../adventure_pet_files_core.js';
import { captureBattlePresentation, battleStatusChanges } from '../view_battle_presentation.js';
import { resolveRecordedBattleRound } from '../battle_round_transaction.js';
import { castHitReactions } from '../actor_animation_core.js';
import { withBattlePointer, nextBattlePointer } from '../battle_pointer_core.js';
import {
    presentationEventDurationMs,
    presentationEventProgress,
    presentationEffectDuration,
} from '../battle_presentation_core.js';
import { presentedEnvironment } from '../spell_environment_core.js';
import { battleEventSound } from '../audio/game_sound_core.js';
import { cardsInHand, selectableCards, PET_CARD_SEQ_BASE } from '../combat_unit_core.js';
import { validTargets } from '../combat_arena_core.js';
import { resolveHandSwipe } from '../adventure_hand_core.js';
import { castBlockedMessage } from '../adventure_cast_feedback_core.js';
import { openingStrategyCue } from '../opening_training_core.js';
import { openingCompanionEvent } from '../opening_journey_core.js';
import { playTacticsFieldRound } from '../tactics_field_battle_core.js';
import { rewardSnapshot } from '../adventure_reward_feedback_core.js';
import { createLearningVoice } from '../audio/language_adventure_voice.js';
import { displayLocale, textFor } from '../locale.js';
import * as A from '../adventure_core.js';
import * as P from '../combat_pve_core.js';
import { battleSpeechController, eventLabel, renderBattle } from '../views/adventure/view_battle_layer.js';
import { createBattleAdvisorBridge } from './battle_advisor_bridge.js';

export function createBattleController({
    nodes,
    getContext,
    model,
    services,
    bus,
    persist = services?.persistence?.persist,
    close = services?.navigation?.close,
    openPanel = services?.navigation?.openPanel,
    enterWorld = services?.navigation?.enterWorld,
    loadPet,
    finishTacticsFight,
    showRewards,
    updateMusic,
    toggleSound,
    openCloud,
    toast = services?.feedback?.toast,
    safely = services?.feedback?.safely,
    framePacer = services?.runtime?.framePacer,
    spellSound = services?.feedback?.spellSound,
    wordLearning,
    hanziMemory,
    languageTasks,
    islandSocial,
    localPlay,
}) {
    const resolveRef = ref => (typeof ref === 'function' ? ref() : ref);
    const getWordLearning = () => resolveRef(wordLearning);
    const getHanziMemory = () => resolveRef(hanziMemory);
    const getLanguageTasks = () => resolveRef(languageTasks);
    const battleChatRequests = new WeakMap();
    const battleChatVoice = createLearningVoice({ getSettings: () => getContext().save?.languageLearning || {} });
    let battleChatAbort = null;

    const advisorBridge = createBattleAdvisorBridge({
        getContext,
        onHintReady: () => paintBattle(),
        onAnalyzeFallback: () => toast('分析暂时不可用，按原选择继续。'),
    });

    const battleIntro = createBattleIntro({
        root: nodes.overlay,
        onDone: current => {
            const ctx = getContext();
            if (ctx.stage === 'battle' && ctx.battle === current) {
                paintBattle();
                const canvas = document.getElementById('battle-canvas');
                if (canvas) {
                    canvas.tabIndex = 0;
                    canvas.focus({ preventScroll: true });
                }
            }
        },
    });

    const arenaPickClock = createArenaClock({
        onSecond: seconds => {
            const badge = nodes.battle.querySelector('[data-arena-countdown]');
            if (badge) {
                badge.textContent = `选牌剩余 ${seconds} 秒`;
                badge.classList.toggle('urgent', seconds <= 5);
            }
            if (seconds > 0 && seconds <= 5) spellSound.play(seconds === 1 ? 'countdownFinal' : 'countdown');
        },
        onExpire: () => {
            const ctx = getContext();
            if (ctx.stage === 'battle' && ctx.battle?.redMushroom && !ctx.animation && !ctx.battle.finished) {
                playRound({ pass: true });
            }
        },
    });

    function enterArenaCombat(match) {
        const ctx = getContext();
        close();
        ctx.clearMovementInput();
        ctx.setAnimation(null);
        ctx.setSelected(null);
        ctx.setDiscarded([]);
        ctx.setPetCardsOpen(false);
        ctx.setRuneCardsOpen(false);
        ctx.setBattle(match.arena);
        ctx.setStage('battle');
        nodes.hud.hidden = true;
        void spellSound.unlock();
        arenaPickClock.start(match.arena.resolved.redMushroom.pickMs);
        paintBattle();
        updateMusic();
    }

    function leaveArenaCombat() {
        arenaPickClock.stop();
        islandSocial().leaveArena();
        enterWorld(getContext().save, null, { announceBeans: false });
        openPanel('social-pvp');
    }

    function stopBattleChatVoice() {
        battleChatAbort?.abort();
        battleChatAbort = null;
        void battleChatVoice.cancel();
    }

    function sendBattleChat(id) {
        const { stage, animation, battle, save } = getContext();
        const row = BATTLE_CHAT.find(item => item.id === id);
        if (!row || stage !== 'battle' || animation || battle.finished || battle.sides.near[0].hp <= 0) return;
        if (row.intent && !battle.redMushroom) battleChatRequests.set(battle, id);
        const locale = save.languageLearning?.enabled ? save.languageLearning.target || 'en' : displayLocale();
        const text = textFor(row.text, locale);
        const spokenLocale = text === row.text && /[\u3400-\u9fff]/u.test(text) ? 'zh-CN' : locale;
        const speech = battleSpeechController(battle);
        const hero = battle.sides.near[0];
        speech.clear(hero.id);
        speech.say(hero.id, row.emoji || text);
        stopBattleChatVoice();
        if (!row.emoji && spellSound.enabled) {
            const abort = (battleChatAbort = new AbortController());
            void battleChatVoice.speak(text, spokenLocale, abort.signal, save).catch(() => {
                if (!abort.signal.aborted) toast('语音暂时不可用，对白已发送。');
            });
        }
    }

    async function withCapturedPetsReady(settle) {
        const { save, battle } = getContext();
        const current = save;
        const currentBattle = battle;
        const species = new Set(battle.captured || []);
        const missing = Object.values(ownedPetRecords(save)).filter(p => species.has(p.speciesId) && !save.pets[p.id]);
        try {
            await Promise.all(missing.map(p => loadPet(p.id)));
            const latest = getContext();
            if (latest.save === current && latest.battle === currentBattle && latest.save.pendingEncounter) await settle();
        } catch (error) {
            toast(error.message);
        }
    }

    async function settleEncounterWin(finishCtx) {
        const before = rewardSnapshot(finishCtx.save);
        const memoryEncounter = finishCtx.save.pendingEncounter?.encounterId;
        const languageTicket = finishCtx.save.pendingEncounter?.languageTask;
        const languageWon = finishCtx.battle.winner === 'near';
        if (languageWon && languageTicket) await getLanguageTasks().won(languageTicket);
        const settle = A.settleEncounter(finishCtx.save, finishCtx.assets.content, finishCtx.battle, { now: Date.now() });
        if (finishCtx.battle.winner === 'near') getHanziMemory().won(memoryEncounter);
        islandSocial().settled(finishCtx.battle, settle);
        return { before, settle };
    }

    function paintBattle() {
        updateMusic();
        framePacer.wake();
        const ctx = getContext();
        const lp = localPlay();
        if (lp.active && ctx.battle && (ctx.battle.localHumans || ctx.battle.localHumanIds)) {
            lp.paintBattle();
            return;
        }
        ctx.perf.end('combat-entry');
        if (battleIntro.active) return;
        advisorBridge.refreshPetHint();
        const currentBattle = ctx.battle;
        const hero = currentBattle.sides.near[0];
        const hand = [...selectableCards(hero), ...P.runeCardsInHand(currentBattle)];
        for (const card of Object.values(currentBattle.resolved.cards || {})) {
            const base = ctx.assets.effects.cards[card.key]?.base;
            if (base) ctx.assets.skillArt.ensure(base).catch(() => {});
        }
        if (ctx.selected && (ctx.discarded.includes(ctx.selected.seq) || !hand.some(h => h.seq === ctx.selected.seq && h.key === ctx.selected.key))) {
            ctx.setSelected(null);
        }
        const latest = getContext();
        const { advisor, aiReview, aiGrowth, aiHintsMuted, aiHint } = advisorBridge.reviewModel(
            currentBattle,
            ctx.save,
            ctx.assets.content,
            latest.discarded,
        );
        renderBattle(
            nodes.battle,
            {
                ...model(),
                aiReview,
                aiHintsMuted,
                aiHint,
                aiGrowth,
                petCardsOpen: latest.petCardsOpen,
                runeCardsOpen: latest.runeCardsOpen,
                runeHand: P.runeCardsInHand(currentBattle),
            },
            {
                battleChat: sendBattleChat,
                aiHintsToggle: () => {
                    advisor.muted = !advisor.muted;
                    advisor.dismissedHintState = null;
                    paintBattle();
                },
                aiHintDismiss: () => {
                    advisor.dismissedHintState = advisor.hintState;
                },
                aiNavigate: entry =>
                    withCapturedPetsReady(async () => {
                        const nowCtx = getContext();
                        if (!nowCtx.battle.finished) return;
                        if (nowCtx.battle.tacticsField) {
                            await finishTacticsFight();
                            return;
                        }
                        const { before, settle } = await settleEncounterWin(nowCtx);
                        enterWorld(nowCtx.save, null, { announceBeans: false });
                        showRewards(before);
                        if (settle?.insufficientStamina) toast('你的精力值不足，无法得到这场战斗的战利品。');
                        openPanel(entry);
                    }),
                toggleRunes: () => {
                    const nowCtx = getContext();
                    if (nowCtx.animation || nowCtx.battle.finished) return;
                    nowCtx.setRuneCardsOpen(!nowCtx.runeCardsOpen);
                    nowCtx.setPetCardsOpen(false);
                    nowCtx.setSelected(null);
                    paintBattle();
                },
                togglePetCards: () => {
                    const nowCtx = getContext();
                    if (nowCtx.animation || nowCtx.battle.finished) return;
                    nowCtx.setPetCardsOpen(!nowCtx.petCardsOpen);
                    nowCtx.setRuneCardsOpen(false);
                    nowCtx.setSelected(null);
                    paintBattle();
                },
                sound: toggleSound,
                cloud: openCloud,
                swipePlay: h => {
                    const nowCtx = getContext();
                    if (nowCtx.animation) return;
                    const intent = resolveHandSwipe(nowCtx.battle, h, nowCtx.discarded);
                    if (!intent) return;
                    nowCtx.setSelected(h);
                    if (intent.decision) playRound(intent.decision);
                    else {
                        paintBattle();
                        toast(intent.message);
                    }
                },
                reselect: () => {
                    const nowCtx = getContext();
                    if (nowCtx.animation || nowCtx.battle.finished) return;
                    nowCtx.setSelected(null);
                    paintBattle();
                },
                select: h => {
                    const nowCtx = getContext();
                    if (getWordLearning().wordPractice.active || nowCtx.animation || nowCtx.battle.finished || !h || nowCtx.discarded.includes(h.seq)) return;
                    nowCtx.setSelected(h);
                    spellSound.play('select');
                    paintBattle();
                },
                discard: seq => {
                    const nowCtx = getContext();
                    if (
                        nowCtx.animation
                        || nowCtx.battle.finished
                        || seq < 0
                        || seq >= PET_CARD_SEQ_BASE
                        || nowCtx.discarded.includes(seq)
                        || !hand.some(h => h.seq === seq)
                    ) {
                        return;
                    }
                    spellSound.play('discard');
                    nowCtx.setDiscarded([...nowCtx.discarded, seq]);
                    if (nowCtx.selected?.seq === seq) nowCtx.setSelected(null);
                    paintBattle();
                },
                target: id => {
                    const nowCtx = getContext();
                    if (!nowCtx.selected || nowCtx.animation || nowCtx.battle.finished) return;
                    const card = nowCtx.battle.resolved.cards[nowCtx.selected.key];
                    const message = nowCtx.discarded.includes(nowCtx.selected.seq)
                        ? '这张卡牌已弃掉'
                        : castBlockedMessage(hero, card, nowCtx.battle.resolved);
                    if (message) {
                        toast(message);
                        return;
                    }
                    if (!validTargets(nowCtx.battle, hero, card).some(t => t.id === id)) {
                        toast('请选择这张卡牌可施放的目标。');
                        return;
                    }
                    playRound({ ...nowCtx.selected, targetId: id, discardSeqs: nowCtx.discarded });
                },
                openRunes: () => {
                    const nowCtx = getContext();
                    if (nowCtx.animation || nowCtx.battle.finished) return;
                    nowCtx.setRuneCardsOpen(true);
                    nowCtx.setPetCardsOpen(false);
                    nowCtx.setSelected(null);
                    paintBattle();
                },
                pass: () => playRound({ pass: true, discardSeqs: getContext().discarded }),
                practiceNext: () => safely(() => finishTacticsFight({ next: true })),
                retreat: () => {
                    const nowCtx = getContext();
                    if (nowCtx.battle.tacticsField) return safely(() => finishTacticsFight());
                    if (nowCtx.battle.redMushroom) {
                        leaveArenaCombat();
                        return;
                    }
                    if (nowCtx.assets.content.pets) A.settleParty(nowCtx.save, nowCtx.assets.content, nowCtx.battle, { retreat: true });
                    const result = A.applyAction(nowCtx.save, nowCtx.assets.content, { type: 'retreat' });
                    nowCtx.save.careAt = Date.now();
                    enterWorld(nowCtx.save);
                    toast(result?.message || '你撤到了怪物附近。已保留物品与任务进度。');
                },
                finish: () => {
                    const nowCtx = getContext();
                    if (nowCtx.battle.tacticsField) return safely(() => finishTacticsFight());
                    if (nowCtx.battle.redMushroom) {
                        leaveArenaCombat();
                        return;
                    }
                    return withCapturedPetsReady(() =>
                        safely(async () => {
                            const finishCtx = getContext();
                            const { before, settle } = await settleEncounterWin(finishCtx);
                            if (finishCtx.battle.winner === 'near') islandSocial().activity('battle');
                            finishCtx.save.careAt = Date.now();
                            enterWorld(finishCtx.save, null, { announceBeans: false });
                            showRewards(before);
                            if (settle?.insufficientStamina) toast('你的精力值不足，无法得到这场战斗的战利品。');
                            bus?.emit('battle:settled', { settle });
                        }),
                    );
                },
            },
        );
    }

    function playRound(decision, readyAnalysis = null) {
        const ctx = getContext();
        if (getWordLearning().wordPractice.active || battleIntro.active || ctx.animation || ctx.battle.finished) return;
        const chosen = ctx.battle.sides.near[0].wordCards?.[decision.seq];
        if (!decision.pass && !decision.capture && chosen && !chosen.activated) {
            void getWordLearning().openBattleWord(decision);
            return;
        }
        const advisor = advisorBridge.advisorFor(ctx.battle);
        if (ctx.battle.redMushroom && arenaPickClock.claim().expired) decision = { pass: true };
        const analysis = readyAnalysis || advisorBridge.resolveRoundAnalysis(ctx.battle, decision, playRound);
        if (!analysis) return;
        safely(() => {
            const nowCtx = getContext();
            const currentBattle = nowCtx.battle;
            advisor.strategyMemory = analysis.memory || advisor.strategyMemory;
            if (!currentBattle.redMushroom && !currentBattle.tacticsField) {
                advisor.session.record(currentBattle, analysis.unavailable ? null : analysis, decision);
            }
            const chatRequest = battleChatRequests.get(currentBattle);
            decision = { ...decision, aiVersion: 1, ...(chatRequest && !currentBattle.redMushroom ? { chatRequest } : {}) };
            const hp = Object.fromEntries(Object.values(currentBattle.unitsById).map(u => [u.id, u.hp]));
            const aura = currentBattle.aura ? { ...currentBattle.aura } : null;
            const hand = cardsInHand(currentBattle.sides.near[0]);
            const previous = nextBattlePointer(currentBattle);
            const tacticsPractice = nowCtx.tacticsPractice;
            const round = currentBattle.redMushroom
                ? { playback: captureBattlePresentation(currentBattle, () => islandSocial().playArena(decision)) }
                : currentBattle.tacticsField
                    ? playTacticsFieldRound({ battle: currentBattle, decisions: tacticsPractice.decisions, create: tacticsPractice.create }, decision, captureBattlePresentation)
                    : resolveRecordedBattleRound({
                          save: nowCtx.save,
                          battle: currentBattle,
                          resolve: () => P.playPveRound(currentBattle, decision),
                          record: () => A.recordDecision(nowCtx.save, currentBattle.lastDecision || decision, currentBattle),
                          restore: checkpoint => P.restorePveBattle(nowCtx.assets.dataset, nowCtx.assets.content, checkpoint),
                      });
            if (round.error) {
                nowCtx.setBattle(round.battle);
                paintBattle();
                console.error('战斗回合已恢复：', round.error);
                throw new Error('本回合未完成，已恢复到出牌前。请重新选择目标。', { cause: round.error });
            }
            const playback = round.playback;
            battleChatRequests.delete(currentBattle);
            nowCtx.setSelected(null);
            nowCtx.setDiscarded([]);
            nowCtx.setPetCardsOpen(false);
            nowCtx.setRuneCardsOpen(false);
            const events = playback.events;
            nowCtx.setAnimation({
                events: withBattlePointer(
                    events.map(e => ({ ...e, periodic: e.type === 'dot' || e.type === 'hot', type: e.type === 'dot' ? 'damage' : e.type === 'hot' ? 'heal' : e.type })),
                    previous,
                    nextBattlePointer(currentBattle),
                ),
                pointer: previous,
                index: 0,
                start: performance.now(),
                hp,
                aura,
                status: playback.initial,
                pips: playback.initialPips,
                statusFeedback: [],
                entered: -1,
                hand: hand.filter(h => (decision.pass || decision.capture || h.seq !== decision.seq) && !decision.discardSeqs?.includes(h.seq)),
            });
            paintBattle();
            if (!currentBattle.redMushroom && !currentBattle.tacticsField) persist();
            if (currentBattle.finished) stopBattleChatVoice();
        });
    }

    function tickAnimation(now) {
        const ctx = getContext();
        const a = ctx.animation;
        if (!a) {
            spellSound.stopCast();
            return null;
        }
        const currentBattle = ctx.battle;
        const e = a.events[a.index];
        if (now < a.start) {
            return { hp: a.hp, aura: a.aura, status: a.status, pips: a.pips, statusFeedback: a.statusFeedback };
        }
        if (!e) {
            getWordLearning().clearConsumedWordAudio();
            spellSound.stopCast();
            ctx.setAnimation(null);
            if (currentBattle.redMushroom && !currentBattle.finished && !localPlay().active) {
                arenaPickClock.start(currentBattle.resolved.redMushroom.pickMs);
            }
            if (currentBattle.finished && !a.events.some(event => event.type === 'combat_end')) {
                spellSound.play(currentBattle.winner === 'near' ? 'victory' : 'defeat');
            }
            paintBattle();
            return null;
        }
        if (a.entered !== a.index) {
            a.entered = a.index;
            const cue = battleEventSound(a.events, a.index);
            if (cue && a.index > (a.silentThrough ?? -1)) spellSound.play(cue);
            if (e.status) {
                a.statusFeedback.push(...battleStatusChanges(a.status, e.status, e).map(change => ({ ...change, start: now })));
                a.status = e.status;
            }
            if (e.pips) a.pips = e.pips;
            if (e.type === 'damage') a.hp[e.target] = Math.max(0, a.hp[e.target] - e.amount);
            if (e.type === 'heal') {
                a.hp[e.target] = Math.min(currentBattle.unitsById[e.target].maxHp, Number.isFinite(e.hp) ? e.hp : a.hp[e.target] + e.amount);
            }
            if (e.type === 'cast' && e.wordCardId) getWordLearning().playWordRecording(e.wordCardId);
            const strategyCue = openingStrategyCue(currentBattle, e);
            if (strategyCue) {
                const speech = battleSpeechController(currentBattle);
                speech.clear(strategyCue.unitId);
                speech.say(strategyCue.unitId, strategyCue.text, { duration: 2800 });
            }
            const companionText = openingCompanionEvent(ctx.save, currentBattle, e);
            if (companionText) {
                a.companionFeedback = companionText;
                const speech = battleSpeechController(currentBattle);
                speech.clear(e.caster);
                speech.say(e.caster, companionText, { duration: 3500 });
            }
            const text = e.type === 'speak' ? '' : companionText || eventLabel(e, currentBattle, ctx.assets);
            if (text || e.type === 'speak') {
                const banner = nodes.battle?.querySelector?.('#cast-announcement') || document.getElementById('cast-announcement');
                if (banner) banner.textContent = text;
            }
        }
        a.statusFeedback = a.statusFeedback.filter(change => now - change.start < 700);
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const duration = presentationEventDurationMs(e, {
            effects: ctx.assets.effects,
            card: currentBattle.resolved.cards[e.card],
            hp: a.hp[e.target],
            reducedMotion,
            briskTraining: currentBattle.monsterTemplates?.some(m => m.openingTrainingVersion === 3),
        });
        const progress = presentationEventProgress(e, Math.min(1, (now - a.start) / duration), {
            effects: ctx.assets.effects,
            card: currentBattle.resolved.cards[e.card],
            reducedMotion,
        });
        const card = currentBattle.resolved.cards[e.card];
        const spec = card && ctx.assets.effects.bases[ctx.assets.effects.cards[card.key]?.base];
        const impact = spec?.kind === 'summon' ? ctx.assets.effects.timeline.summonImpact : ctx.assets.effects.timeline.impact;
        a.aura = presentedEnvironment(a.aura, a.events, a.index, progress, impact);
        const reactions = castHitReactions(
            a.events,
            a.index,
            progress,
            e.type === 'cast' ? presentationEffectDuration(ctx.assets.effects, card, reducedMotion) : duration,
            impact,
        );
        a.recoiledEvents ??= new Set();
        for (const reaction of reactions) a.recoiledEvents.add(reaction.eventIndex);
        const recoilPlayed = a.recoiledEvents.has(a.index);
        if (e.type === 'cast' || e.type === 'fizzle') {
            spellSound.track(ctx.assets.effects, currentBattle.resolved.cards[e.card], progress, {
                active: !document.hidden && a.index > (a.silentThrough ?? -1),
                failed: e.type === 'fizzle',
                reducedMotion,
                instance: String(a.index),
            });
        } else {
            spellSound.stopCast();
        }
        const pointer = e.type === 'movearrow' ? { from: e.from, to: e.caster, progress } : { from: a.pointer, to: a.pointer, progress: 1 };
        if (progress === 1) {
            if (e.type === 'movearrow') a.pointer = e.caster;
            a.index++;
            a.start = now;
        }
        return {
            event: { ...e, recoilPlayed, school: e.school || currentBattle.resolved.cards[e.card]?.spellSchool },
            progress,
            hp: a.hp,
            aura: a.aura,
            status: a.status,
            pips: a.pips,
            statusFeedback: a.statusFeedback,
            reactions,
            pointer,
        };
    }

    return {
        advisorFor: advisorBridge.advisorFor,
        battleIntro,
        arenaPickClock,
        enterArenaCombat,
        leaveArenaCombat,
        stopBattleChatVoice,
        sendBattleChat,
        refreshPetHint: advisorBridge.refreshPetHint,
        withCapturedPetsReady,
        paintBattle,
        playRound,
        tickAnimation,
    };
}
