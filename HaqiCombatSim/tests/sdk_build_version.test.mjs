import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import config, { resolveSdkUrl, persistSdkUrl } from '../vite.config.mjs';
import { SDK_URL } from '../js/adventure_cloud.js';

const sdkBase = 'https://cdn.keepwork.com/sdk/keepworkSDK.core.iife.js';

test('SDK version uses content bytes, not the cache-busting request URL', async () => {
    const requests = [];
    const bytes = Buffer.from('window.keepwork = {};');
    const fetchSdk = async (url, options) => {
        requests.push(url);
        assert.equal(options.cache, 'no-store');
        assert.ok(options.signal instanceof AbortSignal);
        return new Response(bytes);
    };
    const expected = `${sdkBase}?v=${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}`;
    assert.equal(await resolveSdkUrl(fetchSdk), expected);
    assert.equal(await resolveSdkUrl(fetchSdk), expected);
    assert.notEqual(requests[0], requests[1]);
    assert.ok(requests.every(url => url.startsWith(`${sdkBase}?v=`)));
    assert.notEqual(await resolveSdkUrl(async () => new Response('new SDK')), expected);
});

test('SDK resolution fails on HTTP, empty-body, and network errors', async () => {
    await assert.rejects(resolveSdkUrl(async () => new Response('', { status: 503 })), /503/);
    await assert.rejects(resolveSdkUrl(async () => new Response('')), /empty bundle/);
    await assert.rejects(resolveSdkUrl(async () => { throw new Error('network unavailable'); }), /network unavailable/);
});

test('Vite embeds the resolved SDK URL while dev and source need no CDN check', async () => {
    assert.match(SDK_URL, /^https:\/\/cdn\.keepwork\.com\/sdk\/keepworkSDK\.core\.iife\.js\?v=[0-9a-f]{12}$/);
    const originalFetch = globalThis.fetch;
    let requests = 0;
    globalThis.fetch = async () => { requests++; return new Response('SDK build fixture'); };
    try {
        const devConfig = await config({ command: 'serve' });
        assert.equal(requests, 0);
        assert.equal(devConfig.define.__HAQI_SDK_URL__, undefined);
        const buildConfig = await config({ command: 'build' });
        assert.equal(requests, 1);
        assert.equal(typeof buildConfig.plugins.find(plugin => plugin.name === 'persist-sdk-cdn-version').writeBundle, 'function');
        const expected = JSON.parse(buildConfig.define.__HAQI_SDK_URL__);
        const result = await build({
            configFile: false,
            root: buildConfig.root,
            define: buildConfig.define,
            publicDir: false,
            logLevel: 'silent',
            build: {
                write: false,
                minify: false,
                lib: { entry: 'js/adventure_cloud.js', formats: ['es'] },
            },
        });
        const outputs = Array.isArray(result) ? result : [result];
        const code = outputs.flatMap(output => output.output).filter(item => item.type === 'chunk').map(item => item.code).join('\n');
        assert.ok(code.includes(expected));
        assert.ok(!code.includes('__HAQI_SDK_URL__'));
        assert.ok(!code.includes('haqi-storage=20260930'));
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('persisted SDK hash updates only the source fallback and rejects bare URLs', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'haqi-sdk-'));
    const sourcePath = path.join(directory, 'adventure_cloud.js');
    const source = fs.readFileSync(new URL('../js/adventure_cloud.js', import.meta.url), 'utf8');
    const updatedUrl = `${sdkBase}?v=0123456789ab`;
    try {
        fs.writeFileSync(sourcePath, source);
        persistSdkUrl(updatedUrl, sourcePath);
        assert.equal(fs.readFileSync(sourcePath, 'utf8'), source.replace(SDK_URL, updatedUrl));
        persistSdkUrl(updatedUrl, sourcePath);
        assert.equal(fs.readFileSync(sourcePath, 'utf8'), source.replace(SDK_URL, updatedUrl));
        assert.throws(() => persistSdkUrl(sdkBase, sourcePath), /Invalid versioned/);
        fs.writeFileSync(sourcePath, 'unexpected source');
        assert.throws(() => persistSdkUrl(updatedUrl, sourcePath), /fallback not found/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});