import { locationSnapshot } from '../adventure_coordinates_core.js';
import { createEarthPlaces } from '../earth/adventure_earth_places.js';
import { gearScoreV2 } from '../combat_formulas_core.js';
import { magicStarCombatLevel } from '../adventure_magic_star_core.js';
import { renderEarthAtlas, renderEarthLoading, renderEarthStory } from '../views/adventure/view_adventure_earth.js';
import { renderEarthLocalMap } from '../views/adventure/view_adventure_earth_local_map.js';
import { earthGeo, earthChapterEvent } from '../adventure_earth_core.js';
import {
    earthCityChapterProgress,
    earthCityQuestOffers,
    applyEarthCityQuest,
    earthCityQuestTarget,
    earthCityStory,
} from '../adventure_earth_city_config_core.js';
import { createIslandSceneLoadingView } from '../views/adventure/view_island_scene_loading.js';
import * as A from '../adventure_core.js';
import * as W from '../adventure_world_core.js';
import { dungeonFor } from '../adventure_dungeons_core.js';
import { persistReward } from '../adventure_reward_persistence.js';
import { createLearningVoice } from '../audio/language_adventure_voice.js';
import { createStoryChat } from '../learning/language_story.js';

export function routeWorldPortal(portal, target, { travelEarth, close, setAtlasPortalFocus, setPanel, openEarthMap, openPanel }) {
    if (target === 'earth' && portal.travel) {
        void travelEarth(portal.earth);
        return;
    }
    // Unconfigured portals and the return direction only switch map views.
    setAtlasPortalFocus(portal.id);
    if (target === 'earth') {
        close({ silent: true });
        setPanel('earthmap');
        void openEarthMap({ ...portal.earth, portalFocus: true });
    } else {
        openPanel('worldmap');
    }
}

export function createEarthController({
    nodes,
    getContext,
    services,
    close = services?.navigation?.close,
    openPanel = services?.navigation?.openPanel,
    persist = services?.persistence?.persist,
    queueCloudSave = services?.persistence?.queueCloudSave,
    paintHud = services?.navigation?.paintHud,
    toast = services?.feedback?.toast,
    showTitle = services?.navigation?.showTitle,
    enterWorld = services?.navigation?.enterWorld,
    showTeleportEffect,
    attachMapServers,
    openFreeTalk,
    awardLanguageSpeech,
    membership,
    islandSocial,
    showEarthSceneLoadingFn,
    getEarthFn,
    earthPlacesClient,
}) {
    let earthPractice = null;
    let earthService = null;
    let earthServiceTask = null;
    let earthView = null;
    let earthViewTicket = 0;
    let earthTraveling = false;
    let earthOwner = null;
    let earthLoadingRetry = null;
    let earthLoadingExit = null;

    const earthLoadingView = showEarthSceneLoadingFn
        ? { show() {}, hide() {} }
        : createIslandSceneLoadingView({
              retry: () => earthLoadingRetry?.(),
              exit: () => earthLoadingExit?.(),
          });
    const earthPlaces = earthPlacesClient || createEarthPlaces();

    function showEarthSceneLoading(state, actions = {}) {
        if (showEarthSceneLoadingFn) {
            showEarthSceneLoadingFn(state, actions);
            return;
        }
        const { retry, exit } = actions;
        if (retry) earthLoadingRetry = retry;
        if (exit) earthLoadingExit = exit;
        const { assets, save, roleStore } = getContext();
        earthLoadingView.show(state, { assets, save, scope: earthViewTicket, roleId: roleStore?.catalog.activeId });
    }

    async function getEarth() {
        if (getEarthFn) return getEarthFn();
        if (!earthServiceTask) {
            const { assets } = getContext();
            earthServiceTask = import('../earth/adventure_earth.js').then(({ createEarthService }) => {
                earthService = createEarthService({
                    content: assets.content,
                    getPlayerLevel: () => getContext().save?.level || 1,
                    getPlayerPower: () => {
                        const ctx = getContext();
                        return gearScoreV2(
                            A.playerSpec(
                                ctx.save,
                                ctx.assets.content,
                                magicStarCombatLevel(ctx.assets.content, {
                                    keepworkVip: membership().state.isVip,
                                    expiresAt: membership().state.expiresAt,
                                    now: Date.now(),
                                }),
                            ),
                        );
                    },
                    registerImage: assets.registerImage,
                    releaseImage: assets.releaseImage,
                    prepareAssets: target => assets.prepareEarthScene(target, getContext().save),
                });
                return earthService;
            });
        }
        return earthServiceTask;
    }

    function switchWorldMap(id) {
        getContext().setAtlasPortalFocus(null);
        openPanel(id === 'earth' ? 'earthmap' : 'worldmap');
    }

    function browseWorldPortal(portal, target) {
        routeWorldPortal(portal, target, {
            travelEarth,
            close,
            setAtlasPortalFocus: id => getContext().setAtlasPortalFocus(id),
            setPanel: name => getContext().setPanel(name),
            openEarthMap,
            openPanel,
        });
    }

    function bindWorldObjectsChanged(targetWorld) {
        targetWorld.onObjectsChanged = (change = {}) => {
            W.invalidateWorldObjects(targetWorld, change);
            const ctx = getContext();
            if (ctx.world === targetWorld) {
                void ctx.assets.warmNearby?.(ctx.world, ctx.save);
                if (!change.wildOnly && change.socialChanged !== false) void islandSocial().refreshEarth();
            }
        };
    }

    async function openEarthMap(focus = null) {
        const ctx = getContext();
        const ticket = ++earthViewTicket;
        const current = ctx.save;
        renderEarthLoading(nodes.overlay, {
            close,
            localMap: ctx.world.isEarth ? () => openPanel('localmap') : null,
            switchWorld: switchWorldMap,
        });
        try {
            const service = await getEarth();
            const data = await service.atlas();
            let places;
            try {
                places = await earthPlaces.read();
            } catch {
                toast('本机地图收藏读取失败，可重试打开地图');
            }
            const latest = getContext();
            if (ticket !== earthViewTicket || current !== latest.save || latest.panel !== 'earthmap') return;
            earthView = renderEarthAtlas(
                nodes.overlay,
                {
                    ...data,
                    places,
                    assetMode: latest.assets.mode,
                    current: focus || (latest.world.isEarth ? earthGeo(latest.save.position, service.rules) : null),
                    focus,
                },
                {
                    close,
                    localMap: () => openPanel('localmap'),
                    localMapLabel: latest.world.isEarth ? '返回当前城市地图' : '返回当前岛屿地图',
                    switchWorld: switchWorldMap,
                    portal: browseWorldPortal,
                    viewport: bounds => service.viewport(bounds),
                    addFavorite: geo => earthPlaces.add(geo),
                    removeFavorite: id => earthPlaces.remove(id),
                    travel: travelEarth,
                },
            );
            attachMapServers();
        } catch (e) {
            const latest = getContext();
            if (ticket === earthViewTicket && latest.panel === 'earthmap') {
                renderEarthLoading(nodes.overlay, {
                    close,
                    localMap: latest.world.isEarth ? () => openPanel('localmap') : null,
                    message: e.message,
                    retry: () => openEarthMap(focus),
                    switchWorld: switchWorldMap,
                });
            }
        }
    }

    async function travelEarth(geo) {
        const ctx = getContext();
        if (ctx.save.pendingEncounter || ctx.save.coopRun || dungeonFor(ctx.assets.content, ctx.save.zone)) {
            toast('请先完成战斗或退出副本');
            return;
        }
        const current = ctx.save;
        const role = ctx.roleStore?.catalog.activeId;
        const ticket = earthViewTicket;
        earthTraveling = true;
        earthView?.busy('正在准备目的地，关闭地图可取消…');
        showEarthSceneLoading({ phase: 'assets' }, { retry: () => void travelEarth(geo), exit: () => void showTitle() });
        try {
            const service = await getEarth();
            if (current !== getContext().save || ticket !== earthViewTicket) return;
            const prepared = await service.prepare(geo, {
                onProgress: progress => {
                    if (current === getContext().save && ticket === earthViewTicket) {
                        showEarthSceneLoading({ phase: 'map', ...progress });
                    }
                },
            });
            const latest = getContext();
            if (current !== latest.save || role !== latest.roleStore?.catalog.activeId || ticket !== earthViewTicket) return;
            if (latest.save.zone !== 'earth') latest.save.earthReturn = locationSnapshot(latest.save, latest.assets.content);
            latest.save.zone = 'earth';
            latest.save.position = prepared.position;
            latest.assets.content.earthWorld = prepared.world;
            earthOwner = current;
            earthTraveling = false;
            bindWorldObjectsChanged(prepared.world);
            await enterWorld(latest.save);
            if (current !== getContext().save) return;
            if (geo.id && geo.name && !geo.favorite) {
                void earthPlaces.visit(geo).catch(() => toast('最近访问城市保存失败'));
            }
            showTeleportEffect();
            toast('已抵达现实世界。沿陆地探索，或打开地图前往远方。');
        } catch (e) {
            if (current === getContext().save && ticket === earthViewTicket) {
                earthView?.error(e.message);
                showEarthSceneLoading({ phase: 'error', message: e.message });
            }
        } finally {
            if (ticket === earthViewTicket) earthTraveling = false;
        }
    }

    async function practiceEarth(npc, learning) {
        const ctx = getContext();
        if (!ctx.save.languageLearning.enabled) {
            toast('请先在双语学习中选择目标语言。');
            return;
        }
        const current = ctx.save;
        const role = ctx.roleStorage;
        await Promise.resolve();
        const latest = getContext();
        if (current !== latest.save || role !== latest.roleStorage) return;
        close();
        earthPractice = createStoryChat({
            allowedZone: latest.save.zone,
            onClosed: () => {
                if (getContext().panel === 'earthpractice') {
                    getContext().setPanel(null);
                    paintHud();
                }
            },
            onSpeech: awardLanguageSpeech,
            getState: () => {
                const nowCtx = getContext();
                return {
                    save: nowCtx.save,
                    content: nowCtx.assets.content,
                    role: nowCtx.roleStorage,
                    identity: nowCtx.roleStore?.owner,
                    stage: nowCtx.stage,
                };
            },
            voice: createLearningVoice({ getSettings: () => getContext().save.languageLearning }),
            saveSettings: settings => {
                Object.assign(getContext().save.languageLearning, settings);
                persist();
            },
            openSettings: () => openPanel('settings'),
            onFreeTalk: (profile, options) => {
                earthPractice.close();
                void openFreeTalk(profile, options);
            },
            commit: completion => {
                const nowCtx = getContext();
                const committed = persistReward(
                    nowCtx.save,
                    nowCtx.assets.content,
                    { type: 'language-complete', completion },
                    { learningCompletion: completion },
                    nowCtx.roleStorage,
                );
                nowCtx.setSave(committed.save);
                nowCtx.setStorageWarning(false);
                queueCloudSave();
                paintHud();
                return committed.result;
            },
        });
        const cityId = npc.cityId || 'shenzhen';
        const story = {
            id: `earth-${cityId}:${learning.id}`,
            title: learning.title,
            context: learning.context,
            rewardGroup: 'help',
            opening: { 'zh-CN': '我们先问清楚，再一起出发。', en: 'Let us ask first, then go together.' },
            turns: learning.prompts.map((row, i) => ({
                id: learning.id.startsWith('city:') ? row.id : `earth-${cityId}:help:${i}`,
                pattern: row.en,
                hint: row.zh,
                question: row.question,
                answer: { 'zh-CN': row.zh, en: row.en },
                response: { 'zh-CN': '谢谢你说清楚。我们一起去吧。', en: 'Thank you. Let us go together.' },
            })),
        };
        getContext().setPanel('earthpractice');
        earthPractice.open({ ...npc, stories: [story] }, story, null);
    }

    async function openEarthNpc(npc) {
        close();
        getContext().setPanel('earthstory');
        const current = getContext().save;
        const ticket = ++earthViewTicket;
        renderEarthLoading(nodes.overlay, {
            close,
            localMap: getContext().world.isEarth ? () => openPanel('localmap') : null,
            message: '正在读取这段故事…',
        });
        try {
            const data = await earthService.story();
            const latest = getContext();
            if (current !== latest.save || ticket !== earthViewTicket) return;
            const progress = earthCityChapterProgress(latest.save, data.quests);
            const story = earthCityStory(latest.save, data.city, npc);
            const done = () => {
                if (earthChapterEvent(getContext().save, data.quests, story.event)) {
                    persist();
                    queueCloudSave();
                    paintHud();
                }
                close();
            };
            const questOffers = earthCityQuestOffers(latest.save, data.city, npc.id);
            renderEarthStory(
                nodes.overlay,
                { ...data, assets: latest.assets, npc, story, progress, questOffers },
                {
                    close,
                    advance: done,
                    choose: choice => {
                        toast(choice.reply);
                        if (choice.correct) done();
                    },
                    quest: offer => {
                        try {
                            const result = applyEarthCityQuest(getContext().save, data.city, npc.id, offer.quest.id, offer.kind);
                            persist();
                            queueCloudSave();
                            paintHud();
                            toast(
                                offer.kind === 'complete'
                                    ? offer.quest.completion
                                    : offer.kind === 'talk'
                                        ? result.objective.reply
                                        : offer.quest.description,
                            );
                            void openEarthNpc(npc);
                        } catch (e) {
                            toast(e.message);
                        }
                    },
                    service: kind => {
                        close();
                        openPanel(kind === 'map' ? 'localmap' : kind);
                    },
                    chat: () =>
                        openFreeTalk({
                            ...npc,
                            description: `${npc.background} ${npc.role}。常用语言：${npc.languages.join('、')}。${story.text}`,
                            cityName: data.city.name,
                        }),
                    practice: () => void practiceEarth(npc, data.learning),
                    go: () => {
                        const focus =
                            earthCityQuestTarget(getContext().save, data.city)?.destination
                            || story.destination
                            || data.quests.steps[earthCityChapterProgress(getContext().save, data.quests).step]?.destination;
                        close();
                        getContext().setPanel('earthmap');
                        void openEarthMap(focus);
                    },
                },
            );
        } catch (e) {
            if (current === getContext().save && ticket === earthViewTicket) {
                renderEarthLoading(nodes.overlay, {
                    close,
                    localMap: getContext().world.isEarth ? () => openPanel('localmap') : null,
                    message: e.message,
                    retry: () => openEarthNpc(npc),
                });
            }
        }
    }

    async function restoreEarthWorld(newSave, restoredBattle, { announceBeans = false } = {}) {
        const service = await getEarth();
        if (earthOwner !== newSave || !service.world) {
            const ticket = ++earthViewTicket;
            getContext().setPanel('earth-restore');
            nodes.entry.hidden = true;
            showEarthSceneLoading(
                { phase: 'assets', message: '正在恢复这片地球区域，原存档会保留…' },
                { exit: () => void showTitle(), retry: () => void enterWorld(newSave, restoredBattle, { announceBeans }) },
            );
            try {
                const result = await service.prepare(earthGeo(newSave.position, service.rules), {
                    restore: true,
                    onProgress: progress => {
                        if (getContext().save === newSave && ticket === earthViewTicket) {
                            showEarthSceneLoading({ phase: 'map', ...progress });
                        }
                    },
                });
                if (getContext().save !== newSave || ticket !== earthViewTicket) return false;
                getContext().assets.content.earthWorld = result.world;
                newSave.position = result.position;
                earthOwner = newSave;
                bindWorldObjectsChanged(result.world);
            } catch (e) {
                if (getContext().save !== newSave || ticket !== earthViewTicket) return false;
                showEarthSceneLoading({ phase: 'error', message: `${e.message}。原存档和未结束的战斗已保留。` });
                return false;
            }
        }
        return true;
    }

    function renderLocalEarthMap() {
        const { world, save, renderer } = getContext();
        earthView?.dispose();
        earthView = renderEarthLocalMap(nodes.overlay, world, save, {
            close,
            switchWorld: switchWorldMap,
            travel: travelEarth,
            viewport: bounds => getEarth().then(service => service.localViewport(bounds)),
            draw: (canvas, options) => renderer.minimap(canvas, world, save, options),
        });
        attachMapServers();
    }

    function updateFrame(now, dt) {
        const { stage, world, panel, dialog, save, renderer } = getContext();
        if (stage === 'world' && world.isEarth && !panel && !dialog) {
            earthService?.update(save.position, now);
            earthService?.updateVisible(save.position, renderer.viewRect(), dt);
            if (world.error && world.error !== world.reportedError) {
                world.reportedError = world.error;
                toast(world.error);
            }
        }
    }

    function tickPractice() {
        earthPractice?.tick();
    }

    function closeAll() {
        earthLoadingView.hide();
        earthLoadingRetry = null;
        earthLoadingExit = null;
        earthPractice?.close();
        earthViewTicket++;
        earthView?.dispose();
        earthView = null;
        if (earthTraveling) {
            earthService?.cancelPending();
            earthTraveling = false;
        }
    }

    function resetSession() {
        earthViewTicket++;
        earthService?.cancel();
        earthOwner = null;
        const { assets } = getContext();
        if (assets?.content) delete assets.content.earthWorld;
    }

    function nextTicket() {
        return ++earthViewTicket;
    }

    function currentTicket() {
        return earthViewTicket;
    }

    function getChapter() {
        return earthService?.chapter;
    }

    return {
        getEarth,
        getChapter,
        switchWorldMap,
        browseWorldPortal,
        openEarthMap,
        travelEarth,
        practiceEarth,
        openEarthNpc,
        restoreEarthWorld,
        renderLocalEarthMap,
        updateFrame,
        tickPractice,
        closeAll,
        resetSession,
        nextTicket,
        currentTicket,
    };
}
