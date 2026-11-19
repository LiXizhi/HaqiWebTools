import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installExpansion } from '../js/adventure_expansion_core.js';
import { createAdventure } from '../js/adventure_core.js';
import { createSaveCommitter } from '../js/adventure_reward_persistence.js';

const read = p => JSON.parse(fs.readFileSync(new URL('../data/' + p, import.meta.url)));
const { content } = installExpansion(
    read('adventure/chapter.json'),
    read('adventure/combat.json'),
    read('adventure/pets.json'),
    read('adventure/shop-candidates.json'),
    read('kids/cards.json'),
    read('kids/charms.json'),
);

function makeCtx({ fail = false } = {}) {
    let stored = null;
    let cloud = 0;
    let hud = 0;
    let panel = 0;
    const ctx = {
        save: createAdventure(content, { school: 'fire', seed: 11 }),
        assets: { content },
        roleEpoch: 1,
        storageWarning: true,
        roleStore: { owner: 'user1', catalog: { activeId: 'r1', roles: [{ id: 'r1', save: null }] } },
        roleStorage: {
            getItem: () => stored,
            setItem: (_k, v) => {
                if (fail) throw Error('quota');
                stored = v;
            },
        },
        setSave: next => {
            ctx.save = next;
        },
        setStorageWarning: v => {
            ctx.storageWarning = v;
        },
    };
    const committer = createSaveCommitter({
        getContext: () => ctx,
        saveLocal: (next, storage) => storage.setItem('save', JSON.stringify(next)),
        queueCloudSave: () => cloud++,
        paintHud: () => hud++,
        paintPanel: () => panel++,
    });
    return { ctx, committer, counts: () => ({ cloud, hud, panel }), stored: () => stored, setFail: v => { fail = v; } };
}

test('commitSave leaves active save and cloud queue untouched when storage throws', () => {
    const h = makeCtx({ fail: true });
    const before = JSON.stringify(h.ctx.save);
    assert.throws(
        () => h.committer.commitSave(draft => { draft.inventory[100] = (draft.inventory[100] || 0) + 50; }),
        /quota/,
    );
    assert.equal(JSON.stringify(h.ctx.save), before);
    assert.equal(h.ctx.storageWarning, true);
    assert.deepEqual(h.counts(), { cloud: 0, hud: 0, panel: 0 });
});

test('commitSave discards stale async commits when roleEpoch, owner, roleId, or save changes', () => {
    for (const mismatch of ['save', 'epoch', 'owner', 'roleId']) {
        const h = makeCtx();
        const expected = {
            save: h.ctx.save,
            epoch: h.ctx.roleEpoch,
            owner: h.ctx.roleStore.owner,
            roleId: h.ctx.roleStore.catalog.activeId,
        };
        if (mismatch === 'save') h.ctx.save = createAdventure(content, { school: 'ice', seed: 22 });
        if (mismatch === 'epoch') h.ctx.roleEpoch++;
        if (mismatch === 'owner') h.ctx.roleStore.owner = 'other';
        if (mismatch === 'roleId') h.ctx.roleStore.catalog.activeId = 'r2';

        const before = JSON.stringify(h.ctx.save);
        const result = h.committer.commitSave(draft => { draft.revision += 99; }, { expected });
        assert.equal(result, null, mismatch);
        assert.equal(JSON.stringify(h.ctx.save), before, mismatch);
        assert.equal(h.stored(), null, mismatch);
        assert.deepEqual(h.counts(), { cloud: 0, hud: 0, panel: 0 }, mismatch);
    }
});

test('commitReward applies an identical receipt only once and supports paint routing', () => {
    const h = makeCtx();
    h.ctx.save.openingJourney = { version: 1, phase: 'done', celebrated: true };
    const receiptAction = {
        type: 'companion-wordplay',
        step: 'answer',
        expectedStep: 0,
        language: 'en',
        text: 'hello',
        input: 'text',
        receipt: 'receipt-1',
        at: 1000,
    };
    const first = h.committer.commitReward(receiptAction, {}, { accept: r => !!r?.accepted, paint: 'both' });
    assert.equal(first.rejected, false);
    assert.equal(first.result.accepted, true);
    assert.equal(h.ctx.storageWarning, false);
    assert.deepEqual(h.counts(), { cloud: 1, hud: 1, panel: 1 });

    // Replaying the same receipt must be rejected by rules and must not trigger another cloud/paint cycle.
    const afterFirst = JSON.stringify(h.ctx.save);
    const second = h.committer.commitReward(receiptAction, {}, { accept: r => !!r?.accepted, paint: 'both' });
    assert.equal(second.rejected, true);
    assert.equal(second.result.accepted, false);
    assert.equal(JSON.stringify(h.ctx.save), afterFirst);
    assert.deepEqual(h.counts(), { cloud: 1, hud: 1, panel: 1 });

    h.committer.commitSave(draft => { draft.revision++; }, { paint: 'panel', cloud: false });
    assert.deepEqual(h.counts(), { cloud: 1, hud: 1, panel: 2 });
    h.committer.commitSave(draft => { draft.revision++; }, { paint: 'none', cloud: false, shouldSave: () => false });
    assert.deepEqual(h.counts(), { cloud: 1, hud: 1, panel: 2 });
});

test('commitSave syncs updated petFileRefs and petPages from roleStore catalog', () => {
    const h = makeCtx();
    h.ctx.save.petInstanceVersion = 1;
    h.ctx.roleStore.catalog.roles[0].save = {
        petFileRefs: { p1: { path: 'pets/p1.json', group: 'pets' } },
        petPages: { pets: 1 },
    };
    h.committer.commitSave(draft => { draft.revision++; }, { paint: 'hud' });
    assert.deepEqual(h.ctx.save.petFileRefs, { p1: { path: 'pets/p1.json', group: 'pets' } });
    assert.deepEqual(h.ctx.save.petPages, { pets: 1 });
});
