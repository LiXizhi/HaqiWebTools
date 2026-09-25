import fs from 'node:fs';
import path from 'node:path';
import {npcItemLimits} from '../js/adventure_npc_core.js';

// Explicit runtime projections, not a recursive key blacklist: fields such as
// `source` still power the card comparison UI, and hashes guard atlas validity.
const pick = (row, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]));
const map = (rows, project) => Object.fromEntries(Object.entries(rows).map(([id, row]) => [id, project(row)]));
const urlFields = ['local', 'cdn'];
const developmentFiles = new Set(['card-atlas.json', 'cdn-publish-plan.json', 'skill-art-plan.json', 'expansion-report.json', 'quest-catalog.json', 'monster-catalog.json', 'boss-art-plan.json', 'boss-art.json']);

export function projectRuntimeData(relativePath, value) {
    if (!relativePath.startsWith('adventure/')) return value;
    const name = relativePath.slice('adventure/'.length);
    if (name === 'building-art-plan.json') return null;
    if (developmentFiles.has(name)) return null;
    switch (name) {
        case 'dungeon-index.json': return {
            version: value.version,
            worlds: value.worlds.map(row => ({
                ...pick(row, ['id', 'name', 'playable', 'recommendedLevel', 'monsterCount', 'bossArenaId', 'battleRewards', 'mapInfo', 'loaded']),
                boss: row.boss ? {...pick(row.boss, ['name', 'source', 'level']), attributes: pick(row.boss.attributes, ['asset'])} : null,
                arenas: row.arenas.map(arena => pick(arena, ['id', 'blocked'])),
            })),
        };
        case 'monster-art.json': return {
            version: value.version,
            entries: map(value.entries, row => pick(row, [...urlFields, 'width', 'height', 'size', 'sha256'])),
            bindings: map(value.bindings, row => pick(row, ['kind', 'id', 'petId'])),
            models: map(value.models, row => pick(row, ['kind', 'id', 'petId'])),
        };
        case 'quest-journal.json': return {
            version: value.version,
            quests: value.quests.map(row => ({
                ...pick(row, ['id', 'title', 'description', 'region', 'obsolete', 'startNpc', 'endNpc', 'validDate']),
                objectives: row.objectives.map(goal => pick(goal, ['type', 'name', 'count'])),
                prerequisites: row.prerequisites.map(quest => pick(quest, ['id', 'title'])),
                requirements: row.requirements.map(requirement => pick(requirement, ['name', 'min', 'max'])),
                rewards: row.rewards.map(group => ({...pick(group, ['choice', 'schoolFilter']), items: group.items.map(item => pick(item, ['id', 'name', 'count']))})),
            })),
        };
        case 'quest-runtime.json': return {
            version: value.version, paths: value.paths,
            quests: value.quests.map(row => ({
                ...pick(row, ['id', 'title', 'region', 'startNpc', 'endNpc', 'repeat']),
                prerequisites: row.prerequisites.map(quest => pick(quest, ['id', 'value'])),
                requirements: row.requirements.map(requirement => pick(requirement, ['id', 'min', 'max'])),
                groups: row.groups.map(group => ({...pick(group, ['kind', 'condition', 'mode']), items: group.items.map(item => pick(item, ['id', 'name', 'count', 'producers', 'odds', 'unit', 'amount', 'destroy']))})),
                rewards: row.rewards.map(group => ({...pick(group, ['choice', 'schoolFilter']), items: group.items.map(item => pick(item, ['id', 'name', 'count']))})),
            })),
        };
        case 'dungeons.json': return {version:value.version,worlds:value.worlds.map(row=>pick(row,['id','name','attributes','arenas','warnings','recommendedLevel','monsterCount'])),monsters:map(value.monsters,row=>pick(row,['id','source','name','school','level','hp','xp','coins','attributes','pool','sequences','genes','cardsets']))};
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
            items: map(value.items, row => ({...pick(row, ['id', 'name', 'description', 'sourceIcon', 'assetkey', 'stats', 'slot', 'kind', 'subtype', 'maxCount', 'maxCopiesInStack']), exchangeLimits:npcItemLimits(row)})),
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
        case 'mount-catalog.json': return {
            version: value.version,
            sheets: map(value.sheets, row => pick(row, [...urlFields, 'width', 'height', 'columns', 'rows'])),
            mounts: value.mounts.map(mount => ({
                ...pick(mount, ['id', 'name', 'ground', 'lift', 'bob', 'stats', 'commerce', 'rideable', 'layoutBounds']),
                art: mount.art ? pick(mount.art, [...urlFields, 'width', 'height', 'columns', 'rows']) : null,
                source: { items: mount.source?.items || [] },
                directions: Object.fromEntries(Object.entries(mount.directions || {}).map(([direction, pose]) => [direction, {
                    ...pick(pose, ['cell', 'riderCell', 'riderArt', 'seat', 'anchor', 'scale', 'foreground']),
                    ...(pose.characters ? { characters: Object.fromEntries(Object.entries(pose.characters).map(([gender, row]) => [gender, pick(row, ['anchor', 'seat', 'scale'])])) } : {}),
                }])),
            })),
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
            if(prefix==='adventure/'&&entry.name==='dungeons.json')continue;
            // The small public website catalogue is emitted separately by Vite.
            if(prefix===''&&entry.name==='official-website.json')continue;
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
