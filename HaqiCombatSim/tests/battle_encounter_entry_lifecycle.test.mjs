import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldInteractionController } from '../js/adventure/world_interaction_controller.js';

function setup() {
    let resolve;
    let started = 0;
    const dictionary = new Promise(r => { resolve = r; });
    const c = {
        save: { position: { x: 10, y: 10 }, languageLearning: { enabled: true, target: 'en' } },
        roleEpoch: 1,
        world: { zone: 'camp' },
        roleStore: { owner: 'guest', catalog: { activeId: 'a' } },
        stage: 'world',
        panel: null,
        dialog: null,
        keys: new Set(),
        joystick: { x: 0, y: 0 },
        heldPointer: null,
        path: [],
        destination: null,
        encounterStarting: false,
        battle: null,
        selected: null,
        discarded: [],
        animation: null,
        petCardsOpen: false,
        runeCardsOpen: false,
    };
    const pending = [];
    const ctrl = createWorldInteractionController({
        nodes: { hud: {}, battle: { replaceChildren() {} } },
        getContext: () => ({
            ...c,
            characterChat: { active: false },
            secondCharacterChat: null,
            assets: { content: {}, dataset: {} },
            renderer: { prepareScene() {} },
            setBattle: v => { c.battle = v; },
            setStage: v => { c.stage = v; },
            setSelected: v => { c.selected = v; },
            setDiscarded: v => { c.discarded = v; },
            setAnimation: v => { c.animation = v; },
            setPetCardsOpen: v => { c.petCardsOpen = v; },
            setRuneCardsOpen: v => { c.runeCardsOpen = v; },
            setEncounterStarting: v => { c.encounterStarting = v; },
            clearMovementPath: () => { c.path = []; c.destination = null; },
        }),
        heroNavigation: { cancel() {} },
        localPlay: () => ({ active: false, paused: false, interceptNpc: () => false }),
        tryLanguageScene: () => false,
        languageAdventure: { active: false },
        islandSocial: () => ({}),
        membership: () => ({ state: {} }),
        languageTasks: { battleTicket: () => null },
        wordLearning: {
            prepareBattleWordCards: () => dictionary,
            attachBattleWordCards() {},
        },
        beginEncounter: save => {
            started++;
            save.pendingEncounter = { seed: 1 };
        },
        restorePveBattle: () => ({}),
        persist() {},
        close() {},
        toast() {},
        perf: { start() {} },
        battleIntro: { open() {} },
        safely: fn => {
            const res = fn();
            if (res?.then) pending.push(res);
            return res;
        },
    });
    return {
        c,
        enter: () => {
            ctrl.interact({ kind: 'encounter', id: 'scout' });
            return Promise.all(pending);
        },
        resolve,
        get started() { return started; },
    };
}

test('delayed encounter dictionary accepts same-role background save clone and enters battle', async () => {
    const t = setup();
    const pending = t.enter();
    t.c.save = structuredClone(t.c.save);
    t.c.save.petWorld = { backgroundSaved: true };
    t.resolve(null);
    await pending;
    assert.equal(t.started, 1);
    assert.equal(t.c.stage, 'battle');
    assert.equal(t.c.encounterStarting, false);
});

test('delayed encounter dictionary refuses obsolete lifecycle and manual movement', async () => {
    const changes = [
        c => c.roleEpoch++,
        c => { c.roleStore.owner = 'other'; },
        c => { c.roleStore.catalog.activeId = 'b'; },
        c => { c.world = { zone: 'camp' }; },
        c => { c.stage = 'title'; },
        c => { c.save.languageLearning.target = 'zh'; },
        c => { c.save.pendingEncounter = {}; },
        c => { c.panel = 'bag'; },
        c => { c.dialog = {}; },
        c => { c.save.position.x += 10; },
        c => { c.path = [{ x: 20, y: 20 }]; },
        c => { c.destination = { x: 20, y: 20 }; },
        c => { c.keys.add('right'); },
        c => { c.joystick.x = 1; },
        c => { c.heldPointer = { active: true }; },
    ];
    for (const change of changes) {
        const t = setup();
        const pending = t.enter();
        change(t.c);
        t.resolve(null);
        await pending;
        assert.equal(t.started, 0, String(change));
        assert.equal(t.c.encounterStarting, false);
    }
});
