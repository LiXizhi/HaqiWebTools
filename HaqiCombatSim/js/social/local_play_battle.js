// social/local_play_battle.js — 本地双人模式同屏战斗、红蘑菇赛场与 AI 队友战斗决策。
import { captureBattlePresentation } from '../views/adventure/view_battle_presentation.js';
import { recordTacticsRound } from '../battle_tactics_journal_core.js';
import { nextBattlePointer } from '../battle_pointer_core.js';
import { validTargets } from '../combat_arena_core.js';
import { startRedMushroom, playRedMushroom, restoreRedMushroom } from '../adventure_red_mushroom_core.js';
import {
    settleLocalBattle,
    localParty,
    localHumanResources,
    createLocalReady,
} from '../adventure_local_coop_core.js';
import { createCloseButton } from '../ui/controls.js';
import { el, button } from '../ui/dom.js';
import { renderBattle } from '../views/adventure/view_battle_layer.js';
import { ownedPetRecords } from '../adventure_pet_files_core.js';
import { companionParams, companionLanguage, legalCompanionDecision } from '../adventure_companion_ai_core.js';
import { BattleAIClient } from '../battle_ai/client.js';
import { snapshotUnit } from '../adventure_social_core.js';
import { observeBattle, haqiRulesAdapter } from '../battle_ai/haqi_adapter_core.js';
import * as P from '../combat_pve_core.js';
import * as U from '../combat_unit_core.js';

export function createLocalBattleController({
    state,
    saves,
    ids,
    getSession,
    getRecord,
    setRecord,
    getLoadedKey,
    getWriteQueue,
    queueWrite,
    db,
    isBusy,
    setBusy,
    safe,
    storeSaves,
    loadPet,
    close,
    closeAll,
    api,
    companion,
    aiPaused,
    ui,
    roots,
    panels,
}) {
    const aiBattle = new BattleAIClient();
    let aiTicket = 0;
    let aiBattleTask = null;
    let hintRound = null;
    let hintLanguage = null;
    const battleUi = [{ discarded: [] }, { discarded: [] }];
    const ready = createLocalReady();
    let match = null;
    let battleTargetOwner = 0;

    function resetAIBattle({ keepHints = false } = {}) {
        aiTicket++;
        aiBattle.dispose();
        aiBattleTask = null;
        if (!keepHints) hintRound = null;
    }

    function restorePendingBattle(p) {
        if (p.kind === 'pvp') {
            match = restoreRedMushroom(state().assets.dataset, p.replay);
            api.enterBattle(match.arena);
        } else {
            api.enterBattle(P.restorePveBattle(state().assets.dataset, state().assets.content, p.checkpoint));
        }
    }

    function battleAllies(save = state().save) {
        const { assets } = state();
        const members =
            save.coopRun?.members ||
            (api.prepareSocialTeam?.() || api.socialTeam?.() || []).map((profile, i) => ({
                profile,
                unit: snapshotUnit(profile, assets.dataset, `ally${i + 1}`, i + 1),
            }));
        return members.map(({ profile: p, unit }) => ({
            ...unit,
            appearance: p.appearance,
            bodyId: p.bodyId,
            headId: p.headId,
            customHead: p.customHead,
            mountId: p.mountId,
        }));
    }

    function partyFor(save = state().save) {
        const session = getSession();
        return localParty(session.formation, [save, session.second], state().assets.content, battleAllies(save));
    }

    function humanIds() {
        const b = state().battle;
        return b.localHumanIds || Object.keys(b.localHumans || {});
    }

    function updateAIBattle() {
        const session = getSession();
        const b = state().battle;
        if (!b || b.finished || session?.controller !== 'ai' || aiPaused() || isBusy() || state().animating) return;
        ready.reset(b.turn);
        const id = humanIds()[1];
        const ticket = aiTicket;
        if (!b.unitsById[id]) return;
        if (ready.choices[id] || aiBattleTask) return;
        const observation = observeBattle(b, id);
        const stateId = haqiRulesAdapter.stateId(observation);
        const task = (aiBattleTask = {});
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(Error('战斗分析超时')), companionParams(state().assets.content).battleTimeoutMs);
        });
        Promise.race([aiBattle.analyze(observation, { difficulty: 'expert' }), timeout])
            .then(result => result.candidates.map(row => row.action))
            .catch(() => {
                if (aiBattleTask === task) aiBattle.dispose();
                return haqiRulesAdapter.actions(observation).sort((a, b) => Number(!!a.pass) - Number(!!b.pass));
            })
            .then(actions => {
                if (
                    aiBattleTask !== task ||
                    ticket !== aiTicket ||
                    getSession()?.controller !== 'ai' ||
                    state().battle !== b ||
                    aiPaused() ||
                    state().animating ||
                    stateId !== haqiRulesAdapter.stateId(observeBattle(b, id))
                )
                    return;
                const decision = actions.map(a => legalCompanionDecision(b, id, a)).find(Boolean) || { pass: true };
                safe(() => pick(1, decision));
            })
            .finally(() => {
                clearTimeout(timer);
                if (aiBattleTask === task) aiBattleTask = null;
            });
    }

    function updateAIHint() {
        const session = getSession();
        const b = state().battle;
        const language = companionLanguage(state().save.languageLearning);
        if (
            !b ||
            b.finished ||
            state().animating ||
            !companion.ready ||
            session?.controller !== 'ai' ||
            session.hintsMuted ||
            battleUi[0].selected ||
            aiPaused() ||
            ready.choices[humanIds()[0]] ||
            !b.unitsById[humanIds()[0]]
        )
            return;
        const id = humanIds()[0];
        const observation = observeBattle(b, id);
        const key = haqiRulesAdapter.stateId(observation);
        const ticket = aiTicket;
        if (hintRound === key && hintLanguage === language) return;
        hintRound = key;
        hintLanguage = language;
        aiBattle
            .analyze(observation, { difficulty: 'expert' })
            .then(result => {
                if (
                    ticket !== aiTicket ||
                    state().battle !== b ||
                    state().animating ||
                    getSession()?.hintsMuted ||
                    battleUi[0].selected ||
                    aiPaused() ||
                    ready.choices[id] ||
                    key !== haqiRulesAdapter.stateId(observeBattle(b, id))
                )
                    return;
                const discarded = battleUi[0].discarded;
                const choice = result.candidates
                    .map(row => row.action)
                    .find(a => !discarded.includes(a.seq) && legalCompanionDecision(b, id, a));
                if (choice) companion.hint(choice, b);
            })
            .catch(() => {});
    }

    async function beginBattle() {
        const session = getSession();
        if (!session) return null;
        const { save, assets } = state();
        closeAll();
        const checkpoint = structuredClone(save.pendingEncounter);
        const party = partyFor();
        checkpoint.party = party;
        checkpoint.player = party[0];
        checkpoint.localHumans = localHumanResources(saves(), assets.content);
        const record = getRecord();
        record.pending = {
            kind: 'pve',
            receipt: `local:${checkpoint.id}`,
            ids: [...ids()],
            checkpoint,
            base: structuredClone(save.pendingEncounter),
            second: structuredClone(session.second),
            controller: session.controller,
        };
        companion.clearSpeech();
        await queueWrite();
        return P.restorePveBattle(assets.dataset, assets.content, checkpoint);
    }

    async function pick(owner, decision) {
        if (isBusy() || state().animating) return;
        const b = state().battle;
        const id = humanIds()[owner];
        if (owner === 0) companion.clearSpeech();
        ready.reset(b.turn);
        ready.submit(id, decision, humanIds());
        if (!ready.complete(humanIds(), b.unitsById)) {
            paintBattle();
            return;
        }
        setBusy(true);
        try {
            const record = getRecord();
            const joint = { humanDecisions: ready.decisions(humanIds(), b.unitsById), aiVersion: 1 };
            const nextRecord = structuredClone(record);
            const nextMatch = b.redMushroom ? restoreRedMushroom(state().assets.dataset, record.pending.replay) : null;
            const nextBattle =
                nextMatch?.arena || P.restorePveBattle(state().assets.dataset, state().assets.content, record.pending.checkpoint);
            const previous = nextBattlePointer(nextBattle);
            const hp = Object.fromEntries(Object.values(nextBattle.unitsById).map(u => [u.id, u.hp]));
            const aura = nextBattle.aura ? { ...nextBattle.aura } : null;
            const playback = captureBattlePresentation(nextBattle, () => {
                if (nextMatch) {
                    playRedMushroom(nextMatch, joint);
                    nextRecord.pending.replay = structuredClone(nextMatch.replay);
                } else {
                    P.playPveRound(nextBattle, joint);
                    nextRecord.pending.checkpoint.decisions.push(structuredClone(nextBattle.lastDecision));
                }
            });
            if (!nextMatch) recordTacticsRound(nextRecord.pending.checkpoint, nextBattle, playback);
            await getWriteQueue();
            await db.write(getLoadedKey(), nextRecord);
            setRecord(nextRecord);
            match = nextMatch;
            api.enterBattle(nextBattle);
            api.presentLocal(playback, previous, hp, aura);
            battleUi.forEach(u => {
                u.selected = null;
                u.discarded = [];
            });
            ready.reset(null);
            api.paintHud();
        } catch (error) {
            api.toast(error.message);
            for (const id of humanIds()) ready.cancel(id);
        } finally {
            setBusy(false);
            paintBattle();
        }
    }

    function paintBattle() {
        const session = getSession();
        if (!session || !state().battle) return false;
        const { battle: b } = state();
        ready.reset(b.turn);
        if (
            !isBusy() &&
            !state().animating &&
            !b.finished &&
            humanIds().every(id => b.unitsById[id].hp <= 0 || b.unitsById[id].freezeRounds > 0)
        ) {
            queueMicrotask(() => {
                if (!isBusy() && !state().animating && !b.finished) void pick(0, { pass: true });
            });
        }
        let container = document.getElementById('local-battle-panels');
        if (!container) {
            state().battleRoot.replaceChildren();
            container = el('div', 'local-battle-panels');
            container.id = 'local-battle-panels';
            container.append(el('div', 'local-battle-half'), el('div', 'local-battle-half'));
            state().battleRoot.append(el('div', 'local-battle-shared'), container);
        }
        state().battleRoot.className = 'battle-layer visible local-battle';
        const shared = state().battleRoot.querySelector('.local-battle-shared');
        const views = [];
        humanIds().forEach((id, owner) => {
            const u = battleUi[owner];
            const hero = b.unitsById[id];
            const root = container.children[owner];
            const waiting = !!ready.choices[id];
            if (owner === 1 && session.controller === 'ai') {
                root.replaceChildren(
                    el(
                        'div',
                        'local-ai-status',
                        el('h2', '', hero.name),
                        el('p', '', b.finished ? '这场战斗已结束。' : waiting ? '队友已准备好。' : '队友正在选择行动。'),
                    ),
                );
                return;
            }
            const select = h => {
                if (waiting || isBusy()) return;
                u.selected = h;
                battleTargetOwner = owner;
                ui[owner].focus = 0;
                if (owner === 0) companion.clearSpeech();
                paintBattle();
            };
            const target = id =>
                safe(() => {
                    if (waiting || isBusy() || !u.selected) return;
                    const card = b.resolved.cards[u.selected.key];
                    if (!U.canCast(hero, card, b.resolved) || !validTargets(b, hero, card).some(t => t.id === id))
                        throw Error('请选择有效卡牌与目标');
                    void pick(owner, { ...u.selected, targetId: id, discardSeqs: u.discarded });
                });
            views[owner] = [
                {
                    ...api.model(),
                    save: saves()[owner],
                    controlledUnitId: id,
                    localDuo: true,
                    localBattlePane: true,
                    localBattleOwner: owner,
                    localBattleWaiting: waiting,
                    localBattleFooter: shared,
                    selected: u.selected,
                    discarded: u.discarded,
                    petCardsOpen: u.petCardsOpen,
                    runeCardsOpen: u.runeCardsOpen,
                    runeHand: P.runeCardsInHand(b, id),
                    animating: isBusy() || state().animating,
                    aiHintsMuted: session.controller === 'ai' ? !!session.hintsMuted : true,
                },
                {
                    sound: api.sound,
                    cloud: api.login,
                    select,
                    target,
                    swipePlay: select,
                    reselect: () => {
                        u.selected = null;
                        paintBattle();
                    },
                    toggleRunes: () => {
                        u.runeCardsOpen = !u.runeCardsOpen;
                        u.petCardsOpen = false;
                        paintBattle();
                    },
                    togglePetCards: () => {
                        u.petCardsOpen = !u.petCardsOpen;
                        u.runeCardsOpen = false;
                        paintBattle();
                    },
                    discard: seq => {
                        if (waiting || isBusy()) return;
                        u.discarded.push(seq);
                        u.selected = null;
                        if (owner === 0) {
                            companion.clearSpeech();
                            hintRound = null;
                        }
                        paintBattle();
                    },
                    pass: () => pick(owner, { pass: true, discardSeqs: u.discarded }),
                    retreat: () => safe(() => settle(true)),
                    finish: () => safe(() => settle(false)),
                    cancelReady: () => {
                        ready.cancel(id);
                        paintBattle();
                    },
                    openRunes: () => {
                        u.runeCardsOpen = true;
                        u.petCardsOpen = false;
                        paintBattle();
                    },
                    aiHintsToggle: () => {
                        if (session.controller !== 'ai') return;
                        session.hintsMuted = !session.hintsMuted;
                        hintRound = null;
                        companion.clearSpeech();
                        paintBattle();
                    },
                    aiHintDismiss: () => companion.clearSpeech(),
                },
            ];
        });
        if (
            !battleUi[battleTargetOwner].selected ||
            ready.choices[humanIds()[battleTargetOwner]] ||
            !views[battleTargetOwner]
        ) {
            battleTargetOwner = views.findIndex((v, i) => v && battleUi[i].selected && !ready.choices[humanIds()[i]]);
        }
        if (battleTargetOwner < 0) battleTargetOwner = 0;
        const [sharedModel, sharedCallbacks] = views[battleTargetOwner];
        renderBattle(
            shared,
            {
                ...sharedModel,
                localBattlePane: false,
                localBattleShared: true,
                selected: ready.choices[humanIds()[battleTargetOwner]] ? null : sharedModel.selected,
            },
            sharedCallbacks,
        );
        shared.classList.add('local-battle-shared');
        shared.querySelector('.battle-pet-hint-toggle')?.remove();
        views.forEach((view, owner) => {
            if (!view) return;
            const root = container.children[owner];
            renderBattle(root, ...view);
            root.classList.add('local-battle-half');
            root.classList.toggle('local-ready', !!ready.choices[humanIds()[owner]] && !b.finished);
            root.querySelector('.battle-chat')?.remove();
        });
        return true;
    }

    async function settle(retreat) {
        if (isBusy()) return;
        setBusy(true);
        try {
            const record = getRecord();
            const session = getSession();
            const { assets } = state();
            const b = state().battle.redMushroom
                ? restoreRedMushroom(state().assets.dataset, record.pending.replay).arena
                : P.restorePveBattle(state().assets.dataset, state().assets.content, record.pending.checkpoint);
            if (!retreat && !b.finished) throw Error('战斗尚未结束');
            if (!b.redMushroom) {
                for (let owner = 0; owner < 2; owner++) {
                    for (const species of b.localHumans[humanIds()[owner]].captured) {
                        const p = Object.values(ownedPetRecords(saves()[owner])).find(p => p.speciesId === species);
                        if (p && !saves()[owner].pets[p.id]) await loadPet(owner, p.id);
                    }
                }
            }
            const next = settleLocalBattle(saves(), session.formation, assets.content, b, record.pending, {
                retreat,
                now: Date.now(),
            });
            void companion.remember(
                retreat
                    ? '我们退出了这场战斗。'
                    : b.winner === 'near'
                      ? '我们一起赢得了一场战斗。'
                      : '我们一起结束了一场战斗，没有获胜。',
            );
            storeSaves(next);
            const cleared = { ...record, pending: null };
            await getWriteQueue();
            await db.write(getLoadedKey(), cleared);
            setRecord(cleared);
            match = null;
            ready.reset(null);
            api.leaveBattle();
        } finally {
            setBusy(false);
        }
    }

    async function startArena(ensure) {
        if (isBusy()) return;
        await ensure();
        const { assets } = state();
        const session = getSession();
        const record = getRecord();
        const seats = partyFor().map(u => ({ ...u, kind: u.speciesId ? 'pet' : 'self' }));
        match = startRedMushroom(assets.dataset, seats, seats.length, Date.now() >>> 0, { scale: 1 });
        record.pending = {
            kind: 'pvp',
            receipt: `local:${crypto.randomUUID()}`,
            ids: [...ids()],
            controller: session.controller,
            replay: structuredClone(match.replay),
        };
        await queueWrite();
        closeAll();
        api.enterBattle(match.arena);
    }

    function arenaLobby(ensure) {
        closeAll();
        const root = roots[0];
        root.replaceChildren(
            el(
                'section',
                'modal',
                el('header', 'modal-header', el('h2', '', '双人红蘑菇赛场'), createCloseButton(() => close(0))),
                el(
                    'div',
                    'modal-body',
                    el('p', '', '两名玩家同队，共用四个法阵。可先在宠物界面调整阵容。'),
                    button('一起出战', () => safe(() => startArena(ensure)), 'primary'),
                ),
            ),
        );
        panels[0] = 'arena';
    }

    function handleBattleControl(owner, action, repeat, navigate) {
        if (state().animating || (repeat && !['left', 'right', 'up', 'down'].includes(action))) return true;
        if (action === 'back') {
            ready.cancel(humanIds()[owner]);
            battleUi[owner].selected = null;
            paintBattle();
        } else if (action === 'pass') {
            void pick(owner, { pass: true, discardSeqs: battleUi[owner].discarded });
        } else if (action === 'discard' && battleUi[owner].selected) {
            const seq = battleUi[owner].selected.seq;
            if (seq >= 0 && seq < U.PET_CARD_SEQ_BASE && !ready.choices[humanIds()[owner]]) {
                battleUi[owner].discarded.push(seq);
                battleUi[owner].selected = null;
                paintBattle();
            }
        } else {
            navigate(owner, action);
        }
        return true;
    }

    function syncBattleTargetFocus(owner) {
        if (battleUi[owner].selected && battleTargetOwner !== owner) {
            battleTargetOwner = owner;
            paintBattle();
        }
    }

    function isOwnerSelectableInBattle(owner) {
        return !state().battle.finished && !ready.choices[humanIds()[owner]];
    }

    function hasOwnerSelectedCard(owner) {
        return !!battleUi[owner].selected;
    }

    return {
        resetAIBattle,
        restorePendingBattle,
        partyFor,
        beginBattle,
        paintBattle,
        arenaLobby,
        updateAIBattle,
        updateAIHint,
        handleBattleControl,
        syncBattleTargetFocus,
        isOwnerSelectableInBattle,
        hasOwnerSelectedCard,
    };
}
