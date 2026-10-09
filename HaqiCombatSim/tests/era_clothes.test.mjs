import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validHeroBodyId,resolvedBodyId} from '../js/hero_body_core.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
test('shared era outfits survive save validation and use both registered atlases',()=>{
 const art=read('../art-references/era-clothes.json'),preview=read('../data/hero-preview.json'),game=read('../data/adventure/hero-art.json');
 assert.equal(Object.keys(art.variants).length,16);
 for(const [id,v] of Object.entries(art.variants)){
  const appearance=v.gender==='female'?'girl':'boy';
  assert.ok(validHeroBodyId(id,appearance));assert.equal(resolvedBodyId({appearance,bodyId:id}),id);
  assert.equal(validHeroBodyId(id,appearance==='girl'?'boy':'girl'),false);
  assert.equal(game.bodyVariants[id].sha256,v.sha256);assert.equal(preview.bodyVariants[id].cdn,v.cdn);
  const raw=readFileSync(new URL('../'+v.local,import.meta.url));assert.ok(raw.length<=200000);
  assert.equal(createHash('sha256').update(raw).digest('hex'),v.sha256);
 }
 assert.equal(validHeroBodyId('era-2030-male','boy'),false);
});
test('seasonal childhood wardrobe is complete and survives gender-safe save IDs',()=>{
 const art=read('../art-references/child-clothes.json'),game=read('../data/adventure/hero-art.json'),preview=read('../data/hero-preview.json');
 assert.equal(Object.keys(art.variants).length,32);
 for(const year of [1950,1960,1970,1980])for(const season of ['spring','summer','autumn','winter'])for(const gender of ['male','female']){
  const id=`child-${year}-${season}-${gender}`,v=art.variants[id],appearance=gender==='female'?'girl':'boy';
  assert.ok(v);assert.ok(validHeroBodyId(id,appearance));assert.equal(resolvedBodyId({appearance,bodyId:id}),id);
  assert.equal(validHeroBodyId(id,appearance==='girl'?'boy':'girl'),false);
  assert.equal(game.bodyVariants[id].cdn,v.cdn);assert.equal(preview.bodyVariants[id].sha256,v.sha256);
  const raw=readFileSync(new URL('../'+v.local,import.meta.url));assert.ok(raw.length<=200000);assert.equal(createHash('sha256').update(raw).digest('hex'),v.sha256);
 }
 assert.equal(validHeroBodyId('child-1990-spring-male','boy'),false);assert.equal(validHeroBodyId('child-1950-rain-female','girl'),false);
});
