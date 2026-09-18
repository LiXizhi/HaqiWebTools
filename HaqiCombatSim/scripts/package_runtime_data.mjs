import fs from 'node:fs';
import path from 'node:path';

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
        case 'assets.json': return map(value, row => pick(row, ['entry']));
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
