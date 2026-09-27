import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewBodyManifest} from '../js/hero_preview_variants_core.js';
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
test('preview costume reuses every original pose and leaves production metadata untouched',()=>{
 const base=read('../data/hero-preview.json'),before=structuredClone(base);
 const variant=read('../art-references/hero-body-variants.json').variants.male2;
 const result=previewBodyManifest(base,variant);
 assert.deepEqual(base,before);
 assert.deepEqual(result.bodies['male-walk'].frames,base.bodies['male-walk'].frames);
 assert.deepEqual(result.bodies['male-walk'].walk.frames,base.bodies['male-walk'].walk.frames);
 assert.deepEqual(result.bodies['female-walk'],base.bodies['female-walk']);
 assert.deepEqual(result.heads,base.heads);
 assert.equal(result.bodies['male-walk'].local,variant.local);
 assert.equal(result.bodies['male-walk'].walk.local,variant.local);
 assert.throws(()=>previewBodyManifest(base,{...variant,width:1}),/尺寸/);
});
