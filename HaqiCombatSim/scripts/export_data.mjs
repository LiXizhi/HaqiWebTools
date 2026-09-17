#!/usr/bin/env node
// export_data.mjs — 把本机 config/Aries 的 XML/CSV 导出为 H5 可读 JSON（见 docs/data-export.md）。
// 用法：node scripts/export_data.mjs --config ../../config/Aries --out data --version kids|teen|both [--verbose]
// 零依赖：使用 scripts/lib/xml_lite.mjs。
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXml, firstChild, childrenNamed, findAll, numberish } from './lib/xml_lite.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');

function parseArgs(argv) {
    const args = { config: path.resolve(projectRoot, '../../config/Aries'), out: path.resolve(projectRoot, 'data'), version: 'both', verbose: false };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--config') args.config = path.resolve(argv[++i]);
        else if (a === '--out') args.out = path.resolve(argv[++i]);
        else if (a === '--version') args.version = argv[++i];
        else if (a === '--verbose') args.verbose = true;
        else if (a === '--help' || a === '-h') { console.log('node scripts/export_data.mjs --config <config/Aries> --out <data> --version kids|teen|both'); process.exit(0); }
    }
    return args;
}

async function exists(p) {
    try { await stat(p); return true; } catch { return false; }
}

async function readText(p, encoding = 'utf8') {
    const buf = await readFile(p);
    if (encoding === 'utf8') return buf.toString('utf8');
    return new TextDecoder(encoding).decode(buf);
}

// ---------------------------------------------------------------------------
// 卡牌
// ---------------------------------------------------------------------------

/** 卡片 XML 路径解析：datafile="config/Aries/Cards/xxx.xml" → configDir/Cards/xxx.xml */
function resolveDatafile(configDir, datafile) {
    const rel = datafile.replace(/^config[\\/]Aries[\\/]/i, '');
    return path.join(configDir, rel);
}

/** card_server.lua L645-724 CreateCardTemplate 的 JS 版 */
function parseCardXml(text, warnings, file) {
    const doc = parseXml(text);
    const card = firstChild(doc, 'card');
    if (!card) { warnings.push(`no <card> in ${file}`); return null; }
    const key = firstChild(card, 'key')?.attr.name;
    const spell = firstChild(card, 'spell')?.attr.name || key;
    const basics = firstChild(card, 'basics')?.attr || {};
    const paramsNode = firstChild(card, 'params');
    if (!key) { warnings.push(`no key in ${file}`); return null; }
    const params = {};
    for (const [k, v] of Object.entries(paramsNode?.attr || {})) params[k] = numberish(v);
    const out = {
        key,
        spellName: spell,
        type: basics.type,
        pipcost: numberish(basics.pipcost ?? 0),
        accuracy: numberish(basics.accuracy ?? 100),
        spellSchool: String(basics.spell_school || 'balance').toLowerCase(),
        params,
    };
    if (basics.hitchance !== undefined) out.hitchance = numberish(basics.hitchance);
    if (basics.require_level !== undefined) out.requireLevel = numberish(basics.require_level);
    if (basics.target !== undefined) out.target = basics.target;
    if (basics.can_learn !== undefined) out.canLearn = numberish(basics.can_learn);
    if (basics.gsid !== undefined) out.gsid = numberish(basics.gsid);
    return out;
}

async function exportCards(configDir, version, warnings, verbose) {
    const listFile = path.join(configDir, 'Cards', version === 'teen' ? 'CardList.teen.xml' : 'CardList.xml');
    const doc = parseXml(await readText(listFile));
    const entries = findAll(doc, 'card').map(n => n.attr.datafile).filter(Boolean);
    const cards = {};
    const typeCount = {};
    let missing = 0;
    for (const df of entries) {
        const file = resolveDatafile(configDir, df);
        if (!(await exists(file))) { missing++; if (verbose) warnings.push(`missing card file ${df}`); continue; }
        const card = parseCardXml(await readText(file), warnings, df);
        if (!card) continue;
        card.datafile = df;
        if (cards[card.key] && verbose) warnings.push(`duplicate key ${card.key} (${df})`);
        cards[card.key] = card;
        typeCount[card.type] = (typeCount[card.type] || 0) + 1;
    }
    return { cards, typeCount, listed: entries.length, missing };
}

// ---------------------------------------------------------------------------
// Charm / Ward / MiniAura / GlobalAura
// ---------------------------------------------------------------------------

async function exportCharms(configDir, version, warnings) {
    const file = path.join(configDir, 'Cards', version === 'teen' ? 'CharmWardList.teen.xml' : 'CharmWardList.xml');
    const doc = parseXml(await readText(file));
    const out = { charm: {}, ward: {}, miniaura: {}, globalaura: {} };
    const groups = { charm: 'charmlist', ward: 'wardlist', miniaura: 'miniauralist', globalaura: 'globalauralist' };
    for (const [name, listName] of Object.entries(groups)) {
        const lists = findAll(doc, listName);
        for (const list of lists) {
            for (const node of childrenNamed(list, name)) {
                const rec = {};
                for (const [k, v] of Object.entries(node.attr)) rec[k] = numberish(v);
                if (rec.id === undefined) { warnings.push(`${name} without id in ${path.basename(file)}`); continue; }
                out[name][rec.id] = rec;
            }
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// Deck attacker AI CSV
// ---------------------------------------------------------------------------

function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) {
            if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
            else cur += c;
        } else if (c === '"') q = true;
        else if (c === ',') { out.push(cur); cur = ''; }
        else cur += c;
    }
    out.push(cur);
    return out;
}

/** card_server.lua deck_ai_style_templates 装载语义：首行 heads（第一格为 style 名），后续行 key,target,weights... */
async function exportAiDecks(configDir, warnings) {
    const dir = path.join(configDir, 'Combat', 'deck_attacker_ai');
    if (!(await exists(dir))) return {};
    const { readdir } = await import('node:fs/promises');
    const out = {};
    for (const f of await readdir(dir)) {
        if (!f.toLowerCase().endsWith('.csv')) continue;
        const text = (await readText(path.join(dir, f))).replace(/^\uFEFF/, '');
        const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
        if (!lines.length) continue;
        const heads = parseCsvLine(lines[0]).map(s => s.trim());
        const style = heads[0] || path.basename(f, '.csv');
        const cards = {};
        for (let i = 1; i < lines.length; i++) {
            const cells = parseCsvLine(lines[i]).map(s => s.trim());
            const key = cells[0];
            if (!key) continue;
            const row = [cells[1] || 'hostile'];
            for (let j = 2; j < heads.length; j++) {
                const v = cells[j];
                row.push(v === undefined || v === '' ? null : (Number.isNaN(Number(v)) ? v : Number(v)));
            }
            cards[key] = row;
        }
        // heads 对齐 row 下标：row[0]=target ↔ heads[1]；row[i] ↔ heads[i+1]
        out[style] = { heads: ['target', ...heads.slice(2)], cards, file: f };
    }
    return out;
}

// ---------------------------------------------------------------------------
// MobStatsByGearScore / MobAIDeckByGearScore / HP mapping
// ---------------------------------------------------------------------------

async function exportStatsByGear(configDir, version) {
    const file = path.join(configDir, 'Combat', version === 'teen' ? 'MobStatsByGearScore.teen.xml' : 'MobStatsByGearScore.xml');
    if (!(await exists(file))) return {};
    const doc = parseXml(await readText(file));
    const out = {};
    for (const group of findAll(doc, 'group')) {
        const school = String(group.attr.school || '').toLowerCase();
        out[school] = childrenNamed(group, 'stats').map(s => {
            const rec = {};
            for (const [k, v] of Object.entries(s.attr)) rec[k] = numberish(v);
            rec.from = numberish(s.attr.gearscore_from);
            rec.to = numberish(s.attr.gearscore_to);
            return rec;
        });
    }
    return out;
}

async function exportAiDeckByGear(configDir, version) {
    const file = path.join(configDir, 'Combat', version === 'teen' ? 'MobAIDeckByGearScore.teen.xml' : 'MobAIDeckByGearScore.xml');
    if (!(await exists(file))) return {};
    const doc = parseXml(await readText(file));
    const out = {};
    for (const group of findAll(doc, 'group')) {
        const school = String(group.attr.school || '').toLowerCase();
        out[school] = childrenNamed(group, 'deck').map(d => {
            const cards = [];
            const re = /\((\d+)\+(\d+)\)/g;
            let m;
            while ((m = re.exec(d.attr.cards || ''))) cards.push({ gsid: Number(m[1]), count: Number(m[2]) });
            return { from: numberish(d.attr.gearscore_from), to: numberish(d.attr.gearscore_to), style: d.attr.style, cards };
        });
    }
    return out;
}

async function exportHpTable(configDir) {
    const file = path.join(configDir, 'HP', 'HP_level_mapping.xml');
    if (!(await exists(file))) return {};
    const doc = parseXml(await readText(file));
    const out = {};
    for (const p of findAll(doc, 'pair')) out[Number(p.attr.level)] = Number(p.attr.hp);
    return out;
}

// ---------------------------------------------------------------------------
// gsid → cardkey（尽力而为）：Others/*_skill_extendcost.txt 的 ex_name 含 "Get_<gsid>_..._<KeyHint>"
// 品质前缀：41xxx Green / 42xxx Blue / 43xxx Purple / 44xxx Orange 对应 key 后缀
// ---------------------------------------------------------------------------

async function exportGsidMap(configDir, version, cards, warnings) {
    const file = path.join(configDir, 'Others', `${version}_skill_extendcost.txt`);
    const map = {};
    const hints = {};
    if (await exists(file)) {
        let text;
        try { text = await readText(file, 'gbk'); } catch { text = await readText(file, 'utf8'); }
        for (const line of text.split(/\r?\n/)) {
            if (!line || line.startsWith('#')) continue;
            const cells = line.split('\t');
            const gsid = Number(cells[2]);
            const exName = cells.find(c => /^Get_\d+_/.test(c)) || '';
            const m = /^Get_(\d+)_(?:thisClass|otherClass)_(?:CardQualification_)?(.+)$/.exec(exName);
            if (gsid && m) hints[gsid] = m[2];
        }
    }
    const keys = Object.keys(cards);
    const lowerIndex = new Map(keys.map(k => [k.toLowerCase(), k]));
    function matchHint(hint) {
        if (!hint) return null;
        const h = hint.toLowerCase();
        if (lowerIndex.has(h)) return lowerIndex.get(h);
        // 提示去掉系前缀后与 key 结尾匹配（如 Ice_GlobalShield ↔ Ice_IceGlobalShield）
        const parts = h.split('_');
        const tail = parts.slice(1).join('_');
        const cands = keys.filter(k => k.toLowerCase().endsWith(tail) && k.toLowerCase().startsWith(parts[0] + '_'));
        if (cands.length === 1) return cands[0];
        if (cands.length > 1) {
            const exact = cands.find(k => !/_(green|blue|purple|orange)$/i.test(k));
            return exact || cands[0];
        }
        return null;
    }
    const qualitySuffix = { 41: '_Green', 42: '_Blue', 43: '_Purple', 44: '_Orange' };
    let resolved = 0;
    for (const [gsidStr, hint] of Object.entries(hints)) {
        const gsid = Number(gsidStr);
        const base = matchHint(hint);
        if (!base) continue;
        map[gsid] = base;
        resolved++;
        for (const [prefix, suffix] of Object.entries(qualitySuffix)) {
            const q = Number(prefix) * 1000 + (gsid % 1000);
            const qKey = base + suffix;
            if (cards[qKey]) { map[q] = qKey; resolved++; }
        }
    }
    // 直接标注 gsid 的卡
    for (const c of Object.values(cards)) if (c.gsid && !map[c.gsid]) { map[c.gsid] = c.key; resolved++; }
    return { map, hintCount: Object.keys(hints).length, resolved };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function exportVersion(args, version) {
    const warnings = [];
    const outDir = path.join(args.out, version);
    await mkdir(outDir, { recursive: true });
    const t0 = Date.now();

    const { cards, typeCount, listed, missing } = await exportCards(args.config, version, warnings, args.verbose);
    const charms = await exportCharms(args.config, version, warnings);
    const aiDecks = await exportAiDecks(args.config, warnings);
    const statsByGear = await exportStatsByGear(args.config, version);
    const aiDeckByGear = await exportAiDeckByGear(args.config, version);
    const hpTable = await exportHpTable(args.config);
    const gsid = await exportGsidMap(args.config, version, cards, warnings);

    // 用 gsid 映射把 AIDeckByGear 转成 cardkey 卡组
    for (const decks of Object.values(aiDeckByGear)) {
        for (const d of decks) {
            d.deck = d.cards.map(c => ({ key: gsid.map[c.gsid] || null, gsid: c.gsid, count: c.count }));
            d.resolvedRatio = d.deck.length ? d.deck.filter(x => x.key).length / d.deck.length : 0;
        }
    }

    const write = (name, obj) => writeFile(path.join(outDir, name), JSON.stringify(obj, null, 1), 'utf8');
    await write('cards.json', cards);
    await write('charms.json', charms);
    await write('ai_decks.json', aiDecks);
    await write('stats_by_gear.json', statsByGear);
    await write('ai_deck_by_gear.json', aiDeckByGear);
    await write('hp_table.json', hpTable);
    await write('gsid_map.json', gsid.map);

    const manifest = {
        version,
        name: `${version} (config/Aries)`,
        generatedAt: new Date().toISOString(),
        source: args.config,
        files: {
            cards: 'cards.json', charms: 'charms.json', aiDecks: 'ai_decks.json', statsByGear: 'stats_by_gear.json',
            aiDeckByGear: 'ai_deck_by_gear.json', hpTable: 'hp_table.json', gsidMap: 'gsid_map.json',
        },
        counts: {
            cardsListed: listed, cardsMissing: missing, cards: Object.keys(cards).length,
            charms: Object.keys(charms.charm).length, wards: Object.keys(charms.ward).length,
            miniauras: Object.keys(charms.miniaura).length, globalauras: Object.keys(charms.globalaura).length,
            aiDeckStyles: Object.keys(aiDecks).length, gsidHints: gsid.hintCount, gsidResolved: gsid.resolved,
        },
        cardTypes: typeCount,
        warnings: warnings.slice(0, 200),
    };
    await write('manifest.json', manifest);
    console.log(`[${version}] cards ${manifest.counts.cards}/${listed} (missing ${missing}), charms ${manifest.counts.charms}, wards ${manifest.counts.wards}, miniaura ${manifest.counts.miniauras}, aiDecks ${manifest.counts.aiDeckStyles}, gsid ${gsid.resolved}/${gsid.hintCount} hints, ${warnings.length} warnings, ${Date.now() - t0}ms → ${outDir}`);
    if (args.verbose) for (const w of warnings) console.log('  ! ' + w);
    return manifest;
}

const args = parseArgs(process.argv);
if (!(await exists(args.config))) {
    console.error(`config dir not found: ${args.config}`);
    process.exit(1);
}
const versions = args.version === 'both' ? ['kids', 'teen'] : [args.version];
for (const v of versions) await exportVersion(args, v);
