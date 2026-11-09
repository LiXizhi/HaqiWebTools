import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {checkRuneSource} from '../scripts/check_rune_source.mjs';

test('source verification requires matching actual bytes and rejects absent or changed sources',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'haqi-rune-source-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const sourcePath=path.join(dir,'RuneList.xml'),catalogPath=path.join(dir,'runes.json');
 const xml='<runes><rune gsid="23439" /></runes>';
 fs.writeFileSync(sourcePath,xml);
 const digest=createHash('sha256').update(xml).digest('hex');
 fs.writeFileSync(catalogPath,JSON.stringify({sources:{'config/Aries/Cards/RuneList.xml':digest}}));
 assert.equal(checkRuneSource({sourcePath,catalogPath}).sha256,digest);
 fs.writeFileSync(sourcePath,xml+' ');
 assert.throws(()=>checkRuneSource({sourcePath,catalogPath}),/哈希不一致/);
 assert.throws(()=>checkRuneSource({sourcePath:path.join(dir,'missing.xml'),catalogPath}),/缺少原版/);
 fs.writeFileSync(catalogPath,'{}');
 assert.throws(()=>checkRuneSource({sourcePath,catalogPath}),/有效的原版来源哈希/);
});
