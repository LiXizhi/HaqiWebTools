import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),file=new URL('data/kids/spell-art.json',root),data=JSON.parse(await fs.readFile(file));
const rows=Object.values(data.bases).filter(r=>!r.system),prefix='keepwork/haqi-adventure/spells/';
if(process.argv.includes('--verify')) {
 let cursor=0;await Promise.all(Array.from({length:6},async()=>{while(cursor<rows.length){const row=rows[cursor++],url='https://cdn.keepwork.com/'+prefix+'spell-publish/'+row.sha256+'.webp';const r=await fetch(url,{headers:{Origin:'http://127.0.0.1:8791'},signal:AbortSignal.timeout(30000)});if(!r.ok||!['*','http://127.0.0.1:8791'].includes(r.headers.get('access-control-allow-origin')))throw new Error('CDN HTTP/CORS failure: '+url);const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length!==row.size||createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw new Error('CDN hash mismatch');row.cdn=url;}}));
 await fs.writeFile(file,JSON.stringify(data,null,2)+'\n');console.log(rows.length+' card faces verified and recorded');
} else {
 const dir=new URL('.asset-cache/spell-publish/',root);await fs.mkdir(dir,{recursive:true});
 for(const row of rows){const bytes=await fs.readFile(new URL(row.local,root));if(bytes.length>200000||createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw new Error('Invalid local card');await fs.writeFile(new URL(row.sha256+'.webp',dir),bytes);}
 console.log(rows.length+' card faces prepared in '+dir.pathname+'; prefix '+prefix);
}
