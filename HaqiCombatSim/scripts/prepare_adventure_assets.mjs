#!/usr/bin/env node
// Local WebP preparation is optional developer tooling; runtime has no build step.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { validateMediaManifest, assetUrl } from '../js/adventure_media_core.js';
import { validateMedia } from './lib/asset_decode.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv.includes('--check') && !process.argv.includes('--cdn')) {
    const result = spawnSync(process.env.HAQI_ASSET_PYTHON || 'python3', [path.join(root,'scripts/prepare_adventure_media.py')], {stdio:'inherit'});
    if (result.status !== 0) process.exit(result.status || 1);
}
const source = JSON.parse(await fs.readFile(path.join(root,'data/adventure/assets.json')));
const media = JSON.parse(await fs.readFile(path.join(root,'data/adventure/media.json')));
validateMediaManifest(media, source, process.argv.includes('--cdn') ? 'cdn' : 'local');
for (const [id,row] of Object.entries(media.entries)) {
    const data = await fs.readFile(path.join(root,row.local));
    if (data.length !== row.size || createHash('sha256').update(data).digest('hex') !== row.sha256) throw new Error(`Asset hash mismatch: ${id}`);
    const dimensions = validateMedia(row.local,data);
    if (dimensions && (dimensions.width !== row.width || dimensions.height !== row.height)) throw new Error(`Asset dimensions changed: ${id}`);
    if (process.argv.includes('--cdn')) {
        const response = await fetch(assetUrl(row,'cdn'),{headers:{Origin:'http://127.0.0.1:8791'},signal:AbortSignal.timeout(25000)});
        if (!response.ok || !['*','http://127.0.0.1:8791'].includes(response.headers.get('access-control-allow-origin'))) throw new Error(`CDN HTTP/CORS failure: ${id}`);
        const remote = Buffer.from(await response.arrayBuffer());
        if (createHash('sha256').update(remote).digest('hex') !== row.sha256) throw new Error(`CDN hash mismatch: ${id}`);
    }
}
console.log(`${Object.keys(media.entries).length} local assets verified${process.argv.includes('--cdn') ? '; CDN bytes and CORS verified' : ''}.`);
