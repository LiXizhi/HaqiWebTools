import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

test('five card backgrounds stay below 24KB with matching manifest hashes', async () => {
  const root = new URL('../', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('data/adventure/card-frames.json', root)));
  assert.deepEqual(Object.keys(manifest.entries).sort(), ['death', 'fire', 'ice', 'life', 'storm']);
  for (const [school, entry] of Object.entries(manifest.entries)) {
    const bytes = await readFile(new URL(entry.local, root));
    assert.ok(bytes.length < 24_000, `${school}: ${bytes.length} bytes`);
    assert.equal(bytes.length, entry.size);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    assert.ok(entry.cdn.startsWith('https://cdn.keepwork.com/'));
    assert.ok(entry.cdn.endsWith(entry.local.split('/').at(-1)));
  }
});
