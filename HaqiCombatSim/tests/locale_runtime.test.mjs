import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocaleFile } from '../js/locale_core.js';
import { fill, setTranslator } from '../js/locale_runtime.js';

test('fill translates the pattern and Chinese slots', () => {
    const table = parseLocaleFile([
        '传送到{name}||Teleport to {name}',
        '雪山眺望台||Snowpeak Overlook',
        '{minutes} 分钟||{minutes} min',
    ].join('\n'));
    setTranslator(source => table[source] || source);
    assert.equal(fill('传送到{name}', { name: '雪山眺望台' }).text, 'Teleport to Snowpeak Overlook');
    assert.equal(fill('传送到{name}', { name: '雪山眺望台' }).zh, '传送到雪山眺望台');
    assert.equal(fill('{minutes} 分钟', { minutes: 5 }).text, '5 min');
    assert.equal(fill('没有译文的{name}', { name: '小路' }).text, '没有译文的小路');
    setTranslator(value => value);
});
