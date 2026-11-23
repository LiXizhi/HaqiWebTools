// adventure/panel_controller.js — 面板路由与弹窗状态协调（HUD 与调试编辑委派至独立子控制器）。
import { shopNavigationState, equipmentNavigationState } from '../adventure_shop_navigation_core.js';
import { recommendedLanguageQuest } from '../language_quest_core.js';
import { wordLanguage } from '../word_lexicon_core.js';
import { renderDungeonJourney } from '../views/adventure/view_dungeon_journey.js';
import { dungeonFor } from '../adventure_dungeons_core.js';
import { renderDungeons } from '../views/adventure/view_adventure_dungeons.js';
import { initialStrengtheningSelection } from '../adventure_strengthening_core.js';
import { normalizeGameServerUrl } from '../adventure_game_server.js';
import { renderMaps } from '../views/adventure/view_adventure_maps.js';
import * as A from '../adventure_core.js';
import * as W from '../adventure_world_core.js';
import { renderHud as defaultRenderHud } from '../views/adventure/view_hud.js';
import { capturePanelFocusState, renderPanel, restorePanelFocusState, settingsView } from '../views/adventure/view_panel_modal.js';
import { createHudController } from './hud_controller.js';
import { createDebugEditController } from './debug_edit_controller.js';

export function createPanelController(options) {
    const {
        nodes,
        getContext,
        model,
        services,
        bus,
        close = services?.navigation?.close,
        persist = services?.persistence?.persist,
        queueCloudSave = services?.persistence?.queueCloudSave,
        enterWorld = services?.navigation?.enterWorld,
        showTitle = services?.navigation?.showTitle,
        loginRoles,
        deleteCurrentRole,
        loadPet,
        action,
        seenGuide,
        performAction,
        interact,
        interactNearest,
        track,
        travel,
        teleportToLandmark,
        teleportToPosition,
        openHomePanel,
        openTimeScroll,
        refreshMembership,
        rechargeMembership,
        setLocale,
        setLearning,
        applyLearningMode,
        toggleMusic,
        toggleSound,
        attachMapServers,
        disposeMapServers,
        earth,
        dungeon,
        wordLearning,
        opening,
        roleCloud,
        islandSocial,
        localPlay,
        languageTasks,
        languageAdventure,
        gameSettings = services?.runtime?.gameSettings,
        adaptiveGraphics = services?.runtime?.adaptiveGraphics,
        spellSound = services?.feedback?.spellSound,
        toast = services?.feedback?.toast,
        safely = services?.feedback?.safely,
        renderHud = defaultRenderHud,
        renderPanelFn = renderPanel,
        renderPetWelcomeFn,
        playOpeningPetWelcomeFn,
        onOpenPanel,
    } = options;

    let atlasView = null;
    let selectedQuestId = null;
    let pinJournalQuest = false;
    let returnPanel = null;

    const closeOrReturn = opts => {
        if (!opts?.silent && returnPanel) {
            const back = returnPanel;
            returnPanel = null;
            openPanel(back);
            return;
        }
        returnPanel = null;
        close(opts);
    };

    const hud = createHudController({
        nodes,
        getContext,
        model,
        services,
        close,
        openPanel,
        persist,
        queueCloudSave,
        loginRoles,
        track,
        interactNearest,
        performAction,
        dungeon,
        opening,
        languageTasks,
        localPlay,
        spellSound,
        renderHud,
        renderPetWelcomeFn,
        playOpeningPetWelcomeFn,
        onOpenPanel,
    });

    const debugEdit = createDebugEditController({
        getContext,
        services,
        queueCloudSave,
        enterWorld,
        openPanel,
        paintHud: hud.paintHud,
        paintPanel,
        toast,
        safely,
    });

    function paintPanel() {
        const ctx = getContext();
        const panel = ctx.panel;
        if (panel === 'camp-arrival') {
            hud.paintCampArrival();
            return;
        }
        if (panel === 'first-pet-welcome') {
            hud.paintFirstPetWelcome();
            return;
        }
        if (panel === 'tactics-challenges') return;
        if (panel === 'tactics-training') {
            opening.openTacticsTraining();
            return;
        }
        if (panel === 'opening-journey') {
            opening.paintOpeningJourney();
            return;
        }
        if (panel === 'forest-commission') {
            opening.paintForestCommission();
            return;
        }
        disposeMapServers?.();
        if (panel === 'home') return;
        if (panel === 'hanzi-memory' || panel === 'hanzi' || panel === 'dictionary' || panel === 'time-scroll') return;
        if (panel === 'map') ctx.setPanel('localmap');
        const activePanel = getContext().panel;
        if (activePanel === 'localmap' && ctx.world.isEarth) {
            earth.renderLocalEarthMap();
            return;
        }
        if (activePanel === 'earthmap') {
            void earth.openEarthMap();
            return;
        }
        if (['earthstory', 'earthpractice'].includes(activePanel)) return;
        if (['mail', 'chat', 'social-party', 'social-actions', 'social-profile', 'social-pvp'].includes(activePanel)) {
            islandSocial().paint(nodes.overlay, activePanel);
            return;
        }
        if (['map', 'worldmap', 'localmap'].includes(activePanel) && ctx.world.layout) {
            atlasView?.dispose();
            const previews = new Map();
            atlasView = renderMaps(
                nodes.overlay,
                ctx.world,
                { ...model(), socialActors: islandSocial().actors, focusPortal: ctx.atlasPortalFocus },
                {
                    close,
                    track,
                    travel,
                    draw: (canvas, drawOpts) => ctx.renderer.minimap(canvas, ctx.world, ctx.save, drawOpts),
                    drawIsland: (canvas, id, drawOpts) => {
                        let preview = previews.get(id);
                        if (!preview) {
                            preview = id === ctx.world.zone ? ctx.world : W.createWorld(id, ctx.assets.content);
                            previews.set(id, preview);
                        }
                        ctx.renderer.minimap(canvas, preview, ctx.save, drawOpts);
                    },
                    portal: earth.browseWorldPortal,
                    teleport: teleportToLandmark,
                    teleportToPosition,
                    switchWorld: earth.switchWorldMap,
                    switchMap: view => openPanel(view === 'world' ? 'worldmap' : 'localmap'),
                },
                activePanel === 'worldmap' ? 'world' : 'local',
            );
            attachMapServers();
            return;
        }
        if (activePanel === 'cloud') {
            roleCloud.paintCloud();
            return;
        }
        if (activePanel === 'companion-wordplay') return;
        if (activePanel === 'companion-practice') {
            opening.paintCompanionPractice();
            return;
        }
        if (activePanel === 'mentor-practice') {
            opening.paintMentorPractice();
            return;
        }
        if (activePanel === 'dungeon-story') return;
        if (activePanel === 'spark-rescue') {
            dungeon.paintSparkRescue();
            return;
        }
        if (activePanel === 'dungeon-journey') {
            const { journeyId, journeyRestart } = dungeon.getState();
            renderDungeonJourney(
                nodes.overlay,
                { ...model(), dungeon: dungeonFor(ctx.assets.content, journeyId), restart: journeyRestart },
                {
                    close,
                    party: () => openPanel('pet'),
                    prepare: (restart = false) => safely(() => void dungeon.loadAndEnterDungeon(journeyId, restart || journeyRestart)),
                    claim: floor => safely(() => dungeon.claimFloorReward(journeyId, floor)),
                },
            );
            return;
        }
        if (activePanel === 'dungeons') {
            renderDungeons(nodes.overlay, model(), {
                close: () => {
                    if (islandSocial().state().pickingDungeon) {
                        islandSocial().cancelDungeonPick();
                        openPanel('social-party');
                        return;
                    }
                    close();
                },
                enter: dungeon.loadAndEnterDungeon,
                leave: dungeon.exitDungeon,
                pick: id => {
                    try {
                        dungeon.pickDungeonLobby(id);
                    } catch (e) {
                        toast(e.message);
                    }
                },
                lobby: (id, restart = false) => {
                    try {
                        dungeon.pickDungeonLobby(id, restart);
                    } catch (e) {
                        toast(e.message);
                    }
                },
            });
            return;
        }
        if (!activePanel) return;
        const focusState = capturePanelFocusState(nodes.overlay, activePanel);
        renderPanelFn(
            nodes.overlay,
            activePanel,
            { ...model(), selectedQuestId, pinJournalQuest },
            {
                languageTask: ctx.startLanguageTask,
                stopLanguageTask: () => {
                    ctx.disposeCourseView();
                },
                retryLanguageTasks: () => languageTasks.retry(),
                close: closeOrReturn,
                action,
                seenGuide,
                deleteRole: deleteCurrentRole,
                loadPet: id =>
                    loadPet(id).catch(e => {
                        toast(e.message);
                        return null;
                    }),
                track,
                travel,
                refresh: paintPanel,
                encounter: id => interact({ kind: 'encounter', id }),
                panel: openPanel,
                applyDebug: debugEdit.applyDebug,
                restoreDebug: debugEdit.restoreDebug,
                learningEvent: (event, context) => languageAdventure.emit(event, event, context),
                cloud: () => void loginRoles(),
                gameServerStatus: () => getContext().gameServerSession?.state,
                reconnectGameServer: () => getContext().gameServerSession?.reconnect(),
                switchGameServer: value => {
                    const url = normalizeGameServerUrl(value);
                    getContext().gameServerSession?.switchServer(url);
                    try {
                        localStorage.setItem('haqi.gameServer', url);
                    } catch {
                        /* Device preference is optional. */
                    }
                },
                music: toggleMusic,
                sound: toggleSound,
                soundVolume: value => {
                    gameSettings.set({ volume: value });
                    spellSound.setVolume(value);
                },
                gameSetting: (key, value) => {
                    gameSettings.set({ [key]: value });
                    if (key === 'playerInputs') {
                        localPlay().clearKeys();
                        ctx.resetMovementInput();
                        ctx.clearMovementPath();
                    }
                    if (value === 'auto') adaptiveGraphics.reset(performance.now());
                    return adaptiveGraphics.effects(gameSettings.value);
                },
                resetZoom: () => getContext().renderer?.resetZoom(),
                soundPreview: async () => {
                    await spellSound.unlock();
                    spellSound.play('heal');
                },
                title: () => showTitle(),
                roles: () => showTitle(),
                refreshMembership: () => refreshMembership(true),
                becomeVip: () => openPanel('recharge'),
                recharge: rechargeMembership,
                setLocale,
                setLearning,
                applyLearningMode,
                disableLearning: () => {
                    setLearning({ enabled: false });
                    close();
                    hud.paintHud();
                },
            },
        );
        restorePanelFocusState(nodes.overlay, focusState);
    }

    function openPanel(kind, openOptions = {}) {
        const ctx = getContext();
        if (ctx.stage !== 'world') return;
        if (kind === 'tactics-training') {
            opening.openTacticsTraining();
            return;
        }
        if (kind === 'language-course') kind = 'quests';
        if (kind === 'home') {
            const learning = ctx.save.languageLearning;
            void openHomePanel({ offerStarterRoom: !!(learning?.enabled && ['en', 'ja', 'ko'].includes(wordLanguage(learning.target))) });
            return;
        }
        if (kind === 'hanzi' && ctx.assets.content.islandPacks?.some(p => p.island.id === ctx.save.zone && p.memory)) {
            if (wordLanguage(ctx.save.languageLearning?.target) !== 'zh') {
                openPanel('quests');
                return;
            }
            wordLearning.openMemory();
            return;
        }
        if (kind === 'dictionary' || kind === 'hanzi') {
            void wordLearning.openDictionary(openOptions.character ? 'zh' : null, openOptions.character);
            return;
        }
        if (kind === 'time-scroll') {
            void openTimeScroll();
            return;
        }
        const lp = localPlay();
        if (lp.active && kind === 'social-pvp') {
            lp.arenaLobby();
            return;
        }
        if (lp.openPersonal(kind, openOptions)) return;
        const previousPanel = ctx.panel;
        const nextReturn = ['upgrade', 'gems'].includes(kind) && ['inventory', 'equipment'].includes(previousPanel) ? previousPanel : null;
        lp.closeAll();
        close({ silent: true });
        returnPanel = nextReturn;
        ctx.clearMovementPath();
        ctx.setPanel(kind);
        spellSound.play('open');
        if (kind === 'pet') ctx.petView.tab = openOptions.tab === 'mount' ? 'mount' : 'follow';
        if (kind === 'settings') settingsView.tab = 'journey';
        if (kind === 'shop') Object.assign(ctx.shopView, shopNavigationState(ctx.shopView, openOptions));
        if (kind === 'npc-services') {
            ctx.setServiceNpc(openOptions.npc);
            Object.assign(ctx.npcServiceView, { query: '', page: 0, kind: '', category: '' });
        }
        if (kind === 'quests') {
            pinJournalQuest = openOptions.questId != null;
            selectedQuestId =
                openOptions.questId
                ?? recommendedLanguageQuest(ctx.save, ctx.assets.content, languageTasks.snapshot().rows)?.id
                ?? A.currentQuest(ctx.save, ctx.assets.content)?.id
                ?? ctx.assets.content.quests.at(-1)?.id;
        }
        if (kind === 'gems') {
            Object.assign(ctx.gemView, {
                guid: openOptions.guid || null,
                gemId: null,
                runes: [null, null, null],
                runeIndex: 0,
                step: openOptions.guid ? 'gems' : 'equipment',
                filter: 0,
                page: 0,
                mode: 'mount',
                removeIds: [],
                message: '',
                confirm: false,
            });
        }
        if (kind === 'upgrade') {
            Object.assign(ctx.strengtheningView, {
                guid: initialStrengtheningSelection(ctx.save, ctx.assets.content, openOptions.itemId, openOptions.guid),
                filter: 0,
                page: 0,
                pending: false,
                message: '',
                offsetX: 0,
                offsetY: 0,
            });
        }
        if (['equipment', 'inventory'].includes(kind)) {
            Object.assign(ctx.equipmentView, equipmentNavigationState(openOptions, ctx.save, ctx.assets.content));
        }
        paintPanel();
        if (['inventory', 'equipment'].includes(kind)) languageAdventure.emit('inventory', 'inventory');
        if (['shop', 'membership', 'recharge', 'checkin'].includes(kind)) refreshMembership();
        if (kind === 'mail' && ctx.roleStore?.owner) void islandSocial().loadMail();
        bus?.emit('panel:opened', { kind, options: openOptions });
    }

    return {
        ...hud,
        ...debugEdit,
        paintPanel,
        openPanel,
        closeAtlas: () => {
            atlasView?.dispose();
            atlasView = null;
        },
        setSelectedQuestId: id => {
            selectedQuestId = id;
        },
        setPinJournalQuest: v => {
            pinJournalQuest = v;
        },
    };
}
