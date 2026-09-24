// Compare Chinese UI strings in an allowlisted set of files with locale dictionaries.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffLocaleLines, parseLocaleFile } from '../js/locale_core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CJK = /[\u4e00-\u9fff]/;

function decodeEscape(text, i) {
    const ch = text[i] || '';
    if (ch === 'n') return { value: '\n', next: i + 1 };
    if (ch === 'r') return { value: '\r', next: i + 1 };
    if (ch === 't') return { value: '\t', next: i + 1 };
    if (ch === 'u' && /^[0-9a-fA-F]{4}/.test(text.slice(i + 1, i + 5))) {
        return { value: String.fromCharCode(Number.parseInt(text.slice(i + 1, i + 5), 16)), next: i + 5 };
    }
    return { value: ch, next: i + 1 };
}

export function extractJsStrings(source) {
    const text = String(source || '');
    const found = [];
    let i = 0;
    let line = 1;
    const bump = ch => { if (ch === '\n') line += 1; };
    const push = (value, at, dynamic) => {
        if (!CJK.test(value)) return;
        found.push({ text: value, line: at, dynamic });
    };
    while (i < text.length) {
        const ch = text[i];
        if (ch === '/' && text[i + 1] === '/') {
            while (i < text.length && text[i] !== '\n') i += 1;
            continue;
        }
        if (ch === '/' && text[i + 1] === '*') {
            i += 2;
            while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) bump(text[i++]);
            i += 2;
            continue;
        }
        if (ch === '\'' || ch === '"') {
            const at = line;
            const quote = ch;
            i += 1;
            let value = '';
            while (i < text.length && text[i] !== quote) {
                if (text[i] === '\\') {
                    bump(text[i]);
                    const decoded = decodeEscape(text, i + 1);
                    value += decoded.value;
                    for (let cursor = i + 1; cursor < decoded.next; cursor += 1) bump(text[cursor]);
                    i = decoded.next;
                    continue;
                }
                value += text[i];
                bump(text[i]);
                i += 1;
            }
            i += 1;
            push(value, at, false);
            continue;
        }
        if (ch === '`') {
            const at = line;
            i += 1;
            let value = '';
            let dynamic = false;
            while (i < text.length && text[i] !== '`') {
                if (text[i] === '\\') {
                    bump(text[i]);
                    const decoded = decodeEscape(text, i + 1);
                    value += decoded.value;
                    for (let cursor = i + 1; cursor < decoded.next; cursor += 1) bump(text[cursor]);
                    i = decoded.next;
                    continue;
                }
                if (text[i] === '$' && text[i + 1] === '{') {
                    dynamic = true;
                    value += '${';
                    i += 2;
                    let depth = 1;
                    while (i < text.length && depth) {
                        const cur = text[i];
                        if (cur === '\'' || cur === '"' || cur === '`') {
                            const q = cur;
                            value += cur;
                            bump(cur);
                            i += 1;
                            while (i < text.length && text[i] !== q) {
                                value += text[i];
                                if (text[i] === '\\' && i + 1 < text.length) {
                                    bump(text[i]);
                                    i += 1;
                                    value += text[i];
                                }
                                bump(text[i]);
                                i += 1;
                            }
                            if (i < text.length) { value += text[i]; bump(text[i]); i += 1; }
                            continue;
                        }
                        if (cur === '{') depth += 1;
                        if (cur === '}') depth -= 1;
                        if (depth) value += cur;
                        bump(cur);
                        i += 1;
                    }
                    value += '}';
                    continue;
                }
                value += text[i];
                bump(text[i]);
                i += 1;
            }
            i += 1;
            push(value, at, dynamic);
            continue;
        }
        bump(ch);
        i += 1;
    }
    return found;
}

export function extractJsonStrings(value, fields = null) {
    const wanted = fields?.length ? new Set(fields) : null;
    const found = [];
    const walk = (node, key) => {
        if (typeof node === 'string') {
            if ((!wanted || wanted.has(key)) && CJK.test(node)) found.push(node);
            return;
        }
        if (Array.isArray(node)) { node.forEach(item => walk(item, key)); return; }
        if (node && typeof node === 'object') {
            for (const [childKey, child] of Object.entries(node)) walk(child, childKey);
        }
    };
    walk(value, '');
    return found;
}

function matchName(name, pattern) {
    const body = pattern.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${body}$`).test(name);
}

export function filesFromManifest(manifest, baseDir = root) {
    const files = [];
    const add = (rel, kind, fields) => {
        const abs = path.resolve(baseDir, rel);
        files.push({ rel: rel.split(path.sep).join('/'), abs, kind, fields: fields || null });
    };
    for (const rel of manifest.files || []) add(rel, kindOf(rel), null);
    for (const dir of manifest.dirs || []) {
        if (dir.enabled === false) continue;
        const absDir = path.resolve(baseDir, dir.path);
        const include = dir.include?.length ? dir.include : ['*'];
        for (const name of readdirSync(absDir)) {
            if (!include.some(pattern => matchName(name, pattern))) continue;
            const rel = path.posix.join(dir.path.split(path.sep).join('/'), name);
            const abs = path.join(absDir, name);
            if (!statSync(abs).isFile()) continue;
            add(rel, dir.kind || kindOf(name), dir.fields || null);
        }
    }
    for (const entry of manifest.json || []) {
        if (entry.enabled === false) continue;
        add(entry.path, 'json', entry.fields || null);
    }
    const seen = new Set();
    return files.filter(file => {
        if (seen.has(file.rel)) return false;
        seen.add(file.rel);
        return true;
    });
}

function kindOf(rel) {
    return rel.endsWith('.json') ? 'json' : 'js';
}

export function scanSources(files) {
    const staticHits = new Map();
    const dynamicHits = [];
    for (const file of files) {
        const source = readFileSync(file.abs, 'utf8');
        if (file.kind === 'json') {
            const values = extractJsonStrings(JSON.parse(source), file.fields);
            values.forEach((text, index) => {
                if (!staticHits.has(text)) staticHits.set(text, { file: file.rel, line: index + 1 });
            });
            continue;
        }
        for (const hit of extractJsStrings(source)) {
            if (hit.dynamic) dynamicHits.push({ ...hit, file: file.rel });
            else if (!staticHits.has(hit.text)) staticHits.set(hit.text, { file: file.rel, line: hit.line });
        }
    }
    return { staticHits, dynamicHits };
}

export function compareToLocale(staticHits, dynamicHits, localeText) {
    const table = parseLocaleFile(localeText);
    const keys = Object.keys(table);
    const missing = [...staticHits.entries()]
        .filter(([text]) => !Object.hasOwn(table, text))
        .map(([text, where]) => ({ text, ...where }))
        .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.text.localeCompare(b.text, 'zh'));
    const dynamicText = dynamicHits.map(hit => hit.text);
    const stale = keys.filter(key => !staticHits.has(key)).map(key => ({
        key,
        inDynamic: dynamicText.some(text => text.includes(key)),
    }));
    return { missing, stale, keyCount: keys.length };
}

function loadManifest(manifestPath) {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

export function runScan({ manifestPath, baseDir = root } = {}) {
    const manifest = loadManifest(manifestPath);
    const files = filesFromManifest(manifest, baseDir).filter(file => existsSync(file.abs));
    const missingFiles = filesFromManifest(manifest, baseDir).filter(file => !existsSync(file.abs));
    const { staticHits, dynamicHits } = scanSources(files);
    const localeDir = path.resolve(baseDir, manifest.localeDir || 'data/adventure/locale');
    const baseName = manifest.base || 'en.txt';
    const basePath = path.join(localeDir, baseName);
    const compared = compareToLocale(staticHits, dynamicHits, readFileSync(basePath, 'utf8'));
    const others = existsSync(localeDir)
        ? readdirSync(localeDir).filter(name => name.endsWith('.txt') && name !== baseName).sort()
        : [];
    const localeDiffs = others.map(name => {
        const diff = diffLocaleLines(readFileSync(basePath, 'utf8'), readFileSync(path.join(localeDir, name), 'utf8'));
        return { name, ...diff };
    });
    return { files, missingFiles, staticHits, dynamicHits, ...compared, baseName, localeDiffs };
}

function printReport(report) {
    console.log(`扫描 ${report.files.length} 个文件，静态句子 ${report.staticHits.size}，动态句子 ${report.dynamicHits.length}`);
    if (report.missingFiles.length) {
        console.log(`清单里找不到 ${report.missingFiles.length} 个路径`);
        for (const file of report.missingFiles) console.log(`  ${file.rel}`);
    }
    console.log(`词典 ${report.baseName} 有 ${report.keyCount} 条`);
    console.log(`源码有、词典没有 ${report.missing.length}`);
    for (const row of report.missing) console.log(`  ${row.file}:${row.line}  ${row.text}`);
    console.log(`词典有、源码没有 ${report.stale.length}`);
    for (const row of report.stale) console.log(`  ${row.key}${row.inDynamic ? '  （出现在动态句子中）' : ''}`);
    console.log(`动态句子 ${report.dynamicHits.length}（含变量，不要原样写入词典）`);
    for (const row of report.dynamicHits) console.log(`  ${row.file}:${row.line}  ${row.text}`);
    if (!report.localeDiffs.length) console.log('没有其他语言文件');
    for (const diff of report.localeDiffs) {
        console.log(`${diff.name} 相对 ${report.baseName}：缺少 ${diff.missing.length}，多出 ${diff.extra.length}`);
        for (const key of diff.missing) console.log(`  - ${key}`);
        for (const key of diff.extra) console.log(`  + ${key}`);
    }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const args = process.argv.slice(2);
    const pathFlag = args.indexOf('--paths');
    const manifestPath = pathFlag >= 0
        ? path.resolve(args[pathFlag + 1])
        : path.join(root, '.cursor/skills/locale-scan/scan-paths.json');
    const report = runScan({ manifestPath });
    printReport(report);
    const check = args.includes('--check');
    if (check && (report.missing.length || report.stale.length || report.missingFiles.length)) process.exit(1);
}
