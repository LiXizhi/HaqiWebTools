import test from 'node:test';
import assert from 'node:assert/strict';
import { syncOverlayInert } from '../js/ui/dom.js';

function fakeElement(classes = [], hidden = false) {
    const attrs = new Map();
    const set = new Set(classes);
    return {
        inert: false,
        hidden,
        classList: {
            contains: name => set.has(name),
            add: name => set.add(name),
            remove: name => set.delete(name),
        },
        setAttribute: (k, v) => attrs.set(k, v),
        removeAttribute: k => attrs.delete(k),
        getAttribute: k => (attrs.has(k) ? attrs.get(k) : null),
    };
}

test('syncOverlayInert isolates background containers while overlay is visible and restores on close', () => {
    const overlay = fakeElement(['overlay']);
    const world = fakeElement();
    const hud = fakeElement();
    const battle = fakeElement();

    assert.equal(syncOverlayInert(overlay, [world, hud, battle]), false);
    assert.equal(hud.inert, false);
    assert.equal(hud.getAttribute('aria-hidden'), null);

    overlay.classList.add('visible');
    assert.equal(syncOverlayInert(overlay, [world, hud, battle]), true);
    assert.equal(world.inert, true);
    assert.equal(hud.inert, true);
    assert.equal(battle.inert, true);
    assert.equal(hud.getAttribute('aria-hidden'), 'true');

    overlay.classList.remove('visible');
    assert.equal(syncOverlayInert(overlay, [world, hud, battle]), false);
    assert.equal(world.inert, false);
    assert.equal(hud.inert, false);
    assert.equal(battle.inert, false);
    assert.equal(hud.getAttribute('aria-hidden'), null);
});

test('syncOverlayInert isolates background when a standalone learning-overlay is unhidden', () => {
    const learningRoot = fakeElement(['overlay', 'learning-overlay', 'camp-chat-overlay'], true);
    const hud = fakeElement();
    const prevDoc = globalThis.document;
    let activeSelector = null;
    globalThis.document = {
        querySelector: sel => (activeSelector && sel.includes('.learning-overlay:not([hidden])') ? activeSelector : null),
    };
    try {
        assert.equal(syncOverlayInert(learningRoot, [hud]), false);
        assert.equal(hud.inert, false);

        learningRoot.hidden = false;
        activeSelector = learningRoot;
        assert.equal(syncOverlayInert(learningRoot, [hud]), true);
        assert.equal(hud.inert, true);
        assert.equal(hud.getAttribute('aria-hidden'), 'true');

        learningRoot.hidden = true;
        activeSelector = null;
        assert.equal(syncOverlayInert(learningRoot, [hud]), false);
        assert.equal(hud.inert, false);
        assert.equal(hud.getAttribute('aria-hidden'), null);
    } finally {
        globalThis.document = prevDoc;
    }
});
