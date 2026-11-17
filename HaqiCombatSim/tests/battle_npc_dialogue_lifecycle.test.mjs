import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bindTouchMovement } from '../js/view_adventure_movement.js';
import { createStoryChat } from '../js/language_story.js';
import { recordLearningCompletion } from '../js/language_adventure_core.js';
import { createPanelController } from '../js/adventure/panel_controller.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../data/adventure/camp-conversations.json', import.meta.url)));
const profile = catalog.profiles.find(row => row.npcId === 36205);
const story = profile.stories[0];

test('real HUD refresh preserves NPC dialogue after every spoken reward and final settlement', async () => {
    const surface = new EventTarget();
    surface.hasPointerCapture = () => false;
    let callbacks;
    let ui;
    let chat;
    let awards = 0;
    let closed = 0;
    let renders = 0;
    let transcript = '';
    const hudRoot = new EventTarget();
    hudRoot.ownerDocument = new EventTarget();
    hudRoot.ownerDocument.defaultView = new EventTarget();
    hudRoot.contains = () => false;

    const state = {
        stage: 'world',
        role: 'test',
        identity: 'test',
        content: {},
        save: {
            zone: 'camp',
            inventory: {},
            languageLearning: { enabled: true, target: 'en', native: 'zh-CN' },
            languageAdventure: { version: 1, progress: {} },
        },
    };
    const path = ['keep'];
    let destination = 'keep';
    const keys = new Set();
    let joystick = { x: 0, y: 0 };
    let heldPointer = null;
    let talkApproach = null;
    const languageAdventure = {
        get active() { return chat?.active; },
        close() { closed++; chat.close(); },
    };
    const touchMovement = bindTouchMovement(surface, { hidden: true }, {
        enabled: () => state.stage === 'world',
        steer: (x, y) => {
            if (x || y) {
                if (!languageAdventure.active) languageAdventure.close();
                talkApproach = null;
                heldPointer = null;
                path.length = 0;
                destination = null;
            }
            joystick = { x, y };
        },
    });
    const panels = createPanelController({
        nodes: { world: surface, hud: hudRoot },
        getContext: () => ({
            world: null,
            roleEpoch: 1,
            roleStore: { owner: 'test', catalog: { activeId: 'test' } },
            stage: 'world',
            save: state.save,
            assets: { content: {} },
        }),
        model: () => ({}),
        languageTasks: { ensure() {}, snapshot() { return { rows: [] }; } },
        renderHud: () => { renders++; },
        localPlay: () => ({ openPanel() {}, toggleMount() {} }),
        dungeon: { exitDungeon() {} },
        loginRoles: () => {},
        track: () => {},
        interactNearest: () => {},
        performAction: () => {},
    });
    const refreshHud = () => panels.paintHud();
    chat = createStoryChat({
        getState: () => state,
        onSpeech: () => {
            awards++;
            refreshHud();
            return { key: 'attack', percent: awards, total: awards };
        },
        voice: {
            cancel: async () => {},
            speak: async () => {},
            start: async () => {},
            finish: async () => transcript,
        },
        commit: completion => {
            const result = recordLearningCompletion(state.save, {}, completion, { learningCompletion: completion });
            refreshHud();
            return result;
        },
        viewFactory: cb => {
            callbacks = cb;
            return { close() {}, render: s => { ui = s; } };
        },
    });
    chat.open(profile, story, null);
    await new Promise(resolve => setImmediate(resolve));
    for (const [index, turn] of story.turns.entries()) {
        transcript = turn.answer.en;
        await callbacks.start();
        await callbacks.finish();
        chat.tick();
        assert.equal(chat.active, true, `spoken turn ${index + 1} must stay open`);
        assert.equal(closed, 0);
        assert.equal(ui.index, Math.min(index + 1, 2));
    }
    assert.equal(ui.done, true);
    assert.equal(awards, 3);
    assert.equal(ui.received, 10);
    for (let i = 0; i < 3; i++) refreshHud();
    assert.equal(chat.active, true);
    assert.equal(closed, 0);
    assert.deepEqual(path, ['keep'], 'stopping input does not clear unrelated navigation');
    assert.ok(renders >= 6, 'the actual guard must dispatch HUD rendering rather than a stub');
    callbacks.close();
    assert.equal(chat.active, false);
    touchMovement.reset();
    panels.disposeHud();
});
