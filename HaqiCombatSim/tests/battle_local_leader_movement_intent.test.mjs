import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createIslandHeroNavigation } from '../js/island_hero_navigation.js';

const source = await readFile(new URL('../js/social/local_play_controller.js', import.meta.url), 'utf8');
const start = source.indexOf('    function control(owner, action, down, repeat = false) {');
const end = source.indexOf('\n    const input = createPlayerInput(', start);
assert.ok(start >= 0 && end > start);

// Execute the real control function; isolate DOM/session infrastructure only.
// Full app navigation wiring and persistence are outside this harness.
function harness(overrides = {}, withCallback = true) {
    const calls = [];
    const state = { stage: 'world', globalPaused: false };
    const context = {
        companion: { typing: false }, session: { controller: 'human' },
        pressed: [new Set(), new Set()], following: [true, true],
        paths: [[{ x: 1 }], [{ x: 2 }]], mouseTargets: [{ x: 1 }, { x: 2 }],
        document: { hidden: false }, wideEnough: () => true,
        innerWidth: 1200, innerHeight: 800, busy: false,
        state: () => state, panels: [null, null], dialogs: [null, null],
        api: { control: (...args) => calls.push(['delegate', ...args]) },
        battle: { handleBattleControl: () => calls.push(['battle']) },
        navigate: () => calls.push(['navigate']), interact: () => calls.push(['interact']),
        ...overrides,
    };
    if (withCallback) context.api.onLeaderMovementIntent = () => calls.push(['intent']);
    vm.createContext(context);
    vm.runInContext(`${source.slice(start, end)}\nthis.runControl = control;`, context);
    return { context, state, calls, control: context.runControl };
}

test('session leader direction down notifies before release; preserves local movement behavior', () => {
    const h = harness();
    h.control(0, 'right', true);
    h.control(0, 'right', false);
    assert.deepEqual(h.calls, [['intent']]);
    assert.equal(h.context.pressed[0].size, 0);
    assert.equal(h.context.following[0], false);
    assert.equal(h.context.paths[0].length, 0);
    assert.equal(h.context.mouseTargets[0], null);
});

test('second player direction never notifies leader or clears leader local path', () => {
    const h = harness();
    h.control(1, 'left', true);
    assert.deepEqual(h.calls, []);
    assert.equal(h.context.paths[0].length, 1);
    assert.equal(h.context.paths[1].length, 0);
});

test('keyup and non-direction controls do not notify leader', () => {
    const h = harness();
    h.control(0, 'up', false);
    h.control(0, 'confirm', true);
    assert.deepEqual(h.calls, [['interact']]);
});

test('blocked, panel, battle, and non-world input do not notify leader', () => {
    for (const overrides of [
        { companion: { typing: true } }, { document: { hidden: true } },
        { wideEnough: () => false }, { busy: true },
        { panels: [{}, null] }, { dialogs: [{}, null] },
    ]) {
        const h = harness(overrides);
        h.control(0, 'up', true);
        assert.equal(h.calls.some(c => c[0] === 'intent'), false);
    }
    for (const patch of [{ stage: 'battle' }, { stage: 'loading' }, { globalPaused: true }]) {
        const h = harness();
        Object.assign(h.state, patch);
        h.control(0, 'up', true);
        assert.equal(h.calls.some(c => c[0] === 'intent'), false);
    }
});

test('solo controls retain delegation without double-notifying', () => {
    const h = harness({ session: null });
    h.control(0, 'up', true);
    assert.deepEqual(h.calls, [['delegate', 'up', true, false]]);
});

test('leader callback remains optional', () => {
    const h = harness({}, false);
    assert.doesNotThrow(() => h.control(0, 'down', true));
    assert.equal(h.context.pressed[0].has('down'), true);
});

test('actual app leader callback clears landed movement and rejects late worker replies only for owner zero', async t => {
    const appSource = await readFile(new URL('../js/adventure_app.js', import.meta.url), 'utf8');
    const callbackSource = appSource.match(/onLeaderMovementIntent:\s*(\(\)=>\{[^\n]+?\}),?\r?\n/)?.[1];
    assert.ok(callbackSource, 'extract the actual createLocalPlay callback');
    for (const owner of [0, 1]) {
        const messages = [];
        const worker = { postMessage: message => messages.push(message), terminate() {} };
        const nav = createIslandHeroNavigation({
            workerFactory: () => worker, clear: () => false,
            setTimer: () => 1, clearTimer() {},
        });
        t.after(() => nav.dispose());
        const destination = { x: 90, y: 40 };
        const state = { path: [{ x: 20, y: 10 }], destination, heldPointer: { active: true } };
        let rewardCancellations = 0;
        const callback = vm.runInNewContext(`(${callbackSource})`, {
            heroNavigation: nav, state,
            questDialogue: { cancelRewardFollow: () => rewardCancellations++ },
        });
        const h = harness({ api: { onLeaderMovementIntent: callback } }, false);
        nav.request({ zone: 'camp', paths: [], trees: [], buildings: [] }, { x: 0, y: 0 }, destination, {
            onResult: path => { state.path = path; },
        });
        const request = messages.find(message => message.type === 'hero-path');
        assert.ok(request);
        const originalPath = state.path, originalPointer = state.heldPointer;
        h.control(owner, 'right', true);
        h.control(owner, 'right', false);
        if (owner === 0) {
            assert.equal(state.path.length, 0);
            assert.equal(state.destination, null);
            assert.equal(state.heldPointer, null);
            assert.equal(rewardCancellations, 1);
            assert.equal(nav.stats().pending, false);
            worker.onmessage({ data: { ...request, path: [destination] } });
            assert.equal(state.path.length, 0, 'late worker result cannot revive the route');
        } else {
            assert.equal(state.path, originalPath);
            assert.equal(state.destination, destination);
            assert.equal(state.heldPointer, originalPointer);
            assert.equal(rewardCancellations, 0);
            assert.equal(nav.stats().pending, true);
            worker.onmessage({ data: { ...request, path: [destination] } });
            assert.deepEqual(state.path, [destination]);
        }
    }
});
