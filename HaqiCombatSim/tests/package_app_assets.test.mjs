import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { collectLocalRows, packageAppAssets, resolveLocalFile } from '../scripts/package_app_assets.mjs';

function tempRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'haqi-app-assets-'));
}

test('local media resolves direct files and mount-lab rewrites', () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, 'assets', 'adventure'), { recursive: true });
    fs.writeFileSync(path.join(root, 'assets', 'adventure', 'tree.webp'), 'tree');
    fs.mkdirSync(path.join(root, 'demos', 'mount-lab', 'assets'), { recursive: true });
    fs.writeFileSync(path.join(root, 'demos', 'mount-lab', 'assets', 'mount.webp'), 'mount');
    assert.equal(resolveLocalFile(root, 'assets/adventure/tree.webp').relative, 'assets/adventure/tree.webp');
    assert.equal(resolveLocalFile(root, 'assets/mount.webp').relative, 'demos/mount-lab/assets/mount.webp');
    assert.throws(() => resolveLocalFile(root, 'assets/missing.webp'));
    assert.throws(() => resolveLocalFile(root, 'assets/adventure/../secret.webp'));
});

test('packaged bytes must match the manifest hash and are written only under app-dist', () => {
    const root = tempRoot();
    const bytes = Buffer.from('webp-bytes');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    fs.mkdirSync(path.join(root, 'assets', 'adventure'), { recursive: true });
    fs.writeFileSync(path.join(root, 'assets', 'adventure', 'icon.webp'), bytes);
    const dataDir = path.join(root, 'runtime');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'pack.json'), JSON.stringify({
        files: { icon: { local: 'assets/adventure/icon.webp', sha256, size: bytes.length, cdn: 'https://cdn.keepwork.com/x.webp' } },
    }));
    const outDir = path.join(root, 'app-dist');
    const summary = packageAppAssets(root, { dataDir, outDir });
    assert.equal(summary.files, 1);
    assert.equal(fs.readFileSync(path.join(outDir, 'assets', 'adventure', 'icon.webp')).toString(), 'webp-bytes');
    const broken = JSON.parse(fs.readFileSync(path.join(dataDir, 'pack.json'), 'utf8'));
    broken.files.icon.sha256 = 'a'.repeat(64);
    fs.writeFileSync(path.join(dataDir, 'pack.json'), JSON.stringify(broken));
    assert.throws(() => packageAppAssets(root, { dataDir, outDir }), /哈希不符/);
    assert.equal(collectLocalRows({ nested: [{ local: 'notes.txt' }, { local: 'assets/adventure/icon.webp' }] }).length, 1);
});
