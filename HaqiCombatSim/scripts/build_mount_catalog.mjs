// Copy the art-lab catalog into game data and attach sheet addresses plus combat stats.
// globalstore.db row: count is index 2 (魔豆), ebuyprice is index 7 (奇豆).
// paraworld.globalstore.lua LoadFromFile o[3] / o[8].
import fs from 'node:fs';
import { statIdToEntry } from '../js/combat_unit_core.js';

const root = new URL('..', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root)));
const catalog = read('demos/mount-lab/catalog.json');
const sheets = read('demos/mount-lab/assets.json');
const originals = Object.fromEntries(read('demos/mount-lab/original-items.json').map(item => [item.id, item]));
const npcItems = read('data/adventure/npc-catalog.json').items;
const lab = new Set(['dragon', 'bird', 'car', 'carpet']);
const sheetKeys = ['rider', 'standing', 'female-rider', 'female-standing'];

function artOf(id) {
    const row = sheets[id];
    if (!row?.cdn) return null;
    return { cdn: row.cdn, local: row.local, width: row.width, height: row.height, columns: row.columns, rows: row.rows };
}
function limits(id) {
    const template = npcItems[String(id)]?.sourceRecord?.[18];
    return { expireTime: Number(template?.[26] || 0), expireType: Number(template?.[29] || 0) };
}
function price(id) {
    const record = npcItems[String(id)]?.sourceRecord;
    return { modou: Number(record?.[2] || 0), qidou: Number(record?.[7] || 0) };
}
function combatStats(item) {
    const stats = {};
    for (const [id, value] of Object.entries(item?.stats || {})) if (statIdToEntry(id) && Number(value)) stats[id] = Number(value);
    return stats;
}

let rideableIndex = 0;
const mounts = catalog.mounts.map(mount => {
    const commerce = {};
    for (const id of mount.source?.items || []) {
        const item = originals[id];
        if (!item) continue;
        const sale = price(id), limit = limits(id);
        commerce[id] = { name: item.name, kind: item.kind, subtype: item.subtype, ...sale, vip: Number(item.stats?.[180]) === 1, ...limit };
    }
    const primary = originals[(mount.source?.items || []).find(id => originals[id])];
    const rideable = !lab.has(mount.id) && Object.values(commerce).some(row => (row.kind === 2 && row.subtype === 6) || (row.kind === 10 && row.subtype === 1));
    let stats = combatStats(primary);
    if (rideable && !Object.keys(stats).length) {
        const n = rideableIndex++;
        // Web bonus for transform pills whose globalstore stats are duration metadata only.
        stats = { 101: 60 + (n % 8) * 10, 111: 2 + (n % 5), 119: 2 + (n % 4) };
    }
    return { ...mount, art: artOf(mount.id), stats, commerce, rideable };
});
const tiger = mounts.find(mount => mount.commerce?.[16071]);
if (tiger?.commerce[16071].modou !== 300 || tiger.commerce[16071].qidou !== 0) throw new Error('霸王虎售价与 globalstore 不一致');
const result = {
    version: catalog.version,
    directions: catalog.directions,
    sheets: Object.fromEntries(sheetKeys.map(id => [id, artOf(id)])),
    mounts,
};
fs.writeFileSync(new URL('data/adventure/mount-catalog.json', root), JSON.stringify(result));
console.log(`Wrote ${mounts.length} mounts, ${mounts.filter(mount => mount.rideable).length} rideable`);
