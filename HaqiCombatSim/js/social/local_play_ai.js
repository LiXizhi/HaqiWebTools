// social/local_play_ai.js — 本地双人模式 AI 伙伴控制器（移动规划、状态快照与控制权切换）。
import { constrainLocalPosition } from '../adventure_local_coop_core.js';
import { gatheringRemaining, gatheringParams, gatheringValue } from '../adventure_gathering_core.js';
import { createCompanionAI } from '../adventure_companion_ai.js';
import { companionParams, companionLanguage, createCompanionPlanner } from '../adventure_companion_ai_core.js';
import * as W from '../adventure_world_core.js';

export function createLocalAIController({
    state,
    ids,
    getSession,
    getRecord,
    queueWrite,
    isBusy,
    safe,
    aiPaused,
    api,
    pressed,
    paths,
    mouseTargets,
    following,
    setFollowing,
    close,
    getGatheringVisible,
    getBattle,
    teamFollowing,
    day,
}) {
    let planner = null,
        aiGoal = null,
        aiCandidates = [],
        aiThinkAt = 0,
        preferredGoal = null;

    const companion = createCompanionAI({
        owner: () => state().store?.owner,
        settings: () => state().save?.languageLearning,
        content: () => state().assets?.content,
        cardName: key => state().assets.effects?.cards[key]?.name || state().assets.dataset.cards[key]?.name,
        focus: () => {
            pressed.forEach(p => p.clear());
            paths[0] = [];
            mouseTargets[0] = null;
            api.walkTo(state().save.position);
        },
        isAI: () => getSession()?.controller === 'ai',
        inBattle: () => !!state().battle,
        switching: () => !!getSession()?.requestedController,
        name: () => getSession()?.second.name,
        toggle: () => safe(() => setController(getSession()?.controller === 'ai' ? 'human' : 'ai')),
        paused: aiPaused,
        scene: () => `${state().stage}:${state().save?.zone}:${state().battle?.turn ?? ''}`,
        speechDelay: quiet => planner?.speechDelay(quiet) || companionParams(state().assets?.content).speechMinMs,
        follow: () => {
            setFollowing(1, false);
            planner?.setMode('follow');
            paths[1] = [];
            aiGoal = null;
            aiThinkAt = 0;
        },
        command: mode => {
            setFollowing(1, false);
            planner?.setMode(mode);
            paths[1] = [];
            aiGoal = null;
            aiThinkAt = 0;
        },
        prefer: id => {
            setFollowing(1, false);
            preferredGoal = id;
            planner?.setMode('auto');
            aiThinkAt = 0;
        },
        suggest: row => {
            if (!aiPaused() && state().stage === 'world') {
                if (row.kind === 'encounter') api.interact({ kind: 'encounter', id: row.id });
                else if (row.kind === 'map') api.openMap?.();
            }
        },
        onSpeech: id => api.onSpeech?.(id),
        snapshot: () => {
            const s = state(),
                session = getSession(),
                record = getRecord(),
                language = companionLanguage(s.save.languageLearning),
                native = s.save.languageLearning?.native || 'zh-CN';
            const nearby = (s.world?.encounters || []).filter(n => W.distance(s.save.position, n) < 350).slice(0, 3);
            return {
                language,
                native,
                player: s.save.name,
                partner: session?.second.name,
                scene: s.world?.name || s.save.zone,
                stage: s.stage,
                activityMode: planner?.mode || 'auto',
                goal: aiGoal?.kind || 'idle',
                goalName: aiGoal?.name || null,
                position: session?.second.position,
                nearbyNPCs: (s.world?.npcs || [])
                    .filter(n => W.distance(s.save.position, n) < 350)
                    .slice(0, 5)
                    .map(n => ({ id: n.id, name: n.name })),
                quests: Object.entries(s.save.quests || {}).slice(0, 10),
                candidates: aiCandidates
                    .filter(n => ['gather', 'pickup', 'follow'].includes(n.kind))
                    .map(n => ({
                        id: n.id,
                        kind: n.kind,
                        name: n.name || null,
                        distance: Math.round(W.distance(session.second.position, n)),
                        remaining: n.remaining ?? null,
                    })),
                partnerResources: {
                    value: (record.credits?.[ids()[1]] || 0) + gatheringValue(record.bags[ids()[1]], gatheringParams(s.assets.content)),
                },
                leaderMoving: !!session?.moving[0],
                battle: s.battle
                    ? {
                          turn: s.battle.turn,
                          finished: s.battle.finished,
                          winner: s.battle.winner,
                          units: s.battle.sides.near.map(u => ({ name: u.name, hp: u.hp, maxHp: u.maxHp })),
                      }
                    : null,
                suggestions:
                    s.stage === 'world'
                        ? [
                              ...nearby.map(n => ({ kind: 'encounter', id: n.id, label: `一起挑战：${n.name || n.id}` })),
                              { kind: 'map', label: '查看地图，决定去哪里' },
                          ]
                        : [],
            };
        },
    });

    async function setController(mode) {
        const session = getSession();
        if (!session || state().battle) {
            if (session) delete session.requestedController;
            return;
        }
        if (isBusy() || state().animating) {
            session.requestedController = mode;
            return;
        }
        session.controller = mode;
        delete session.requestedController;
        getBattle().resetAIBattle();
        close(1);
        following.fill(false);
        paths.forEach(p => (p.length = 0));
        mouseTargets.fill(null);
        pressed.forEach(p => p.clear());
        planner?.reset();
        aiThinkAt = 0;
        aiGoal = null;
        const record = getRecord();
        record.controllers ||= {};
        record.controllers[ids().join(':')] = mode;
        companion.modeChanged();
        await queueWrite();
        api.paintHud();
    }

    function safeAIPosition(point) {
        const world = state().world,
            p = companionParams(state().assets.content);
        return (
            W.walkable(world, point.x, point.y) &&
            constrainLocalPosition(point, state().save.position, innerWidth, innerHeight) &&
            !W.autoInteraction(world, point) &&
            (world.encounters || []).every(enemy => W.distance(enemy, point) > p.enemyClearance)
        );
    }

    function isAIFollowMode() {
        return getSession()?.controller === 'ai' && planner?.mode === 'follow';
    }

    function planAI(now, localFollowing) {
        const session = getSession();
        const record = getRecord();
        if (!session || teamFollowing() || session.controller !== 'ai' || localFollowing()[1] || aiPaused() || now < aiThinkAt) return;
        const s = state(),
            p = companionParams(s.assets.content);
        aiThinkAt = now + p.thinkMs;
        const candidates = getGatheringVisible()
            .filter(n => gatheringRemaining(record, n, day()) > 0 && W.distance(n, s.save.position) < p.followDistance)
            .map(n => ({ ...n, id: `gather:${n.id}`, kind: 'gather', remaining: gatheringRemaining(record, n, day()) }));
        for (const drop of record.drops || []) {
            if (drop.zone === s.world.zone && W.distance(drop, s.save.position) <= p.followDistance) {
                candidates.push({ ...drop, id: `drop:${drop.id}`, kind: 'pickup' });
            }
        }
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI) / 4;
            candidates.push({
                id: i === 0 ? 'follow' : `follow:${i}`,
                kind: 'follow',
                x: s.save.position.x + Math.cos(angle) * p.followSpacing,
                y: s.save.position.y + Math.sin(angle) * p.followSpacing,
            });
        }
        aiCandidates = candidates.filter(safeAIPosition);
        const gp = gatheringParams(s.assets.content),
            value = (record.credits?.[ids()[1]] || 0) + gatheringValue(record.bags[ids()[1]], gp);
        const target = planner.choose({
            now,
            position: session.second.position,
            leader: s.save.position,
            candidates: aiCandidates,
            preferred: preferredGoal,
            smelting: value >= gp.gatherSmeltValue,
            conversing: companion.conversing,
        });
        preferredGoal = null;
        if (!target) {
            paths[1] = [];
            aiGoal = null;
            return;
        }
        if (target.kind === 'smelt' || W.distance(session.second.position, target) <= p.arrivalDistance) {
            paths[1] = [];
            aiGoal = target;
            return;
        }
        if (
            target.id !== aiGoal?.id ||
            W.distance(target, aiGoal) > p.arrivalDistance ||
            (!paths[1].length && W.distance(session.second.position, target) > p.arrivalDistance)
        ) {
            const route = W.findPath(s.world, session.second.position, target);
            if (!route.length || !route.every(safeAIPosition)) {
                paths[1] = [];
                aiGoal = null;
                planner.reject(target.id, now);
                return;
            }
            paths[1] = route;
            aiGoal = target;
        }
    }

    function initPlanner(pair) {
        planner = createCompanionPlanner(pair, companionParams(state().assets.content));
        aiThinkAt = 0;
        aiGoal = null;
        aiCandidates = [];
    }

    function resetPlannerOnWorldSync() {
        planner?.reset({ keepMode: true });
        aiGoal = null;
        aiThinkAt = 0;
    }

    function clearPlanner() {
        planner = null;
        aiGoal = null;
        aiThinkAt = 0;
    }

    return {
        companion,
        setController,
        planAI,
        isAIFollowMode,
        initPlanner,
        resetPlannerOnWorldSync,
        clearPlanner,
    };
}
