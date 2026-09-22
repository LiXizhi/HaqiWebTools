import fs from 'node:fs';
import path from 'node:path';
import {npcItemLimits} from '../js/adventure_npc_core.js';

// Explicit runtime projections, not a recursive key blacklist: fields such as
// `source` still power the card comparison UI, and hashes guard atlas validity.
const pick = (row, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]));
const map = (rows, project) => Object.fromEntries(Object.entries(rows).map(([id, row]) => [id, project(row)]));
const urlFields = ['local', 'cdn'];
const developmentFiles = new Set(['card-atlas.json', 'cdn-publish-plan.json', 'skill-art-plan.json', 'expansion-report.json']);

export function projectRuntimeData(relativePath, value) {
    if (!relativePath.startsWith('adventure/')) return value;
    const name = relativePath.slice('adventure/'.length);
    if (developmentFiles.has(name)) return null;
    switch (name) {
        case 'npc-catalog.json': return {
            version: value.version,
            npcs: value.npcs.map(row => ({
                ...pick(row, ['id', 'instanceId', 'zone', 'name', 'description', 'place', 'enabled', 'hidden', 'x', 'y']),
                buttons: row.buttons.map(button => pick(button, ['label', 'dofunction', 'param1', 'param2', 'canshow'])),
            })),
            shops: value.shops.map(row => pick(row, ['id', 'npcId', 'menu', 'categoryName', 'itemId', 'exchangeId', 'dailyLimit', 'name', 'platform', 'timeRange'])),
            mentors: map(value.mentors, row => ({
                attributes: pick(row.attributes, ['class']),
                courses: row.courses.map(course => pick(course, ['type', 'class', 'gsid', 'exID', 'other_exID', 'needlevel', 'tips', 'name'])),
            })),
            exchanges: map(value.exchanges, row => pick(row, ['prerequisites', 'costs', 'rewards'])),
            items: map(value.items, row => ({...pick(row, ['id', 'name', 'description', 'sourceIcon', 'assetkey', 'stats', 'slot', 'kind', 'subtype']), exchangeLimits:npcItemLimits(row)})),
        };
        case 'assets.json': return map(value, row => pick(row, ['entry']));
        case 'npc-art.json': return {
            version: value.version, byteLimit: value.byteLimit,
            entries: map(value.entries, row => pick(row, [...urlFields, 'size', 'width', 'height'])),
            instances: map(value.instances, row => pick(row, ['visible', 'portrait'])),
        };
        case 'media.json': return {
            schemaVersion: value.schemaVersion,
            entries: map(value.entries, row => pick(row, [...urlFields, 'sha256', 'size', 'sourceEntry', 'width', 'height', 'optional'])),
        };
        case 'card-frames.json': return { version: value.version, entries: map(value.entries, row => pick(row, urlFields)) };
        case 'skill-art.json': return {
            version: value.version, maxBytes: value.maxBytes,
            sheets: map(value.sheets, row => pick(row, [...urlFields, 'sha256', 'size', 'width', 'height', 'columns', 'rows'])),
            bases: map(value.bases, row => ({
                ...pick(row, ['atlas', 'cell', 'name', 'effectAtlas', 'effectFrames', 'heroCardFrame']),
                source: pick(row.source, [...urlFields, 'system', 'adaptation']),
            })),
        };
        case 'shop-icons.json': return {
            version: value.version,
            entries: map(value.entries, row => pick(row, urlFields)),
            items: value.items,
            fallbacks: map(value.fallbacks, () => true),
        };
        case 'pets.json': return {
            ...value,
            pets: map(value.pets, row => ({ ...row, ...(row.art ? { art: pick(row.art, urlFields) } : {}) })),
        };
        default: return value;
    }
}

function collectRuntimeData(source, files, prefix = '') {
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        const from = path.join(source, entry.name);
        if (entry.isDirectory()) {
            collectRuntimeData(from, files, `${prefix}${entry.name}/`);
        } else if (entry.name.endsWith('.json')) {
            const value = projectRuntimeData(`${prefix}${entry.name}`, JSON.parse(fs.readFileSync(from, 'utf8')));
            if (value === null) continue;
            files[`data/${prefix}${entry.name}`] = value;
        }
    }
}

export function packageRuntimeData(source, destination) {
    const files = {};
    collectRuntimeData(source, files);
    const packs = Object.fromEntries(['datasets', 'adventure', 'kids', 'teen', 'sample'].map(group => [group, { schemaVersion: 1, files: {} }]));
    for (const [key, value] of Object.entries(files)) {
        const [, directory, name] = key.split('/');
        const group = name === 'manifest.json' && directory !== 'adventure' ? 'datasets' : directory;
        if (!packs[group]) throw new Error(`未配置的数据包：${key}`);
        packs[group].files[key] = value;
    }
    fs.mkdirSync(destination, { recursive: true });
    for (const [group, pack] of Object.entries(packs)) fs.writeFileSync(path.join(destination, `${group}.json`), JSON.stringify(pack));
}
