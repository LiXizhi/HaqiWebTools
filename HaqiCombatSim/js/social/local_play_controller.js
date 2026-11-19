// social/local_play_controller.js — 本地双人模式与 AI 队友主控制器（会话生命周期、世界移动与输入路由）。
import { migrateCampDrops, locationSnapshot } from '../adventure_coordinates_core.js';
import { startWorldOnFoot } from '../adventure_mounts_core.js';
import { assignedKeyboardAction, normalizePlayerInputs } from '../player_input_core.js';
import { createPlayerInput } from '../player_input.js';
import {
    createLocalFormation,
    validateLocalFormation,
    wideEnough,
} from '../adventure_local_coop_core.js';
import { normalizeLocalKeys, localKeyAction } from '../local_controls_core.js';
import { createLocalStore } from '../adventure_local_store.js';
import { createLearningVoice } from '../audio/language_adventure_voice.js';
import { createLocalPeerControl } from '../views/adventure/view_local_peer_controls.js';
import { SOCIAL_DEFAULTS } from '../adventure_social_core.js';
import { createLocalFollowMotion } from '../adventure_local_follow_core.js';
import { createLocalGatheringController } from './local_play_gathering.js';
import { createLocalBattleController } from './local_play_battle.js';
import { createLocalPanelsController } from './local_play_panels.js';
import { createLocalAIController } from './local_play_ai.js';
import { loadLocalPet, navigateLocalPane, stepLocalWorldMotion, storeLocalDuoSaves } from './local_play_world.js';
import { el } from '../ui/dom.js';
import * as W from '../adventure_world_core.js';
const day = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function createLocalPlay(api) {
    const db = createLocalStore();
    let session = null,
        record = null,
        loadedKey = null,
        loading = null,
        writeQueue = Promise.resolve(),
        busy = false,
        careAt = 0;
    const followMotion = createLocalFollowMotion();
    const panels = [null, null],
        dialogs = [null, null],
        roots = [el('div', 'local-personal local-left'), el('div', 'local-personal local-right')];
    const mouseTargets = [null, null];
    const ui = [{}, {}],
        pressed = [new Set(), new Set()],
        following = [false, false],
        paths = [[], []];
    const banner = el(
        'div',
        'local-wide-warning',
        el('h2', '', '双人模式窗口过小'),
        el('p', '', '请将游戏显示区域调至至少800×480。当前进度已保留。'),
    );
    banner.hidden = true;
    document.body.append(...roots, banner);
    const gatherCanvas = el('canvas', 'local-gather-layer');
    document.body.append(gatherCanvas);

    const state = () => api.state(),
        saves = () => [state().save, session?.second],
        ids = () => session?.ids || [state().store.catalog.activeId];
    const voices = [0, 1].map(owner => createLearningVoice({ getSettings: () => saves()[owner]?.languageLearning || {} }));
    const accountKey = () => `account:${state().store.owner ?? 'guest'}`;
    const safe = fn => {
        try {
            const p = fn();
            if (p?.catch) p.catch(error => api.toast(error.message));
            return p;
        } catch (error) {
            api.toast(error.message);
        }
    };
    const aiPaused = () =>
        !session || document.hidden || state().globalPaused || !wideEnough(innerWidth, innerHeight) || panels.some(Boolean) || dialogs.some(Boolean);
    const mouseOwner = () => {
        if (session?.controller === 'ai') return 0;
        const inputs = normalizePlayerInputs(state().settings.playerInputs);
        const full = inputs.findIndex(d => d.type === 'keyboard-mouse');
        return full >= 0 ? full : inputs.findIndex(d => d.type.startsWith('keyboard'));
    };

    function setFollowing(owner, value) {
        following[owner] = value;
        paths[owner] = [];
        mouseTargets[owner] = null;
        pressed[owner].clear();
        if (value) {
            following[1 - owner] = false;
            paths[1 - owner] = [];
        }
        if (owner === 0) api.walkTo(state().save.position);
    }

    function queueWrite() {
        const key = loadedKey,
            value = structuredClone(record);
        writeQueue = writeQueue.catch(() => {}).then(() => db.write(key, value));
        return writeQueue;
    }

    function storeSaves(next = saves(), { runtimeOnly = false } = {}) {
        storeLocalDuoSaves({ store: state().store, saves, ids, session, api, next, runtimeOnly });
    }
    function loadPet(owner, id) {
        return loadLocalPet({ store: state().store, saves, ids, api, owner, id });
    }

    function teamFollowing() {
        return !!session && !!api.socialTeam?.().length;
    }

    let aiCtrl = null;
    let battle = null;
    let gathering = null;

    const panelsCtrl = createLocalPanelsController({
        state,
        saves,
        getSession: () => session,
        getRecord: () => record,
        queueWrite,
        isBusy: () => busy,
        safe,
        storeSaves,
        loadPet,
        api,
        getCompanion: () => aiCtrl.companion,
        voices,
        roots,
        panels,
        dialogs,
        ui,
        pressed,
        paths,
        following,
        setFollowing,
    });
    const { close, closeAll, openPeerActions, openLocalSocial, flushShopRefresh, refreshShops, openPanel, openPersonal, talk, interceptSocial } =
        panelsCtrl;

    const peerControl = createLocalPeerControl(() => openPeerActions(1));

    aiCtrl = createLocalAIController({
        state,
        ids,
        getSession: () => session,
        getRecord: () => record,
        queueWrite,
        isBusy: () => busy,
        safe,
        aiPaused,
        api,
        pressed,
        paths,
        mouseTargets,
        following,
        setFollowing,
        close,
        getGatheringVisible: () => gathering.visible,
        getBattle: () => battle,
        teamFollowing,
        day,
    });
    const { companion, setController, planAI } = aiCtrl;

    gathering = createLocalGatheringController({
        state,
        saves,
        ids,
        getSession: () => session,
        getRecord: () => record,
        setRecord: next => {
            record = next;
        },
        getLoadedKey: () => loadedKey,
        getWriteQueue: () => writeQueue,
        db,
        isBusy: () => busy,
        setBusy: value => {
            busy = value;
        },
        safe,
        storeSaves,
        api,
        companion,
        panels,
        dialogs,
        following,
        gatherCanvas,
        day,
    });

    battle = createLocalBattleController({
        state,
        saves,
        ids,
        getSession: () => session,
        getRecord: () => record,
        setRecord: next => {
            record = next;
        },
        getLoadedKey: () => loadedKey,
        getWriteQueue: () => writeQueue,
        queueWrite,
        db,
        isBusy: () => busy,
        setBusy: value => {
            busy = value;
        },
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
    });

    function localFollowing() {
        return [following[0], following[1] || (!following[0] && aiCtrl.isAIFollowMode())];
    }

    function syncWorld(force = false) {
        if (!session || !state().world || (force && !teamFollowing() && !localFollowing().some(Boolean))) return;
        const { save, world, assets } = state();
        if (
            followMotion.sync(world, saves(), {
                force,
                params: { ...SOCIAL_DEFAULTS, ...assets.content.balanceParams?.islandSocial },
            })
        ) {
            session.world = world;
            session.lastLeader = { ...save.position };
            paths.forEach(p => (p.length = 0));
            mouseTargets.fill(null);
            aiCtrl.resetPlannerOnWorldSync();
        }
    }

    async function ensure() {
        const key = accountKey();
        if (key === loadedKey && record) {
            if (record.smelt) await gathering.finishSmelt();
            if (record.pickup) await gathering.finishPickup();
            return;
        }
        if (loading) return loading;
        loading = (async () => {
            const value = await db.read(key);
            if (key !== accountKey()) return;
            record = value || { version: 1, bags: {}, depleted: {}, day: day(), formations: {}, pending: null, smelt: null };
            loadedKey = key;
            migrateCampDrops(record, state().assets.content);
            if (!record.lootNamespace) {
                record.lootNamespace = crypto.randomUUID();
                await queueWrite();
            }
            await gathering.ensureConfig();
            if (record.smelt) await gathering.finishSmelt();
            if (record.pickup) await gathering.finishPickup();
            const pending = record.pending,
                receipt = pending && (pending.receipt || pending.base?.id);
            if (receipt && pending.ids.every(id => state().store.catalog.roles.find(r => r.id === id)?.save.rewardedEncounters.includes(receipt))) {
                const next = { ...record, pending: null };
                await db.write(key, next);
                record = next;
            }
        })().finally(() => {
            loading = null;
        });
        return loading;
    }

    async function start(first, second, { controller } = {}) {
        if (!wideEnough(innerWidth, innerHeight)) throw Error('双人模式需要至少800×480的游戏显示区域');
        if (first === second) throw Error('请选择两个不同角色');
        await ensure();
        const { store } = state();
        const rows = [first, second].map(id => store.catalog.roles.find(r => r.id === id));
        if (rows.some(r => !r)) throw Error('角色不存在');
        if (record.pending && JSON.stringify(record.pending.ids) !== JSON.stringify([first, second]))
            throw Error('请先选择原来的两名玩家，恢复并结束双人战斗');
        if (!record.pending && rows.some(r => r.save.pendingEncounter)) throw Error('请先在单人模式结束角色尚未完成的战斗');
        const pair = [first, second].join(':');
        const formation = record.formations[pair] || createLocalFormation([first, second], rows.map(r => r.save));
        validateLocalFormation(formation, [first, second], rows.map(r => r.save));
        followMotion.reset();
        session = {
            ids: [first, second],
            second: startWorldOnFoot(structuredClone(rows[1].save)),
            formation,
            returnTo: { ...locationSnapshot(rows[1].save, state().assets.content), dungeonReturn: rows[1].save.dungeonReturn },
            world: null,
        };
        session.controller = (record.pending?.controller ?? controller ?? record.controllers?.[pair]) === 'ai' ? 'ai' : 'human';
        aiCtrl.initPlanner(pair);
        battle.resetAIBattle();
        for (const seat of formation.slots) {
            if (seat?.kind === 'pet') {
                if (seat.owner === 0) {
                    const ref = rows[0].save.petFileRefs?.[seat.id];
                    if (!rows[0].save.pets[seat.id] && ref) {
                        try {
                            store.petFileIO(first).read(ref.path);
                        } catch {
                            await api.loadPetFile(first, ref.path);
                        }
                    }
                    const next = store.loadPet(rows[0].save, seat.id, first);
                    Object.assign(rows[0].save.pets, next.pets);
                } else {
                    await loadPet(1, seat.id);
                }
            }
        }
        document.body.classList.add('local-duo');
        await api.activate(first);
        if (record.pending) battle.restorePendingBattle(record.pending);
        await companion.start({
            owner: store.owner,
            memoryKey: JSON.stringify([accountKey(), first, second]),
            quotaKey: `quota:${accountKey()}`,
        });
        record.controllers ||= {};
        record.controllers[pair] = session.controller;
        await queueWrite();
    }

    function leave() {
        companion.stop();
        battle.resetAIBattle({ keepHints: true });
        aiCtrl.clearPlanner();
        closeAll();
        peerControl.node.hidden = true;
        pressed.forEach(p => p.clear());
        following.fill(false);
        gathering.resetSessionGathering();
        banner.hidden = true;
        gatherCanvas.hidden = true;
        document.body.classList.remove('local-duo');
        if (session) {
            session.second.zone = session.returnTo.zone;
            session.second.position = session.returnTo.position;
            session.second.positionCoordinateVersion = session.returnTo.coordinateVersion ?? 1;
            session.second.dungeonReturn = session.returnTo.dungeonReturn;
            storeSaves();
        }
        session = null;
    }

    function interact(owner) {
        const target = W.nearestInteraction(state().world, saves()[owner].position);
        if (target?.kind === 'npc') {
            talk(owner, target);
            return;
        }
        if (target?.kind === 'encounter') {
            api.interact(target);
            return;
        }
        if (owner === 0 && target) api.interact(target);
    }

    function navigate(owner, action, override = null) {
        const currentState = state();
        const pane = override || (currentState.stage === 'battle' ? document.querySelector('#local-battle-panels')?.children[owner] : roots[owner]);
        navigateLocalPane({ pane, currentState, battle, ui, owner, action, override });
    }

    function key(event, down) {
        if (event.target?.closest?.('[data-recording-key],input,textarea,select')) return false;
        const current = state();
        if (current.globalPaused || (current.stage !== 'world' && current.stage !== 'battle')) return false;
        const inputs = normalizePlayerInputs(current.settings.playerInputs),
            keys = normalizeLocalKeys(current.settings.localKeys);
        const intent = assignedKeyboardAction(inputs, keys, event.code);
        if (intent && (session || intent.owner === 0)) return control(intent.owner, intent.action, down, event.repeat);
        return !!localKeyAction(keys, event.code);
    }

    function control(owner, action, down, repeat = false) {
        const event = { repeat };
        if (companion.typing || (owner === 1 && session?.controller === 'ai')) {
            pressed[owner].clear();
            return true;
        }
        if (!down) {
            pressed[owner].delete(action);
            if (!session) api.control(action, false, repeat);
            return true;
        }
        if (document.hidden || (session && !wideEnough(innerWidth, innerHeight)) || busy) return true;
        if (action === 'settings' || state().globalPaused) {
            pressed.forEach(p => p.clear());
            api.control(action, down, repeat);
            return true;
        }
        if (!session) {
            if (owner === 0) api.control(action, down, repeat);
            return true;
        }
        if (state().stage === 'battle') return battle.handleBattleControl(owner, action, event.repeat, navigate);
        if (state().stage !== 'world') return false;
        if (panels[owner] || dialogs[owner]) {
            if (event.repeat && !['left', 'right', 'up', 'down'].includes(action)) return true;
            if (action === 'back') {
                const detail = [...roots[owner].querySelectorAll('dialog[open]')].at(-1);
                if (detail) detail.close();
                else {
                    panelsCtrl.resetFormationSelection(owner);
                    close(owner);
                }
            } else {
                navigate(owner, action);
            }
            return true;
        }
        if (['up', 'down', 'left', 'right'].includes(action)) {
            pressed[owner].add(action);
            following[owner] = false;
            paths[owner] = [];
            mouseTargets[owner] = null;
            return true;
        }
        if (event.repeat) return true;
        if (action === 'confirm') interact(owner);
        else if (action === 'follow') setFollowing(owner, !following[owner]);
        else if (['inventory', 'pet', 'deck'].includes(action)) {
            safe(async () => {
                await ensure();
                openPanel(owner, action);
                if (['inventory', 'pet'].includes(action) && !panels[1 - owner] && !dialogs[1 - owner]) openPanel(1 - owner, action);
            });
        }
        return true;
    }

    const input = createPlayerInput({
        settings: () => state().settings,
        enabled: owner => !document.hidden && (!!session || owner === 0) && (!session || wideEnough(innerWidth, innerHeight)),
        dispatch: (owner, e) => control(owner, e.action, e.down, e.repeat),
    });

    function tick(now, dt) {
        flushShopRefresh();
        const { save, world, stage, renderer } = state();
        if (session) {
            if (stage === 'world') syncWorld();
            if (session.requestedController && !busy && !state().animating) safe(() => setController(session.requestedController));
            let anchor = null,
                obstacles = [];
            if (stage === 'world') anchor = renderer.worldToScreen({ ...session.second.position, y: session.second.position.y - 100 });
            else if (stage === 'battle') {
                const canvas = state().battleRoot.querySelector('canvas.battle-canvas'),
                    p = canvas?.battlePositions?.['local-hero-1'];
                if (p) {
                    const rect = canvas.getBoundingClientRect();
                    anchor = { x: rect.left + p.x, y: rect.top + p.y - 90 };
                    obstacles = (canvas.battleStatusRects || []).map(r => ({ ...r, x: r.x + rect.left, y: r.y + rect.top }));
                }
            }
            companion.tick(now, anchor, obstacles);
            if (stage === 'battle') {
                battle.updateAIBattle();
                battle.updateAIHint();
            }
        }
        const showPeers =
            !!session &&
            stage === 'world' &&
            !state().globalPaused &&
            wideEnough(innerWidth, innerHeight) &&
            W.distance(save.position, session.second.position) <= 180;
        peerControl.render(document.querySelector('.local-secondary-toolbar'), showPeers && !panels[1] && !dialogs[1]);
        if (!save || !world) return;
        const paused = !!session && !wideEnough(innerWidth, innerHeight);
        banner.hidden = !paused;
        if (paused) {
            pressed.forEach(p => p.clear());
            gathering.resetSessionGathering();
            gatherCanvas.hidden = true;
            return;
        }
        if (stage !== 'world') {
            gathering.resetSessionGathering();
            gatherCanvas.hidden = true;
            return;
        }
        if (!record || loadedKey !== accountKey()) {
            safe(ensure);
            return;
        }
        if (record.pickup && !busy) {
            busy = true;
            safe(() =>
                gathering.finishPickup().finally(() => {
                    busy = false;
                }),
            );
            return;
        }
        if (session) {
            stepLocalWorldMotion({
                world,
                save,
                assets: state().assets,
                globalPaused: state().globalPaused,
                saves,
                session,
                localFollowing,
                teamFollowing,
                followMotion,
                planAI,
                pressed,
                paths,
                mouseTargets,
                panels,
                dialogs,
                api,
                talk,
                now,
                dt,
                careAt,
                setCareAt: next => {
                    careAt = next;
                },
            });
        }
        gathering.tickGathering(now, dt, ensure);
    }

    return {
        start: async (...args) => {
            try {
                await start(...args);
            } catch (error) {
                companion.stop();
                session = null;
                closeAll();
                document.body.classList.remove('local-duo');
                throw error;
            }
        },
        leave,
        ensure,
        syncWorld,
        partyFor: battle.partyFor,
        beginBattle: battle.beginBattle,
        paintBattle: battle.paintBattle,
        storeSaves,
        tick,
        key,
        closeAll,
        openPersonal,
        openPanel,
        refreshShops,
        arenaLobby: () => battle.arenaLobby(ensure),
        pollInput: now => input.poll(now),
        navigateGlobal: (root, action) => navigate(0, action, root),
        get gatheringPets() {
            return gathering.gatheringPets;
        },
        get active() {
            return !!session;
        },
        get paused() {
            return !!session && !wideEnough(innerWidth, innerHeight);
        },
        get second() {
            return session?.second;
        },
        get busy() {
            return busy;
        },
        toggleMount(owner) {
            if (!session || state().battle) return;
            const save = saves()[owner];
            save.mountHidden = !save.mountHidden;
            storeSaves();
            api.paintHud();
        },
        get moving() {
            return session?.moving || [false, false];
        },
        get mouseOwner() {
            return mouseOwner();
        },
        get secondFollowing() {
            return !!session && (teamFollowing() || !!localFollowing()[1]);
        },
        get following() {
            return !!session && (teamFollowing() || following.some(Boolean) || aiCtrl.isAIFollowMode());
        },
        routePointer(point, target) {
            if (!session || mouseOwner() === 0) return false;
            if (mouseOwner() !== 1) return true;
            const resource = gathering.visible.find(n => W.distance(point, n) < 24);
            mouseTargets[1] = resource || target || point;
            paths[1] = W.findPath(state().world, session.second.position, resource || target || point);
            following[1] = false;
            return true;
        },
        get leaderBlocked() {
            return !!panels[0] || !!dialogs[0];
        },
        clearKeys() {
            pressed.forEach(p => p.clear());
            paths.forEach(p => (p.length = 0));
            mouseTargets.fill(null);
        },
        get hasPersonal() {
            return panels.some(Boolean) || dialogs.some(Boolean);
        },
        get gesture() {
            return panelsCtrl.gesture;
        },
        get roleIds() {
            return [...ids()];
        },
        commitRole(owner, next) {
            const values = saves();
            values[owner] = next;
            storeSaves(values);
            api.paintHud();
        },
        openPeer() {
            openPeerActions(1);
        },
        openSocial(owner, profile) {
            openLocalSocial(owner, profile);
        },
        interceptSocial,
        interceptNpc(target) {
            if (!session || target?.kind !== 'npc') return false;
            talk(0, target);
            return true;
        },
        collectClick(point) {
            if (gathering.collectDrop(point, p => api.walkTo(p))) return true;
            const n = gathering.visible.find(n => W.distance(point, n) < 24);
            if (!n) return false;
            api.walkTo(n);
            return true;
        },
        tryGather() {
            return false;
        },
        guardSolo: async () => {
            await ensure();
            if (record.pending) throw Error('请先选择原双人组合，结束共同战斗后再切换单人');
        },
    };
}
