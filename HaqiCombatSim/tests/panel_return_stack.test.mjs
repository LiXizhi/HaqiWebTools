import test from 'node:test';
import assert from 'node:assert/strict';
import { createPanelController } from '../js/adventure/panel_controller.js';

test('closing upgrade or gems opened from inventory returns to inventory instead of closing to world', () => {
    let panel = null;
    let rendered = [];
    let closedToWorld = 0;
    const ctrl = createPanelController({
        nodes: { hud: {}, overlay: { querySelector: () => null, querySelectorAll: () => [] } },
        getContext: () => ({
            stage: 'world',
            panel,
            world: { zone: 'camp', npcs: [], encounters: [] },
            save: { zone: 'camp', inventory: {}, cards: {}, pets: {}, questProgress: {}, equipmentGuids: {} },
            assets: { content: { shopConfig: { categories: [] }, items: {}, quests: [], cardItems: {} } },
            equipmentView: { tab: 'gear', slot: 0, page: 0, query: '' },
            strengtheningView: {},
            gemView: {},
            shopView: {},
            petView: {},
            setPanel: next => { panel = next; },
            clearMovementPath: () => {},
            setServiceNpc: () => {},
        }),
        model: () => ({
            assets: { content: { shopConfig: { categories: [] }, items: {}, quests: [], cardItems: {} } },
            save: { zone: 'camp', inventory: {}, cards: {}, pets: {}, questProgress: {}, equipmentGuids: {} },
            equipmentView: { tab: 'gear', slot: 0, page: 0, query: '' },
            strengtheningView: {},
            gemView: {},
            shopView: {},
            petView: {},
        }),
        services: {
            navigation: {
                close: opts => {
                    panel = null;
                    if (!opts?.silent) closedToWorld++;
                },
            },
            feedback: { toast: () => {}, safely: fn => fn() },
            runtime: { gameSettings: { value: {} }, adaptiveGraphics: { effects: () => ({}) } },
        },
        bus: null,
        localPlay: () => ({
            active: false,
            openPersonal: () => false,
            closeAll: () => {},
            clearKeys: () => {},
        }),
        islandSocial: () => ({ state: () => ({}) }),
        languageAdventure: { emit: () => {} },
        languageTasks: { snapshot: () => ({ rows: [] }) },
        wordLearning: {},
        earth: {},
        opening: {},
        dungeon: {},
        roleCloud: {},
        spellSound: { play: () => {} },
        refreshMembership: () => {},
        renderPanelFn: (_root, kind, _m, cb) => {
            rendered.push({ kind, close: cb.close });
        },
    });

    ctrl.openPanel('inventory');
    assert.equal(panel, 'inventory');
    ctrl.openPanel('upgrade');
    assert.equal(panel, 'upgrade');
    rendered.at(-1).close();
    assert.equal(panel, 'inventory');
    assert.equal(closedToWorld, 0);

    ctrl.openPanel('gems');
    assert.equal(panel, 'gems');
    rendered.at(-1).close();
    assert.equal(panel, 'inventory');
    assert.equal(closedToWorld, 0);

    rendered.at(-1).close();
    assert.equal(panel, null);
    assert.equal(closedToWorld, 1);

    // Direct open without coming from inventory still closes directly to world.
    ctrl.openPanel('upgrade');
    assert.equal(panel, 'upgrade');
    rendered.at(-1).close();
    assert.equal(panel, null);
    assert.equal(closedToWorld, 2);
});
