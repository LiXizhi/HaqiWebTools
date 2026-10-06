import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmDuoRole} from '../js/role_selection_core.js';

test('two different characters must explicitly confirm; cancellation preserves player slots', () => {
    const ids=['a','b','c'];
    const empty=[null,null];
    const first=confirmDuoRole(empty,'a',ids);
    assert.deepEqual(empty,[null,null]);
    assert.deepEqual(first,['a',null]);
    assert.equal(first.every(Boolean),false);
    const both=confirmDuoRole(first,'b',ids);
    assert.deepEqual(both,['a','b']);
    assert.equal(both.every(Boolean),true);
    assert.deepEqual(confirmDuoRole(both,'c',ids),both);
    const cancelled=confirmDuoRole(both,'a',ids);
    assert.deepEqual(cancelled,[null,'b']);
    assert.deepEqual(confirmDuoRole(cancelled,'c',ids),['c','b']);
    assert.deepEqual(confirmDuoRole(first,'a',ids),empty);
});

test('removed or unknown characters cannot remain confirmed', () => {
    assert.deepEqual(confirmDuoRole(['a','b'],'missing',['b','c']),[null,'b']);
    assert.deepEqual(confirmDuoRole(['a','b'],'c',['b','c']),['c','b']);
});
