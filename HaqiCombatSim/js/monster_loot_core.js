// Pure deterministic monster loot engine for mid/late island encounters, elites,
// and trial towers. Activates authentic exported `attributes.loot1` tables while
// supplementing verified gems, upgrade stones, pet food and runes for Lv.15+ foes.
// Uses an isolated RNG seeded by save.seed + pending.id so combat battle.rng and
// legacy checkpoints remain 100% bit-for-bit unchanged.

import { createRng, hashSeed } from './rng_core.js';

const LOOT_ENTRY_RE = /\[(\d+)\s*,\s*(\d+)\]\s*=\s*(\d+)/g;

// Verified item IDs in data/adventure/chapter.json & npc-catalog.json.
const MID_LATE_ZONES = new Set(['fire', 'ice', 'desert', 'dark', 'tide', 'float', 'sail']);
const GEM_POOL_LV1 = [26006, 26011, 26016, 26021, 26026, 26031];
const GEM_POOL_LV2 = [26002, 26007, 26012, 26017, 26022, 26027];
const GEM_POOL_LV3 = [26008, 26013, 26018, 26023, 26028, 26033];
const ELEMENTAL_RUNES = [23319, 23320, 23321, 23322, 23323];

export function parseLootTable(raw) {
    if (typeof raw !== 'string' || !raw.includes('[')) return [];
    const entries = [];
    LOOT_ENTRY_RE.lastIndex = 0;
    let match;
    while ((match = LOOT_ENTRY_RE.exec(raw)) !== null) {
        const itemId = Number(match[1]);
        const count = Number(match[2]);
        const chance = Math.min(100, Math.max(0, Number(match[3])));
        if (Number.isInteger(itemId) && itemId > 0 && Number.isInteger(count) && count > 0 && chance > 0) {
            entries.push({ itemId, count, chance });
        }
    }
    return entries;
}

export function isSupportedLootItem(content, itemId) {
    const item = content?.items?.[itemId];
    if (!item) return false;
    // Gems (26001..26699), verified upgrade/pet materials, and supported rune cards (kind 18 subtype 2).
    if (itemId >= 26001 && itemId <= 26699 && item.stats?.[41] > 0) return true;
    if ([17172, 17176, 17213, 17228, 17231, 17487].includes(itemId)) return true;
    if (item.kind === 18 && item.subtype === 2 && (itemId === 23439 || ELEMENTAL_RUNES.includes(itemId))) return true;
    return false;
}

function pickFrom(rng, pool, content) {
    const valid = pool.filter(id => content?.items?.[id]);
    if (!valid.length) return null;
    return valid[rng.int(0, valid.length - 1)];
}

function isEligibleLootEncounter(save, content, pending, monsters) {
    if (!pending || pending.monsterLootVersion !== 1) return false;
    if (pending.openingTrainingVersion || save?.zone === 'camp') return false;
    if (!Array.isArray(monsters) || !monsters.length) return false;
    const maxLevel = Math.max(...monsters.map(m => Number(m?.level || 1)));
    const dungeon = content?.dungeons?.find(d => d.id === save?.zone);
    if (dungeon) {
        return dungeon.id !== 'journey:tower-camp' && (maxLevel >= 8 || dungeon.kind === 'elite' || dungeon.kind === 'tower');
    }
    return MID_LATE_ZONES.has(save?.zone) || maxLevel >= 12;
}

// Pure deterministic drop evaluation — safe for both settlement and victory-screen preview.
export function rollMonsterDrops(save, content, pending, monsters) {
    if (!isEligibleLootEncounter(save, content, pending, monsters)) return [];
    const rng = createRng(hashSeed(`${save.seed}:monster-loot:${pending.id}`));
    const merged = new Map();
    const add = (itemId, count) => {
        if (!content?.items?.[itemId] || !Number.isInteger(count) || count <= 0) return;
        merged.set(itemId, (merged.get(itemId) || 0) + count);
    };

    // 1. Honor authentic exported `attributes.loot1` entries first (capped to keep economy healthy).
    let authDrops = 0;
    for (const mob of monsters) {
        const table = parseLootTable(mob?.attributes?.loot1).filter(row => isSupportedLootItem(content, row.itemId));
        if (!table.length) continue;
        for (const row of table) {
            if (authDrops >= 2) break;
            if (rng.int(1, 100) <= row.chance) {
                add(row.itemId, row.count);
                authDrops++;
            }
        }
    }

    // 2. Supplement mid/late progression loop (gems, upgrade stones, pet food & capture runes)
    //    for higher-tier wild foes, trilogy guardians, elites and trial tower floors.
    const maxLevel = Math.max(...monsters.map(m => Number(m?.level || 1)));
    const maxHp = Math.max(...monsters.map(m => Number(m?.hp || 0)));
    const isBossLike = maxHp >= 10000 || monsters.length >= 2 || !!pending.dungeonTacticsVersion;

    if (maxLevel >= 15) {
        // Gem drop chance scales with tier & boss status so socketing becomes an active loop.
        const gemChance = isBossLike ? 55 : maxLevel >= 55 ? 42 : maxLevel >= 35 ? 34 : 26;
        if (rng.int(1, 100) <= gemChance) {
            const gemPool = maxLevel >= 58 ? GEM_POOL_LV3 : maxLevel >= 32 ? GEM_POOL_LV2 : GEM_POOL_LV1;
            const gemId = pickFrom(rng, gemPool, content);
            if (gemId) add(gemId, 1);
        }

        // Upgrade material (17213 仙豆 or 17487 祝福魔珠) so strengthening stays funded organically.
        const upgradeChance = isBossLike ? 65 : 40;
        if (rng.int(1, 100) <= upgradeChance) {
            if (maxLevel >= 45 && content?.items?.[17487] && rng.int(1, 100) <= (isBossLike ? 40 : 22)) {
                add(17487, 1);
            } else if (content?.items?.[17213]) {
                const beanCount = maxLevel >= 60 ? 50 : maxLevel >= 40 ? 35 : 20;
                add(17213, beanCount);
            }
        }

        // Pet food or capture/elemental rune drops for active team building.
        if (merged.size === 0 && rng.int(1, 100) <= (isBossLike ? 70 : 45)) {
            if (maxLevel >= 30 && content?.items?.[23439] && rng.int(1, 100) <= 28) {
                add(23439, 1);
            } else if (content?.items?.[17172]) {
                add(17172, maxLevel >= 60 ? 2 : 1);
            }
        }
    } else if (merged.size === 0 && maxLevel >= 8 && isBossLike && rng.int(1, 100) <= 50) {
        if (content?.items?.[17172]) add(17172, 1);
    }

    return [...merged.entries()].map(([itemId, count]) => ({
        itemId,
        count,
        name: content.items[itemId]?.name || `物品${itemId}`,
    }));
}

export function grantMonsterDrops(save, content, pending, monsters) {
    const drops = rollMonsterDrops(save, content, pending, monsters);
    for (const drop of drops) {
        save.inventory[drop.itemId] = (save.inventory[drop.itemId] || 0) + drop.count;
    }
    return drops;
}
