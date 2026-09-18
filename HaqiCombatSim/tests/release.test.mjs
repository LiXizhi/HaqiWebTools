import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('release hashes all runtime data, is repeatable, and distinguishes previews from verified releases', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'haqi-release-'));
    try {
        fs.copyFileSync(new URL('../uploadRelease.mjs', import.meta.url), path.join(root, 'uploadRelease.mjs'));
        fs.mkdirSync(path.join(root, 'dist/data'), { recursive: true });
        for (const page of ['Haqi', 'HaqiCombatSim', 'HaqiCards', 'HaqiEffects']) {
            fs.writeFileSync(path.join(root, `dist/${page}.html`), '<html><head></head><body></body></html>');
        }
        const data = path.join(root, 'dist/data/cards.json');
        fs.writeFileSync(data, '{}');
        const run = () => spawnSync(process.execPath, [path.join(root, 'uploadRelease.mjs'), '--dry-run'], { encoding: 'utf8' });
        const read = () => JSON.parse(fs.readFileSync(path.join(root, 'release/manifest.json'), 'utf8'));
        assert.equal(run().status, 0);
        const first = read();
        assert.equal(first.verified, false);
        assert.equal(fs.existsSync(path.join(root, 'release/Haqi_v1.html')), false);
        assert.ok(fs.readFileSync(path.join(root, 'release/Haqi_preview.html'), 'utf8').includes(`<base href="${first.base}">`));
        assert.equal(run().status, 0);
        assert.equal(read().hash, first.hash);
        fs.mkdirSync(path.join(root, 'dist/assets'), { recursive: true });
        fs.writeFileSync(path.join(root, 'dist/assets/static.webp'), 'local art is not a release dependency');
        fs.writeFileSync(path.join(root, 'dist/assets/music.ogg'), 'local music');
        assert.equal(run().status, 0);
        assert.equal(read().hash, first.hash);
        assert.ok(read().files.every(file => !/\.(webp|ogg)$/.test(file.path)));
        fs.writeFileSync(data, '{"changed":true}');
        assert.equal(run().status, 0);
        assert.notEqual(read().hash, first.hash);
        fs.writeFileSync(path.join(root, 'dist/qiniu.yaml'), 'must not upload');
        assert.notEqual(run().status, 0);
    } finally {
        // Only this test's freshly created OS temp directory is removed.
        fs.rmSync(root, { recursive: true, force: true });
    }
});
