import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRng } from '../js/rng_core.js';
import { castFishing, castLandsOnShadow, installFishing, isOcean, readStamina, shadowPosition, useStaminaPotion } from '../js/adventure_fishing_core.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../data/adventure/fishing.json', import.meta.url)));
function content() {
    const value = { items: {} };
    installFishing(value, structuredClone(catalog));
    return value;
}
function save(extra = {}) {
    return { inventory: { 17113: 5, 17347: 2, 17348: 1, 17349: 1, 17467: 3, 17344: 1, 17393: 1 }, pendingEncounter: null, revision: 3, ...extra };
}
const fishIds = [17106, 17107, 17108, 17109, 17110, 17111];

test('ocean clicks are outside the island coast', () => {
    const coast = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const world = { w: 200, h: 200, layout: { coast } };
    assert.equal(isOcean(world, 50, 50), false);
    assert.equal(isOcean(world, 150, 40), true);
    assert.equal(isOcean({ w: 1800, h: 1600 }, 10, 10), true);
});

test('the moving marker can land on a shadow, and a frozen shadow is a hit', () => {
    const point = shadowPosition(2, 1000, 640, 280);
    assert.equal(castLandsOnShadow(point, 1000, 640, 280), true);
    assert.equal(castLandsOnShadow({ x: 0, y: 0 }, 1000, 640, 280), false);
    assert.equal(shadowPosition(2, 1000, 640, 280).x, shadowPosition(2, 1000, 640, 280).x);
});

test('a missed ordinary cast keeps the net and does not roll a reward', () => {
    const saveData = save();
    const result = castFishing(saveData, content(), { netId: 17113, hit: false }, createRng(1));
    assert.equal(result.caught, false);
    assert.equal(saveData.inventory[17113], 5);
    assert.equal(readStamina(saveData, content()), 100);
});

test('ordinary, double and crown nets spend one net and grant the exchange fish', () => {
    const data = content();
    const seen = new Set();
    for (let seed = 1; seed <= 80 && seen.size < fishIds.length; seed++) {
        const row = save();
        const result = castFishing(row, data, { netId: 17113, hit: true }, createRng(seed));
        assert.equal(row.inventory[17113], 4);
        assert.equal(result.items.length, 1);
        assert.equal(result.items[0].count, 1);
        seen.add(result.items[0].id);
        assert.ok(row.stamina < 100);
    }
    assert.deepEqual([...seen].sort(), fishIds);
    const doubled = save();
    const doubleResult = castFishing(doubled, data, { netId: 17347, hit: true }, createRng(2));
    assert.equal(doubleResult.items[0].count, 2);
    const crown = save();
    const crownResult = castFishing(crown, data, { netId: 17348, hit: true }, createRng(9));
    assert.equal(crownResult.items[0].id, 17111);
    assert.equal(crownResult.items[0].count, 1);
});

test('guaranteed nets resolve the exchange without a shadow hit', () => {
    const row = save();
    const result = castFishing(row, content(), { netId: 17349, hit: false }, createRng(4));
    assert.equal(result.items[0].id, 17111);
    assert.equal(row.inventory[17349], 0);
});

test('an apparatus miss marker spends the tool and grants no fish', () => {
    const data = content();
    let missed = false;
    for (let seed = 1; seed <= 80 && !missed; seed++) {
        const row = save();
        const before = fishIds.reduce((sum, id) => sum + (row.inventory[id] || 0), 0);
        const result = castFishing(row, data, { netId: 17467, hit: false }, createRng(seed));
        if (!result.caught) {
            missed = true;
            assert.equal(row.inventory[17467], 2);
            assert.equal(fishIds.reduce((sum, id) => sum + (row.inventory[id] || 0), 0), before);
            assert.equal(row.stamina, 100);
        }
    }
    assert.equal(missed, true);
});

test('stamina below 10 blocks casting, and a medium pill restores the exchange amount', () => {
    const data = content();
    const tired = save({ stamina: 9 });
    assert.throws(() => castFishing(tired, data, { netId: 17113, hit: true }, createRng(1)), /精力值低于10/);
    assert.equal(tired.inventory[17113], 5);
    const row = save({ stamina: 40 });
    const restored = useStaminaPotion(row, data, 17344);
    assert.equal(row.inventory[17344], 0);
    assert.equal(restored.stamina, 100);
    assert.throws(() => useStaminaPotion(save(), data, 17393), /特殊前提尚未接入/);
});

test('the same seed repeats the same catch', () => {
    const first = save(), second = save();
    const data = content();
    const a = castFishing(first, data, { netId: 17113, hit: true }, createRng(27));
    const b = castFishing(second, data, { netId: 17113, hit: true }, createRng(27));
    assert.deepEqual(a.items, b.items);
    assert.equal(first.stamina, second.stamina);
});
