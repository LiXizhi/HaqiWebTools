import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/adventure/home/catalog.json',import.meta.url))),rows=catalog.items.filter(i=>i.art.kind==='sprite'),seen=new Set();
for(const {id,art}of rows){if(seen.has(art.cdn))continue;seen.add(art.cdn);const response=await fetch(art.cdn,{signal:AbortSignal.timeout(20000),headers:{Origin:'http://127.0.0.1:8786'}});assert.ok(response.ok,`${id}: ${response.status}`);assert.equal(response.headers.get('access-control-allow-origin'),'*',`${id}: CORS`);const bytes=Buffer.from(await response.arrayBuffer());assert.ok(bytes.length<=200000,id);assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.equal(createHash('sha256').update(bytes).digest('hex'),art.sha256,id);console.log(`${id}: CDN / CORS / WebP / hash verified (${bytes.length})`);}
console.log(`${rows.length} references, ${seen.size} permanent CDN resources verified`);
