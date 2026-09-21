import test from 'node:test';
import assert from 'node:assert/strict';
import { createJsonReader } from '../js/runtime_data.js';

test('streamed progress handles UTF-8 boundaries and unknown or compressed lengths', async () => {
    const value = { text: '魔法世界' }, bytes = new TextEncoder().encode(JSON.stringify(value));
    for (const headers of [{ 'content-length': String(bytes.length) }, {}, { 'content-length': '8', 'content-encoding': 'gzip' }]) {
        const events = [];
        const read = createJsonReader({ packed: false, onProgress: event => events.push(event), request: async () => new Response(new ReadableStream({
            start(controller) {
                for (let offset = 0; offset < bytes.length; offset += 2) controller.enqueue(bytes.slice(offset, offset + 2));
                controller.close();
            },
        }), { headers }) });
        assert.deepEqual(await read('data/example.json'), value);
        assert.equal(events[0].loaded, 0);
        assert.equal(events.at(-1).loaded, bytes.length);
        assert.equal(events.at(-1).done, true);
        assert.equal(events[0].total, headers['content-length'] && !headers['content-encoding'] ? bytes.length : null);
        assert.ok(events.filter(event => !event.done && event.loaded > 0).length > 1);
    }
});

test('concurrent reads share one pack request but return independent data', async () => {
    let count = 0;
    const read = createJsonReader({ packed: true, request: async url => {
        count++;
        assert.equal(url, 'data/adventure.json');
        return { ok: true, json: async () => ({ schemaVersion: 1, files: {
            'data/adventure/chapter.json': { nested: { value: 1 } },
            'data/adventure/media.json': { entries: {} },
        } }) };
    } });
    const [a, b, media] = await Promise.all([
        read('data/adventure/chapter.json'), read('./data/adventure/chapter.json'), read('data/adventure/media.json'),
    ]);
    a.nested.value = 2;
    assert.equal(b.nested.value, 1);
    assert.deepEqual(media, { entries: {} });
    assert.equal(count, 1);
    await assert.rejects(read('data/adventure/missing.json'), /缺少/);
    await assert.rejects(read('data/adventure/../private.json'), /未知/);
    assert.equal(count, 1);
});

test('failed and malformed packs can retry; source mode retains separate-file reads', async () => {
    let count = 0;
    const read = createJsonReader({ packed: true, request: async () => {
        count++;
        if (count === 1) return { ok: false, status: 503 };
        return { ok: true, json: async () => count === 2 ? {} : ({ schemaVersion: 1, files: { 'data/kids/cards.json': { ready: true } } }) };
    } });
    await assert.rejects(read('data/kids/cards.json'), /503/);
    await assert.rejects(read('data/kids/cards.json'), /格式无效/);
    assert.deepEqual(await read('data/kids/cards.json'), { ready: true });
    let sourceCount = 0;
    const source = createJsonReader({ packed: false, request: async (url, options) => {
        sourceCount++;
        assert.equal(url, 'data/kids/cards.json');
        assert.equal(options.cache, 'no-cache');
        return { ok: true, json: async () => ({}) };
    } });
    await source('data/kids/cards.json');
    await source('data/kids/cards.json');
    assert.equal(sourceCount, 2);
});
