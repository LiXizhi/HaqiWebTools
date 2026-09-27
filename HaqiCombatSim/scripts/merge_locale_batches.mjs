import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { formatLocaleLine, isLocaleComment, splitLocaleLine } from '../js/locale_core.js';

const manifest = JSON.parse(readFileSync('tmp/locale-batches/manifest.json', 'utf8'));
const byKey = new Map();
const missing = [];
const bad = [];

for (const batch of manifest.batches) {
    const path = `tmp/locale-batches/${batch.output}`;
    if (!existsSync(path)) {
        missing.push(batch.id);
        continue;
    }
    const data = JSON.parse(readFileSync(path, 'utf8'));
    const rows = Array.isArray(data.entries) ? data.entries : [];
    for (const row of rows) {
        if (!row || typeof row.key !== 'string') {
            bad.push({ batch: batch.id, reason: 'missing key' });
            continue;
        }
        if (typeof row.ja !== 'string' || typeof row.ko !== 'string') {
            bad.push({ batch: batch.id, key: row.key, reason: 'missing ja/ko' });
            continue;
        }
        byKey.set(row.key, { ja: row.ja, ko: row.ko });
    }
}

const enText = readFileSync('data/adventure/locale/en.txt', 'utf8');
const enLines = enText.split(/\r?\n/);
const jaLines = [];
const koLines = [];
let covered = 0;
let emptyEnKept = 0;
const uncovered = [];

for (const line of enLines) {
    if (!line.trim()) {
        jaLines.push('');
        koLines.push('');
        continue;
    }
    if (isLocaleComment(line)) {
        jaLines.push(line);
        koLines.push(line);
        continue;
    }
    const pair = splitLocaleLine(line);
    if (!pair) {
        jaLines.push(line);
        koLines.push(line);
        continue;
    }
    if (!pair.value) {
        // Keep intentionally empty English keys empty in JA/KO too.
        jaLines.push(formatLocaleLine(pair.key, ''));
        koLines.push(formatLocaleLine(pair.key, ''));
        emptyEnKept += 1;
        covered += 1;
        continue;
    }
    const hit = byKey.get(pair.key);
    if (!hit) {
        uncovered.push(pair.key);
        jaLines.push(formatLocaleLine(pair.key, ''));
        koLines.push(formatLocaleLine(pair.key, ''));
        continue;
    }
    jaLines.push(formatLocaleLine(pair.key, hit.ja));
    koLines.push(formatLocaleLine(pair.key, hit.ko));
    covered += 1;
}

writeFileSync('data/adventure/locale/ja.txt', `${jaLines.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
writeFileSync('data/adventure/locale/ko.txt', `${koLines.join('\n').replace(/\n+$/, '')}\n`, 'utf8');

const report = {
    batchesMissing: missing,
    badRows: bad.length,
    covered,
    uncovered: uncovered.length,
    emptyEnKept,
    sampleUncovered: uncovered.slice(0, 20),
};
writeFileSync('tmp/locale-batches/merge-report.json', JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (missing.length || uncovered.length || bad.length) process.exit(1);
