import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedBaseDamage } from '../js/combat_card_targeting_core.js';

test('expectedBaseDamage treats negative splash DOT values as positive expected damage', () => {
    assert.equal(
        expectedBaseDamage({
            key: 'Fire_DOTAttackWithSplash_Level6_Purple',
            type: 'DOTAttack',
            pipcost: 7,
            params: { dots: '-725,0,0' },
        }),
        725,
    );
    assert.equal(
        expectedBaseDamage({
            key: 'Fire_SingleAttackWithDOT',
            type: 'SingleAttackWithDOT',
            pipcost: 4,
            params: { damage_min: '200', damage_max: '200', dots: '50,50' },
        }),
        300,
    );
});
