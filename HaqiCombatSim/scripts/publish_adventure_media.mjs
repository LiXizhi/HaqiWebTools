#!/usr/bin/env node
// Prepare a concrete upload directory, or verify URLs before recording them. Never holds credentials.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'data/adventure/media.json');
const media=JSON.parse(await fs.readFile(file));
const prefix='keepwork/haqi-adventure/v1/';
const staging=path.join(root,'.asset-cache/publish');
const rows=Object.entries(media.entries).map(([id,row])=>({id,local:row.local,sha256:row.sha256,size:row.size,key:prefix+row.sha256+path.extname(row.local)}));
for(const row of rows)row.url='https://cdn.keepwork.com/'+row.key;
if(!process.argv.includes('--verify')) {
    await fs.mkdir(staging,{recursive:true});
    for(const row of rows){const data=await fs.readFile(path.join(root,row.local));if(createHash('sha256').update(data).digest('hex')!==row.sha256)throw new Error('Local hash mismatch');await fs.writeFile(path.join(staging,path.basename(row.key)),data);}
    await fs.writeFile(path.join(root,'data/adventure/cdn-publish-plan.json'),JSON.stringify({prefix,files:rows},null,2)+'\n');
    console.log(`${rows.length} files (${rows.reduce((n,r)=>n+r.size,0)} bytes) prepared at ${staging}`);
    console.log('Upload these files with the Maisi uploader; final URLs are in data/adventure/cdn-publish-plan.json.');
} else {
    let cursor=0;const failures=[];
    await Promise.all(Array.from({length:6},async()=>{while(cursor<rows.length){const row=rows[cursor++];try{
        const r=await fetch(row.url,{headers:{Origin:'http://127.0.0.1:8791'},signal:AbortSignal.timeout(30000)});
        if(!r.ok)throw new Error(`HTTP ${r.status}`);
        if(!['*','http://127.0.0.1:8791'].includes(r.headers.get('access-control-allow-origin')))throw new Error('CORS');
        const bytes=Buffer.from(await r.arrayBuffer());
        if(bytes.length!==row.size||createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw new Error('Checksum');
        media.entries[row.id].cdn=row.url;
    }catch(e){failures.push(`${row.id}: ${e.message}`);}}}));
    if(failures.length)throw new Error(failures.join('\n'));
    await fs.writeFile(file,JSON.stringify(media,null,2)+'\n');
    console.log(`${rows.length} permanent CDN URLs verified (HTTP, CORS, bytes, SHA-256) and recorded.`);
}
