import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import viteConfig from '../vite.config.mjs';
import { syncMaisiRelease, syncAppsRelease, prepareAppsRelease } from '../scripts/sync_keepwork_apps_release.mjs';

test('apps release preparation fast-forwards behind origin and preserves safety boundaries', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'haqi-apps-git-'));
    const repo = path.join(root, 'work');
    fs.mkdirSync(repo);
    const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    try {
        git('init', '-b', 'master');
        git('config', 'user.name', 'Release Test');
        git('config', 'user.email', 'release@example.invalid');
        git('config', 'commit.gpgsign', 'false');
        fs.writeFileSync(path.join(repo, 'page.txt'), 'base');
        git('add', '.'); git('commit', '-m', 'base');
        const base = git('rev-parse', 'HEAD');
        const tree = git('rev-parse', 'HEAD^{tree}');
        for (const remote of ['origin', 'keepwork']) {
            const target = path.join(root, remote + '.git');
            git('init', '--bare', target); git('remote', 'add', remote, target); git('push', remote, 'master');
        }
        const upstream = git('commit-tree', tree, '-p', base, '-m', 'colleague update');
        git('push', 'origin', `${upstream}:refs/heads/master`);
        assert.throws(() => prepareAppsRelease(repo), /Unexpected origin URL/);
        const prepare = () => prepareAppsRelease(repo, { localTest: true });
        prepare();
        assert.equal(git('rev-parse', 'HEAD'), upstream);
        prepare();
        assert.equal(git('rev-parse', 'HEAD'), upstream);
        fs.writeFileSync(path.join(repo, 'page.txt'), 'local edit');
        assert.throws(prepare, /未提交修改/);
        assert.equal(fs.readFileSync(path.join(repo, 'page.txt'), 'utf8'), 'local edit');
        git('add', '.'); git('commit', '-m', 'local release');
        const local = git('rev-parse', 'HEAD');
        prepare();
        assert.equal(git('rev-parse', 'HEAD'), local);
        const divergent = git('commit-tree', tree, '-p', upstream, '-m', 'other update');
        git('push', 'origin', `${divergent}:refs/heads/master`);
        assert.throws(prepare, /已分叉/);
        assert.equal(git('rev-parse', 'HEAD'), local);
        git('switch', '-c', 'feature');
        assert.throws(prepare, /master 分支/);
        assert.equal(git('ls-remote', 'keepwork', 'refs/heads/master').split(/\s/)[0], base);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('apps publication requires committed source verified on origin even in isolated compatibility mode', async () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'haqi-source-gate-'));
    const root = path.join(fixture, 'source');
    fs.mkdirSync(root);
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    try {
        git('init', '-b', 'master');
        git('config', 'user.name', 'Release Test');
        git('config', 'user.email', 'release@example.invalid');
        git('config', 'commit.gpgsign', 'false');
        fs.writeFileSync(path.join(root, 'source.txt'), 'base');
        git('add', 'source.txt'); git('commit', '-m', 'base');
        const remote = path.join(fixture, 'origin.git');
        git('init', '--bare', remote); git('remote', 'add', 'origin', remote); git('push', 'origin', 'master');
        const options = { projectRoot: root, releaseDir: root, pages: [], verified: true, publish: true, configuredRoot: path.join(root, 'missing-apps') };
        fs.writeFileSync(path.join(root, 'source.txt'), 'release');
        for (const isolated of [false, true]) await assert.rejects(syncAppsRelease({ ...options, isolated }), /未提交修改/);
        git('add', 'source.txt'); git('commit', '-m', 'release');
        for (const isolated of [false, true]) await assert.rejects(syncAppsRelease({ ...options, isolated }), /尚未在 origin 核验/);
        git('push', 'origin', 'master');
        await assert.rejects(syncAppsRelease(options), /找不到本机 apps/);
    } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
});

test('CDN release inlines both Workers including Windows path casing variants', async () => {
    const plugin = (await viteConfig({ command: 'build' })).plugins.find(plugin => plugin.name === 'inline-cdn-worker');
    for (const file of ['js/sim_pool.js', 'js/battle_ai/client.js']) {
        const url = new URL(`../${file}`, import.meta.url);
        const source = fs.readFileSync(url, 'utf8');
        const id = fileURLToPath(url).replaceAll('\\', '/');
        const ids = process.platform === 'win32' ? [id, id.toUpperCase()] : [id];
        for (const variant of ids) {
            const result = plugin.transform.call({ error(message) { throw Error(message); } }, source, variant);
            assert.ok(result, `${file} must be transformed for ${variant}`);
            assert.match(result.code, /\?worker&inline/);
            assert.match(result.code, /new InlineCdnWorker\(\)/);
            assert.doesNotMatch(result.code, /new Worker\(new URL/);
            if (file === 'js/sim_pool.js') assert.match(result.code, /new Worker\(this.workerUrl/);
        }
        assert.throws(() => plugin.transform.call({ error(message) { throw Error(message); } }, '', id), /constructor not found/);
    }
    assert.equal(plugin.transform('', '/unrelated.js'), null);
});

test('verified release awaits apps publication before Maisi and stops if apps fails', async () => {
    const source = fs.readFileSync(new URL('../uploadRelease.mjs', import.meta.url), 'utf8');
    const block = source.slice(source.lastIndexOf('if (manifest.verified) {'));
    for (const failApps of [false, true]) {
        const calls = [];
        const result = vm.runInNewContext(`(async () => {${block}})()`, {
            manifest: { verified: true }, root: '', release: '', pages: [], args: new Set(),
            console: { log() {} },
            syncAppsRelease: async () => {
                calls.push('apps-start');
                await Promise.resolve();
                if (failApps) throw new Error('apps failed');
                calls.push('apps-done');
                return 'apps';
            },
            syncMaisiRelease: () => { calls.push('maisi'); return 'maisi'; },
        });
        if (failApps) {
            await assert.rejects(result, /apps failed/);
            assert.deepEqual(calls, ['apps-start']);
        } else {
            await result;
            assert.deepEqual(calls, ['apps-start', 'apps-done', 'maisi']);
        }
    }
});

test('release hashes all runtime data, is repeatable, and distinguishes previews from verified releases', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'haqi-release-'));
    try {
        fs.copyFileSync(new URL('../uploadRelease.mjs', import.meta.url), path.join(root, 'uploadRelease.mjs'));
        fs.mkdirSync(path.join(root, 'scripts'));
        fs.copyFileSync(new URL('../scripts/sync_keepwork_apps_release.mjs', import.meta.url), path.join(root, 'scripts/sync_keepwork_apps_release.mjs'));
        fs.mkdirSync(path.join(root, 'dist/data'), { recursive: true });
        for (const page of ['Haqi', 'HaqiOfficialWebsite', 'HaqiPromo']) {
            fs.writeFileSync(path.join(root, `dist/${page}.html`), '<html><head></head><body></body></html>');
        }
        const data = path.join(root, 'dist/data/cards.json');
        fs.writeFileSync(data, '{}');
        // Async spawn instead of spawnSync: blocked sandboxes and some CI hosts
        // reject synchronous child process creation (EBUSY) while allowing async.
        const run = () => new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [path.join(root, 'uploadRelease.mjs'), '--dry-run'], { stdio: 'ignore' });
            child.on('error', reject);
            child.on('exit', code => resolve(code ?? 1));
        });
        const read = () => JSON.parse(fs.readFileSync(path.join(root, 'release/manifest.json'), 'utf8'));
        assert.equal(await run(), 0);
        const first = read();
        assert.equal(first.verified, false);
        assert.ok(fs.readFileSync(path.join(root, 'release/HaqiOfficialWebsite_preview.html'), 'utf8').includes(`<base href="${first.base}">`));
        assert.ok(fs.readFileSync(path.join(root, 'release/HaqiPromo_preview.html'), 'utf8').includes(`<base href="${first.base}">`));
        assert.match(fs.readFileSync(path.join(root, 'release/HaqiPromo_preview.html'), 'utf8'), /location\.replace\(new URL\('HaqiPromo\.html'\+location\.search\+location\.hash/);
        assert.doesNotMatch(fs.readFileSync(path.join(root, 'release/Haqi_preview.html'), 'utf8'), /location\.replace/);
        assert.equal(fs.existsSync(path.join(root, 'release/HaqiCombatSim_preview.html')), false);
        assert.equal(fs.existsSync(path.join(root, 'release/Haqi_v1.html')), false);
        assert.ok(fs.readFileSync(path.join(root, 'release/Haqi_preview.html'), 'utf8').includes(`<base href="${first.base}">`));
        assert.equal(await run(), 0);
        assert.equal(read().hash, first.hash);
        fs.mkdirSync(path.join(root, 'dist/assets'), { recursive: true });
        fs.writeFileSync(path.join(root, 'dist/assets/static.webp'), 'local art is not a release dependency');
        fs.writeFileSync(path.join(root, 'dist/assets/music.ogg'), 'local music');
        assert.equal(await run(), 0);
        assert.equal(read().hash, first.hash);
        assert.ok(read().files.every(file => !/\.(webp|ogg)$/.test(file.path)));
        fs.writeFileSync(data, '{"changed":true}');
        assert.equal(await run(), 0);
        assert.notEqual(read().hash, first.hash);
        fs.mkdirSync(path.join(root, 'dist/data/adventure/locale'), { recursive: true });
        fs.writeFileSync(path.join(root, 'dist/data/adventure/locale/en.txt'), '甲||A\n');
        assert.equal(await run(), 0);
        assert.ok(read().files.some(file => file.path === 'data/adventure/locale/en.txt'));
        fs.writeFileSync(path.join(root, 'dist/notes.txt'), 'no');
        assert.notEqual(await run(), 0);
        fs.rmSync(path.join(root, 'dist/notes.txt'));
        fs.writeFileSync(path.join(root, 'dist/qiniu.yaml'), 'must not upload');
        assert.notEqual(await run(), 0);
    } finally {
        // Only this test's freshly created OS temp directory is removed.
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('verified release copies only its entry wrappers into sibling Maisi and apps checkouts', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'haqi-maisi-sync-'));
    try {
        const projectRoot = path.join(root, 'ParaEngine/paraworld/web/HaqiCombatSim');
        const releaseDir = path.join(projectRoot, 'release');
        const repo = path.join(root, 'maisi');
        const game = path.join(repo, 'maisi/maisi/webgames/MagicHaqi');
        const pages = ['Haqi', 'HaqiOfficialWebsite', 'HaqiPromo'];
        const options = { projectRoot, releaseDir, pages, verified: true, configuredRoot: '' };
        fs.mkdirSync(releaseDir, { recursive: true });
        assert.equal(syncMaisiRelease(options), null);
        fs.mkdirSync(path.join(game, 'release'), { recursive: true });
        fs.mkdirSync(path.join(repo, '.git'));
        fs.writeFileSync(path.join(game, 'MagicHaqi.html'), '<html></html>');
        fs.writeFileSync(path.join(game, 'release/MagicHaqi_v1.html'), 'existing game');
        for (const page of pages) fs.writeFileSync(path.join(releaseDir, `${page}_v1.html`), `new ${page} release`);
        fs.writeFileSync(path.join(releaseDir, 'Haqi_preview.html'), 'verified preview');
        fs.writeFileSync(path.join(releaseDir, 'HaqiCombatSim_v1.html'), 'excluded simulator');
        fs.writeFileSync(path.join(releaseDir, 'manifest.json'), '{}');
        assert.equal(syncMaisiRelease({ ...options, verified: false }), null);
        assert.equal(fs.existsSync(path.join(game, 'release/Haqi_v1.html')), false);
        fs.writeFileSync(path.join(game, 'release/Haqi_v1.html'), 'old version');
        const destination = syncMaisiRelease(options);
        assert.equal(destination, path.join(game, 'release'));
        assert.equal(fs.readFileSync(path.join(destination, 'HaqiOfficialWebsite.html'), 'utf8'), 'new HaqiOfficialWebsite release');
        for (const page of pages) assert.equal(fs.readFileSync(path.join(destination, `${page}_v1.html`), 'utf8'), `new ${page} release`);
        assert.equal(fs.existsSync(path.join(destination, 'Haqi_preview.html')), false);
        assert.equal(fs.existsSync(path.join(destination, 'HaqiCombatSim_v1.html')), false);
        assert.equal(fs.existsSync(path.join(destination, 'manifest.json')), false);
        assert.equal(fs.readFileSync(path.join(destination, 'MagicHaqi_v1.html'), 'utf8'), 'existing game');
        assert.equal(syncMaisiRelease({ ...options, projectRoot: path.join(root, 'unrelated/deep/project'), configuredRoot: repo }), destination);
        assert.equal(await syncAppsRelease(options), null);
        const apps = path.join(root, 'apps');
        const appsGame = path.join(apps, 'official/apps/MagicHaqi');
        fs.mkdirSync(path.join(apps, '.git'), { recursive: true });
        fs.mkdirSync(appsGame, { recursive: true });
        fs.writeFileSync(path.join(appsGame, 'MagicHaqi.html'), '<html></html>');
        assert.equal(await syncAppsRelease({ ...options, verified: false }), null);
        assert.equal(await syncAppsRelease(options), path.join(appsGame, 'release'));
        assert.equal(fs.readFileSync(path.join(appsGame, 'release/HaqiOfficialWebsite.html'), 'utf8'), 'new HaqiOfficialWebsite release');
        for (const page of pages) assert.equal(fs.readFileSync(path.join(appsGame, `release/${page}_v1.html`), 'utf8'), `new ${page} release`);
        assert.equal(fs.existsSync(path.join(appsGame, 'release/Haqi_preview.html')), false);
        assert.equal(fs.existsSync(path.join(appsGame, 'release/HaqiCombatSim_v1.html')), false);
        assert.equal(fs.existsSync(path.join(appsGame, 'release/manifest.json')), false);
        assert.equal(await syncAppsRelease({ ...options, projectRoot: path.join(root, 'unrelated/deep/project'), configuredRoot: apps }), path.join(appsGame, 'release'));
    } finally {
        assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
        fs.rmSync(root, { recursive: true, force: true });
    }
});
