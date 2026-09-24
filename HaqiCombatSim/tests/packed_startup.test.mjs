import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageRuntimeData } from '../scripts/package_runtime_data.mjs';

test('adventure startup loads two published packs with CDN images and no loose JSON requests', async () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'haqi-pack-startup-'));
    const globals = ['fetch', 'Image', 'location', '__HAQI_PACKED_DATA__'];
    const previous = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
    const requests = [], images = [];
    try {
        packageRuntimeData(fileURLToPath(new URL('../data/', import.meta.url)), temporary);
        globalThis.__HAQI_PACKED_DATA__ = true;
        globalThis.location = { hostname: 'localhost', search: '' };
        globalThis.fetch = async url => {
            requests.push(url);
            assert.match(url, /^data\/(adventure|kids)\.json$/);
            return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(temporary, url.slice(5)))) };
        };
        globalThis.Image = class {
            set src(url) {
                assert.match(url, /^https:\/\/cdn\.keepwork\.com\//);
                assert.equal(this.crossOrigin, 'anonymous');
                images.push(url);
                queueMicrotask(() => this.onload());
            }
        };
        const { loadResources } = await import('../js/adventure_assets.js');
        const resources = await loadResources();
        const journal = await resources.loadQuestJournal();
        assert.ok(journal.quests.length > 400);
        assert.ok(resources.content.catalogQuests.quests.length > 400);
        assert.deepEqual(requests.sort(), ['data/adventure.json', 'data/kids.json']);
        assert.equal(resources.mode, 'cdn');
        assert.equal(Object.keys(resources.content.pets).length, 360);
        assert.ok(resources.content.shop.length > 1000);
        assert.ok(images.length > 20);
    } finally {
        globals.forEach((key, index) => {
            if (previous[index]) Object.defineProperty(globalThis, key, previous[index]);
            else delete globalThis[key];
        });
        assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep));
        fs.rmSync(temporary, { recursive: true, force: true });
    }
});
