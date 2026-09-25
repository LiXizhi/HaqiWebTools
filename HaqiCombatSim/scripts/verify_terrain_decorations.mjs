import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),file=new URL('data/adventure/terrain-decoration-art.json',root);
const manifest=JSON.parse(await fs.readFile(file));
const uploaded={
    meadow:'https://cdn.keepwork.com/keepwork/haqi/adventure/environment/terrain-meadow-20b11df57136.webp',
    stones:'https://cdn.keepwork.com/keepwork/haqi/adventure/environment/terrain-stones-06b3275c7e1a.webp',
    shore:'https://cdn.keepwork.com/keepwork/haqi/adventure/environment/terrain-shore-1307b6047bc4.webp',
};
for(const [id,row] of Object.entries(manifest.atlases)){
    const bytes=await fs.readFile(new URL(row.local,root));
    if(bytes.length>200000||bytes.length!==row.size||createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw Error(`本地资源校验失败：${id}`);
    const response=await fetch(uploaded[id],{headers:{Origin:'http://127.0.0.1:8791'},signal:AbortSignal.timeout(30000)});
    if(!response.ok||!['*','http://127.0.0.1:8791'].includes(response.headers.get('access-control-allow-origin')))throw Error(`CDN HTTP/CORS 校验失败：${id}`);
    const remote=Buffer.from(await response.arrayBuffer());
    if(!bytes.equals(remote))throw Error(`CDN 内容不符：${id}`);
    row.cdn=uploaded[id];console.log(`${id}: ${row.size} bytes, HTTP/CORS/SHA-256 verified`);
}
await fs.writeFile(file,JSON.stringify(manifest,null,2)+'\n');
