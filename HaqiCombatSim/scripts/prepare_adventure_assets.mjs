#!/usr/bin/env node
// Download only the exported chapter subset. Runtime never contacts the CDN.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateSync, inflateRawSync } from 'node:zlib';
import { validateMedia } from './lib/asset_decode.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = JSON.parse(await fs.readFile(path.join(root, 'data/adventure/assets.json')));
const check = process.argv.includes('--check');
const errors = [], rows = Object.values(assets);
let cursor = 0, ready = 0;
function decoded(row, data) {
    if (row.path.endsWith('.z')) {
        // ParaEngine .z assets are ZIP containers; older manifests may contain raw zlib.
        if (data.readUInt32LE(0) === 0x04034b50) {
            const method = data.readUInt16LE(8), size = data.readUInt32LE(18);
            const offset = 30 + data.readUInt16LE(26) + data.readUInt16LE(28);
            const payload = data.subarray(offset, offset + size);
            if (method !== 0 && method !== 8) throw new Error('Unsupported ZIP method');
            data = method === 8 ? inflateRawSync(payload) : payload;
        } else data = inflateSync(data);
    }
    validateMedia(row.local,data);
    return data;
}
async function worker() {
    while (cursor < rows.length) {
        const row = rows[cursor++], file = path.join(root, row.local);
        try {
            let data;
            try { data = await fs.readFile(file); } catch {}
            if (data && row.path.endsWith('.p') && createHash('md5').update(data).digest('hex') !== row.md5) data = null;
            if (!data) {
                if (check) throw new Error('Missing or mismatched local file');
                let last;
                for (let attempt = 0; attempt < 3; attempt++) {
                    try {
                        const response = await fetch(row.url, { signal: AbortSignal.timeout(25000) });
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        data = Buffer.from(await response.arrayBuffer());
                        if (data.length !== row.size || createHash('md5').update(data).digest('hex') !== row.md5) throw new Error('Manifest checksum mismatch');
                        data = decoded(row, data); last = null; break;
                    } catch (e) { last = e; }
                }
                if (last) throw last;
                await fs.mkdir(path.dirname(file), { recursive: true });
                await fs.writeFile(file, data);
            } else validateMedia(row.local,data);
            ready++;
        } catch (e) { errors.push({ path: row.path, optional: row.optional, error: e.message }); }
    }
}
await Promise.all(Array.from({ length: 6 }, worker));
for (const name of ['sprites','creatures']) validateMedia(name+'.png',await fs.readFile(path.join(root,'assets/adventure',name+'.png')));
console.log(`${ready}/${rows.length} chapter assets verified locally.`);
for (const e of errors) console.error(`${e.optional ? 'Optional' : 'Required'}: ${e.path}: ${e.error}`);
if (errors.some(e => !e.optional)) process.exitCode = 1;
