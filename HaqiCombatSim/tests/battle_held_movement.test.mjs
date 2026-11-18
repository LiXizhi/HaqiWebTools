import test from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../js/adventure_world_core.js';
import { earthRules } from '../js/adventure_earth_core.js';
import { bindTouchMovement } from '../js/views/adventure/view_adventure_movement.js';
import { createPanelController } from '../js/adventure/panel_controller.js';
import { stepWorldMovement } from '../js/adventure/world_interaction_controller.js';

function harness(terrain) {
    const captures = new Set();
    const surface = new EventTarget();
    surface.setPointerCapture = id => captures.add(id);
    surface.hasPointerCapture = id => captures.has(id);
    surface.releasePointerCapture = id => captures.delete(id);
    let renders = 0;
    let layoutReads = 0;
    let cancellations = 0;
    surface.getBoundingClientRect = () => {
        layoutReads++;
        return { left: 0, top: 0 };
    };
    const hud = new EventTarget();
    hud.ownerDocument = new EventTarget();
    hud.ownerDocument.defaultView = new EventTarget();
    hud.contains = () => false;

    const c = {
        world: {
            isEarth: true,
            earthBoating: true,
            w: 8640000,
            h: 4320000,
            earthRules: earthRules(),
            terrainAt: () => terrain,
            paths: [],
            buildings: [],
            landmarks: [],
        },
        save: { position: { x: 800, y: 600 } },
        assets: { content: {} },
        dt: 1 / 60,
        now: 1000,
        moving: false,
        keys: new Set(),
        joystick: { x: 0, y: 0 },
        heldPointer: null,
        path: [],
        destination: null,
        talkApproach: null,
        stage: 'world',
        panel: null,
        dialog: null,
        roleEpoch: 1,
        roleStore: { owner: 'test', catalog: { activeId: 'test' } },
        renderer: {
            screenToWorld: (x, y) => ({ x: c.save.position.x + x - 400, y: c.save.position.y + y - 300 }),
        },
        setMoving: v => { c.moving = v; },
        setPath: v => { c.path = v; },
        setTalkApproach: v => { c.talkApproach = v; },
        clearMovementPath: () => { c.path = []; c.destination = null; },
    };
    const heroNavigation = { cancel() { cancellations++; } };
    const languageAdventure = { active: false, close() {} };
    const touchIndicator = { hidden: true, style: {}, firstElementChild: { style: {} } };
    const touchMovement = bindTouchMovement(surface, touchIndicator, {
        enabled: () => c.stage === 'world' && !c.panel && !c.dialog,
        steer: (x, y) => {
            if (x || y) {
                languageAdventure.close();
                c.talkApproach = null;
                c.heldPointer = null;
                c.path = [];
                c.destination = null;
            }
            c.joystick = { x, y };
        },
    });
    function resetMovementInput() {
        heroNavigation.cancel();
        c.keys.clear();
        c.joystick = { x: 0, y: 0 };
        c.heldPointer = null;
        touchMovement.reset();
    }
    const panels = createPanelController({
        nodes: { world: surface, hud },
        getContext: () => ({ world: c.world, roleEpoch: c.roleEpoch, roleStore: c.roleStore, stage: c.stage, save: c.save, assets: c.assets }),
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
    return {
        c,
        captures,
        panels,
        resetMovementInput,
        step: () => stepWorldMovement(c, { world: surface, hud }, c.dt, c.now, languageAdventure, () => {}),
        get renders() { return renders; },
        get layoutReads() { return layoutReads; },
        get cancellations() { return cancellations; },
        pointer(type, x) {
            const event = new Event(type);
            Object.assign(event, { pointerType: 'touch', pointerId: 1, button: 0, clientX: x, clientY: 300 });
            surface.dispatchEvent(event);
        },
    };
}

for (const terrain of ['water', 'ocean', 'grass']) {
    for (const input of ['mouse', 'keyboard', 'touch']) {
        test(`${input} keeps moving over ${terrain} through repeated streaming HUD refreshes`, () => {
            const h = harness(terrain);
            const c = h.c;
            if (input === 'mouse') c.heldPointer = { x: 650, y: 300, since: 0, active: true };
            if (input === 'keyboard') c.keys.add('right');
            if (input === 'touch') {
                h.pointer('pointerdown', 400);
                h.pointer('pointermove', 460);
            }
            for (let i = 0; i < 120; i++) {
                h.panels.paintHud();
                const previous = c.save.position.x;
                c.moving = false;
                h.step();
                assert.equal(c.moving, true, `frame ${i} must not stop`);
                assert.ok(Math.abs(c.save.position.x - previous - W.WALK_SPEED / 60) < 1e-6, 'constant speed without stop/start jitter');
                if (input === 'touch') assert.equal(h.captures.has(1), true);
                c.now += 1000 / 60;
            }
            assert.equal(h.renders, 120);
            if (input === 'mouse') assert.equal(h.layoutReads, 1, 'held movement reuses canvas bounds across all 120 frames');
            h.resetMovementInput();
            assert.equal(h.cancellations, 1, 'explicit input reset also cancels a pending hero path');
            const stopped = c.save.position.x;
            c.moving = false;
            h.step();
            assert.equal(c.save.position.x, stopped);
            assert.equal(c.moving, false);
            assert.equal(c.keys.size, 0);
            assert.equal(c.heldPointer, null);
            assert.equal(h.captures.size, 0);
            h.panels.disposeHud();
        });
    }
}

test('touch release after HUD refresh stops movement and releases capture', () => {
    const h = harness('water');
    h.pointer('pointerdown', 400);
    h.pointer('pointermove', 460);
    h.panels.paintHud();
    h.pointer('pointerup', 460);
    h.step();
    assert.equal(h.c.save.position.x, 800);
    assert.equal(h.captures.size, 0);
    h.panels.disposeHud();
});
