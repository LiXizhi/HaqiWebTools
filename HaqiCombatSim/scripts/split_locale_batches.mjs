import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { isLocaleComment, splitLocaleLine } from '../js/locale_core.js';

const text = readFileSync('data/adventure/locale/en.txt', 'utf8');
const lines = text.split(/\r?\n/);
let section = 'unknown';
const entries = [];

for (const line of lines) {
    if (isLocaleComment(line)) {
        section = line.trim().replace(/^#\s*/, '');
        continue;
    }
    if (!line.trim()) continue;
    const pair = splitLocaleLine(line);
    if (!pair) continue;
    entries.push({ key: pair.key, en: pair.value, section });
}

const outDir = 'tmp/locale-batches';
rmSync(outDir, { recursive: true, force: true });
mkdirSync(`${outDir}/in`, { recursive: true });
mkdirSync(`${outDir}/out`, { recursive: true });

const BATCH_SIZE = 120;
const batches = [];

for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const chunk = entries.slice(i, i + BATCH_SIZE);
    const id = String(batches.length).padStart(3, '0');
    const sections = [...new Set(chunk.map(row => row.section))];
    const payload = {
        id,
        sections,
        count: chunk.length,
        entries: chunk.map(({ key, en, section: src }) => ({ key, en, section: src })),
    };
    writeFileSync(`${outDir}/in/batch_${id}.json`, JSON.stringify(payload, null, 2), 'utf8');
    batches.push({
        id,
        count: chunk.length,
        sections,
        input: `in/batch_${id}.json`,
        output: `out/batch_${id}.json`,
    });
}

writeFileSync(`${outDir}/manifest.json`, JSON.stringify({
    totalKeys: entries.length,
    batchCount: batches.length,
    batchSize: BATCH_SIZE,
    batches,
}, null, 2), 'utf8');

console.log(JSON.stringify({
    totalKeys: entries.length,
    batchCount: batches.length,
    batchSize: BATCH_SIZE,
}, null, 2));
