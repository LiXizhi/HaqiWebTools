import { readFileSync, readdirSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('tmp/locale-batches/manifest.json', 'utf8'));
const placeholderRe = /\{[^{}]+\}/g;
const problems = [];
let done = 0;

for (const batch of manifest.batches) {
    let out;
    try {
        out = JSON.parse(readFileSync(`tmp/locale-batches/${batch.output}`, 'utf8'));
    } catch {
        continue;
    }
    done += 1;
    const input = JSON.parse(readFileSync(`tmp/locale-batches/${batch.input}`, 'utf8'));
    if (!Array.isArray(out.entries) || out.entries.length !== input.entries.length) {
        problems.push({ batch: batch.id, reason: `count ${out.entries?.length} != ${input.entries.length}` });
        continue;
    }
    for (let i = 0; i < input.entries.length; i += 1) {
        const src = input.entries[i];
        const dst = out.entries[i];
        if (dst.key !== src.key) {
            problems.push({ batch: batch.id, i, reason: 'key mismatch' });
            continue;
        }
        if (typeof dst.ja !== 'string' || typeof dst.ko !== 'string') {
            problems.push({ batch: batch.id, i, reason: 'ja/ko type' });
            continue;
        }
        if (!src.en) {
            if (dst.ja || dst.ko) problems.push({ batch: batch.id, i, reason: 'expected empty' });
            continue;
        }
        if (!dst.ja || !dst.ko) {
            problems.push({ batch: batch.id, i, reason: 'empty translation', key: src.key });
            continue;
        }
        const ph = src.key.match(placeholderRe) || [];
        for (const p of ph) {
            if (!dst.ja.includes(p) || !dst.ko.includes(p)) {
                problems.push({ batch: batch.id, i, reason: `missing ${p}`, key: src.key });
            }
        }
    }
}

console.log(JSON.stringify({
    batchesDone: done,
    batchesTotal: manifest.batchCount,
    problemCount: problems.length,
    problems: problems.slice(0, 40),
}, null, 2));
process.exit(done === manifest.batchCount && problems.length === 0 ? 0 : 1);
