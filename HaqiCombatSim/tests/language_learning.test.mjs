import test from 'node:test';
import assert from 'node:assert/strict';
import { testDurationMs, parseMemory, serializeMemory, speechGain, speechOutcome, WEAKEN_AT, WIN_AT } from '../js/language_learning_core.js';

test('price maps onto a test between 10 seconds and 5 minutes', () => {
    assert.equal(testDurationMs(10, [10, 100]), 10_000);
    assert.equal(testDurationMs(100, [10, 100]), 300_000);
    assert.equal(testDurationMs(55, [10, 100]), 10_000 + Math.round(0.5 * 290_000));
    assert.equal(testDurationMs(4, [10, 100]), 10_000);
    assert.equal(testDurationMs(200, [10, 100]), 300_000);
    assert.equal(testDurationMs(40, [40]), 10_000);
});

test('memory profile keeps unknown fields', () => {
    const text = '---\nnativeLanguage: ja\ntargetLanguage: en\nlevel: 140\nstrengths: greetings\ncoachName: Maya\n---\nLikes short stories.\n';
    const profile = parseMemory(text);
    assert.equal(profile.nativeLanguage, 'ja');
    assert.equal(profile.level, 100);
    assert.deepEqual(profile.strengths, ['greetings']);
    assert.equal(profile.extra.coachName, 'Maya');
    assert.equal(profile.notes, 'Likes short stories.');
    const again = parseMemory(serializeMemory(profile));
    assert.equal(again.extra.coachName, 'Maya');
    assert.equal(again.notes, 'Likes short stories.');
});

test('speech progress weakens at 50 and wins at 100', () => {
    assert.equal(WEAKEN_AT, 50);
    assert.equal(WIN_AT, 100);
    assert.equal(speechOutcome(speechGain({ sentences: 1 })).weaken, false);
    assert.equal(speechOutcome(49).weaken, false);
    assert.equal(speechOutcome(50).weaken, true);
    assert.equal(speechOutcome(50).win, false);
    assert.equal(speechOutcome(100).win, true);
    assert.equal(speechGain({ sentences: 4, relevant: 6 }), 100);
});
