import test from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../js/adventure_world_core.js';
import { stepMonsterWander, releaseFieldPursuit, monsterScenePositions } from '../js/adventure_monster_motion_core.js';
import { createWorldInteractionController } from '../js/adventure/world_interaction_controller.js';

function setup(x = 300) {
    const monster = { id: 'ice-scout', monsterId: 'ice', x: 300, y: 300 };
    const world = { zone: 'frost', encounters: [monster] };
    const save = { position: { x, y: 300 } };
    let destination = null;
    let path = [];
    let entered = 0;
    const origFindPath = W.findPath;
    const ctrl = createWorldInteractionController({
        nodes: {},
        getContext: () => ({
            world,
            save,
            destination,
            path,
            setDestination: next => { destination = next; },
            setPath: next => { path = next; },
        }),
        close: () => {
            releaseFieldPursuit(world, save.position);
            W.resetAutoInteraction(world, save.position);
        },
        interact: () => entered++,
        toast: () => {},
        heroNavigation: { cancel() {}, request() {} },
        onInteract: () => entered++,
    });
    // Stub world.layout so W.findPath returns a non-empty route when called in distant tracking test.
    world.findPathStub = origFindPath;
    return {
        ctrl,
        world,
        save,
        monster,
        get destination() { return destination; },
        get entered() { return entered; },
    };
}

test('explicit tracked challenge works beside a monster held after closing a panel', () => {
    const t = setup();
    for (let i = 0; i < 10; i++) {
        stepMonsterWander(t.world, t.monster, 0.05, { x: 0, y: 0, w: 800, h: 600 }, { hero: t.save.position, ambient: false });
    }
    releaseFieldPursuit(t.world, t.save.position);
    assert.equal(monsterScenePositions(t.world, t.monster)[0].holdUntilExit, true);
    assert.equal(W.takeAutoInteraction(t.world, t.save.position), null);
    t.ctrl.walkTo({ ...t.monster, kind: 'encounter' }, true);
    assert.equal(t.entered, 1);
});

test('explicit distant tracking challenges on arrival; ordinary movement keeps contact rules', () => {
    const t = setup(500);
    t.ctrl.walkTo({ ...t.monster, kind: 'encounter' }, true);
    assert.equal(t.entered, 0);
    assert.equal(t.destination.explicitChallenge, true);
    assert.equal(t.ctrl.trackedDestinationInteraction(t.destination, 82), null);
    t.save.position.x = 300;
    assert.equal(t.ctrl.trackedDestinationInteraction(t.destination, 82).id, 'ice-scout');
    assert.equal(t.ctrl.trackedDestinationInteraction({ ...t.monster, kind: 'encounter' }, 82), null);
    for (const invalid of ['hidden', 'blocked', 'missing']) {
        if (invalid === 'hidden') t.monster.hidden = true;
        if (invalid === 'blocked') { t.monster.hidden = false; t.monster.blocked = ['quest']; }
        if (invalid === 'missing') t.world.encounters = [];
        assert.equal(t.ctrl.trackedDestinationInteraction(t.destination, 82), null);
    }
});

test('explicit challenge triggers at wandered sprite coordinates and updates path while chasing', () => {
    const monster = { id: 'camp-mouse', monsterId: 'fire', x: 300, y: 300 };
    const world = {
        zone: 'camp',
        encounters: [monster],
        monsterSceneParams: { territoryRadius: 200, perceptionMultiplier: 1.5, dungeonWanderRadius: 120, wanderSpeed: 40, chaseSpeed: 90, returnSpeed: 60, alertDelay: 1.2, restMin: 0, restMax: 0 },
    };
    const save = { position: { x: 600, y: 300 } };
    let destination = null;
    let path = [];
    let entered = 0;
    const requested = [];
    const ctrl = createWorldInteractionController({
        nodes: {},
        getContext: () => ({
            world,
            save,
            destination,
            path,
            setDestination: next => { destination = next; },
            setPath: next => { path = next; },
        }),
        close: () => {},
        interact: () => entered++,
        toast: () => {},
        heroNavigation: {
            cancel() {},
            request(_w, _from, to, opts) {
                requested.push({ x: to.x, y: to.y });
                opts?.onResult?.([{ x: to.x, y: to.y }]);
            },
            stats: () => ({ pending: false }),
        },
        onInteract: () => entered++,
    });

    for (let i = 0; i < 60; i++) {
        stepMonsterWander(world, monster, 0.05, { x: 0, y: 0, w: 900, h: 600 }, { hero: save.position });
    }
    const pose = monsterScenePositions(world, monster)[0];
    pose.x = 420;
    pose.y = 300;
    ctrl.walkTo({ ...monster, x: pose.x, y: pose.y, kind: 'encounter' }, true);
    assert.equal(entered, 0);
    assert.deepEqual(requested.at(-1), { x: 420, y: 300 });

    // Monster wanders > 28px while hero is still walking toward old spot.
    pose.x = 460;
    pose.y = 310;
    assert.equal(ctrl.trackMovingEncounter(), true);
    assert.equal(destination.x, 460);
    assert.equal(destination.y, 310);
    assert.deepEqual(path, [{ x: 460, y: 310 }]);

    // Arriving near the wandered sprite (still > 82px from the 300,300 anchor) triggers arrival.
    save.position = { x: 455, y: 310 };
    assert.equal(ctrl.trackedDestinationInteraction(destination, 82)?.id, 'camp-mouse');
});
