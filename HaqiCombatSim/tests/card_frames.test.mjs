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

test('shared skill atlas has nine equal cells, original references and a 200KB budget', async () => {
  const root = new URL('../', import.meta.url);
  const atlas = JSON.parse(await readFile(new URL('data/adventure/card-atlas.json', root)));
  const bytes = await readFile(new URL(atlas.image.local, root));
  assert.ok(bytes.length <= 200_000);
  assert.equal(bytes.length, atlas.image.size);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), atlas.image.sha256);
  assert.equal(atlas.columns, 3);
  assert.equal(atlas.rows, 3);
  assert.equal(atlas.cells.length, 9);
  assert.equal(new Set(atlas.cells.map(cell => cell.id)).size, 9);
  assert.equal(atlas.image.width, atlas.image.height);
  assert.equal(atlas.image.width % 3, 0);
  const size = atlas.image.width / 3;
  for (const [i, cell] of atlas.cells.entries()) {
    assert.deepEqual(cell.rect, [i % 3 * size, Math.floor(i / 3) * size, size, size]);
    assert.ok(cell.original.sourceEntry);
    const original = await readFile(new URL(cell.original.local, root));
    assert.equal(createHash('sha256').update(original).digest('hex'), cell.original.sha256);
  }
  assert.ok(atlas.image.cdn.startsWith('https://cdn.keepwork.com/'));
  assert.ok(atlas.image.cdn.endsWith(atlas.image.local.split('/').at(-1)));
});
