// data_core.js — 数据集加载（浏览器 fetch / Node fs 均可，通过注入 readJson）。
// dataset = { version, name, manifest, cards, charms, aiDecks, statsByGear, hpTable, gsidMap }
import { parseMiniauraStats } from './combat_unit_core.js';

const FILE_KEYS = ['cards', 'charms', 'aiDecks', 'statsByGear', 'hpTable', 'gsidMap'];

/**
 * @param baseUrl 目录（如 'data/sample' 或 'data/teen'）
 * @param readJson async (url) → object
 */
export async function loadDataset(baseUrl, readJson) {
    const manifest = await readJson(`${baseUrl}/manifest.json`);
    const dataset = { version: manifest.version || 'kids', name: manifest.name || baseUrl, manifest, baseUrl };
    for (const k of FILE_KEYS) {
        const file = manifest.files && manifest.files[k];
        if (!file) { dataset[k] = k === 'charms' ? { charm: {}, ward: {}, miniaura: {}, globalaura: {} } : {}; continue; }
        try {
            dataset[k] = await readJson(`${baseUrl}/${file}`);
        } catch (e) {
            dataset[k] = k === 'charms' ? { charm: {}, ward: {}, miniaura: {}, globalaura: {} } : {};
        }
    }
    normalizeDataset(dataset);
    return dataset;
}

export function normalizeDataset(dataset) {
    const ch = dataset.charms || (dataset.charms = {});
    for (const group of ['charm', 'ward', 'miniaura', 'globalaura']) ch[group] = ch[group] || {};
    for (const tpl of Object.values(ch.miniaura)) tpl._stats = parseMiniauraStats(tpl.stats);
    for (const [key, card] of Object.entries(dataset.cards || {})) {
        card.key = card.key || key;
        card.params = card.params || {};
        card.spellSchool = String(card.spellSchool || card.spell_school || 'balance').toLowerCase();
    }
    return dataset;
}

/** 浏览器 readJson */
export function fetchJson(url) {
    return fetch(url, { cache: 'no-cache' }).then(r => {
        if (!r.ok) throw new Error(`${url}: ${r.status}`);
        return r.json();
    });
}

/** 列出可用数据集（浏览器：探测 manifest） */
export async function discoverDatasets(readJson, candidates = ['data/kids', 'data/teen', 'data/sample']) {
    const out = [];
    for (const dir of candidates) {
        try {
            const m = await readJson(`${dir}/manifest.json`);
            out.push({ dir, version: m.version, name: m.name || dir, counts: m.counts || {} });
        } catch (e) { /* 不存在 */ }
    }
    return out;
}

/** 按系筛卡（含 balance 通用） */
export function cardsOfSchool(dataset, school, includeBalance = true) {
    return Object.values(dataset.cards).filter(c => c.spellSchool === school || (includeBalance && c.spellSchool === 'balance'));
}
