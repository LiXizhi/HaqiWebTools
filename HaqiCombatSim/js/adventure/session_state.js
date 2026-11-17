// adventure/session_state.js — 按子域切片组织的冒险共享会话状态容器（对外保留扁平兼容访问）。
export function createAdventureSessionState({
    learningForced = false,
    perf = null,
    spellSound = null,
    updatePetStatus = null,
    onResetMovement = null,
    onUntrack = null,
    onStartLanguageTask = null,
} = {}) {
    const session = {
        assets: null,
        renderer: null,
        stage: 'loading',
        music: null,
        storageWarning: false,
        cloudClient: null,
        gameServerSession: null,
        mapServersDispose: null,
        joiningRoleId: null,
        roleStore: null,
        roleStorage: null,
        roleEpoch: 0,
        lastRoleSync: 0,
        creationPreview: null,
        lastRuntimeSave: 0,
        lastCare: 0,
        lastLanguageDayCheck: 0,
        lastTimeCityId: null,
        lastTimeCityCheck: 0,
        learningForced,
        perf,
        spellSound,
        updatePetStatus,
        characterChat: null,
        secondCharacterChat: null,
    };

    const world = {
        save: null,
        world: null,
        path: [],
        destination: null,
        moving: false,
        lastFrame: 0,
        fishingApproach: null,
        talkApproach: null,
        fishingLoadEpoch: 0,
        warmCell: '',
        teleportEffect: null,
        hanziIsland: null,
        hanziTicket: 0,
        joystick: { x: 0, y: 0 },
        heldPointer: null,
        keys: new Set(),
    };

    const battle = {
        battle: null,
        selected: null,
        discarded: [],
        animation: null,
        encounterStarting: false,
        petCardsOpen: false,
        runeCardsOpen: false,
        tacticsPractice: null,
    };

    const ui = {
        panel: null,
        dialog: null,
        dialogDone: null,
        atlasPortalFocus: null,
        courseView: null,
        toastTimer: 0,
        serviceNpc: null,
        shopView: { category: 'pet', query: '', school: '', slot: '', ownership: '', page: 0 },
        petView: { selected: null },
        equipmentView: { tab: 'gear', slot: 0, item: null, query: '' },
        gemView: {
            guid: null,
            gemId: null,
            runes: [null, null, null],
            runeIndex: 0,
            step: 'equipment',
            filter: 0,
            page: 0,
            mode: 'mount',
            removeIds: [],
            message: '',
            confirm: false,
        },
        strengtheningView: { guid: null, filter: 0, page: 0, pending: false, message: '' },
        npcServiceView: { query: '', page: 0 },
        membershipView: { tab: 'attributes' },
        rechargeView: { amount: '108' },
    };

    const state = {
        slices: { session, world, battle, ui },
        bumpFishingLoadEpoch: () => ++world.fishingLoadEpoch,
        bumpRoleEpoch: () => {
            session.roleEpoch++;
        },
        clearMovementPath: () => {
            world.path = [];
            world.destination = null;
        },
        clearMovementInput: () => {
            world.path = [];
            world.destination = null;
            world.keys.clear();
        },
        resetMovementInput: () => onResetMovement?.(),
        disposeCourseView: () => {
            ui.courseView?.dispose();
            ui.courseView = null;
        },
        untrack: (...args) => onUntrack?.(...args),
        startLanguageTask: (...args) => onStartLanguageTask?.(...args),
    };

    const bindSlice = slice => {
        for (const key of Object.keys(slice)) {
            Object.defineProperty(state, key, {
                enumerable: true,
                configurable: true,
                get: () => slice[key],
                set: value => {
                    slice[key] = value;
                },
            });
        }
    };
    bindSlice(session);
    bindSlice(world);
    bindSlice(battle);
    bindSlice(ui);

    const setterFields = [
        ['setSave', 'save'],
        ['setWorld', 'world'],
        ['setBattle', 'battle'],
        ['setStage', 'stage'],
        ['setPanel', 'panel'],
        ['setDialog', 'dialog'],
        ['setDialogDone', 'dialogDone'],
        ['setAtlasPortalFocus', 'atlasPortalFocus'],
        ['setCourseView', 'courseView'],
        ['setTeleportEffect', 'teleportEffect'],
        ['setPath', 'path'],
        ['setDestination', 'destination'],
        ['setMoving', 'moving'],
        ['setLastFrame', 'lastFrame'],
        ['setLastRuntimeSave', 'lastRuntimeSave'],
        ['setFishingApproach', 'fishingApproach'],
        ['setTalkApproach', 'talkApproach'],
        ['setWarmCell', 'warmCell'],
        ['setSelected', 'selected'],
        ['setDiscarded', 'discarded'],
        ['setAnimation', 'animation'],
        ['setMusic', 'music'],
        ['setStorageWarning', 'storageWarning'],
        ['setPetCardsOpen', 'petCardsOpen'],
        ['setRuneCardsOpen', 'runeCardsOpen'],
        ['setRoleStorage', 'roleStorage'],
        ['setJoiningRoleId', 'joiningRoleId'],
        ['setLastRoleSync', 'lastRoleSync'],
        ['setLastCare', 'lastCare'],
        ['setLastLanguageDayCheck', 'lastLanguageDayCheck'],
        ['setLastTimeCityId', 'lastTimeCityId'],
        ['setLastTimeCityCheck', 'lastTimeCityCheck'],
        ['setEncounterStarting', 'encounterStarting'],
        ['setServiceNpc', 'serviceNpc'],
        ['setHeldPointer', 'heldPointer'],
    ];
    for (const [method, key] of setterFields) {
        state[method] = next => {
            state[key] = next;
        };
    }
    return state;
}
