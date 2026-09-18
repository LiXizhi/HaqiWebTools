import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageRuntimeData, projectRuntimeData } from '../scripts/package_runtime_data.mjs';
import { validateAdventureContent } from '../js/adventure_content_core.js';
import { validateMediaManifest, assetUrl } from '../js/adventure_media_core.js';
import { validateSkillArt, skillFrame } from '../js/skill_art_core.js';

const read = name => JSON.parse(fs.readFileSync(new URL(`../data/adventure/${name}.json`, import.meta.url)));
const compact = name => projectRuntimeData(`adventure/${name}.json`, read(name));

test('compact art retains validation, every animation crop, CDN URL and comparison UI metadata', () => {
    const original = read('skill-art'), art = compact('skill-art');
    const before = JSON.stringify(original);
    projectRuntimeData('adventure/skill-art.json', original);
    assert.equal(JSON.stringify(original), before);
    assert.equal(validateSkillArt(art, read('spell-effects')), 225);
    validateAdventureContent(read('chapter'), read('combat'), compact('assets'));
    validateMediaManifest(compact('media'), compact('assets'));
    for (const [base, row] of Object.entries(original.bases)) {
        for (const progress of [null, 0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1]) {
            assert.deepEqual(skillFrame(art, base, progress), skillFrame(original, base, progress));
        }
        for (const key of ['local', 'cdn', 'system', 'adaptation']) assert.equal(art.bases[base].source[key], row.source[key]);
    }
    for (const name of ['media', 'card-frames', 'shop-icons']) {
        for (const [id, row] of Object.entries(compact(name).entries)) assert.equal(assetUrl(row), assetUrl(read(name).entries[id]));
    }
    const shop = compact('shop-icons'), fullShop = read('shop-icons');
    assert.deepEqual(shop.items, fullShop.items);
    assert.deepEqual(Object.keys(shop.fallbacks), Object.keys(fullShop.fallbacks));
    assert.ok(Object.values(shop.fallbacks).every(value => value === true));
    for (const [id, pet] of Object.entries(read('pets').pets)) {
        assert.deepEqual(compactPets.pets[id], { ...pet, art: { local: pet.art.local, cdn: pet.art.cdn } });
    }
    assert.equal(art.sheets['ice-01'].sourceSha256, undefined);
    assert.equal(shop.sources, undefined);
});
const compactPets = compact('pets');

test('data packaging minifies output, omits development plans and preserves source files', () => {
    const source = new URL('../data/', import.meta.url);
    const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'haqi-runtime-data-'));
    const original = fs.readFileSync(new URL('adventure/skill-art.json', source), 'utf8');
    try {
        packageRuntimeData(fileURLToPath(source), destination);
        for (const name of ['card-atlas', 'cdn-publish-plan', 'skill-art-plan', 'expansion-report']) {
            assert.equal(fs.existsSync(path.join(destination, `adventure/${name}.json`)), false);
        }
        const output = fs.readFileSync(path.join(destination, 'adventure/skill-art.json'), 'utf8');
        assert.equal(output, JSON.stringify(compact('skill-art')));
        assert.equal(fs.readFileSync(new URL('adventure/skill-art.json', source), 'utf8'), original);
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(destination, 'kids/cards.json'))), JSON.parse(fs.readFileSync(new URL('kids/cards.json', source))));
    } finally {
        assert.ok(path.resolve(destination).startsWith(path.resolve(os.tmpdir()) + path.sep));
        fs.rmSync(destination, { recursive: true, force: true });
    }
});
