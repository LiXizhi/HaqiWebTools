import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
test('storybook UI ships as one alpha WebP below 100,000 bytes with valid nine-slice crops', async () => {
    const manifest = JSON.parse(await readFile(new URL('data/adventure/ui-art.json', root)));
    const bytes = await readFile(new URL(manifest.local, root));
    assert.ok(bytes.length < 100000);
    assert.equal(bytes.length, manifest.size);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.equal(bytes.toString('ascii', 12, 16), 'VP8X');
    assert.ok(bytes[20] & 0x10, 'alpha channel required');
    assert.equal(bytes.readUIntLE(24, 3) + 1, manifest.width);
    assert.equal(bytes.readUIntLE(27, 3) + 1, manifest.height);
    assert.ok(manifest.cdn.startsWith('https://cdn.keepwork.com/'));
    const cells = new Set();
    for (const frame of Object.values(manifest.frames)) {
        const [x, y, w, h] = frame.rect;
        assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0);
        assert.ok(x + w <= manifest.width && y + h <= manifest.height);
        const [column, row] = frame.cell;
        assert.ok(Number.isInteger(column) && Number.isInteger(row) && column >= 0 && column < (manifest.columns || 4) && row >= 0 && row < (manifest.rows || 4));
        assert.ok(!cells.has(frame.cell.join(',')), 'cells cannot overlap');
        cells.add(frame.cell.join(','));
        if (frame.slice) {
            const [top, right, bottom, left] = frame.slice;
            assert.ok(top + bottom < h && left + right < w, 'stretchable center remains');
        }
    }
    assert.equal(cells.size, 18);
    for (const name of ['paper', 'wood', 'jade', 'cream']) assert.ok(manifest.frames[name].slice);
    for (const name of ['book', 'cards', 'bag', 'pet', 'shop', 'map', 'cloud', 'settings', 'gourd', 'close', 'dungeon', 'home']) assert.ok(manifest.frames[name]);
});

test('forest skin has four independent alpha assets and safe stretchable centers',async()=>{
 const manifest=JSON.parse(await readFile(new URL('data/adventure/forest-ui.json',root)));
 assert.equal(manifest.status,'cdn-verified');
 assert.deepEqual(Object.keys(manifest.assets).sort(),['frame','primary','secondary','tooltip']);
 for(const row of Object.values(manifest.assets)){
  const bytes=await readFile(new URL(row.local,root));
  assert.equal(bytes.length,row.size);assert.ok(bytes.length<=200000);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
  assert.ok(bytes[20]&0x10);assert.equal(bytes.readUIntLE(24,3)+1,row.width);assert.equal(bytes.readUIntLE(27,3)+1,row.height);
  const [t,r,b,l]=row.slice;assert.ok(t+b<row.height&&l+r<row.width);
  assert.ok(row.cdn.startsWith('https://cdn.keepwork.com/'));
 }
});
