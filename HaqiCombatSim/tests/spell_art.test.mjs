import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {validateMedia} from '../scripts/lib/asset_decode.mjs';
import {assetUrl} from '../js/adventure_media_core.js';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root)));
test('every inventory base has a decoded, budgeted and traceable card face',()=>{
 const art=read('data/kids/spell-art.json'),effects=read('data/adventure/spell-effects.json');
 let original=0,adapted=0,system=0;
 assert.deepEqual(Object.keys(art.bases),Object.keys(effects.bases));
 for(const [base,row] of Object.entries(art.bases)) {
  if(row.system){assert.ok(row.reason);system++;continue;}
  const bytes=fs.readFileSync(new URL(assetUrl(row,'local'),root));assert.ok(bytes.length<=200000,base);assert.equal(bytes.length,row.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
  assert.ok(assetUrl(row,'cdn').endsWith(row.sha256+'.webp'));
  assert.deepEqual(validateMedia(row.local,bytes),{width:row.width,height:row.height});
  if(row.adaptation){assert.ok(row.missingSource);adapted++;}else{assert.ok(row.sourceEntry);original++;}
 }
 assert.equal(original,198);assert.equal(adapted,6);assert.equal(system,21);
});
