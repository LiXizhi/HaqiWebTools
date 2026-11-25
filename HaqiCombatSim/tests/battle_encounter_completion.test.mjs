import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAdventure, beginEncounter } from '../js/adventure_core.js';
import { restorePveBattle } from '../js/combat_pve_core.js';
import { createBattleController } from '../js/adventure/battle_controller.js';
import { createAppBus } from '../js/adventure/app_bus.js';

const read = file => JSON.parse(readFileSync(new URL('../' + file, import.meta.url)));
const content = read('data/adventure/chapter.json');
content.worldMaps = Object.fromEntries(Object.entries(content.worldMapIndex.islands).map(([id, row]) => [id, read(row.file)]));
const dataset = read('data/adventure/combat.json');

function gate() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function resultScreen({ winner = 'near', won, returnWorld } = {}) {
    const save = createAdventure(content);
    const { checkpoint } = beginEncounter(save, content, 'fire-scout');
    const battle = restorePveBattle(dataset, content, checkpoint);
    battle.finished = true;
    battle.winner = winner;
    const ctx = { stage: 'battle', battle, save, roleEpoch: 1, assets: { content, effects: { cards: {} } }, discarded: [], perf: { end() {} } };
    const bus = createAppBus();
    const events = [];
    bus.on('rewards:show', () => events.push('reward'));
    bus.on('battle:settled', () => events.push('settled'));
    let buttons;
    const controller = createBattleController({
        nodes: {}, getContext: () => ctx, model: () => ({}), bus,
        renderBattleView: (_root, _model, actions) => { buttons = actions; },
        framePacer: { wake() {} }, updateMusic() {}, localPlay: () => ({ active: false }),
        languageTasks: { won }, hanziMemory: { won: () => events.push('hanzi') },
        islandSocial: () => ({ settled: () => events.push('social'), activity: () => events.push('activity') }),
        enterWorld: async () => {
            if (returnWorld) await returnWorld();
            ctx.battle = null;
            ctx.stage = 'world';
            events.push('world');
        },
        toast: message => events.push(message), openPanel: entry => events.push(entry),
    });
    controller.paintBattle();
    return { ctx, save, checkpoint, buttons, events };
}

test('normal finish settles once and shows the reward after returning to the world', async () => {
    const { save, checkpoint, buttons, events } = resultScreen();
    await Promise.all([buttons.finish(), buttons.aiNavigate('deck')]);
    assert.deepEqual(save.rewardedEncounters, [checkpoint.id]);
    assert.equal(save.pendingEncounter, null);
    assert.deepEqual(events, ['hanzi', 'social', 'activity', 'world', 'reward', 'settled']);
});

test('review navigation waits for world restoration before showing the reward and opening the panel', async () => {
    const returnGate = gate();
    const enteringWorld = gate();
    const { buttons, events, save, checkpoint } = resultScreen({
        winner: 'far',
        returnWorld: () => { enteringWorld.resolve(); return returnGate.promise; },
    });
    const done = buttons.aiNavigate('deck');
    await enteringWorld.promise;
    assert.deepEqual(events, ['social']);
    returnGate.resolve();
    await done;
    assert.deepEqual(save.rewardedEncounters, [checkpoint.id]);
    assert.deepEqual(events, ['social', 'world', 'reward', 'settled', 'deck']);
});

test('a role switch during the language task cancels the old battle completion', async () => {
    const started = gate(), resume = gate();
    const { ctx, save, checkpoint, buttons, events } = resultScreen({
        won: () => { started.resolve(); return resume.promise; },
    });
    checkpoint.languageTask = { courseId: 'test' };
    const done = buttons.aiNavigate('deck');
    await started.promise;
    ctx.roleEpoch++;
    ctx.save = createAdventure(content);
    resume.resolve();
    await done;
    assert.equal(save.pendingEncounter, checkpoint);
    assert.deepEqual(save.rewardedEncounters, []);
    assert.deepEqual(events, []);
});

test('the render recovery exit settles an already won battle instead of discarding its reward', async () => {
    const { save, checkpoint, buttons, events } = resultScreen();
    await buttons.retreat();
    assert.deepEqual(save.rewardedEncounters, [checkpoint.id]);
    assert.equal(save.pendingEncounter, null);
    assert.deepEqual(events, ['hanzi', 'social', 'activity', 'world', 'reward', 'settled']);
});

test('an old retreat control cannot affect another battle, role, world or an ongoing settlement', async () => {
    for (const change of [
        ctx => { ctx.battle = { ...ctx.battle }; },
        ctx => { ctx.roleEpoch++; ctx.save = createAdventure(content); },
        ctx => { ctx.stage = 'world'; },
        ctx => { ctx.battle = null; },
    ]) {
        const { ctx, save, buttons, events } = resultScreen();
        const before = JSON.stringify(save);
        change(ctx);
        await buttons.retreat();
        assert.equal(JSON.stringify(save), before);
        assert.deepEqual(events, []);
    }
    const started = gate(), resume = gate();
    const { buttons, events, checkpoint } = resultScreen({ won: () => { started.resolve(); return resume.promise; } });
    checkpoint.languageTask = { courseId: 'test' };
    const pending = buttons.finish();
    await started.promise;
    await buttons.retreat();
    assert.deepEqual(events, []);
    resume.resolve();
    await pending;
    assert.equal(events.filter(event => event === 'world').length, 1);
});


test('a failed world return can retry after settlement without losing the exit or duplicating rewards', async () => {
    let returns = 0;
    const { save, checkpoint, buttons, events, ctx } = resultScreen({
        returnWorld: () => { if (++returns === 1) throw Error('scene unavailable'); },
    });
    await buttons.finish();
    assert.equal(ctx.stage, 'battle');
    assert.equal(save.pendingEncounter, null);
    assert.deepEqual(save.rewardedEncounters, [checkpoint.id]);
    assert.equal(events.includes('暂时没能返回场景，请再点一次重试。'), true);
    await Promise.all([buttons.finish(), buttons.retreat()]);
    assert.equal(returns, 2);
    assert.equal(ctx.stage, 'world');
    assert.deepEqual(save.rewardedEncounters, [checkpoint.id]);
    for (const event of ['hanzi', 'social', 'activity', 'world', 'reward', 'settled']) {
        assert.equal(events.filter(item => item === event).length, 1, event);
    }
});

test('an old completion retry after a failed return cannot settle or navigate another role', async () => {
    let returns = 0;
    const { save, checkpoint, buttons, events, ctx } = resultScreen({
        returnWorld: () => { returns++; throw Error('scene unavailable'); },
    });
    await buttons.finish();
    const other = createAdventure(content);
    ctx.roleEpoch++;ctx.save = other;ctx.battle = null;ctx.stage = 'world';
    const before = JSON.stringify(other);
    await buttons.finish();await buttons.retreat();
    assert.equal(JSON.stringify(other), before);
    assert.equal(returns, 1);
    assert.deepEqual(save.rewardedEncounters, [checkpoint.id]);
    assert.equal(events.includes('reward'), false);
});


test('a rejected completion belonging to the old role does not show an error in the new role', async () => {
    let reject;
    const started = gate();
    const { ctx, buttons, checkpoint, events, save } = resultScreen({
        won: () => { started.resolve(); return new Promise((_resolve, fail) => { reject = fail; }); },
    });
    checkpoint.languageTask = { courseId: 'test' };
    const finishing = buttons.finish();await started.promise;
    ctx.roleEpoch++;ctx.save = createAdventure(content);ctx.battle = null;ctx.stage = 'world';
    reject(Error('old role unavailable'));await finishing;
    assert.equal(save.pendingEncounter, checkpoint);
    assert.deepEqual(events, []);
});
