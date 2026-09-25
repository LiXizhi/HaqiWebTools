import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { syncMaisiRelease } from '../scripts/sync_maisi_release.mjs';

test('release hashes all runtime data, is repeatable, and distinguishes previews from verified releases', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'haqi-release-'));
    try {
        fs.copyFileSync(new URL('../uploadRelease.mjs', import.meta.url), path.join(root, 'uploadRelease.mjs'));
        fs.mkdirSync(path.join(root, 'scripts'));
        fs.copyFileSync(new URL('../scripts/sync_maisi_release.mjs', import.meta.url), path.join(root, 'scripts/sync_maisi_release.mjs'));
        fs.mkdirSync(path.join(root, 'dist/data'), { recursive: true });
        for (const page of ['Haqi', 'HaqiCombatSim', 'HaqiCards', 'HaqiEffects', 'HaqiOfficialWebsite']) {
            fs.writeFileSync(path.join(root, `dist/${page}.html`), '<html><head></head><body></body></html>');
        }
        const data = path.join(root, 'dist/data/cards.json');
        fs.writeFileSync(data, '{}');
        const run = () => spawnSync(process.execPath, [path.join(root, 'uploadRelease.mjs'), '--dry-run'], { encoding: 'utf8' });
        const read = () => JSON.parse(fs.readFileSync(path.join(root, 'release/manifest.json'), 'utf8'));
        assert.equal(run().status, 0);
        const first = read();
        assert.equal(first.verified, false);
        assert.ok(fs.readFileSync(path.join(root, 'release/HaqiOfficialWebsite_preview.html'), 'utf8').includes(`<base href="${first.base}">`));
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
        fs.mkdirSync(path.join(root, 'dist/data/adventure/locale'), { recursive: true });
        fs.writeFileSync(path.join(root, 'dist/data/adventure/locale/en.txt'), '甲||A\n');
        assert.equal(run().status, 0);
        assert.ok(read().files.some(file => file.path === 'data/adventure/locale/en.txt'));
        fs.writeFileSync(path.join(root, 'dist/notes.txt'), 'no');
        assert.notEqual(run().status, 0);
        fs.rmSync(path.join(root, 'dist/notes.txt'));
        fs.writeFileSync(path.join(root, 'dist/qiniu.yaml'), 'must not upload');
        assert.notEqual(run().status, 0);
    } finally {
        // Only this test's freshly created OS temp directory is removed.
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('verified release copies only its entry wrappers into a sibling Maisi checkout', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'haqi-maisi-sync-'));
    try {
        const projectRoot = path.join(root, 'ParaEngine/paraworld/web/HaqiCombatSim');
        const releaseDir = path.join(projectRoot, 'release');
        const repo = path.join(root, 'maisi');
        const game = path.join(repo, 'maisi/maisi/webgames/MagicHaqi');
        const pages = ['Haqi', 'HaqiCombatSim', 'HaqiCards', 'HaqiEffects', 'HaqiOfficialWebsite'];
        const options = { projectRoot, releaseDir, pages, verified: true, configuredRoot: '' };
        fs.mkdirSync(releaseDir, { recursive: true });
        assert.equal(syncMaisiRelease(options), null);
        fs.mkdirSync(path.join(game, 'release'), { recursive: true });
        fs.mkdirSync(path.join(repo, '.git'));
        fs.writeFileSync(path.join(game, 'MagicHaqi.html'), '<html></html>');
        fs.writeFileSync(path.join(game, 'release/MagicHaqi_v1.html'), 'existing game');
        for (const page of pages) fs.writeFileSync(path.join(releaseDir, `${page}_v1.html`), `new ${page} release`);
        fs.writeFileSync(path.join(releaseDir, 'Haqi_preview.html'), 'do not copy');
        assert.equal(syncMaisiRelease({ ...options, verified: false }), null);
        assert.equal(fs.existsSync(path.join(game, 'release/Haqi_v1.html')), false);
        fs.writeFileSync(path.join(game, 'release/Haqi_v1.html'), 'old version');
        const destination = syncMaisiRelease(options);
        assert.equal(destination, path.join(game, 'release'));
        for (const page of pages) assert.equal(fs.readFileSync(path.join(destination, `${page}_v1.html`), 'utf8'), `new ${page} release`);
        assert.equal(fs.existsSync(path.join(destination, 'Haqi_preview.html')), false);
        assert.equal(fs.readFileSync(path.join(destination, 'MagicHaqi_v1.html'), 'utf8'), 'existing game');
        assert.equal(syncMaisiRelease({ ...options, projectRoot: path.join(root, 'unrelated/deep/project'), configuredRoot: repo }), destination);
    } finally {
        assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
        fs.rmSync(root, { recursive: true, force: true });
    }
});
