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
import { createJsonReader } from '../js/runtime_data.js';
import { loadDataset, discoverDatasets } from '../js/data_core.js';
import { installExpansion } from '../js/adventure_expansion_core.js';
import { installNpcCatalog, npcOffers, npcOfferStatus } from '../js/adventure_npc_core.js';
import { createAdventure } from '../js/adventure_core.js';

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

test('compact NPC catalog preserves offers and eligibility without export metadata', () => {
    const original = read('npc-catalog'), before = JSON.stringify(original);
    const catalog = projectRuntimeData('adventure/npc-catalog.json', original);
    assert.equal(JSON.stringify(original), before);
    assert.ok(Buffer.byteLength(JSON.stringify(catalog)) < Buffer.byteLength(before) * .65);
    assert.equal(catalog.sources, undefined);
    assert.equal(catalog.report, undefined);
    assert.ok(catalog.npcs.every(row => !('sourceXml' in row) && !('attributes' in row)));
    assert.ok(catalog.shops.every(row => !('rawColumns' in row) && !('sourceRow' in row)));
    assert.ok(Object.values(catalog.exchanges).every(row => !('rawRewards' in row)));
    const makeContent = data => {
        const { content } = installExpansion(read('chapter'), read('combat'), read('pets'), read('shop-candidates'),
            JSON.parse(fs.readFileSync(new URL('../data/kids/cards.json', import.meta.url))),
            JSON.parse(fs.readFileSync(new URL('../data/kids/charms.json', import.meta.url))));
        installNpcCatalog(content, data);
        return content;
    };
    const full = makeContent(original), packed = makeContent(catalog);
    assert.equal(catalog.npcs.length, original.npcs.length);
    for (const school of ['fire', 'ice', 'storm', 'life', 'death']) {
        for (const level of [1, 50]) {
            const save = createAdventure(full, { school });
            save.level = level; save.trainingPointLevel = level; save.cards = {};
            for (const id of [100, 17213, 17143, 17225]) save.inventory[id] = 100000;
            for (const [index, npc] of original.npcs.entries()) {
                const offers = npcOffers(full, npc), projected = npcOffers(packed, catalog.npcs[index]);
                assert.equal(projected.length, offers.length);
                for (const [offerIndex, offer] of offers.entries()) {
                    const reduced = projected[offerIndex];
                    for (const [key, value] of Object.entries(reduced)) assert.deepEqual(value, offer[key]);
                    assert.deepEqual(npcOfferStatus(save, packed, reduced), npcOfferStatus(save, full, offer));
                }
            }
        }
    }
});

test('five compact packs load all datasets, retain projected content and preserve sources', async () => {
    const source = new URL('../data/', import.meta.url);
    const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'haqi-runtime-data-'));
    const original = fs.readFileSync(new URL('adventure/skill-art.json', source), 'utf8');
    try {
        packageRuntimeData(fileURLToPath(source), destination);
        assert.deepEqual(fs.readdirSync(destination).sort(), ['adventure.json', 'datasets.json', 'kids.json', 'sample.json', 'teen.json']);
        const calls = [];
        const reader = createJsonReader({ packed: true, request: async url => {
            calls.push(url);
            return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(destination, url.slice(5)))) };
        } });
        for (const name of ['card-atlas', 'cdn-publish-plan', 'skill-art-plan', 'expansion-report']) {
            await assert.rejects(reader(`data/adventure/${name}.json`), /数据包缺少/);
        }
        const output = fs.readFileSync(path.join(destination, 'adventure.json'), 'utf8');
        assert.ok(!Object.hasOwn(JSON.parse(output).files,'data/adventure/dungeons.json'));
        assert.ok(Object.hasOwn(JSON.parse(output).files,'data/adventure/dungeon-index.json'));
        assert.equal(output, JSON.stringify(JSON.parse(output)));
        assert.deepEqual(await reader('data/adventure/skill-art.json'), compact('skill-art'));
        assert.deepEqual(await reader('data/adventure/npc-catalog.json'), compact('npc-catalog'));
        for(const id of ['camp','town','fire','ice','desert','dark','index'])assert.deepEqual(await reader(`data/adventure/maps/${id}.json`),read(`maps/${id}`));
        assert.equal(fs.readFileSync(new URL('adventure/skill-art.json', source), 'utf8'), original);
        assert.equal((await discoverDatasets(reader)).length, 3);
        assert.deepEqual(calls, ['data/adventure.json', 'data/datasets.json']);
        for (const version of ['kids', 'teen', 'sample']) {
            const baseline = await loadDataset(`data/${version}`, async url => JSON.parse(fs.readFileSync(new URL('../' + url, import.meta.url))));
            assert.deepEqual(await loadDataset(`data/${version}`, reader), baseline);
        }
        assert.equal(calls.length, 5);
        const cards = await reader('data/kids/cards.json');
        cards.changed = true;
        assert.equal((await reader('data/kids/cards.json')).changed, undefined);
    } finally {
        assert.ok(path.resolve(destination).startsWith(path.resolve(os.tmpdir()) + path.sep));
        fs.rmSync(destination, { recursive: true, force: true });
    }
});
