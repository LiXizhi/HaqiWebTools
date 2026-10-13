// Install only real uploader-returned, hash-verified URLs. Never infer CDN paths.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const args=process.argv.slice(2),logArg=args.indexOf('--upload-log');
assert.ok(logArg>=0&&args[logArg+1],'Pass --upload-log with actual successful uploader output');
const log=fs.readFileSync(path.resolve(args[logArg+1]),'utf8');
const urls=[...new Set(log.match(/https:\/\/cdn\.keepwork\.com\/[^\s]+\.webp/g)||[])];
const prompts=read('data/adventure/island-map-repaint-prompts.json');
const checked=await Promise.allSettled(prompts.islands.map(async p=>{
    const row=read(`.cache/registered-islands/${p.id}-resource.json`),bytes=fs.readFileSync(path.join(root,row.local));
    assert.equal(sha(bytes),row.sha256);assert.equal(bytes.length,row.size);assert.ok(row.size<=200000);
    assert.equal(sha(fs.readFileSync(path.join(root,row.source.layout))),row.source.layoutSha256,'Layout changed after art generation');
    const matches=urls.filter(url=>new URL(url).pathname.endsWith('/'+path.basename(row.local)));assert.equal(matches.length,1,'Missing or ambiguous uploaded URL: '+p.id);
    const response=await fetch(matches[0],{headers:{Origin:'http://127.0.0.1:8765'},signal:AbortSignal.timeout(45000)});assert.ok(response.ok,`CDN ${p.id}: ${response.status}`);
    assert.equal(sha(Buffer.from(await response.arrayBuffer())),row.sha256,'CDN hash '+p.id);
    assert.equal(response.headers.get('access-control-allow-origin'),'*','Canvas CORS '+p.id);
    row.cdn=matches[0];row.source.styleReference=p.styleReference;row.source.styleReferenceSha256=sha(fs.readFileSync(path.join(root,p.styleReference)));
    return {id:p.id,row};
}));
const errors=checked.filter(r=>r.status==='rejected');if(errors.length){for(const r of errors)console.error(r.reason);throw Error('No runtime files written: asset verification failed');}
const atlas=read('data/adventure/world-map-art.json');
for(const {value:{id,row}} of checked){
    const island=atlas.islands.find(i=>i.id===id);assert.ok(island,id);
    atlas.resources[id]=row;island.resource=id;island.rect=row.frames[id].rect;island.detailStyle='illustration';
}
fs.writeFileSync(path.join(root,'data/adventure/world-map-art.json'),JSON.stringify(atlas,null,2)+'\n');
const report=checked.map(({value:{id,row}})=>({id,local:row.local,cdn:row.cdn,width:row.width,height:row.height,size:row.size,sha256:row.sha256,cors:'*'}));
fs.writeFileSync(path.join(root,'.cache/registered-islands/cdn-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
