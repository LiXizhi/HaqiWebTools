import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {HeroRenderer} from '../js/hero_renderer.js';
import {validHeroBodyId} from '../js/hero_body_core.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
const manifest=read('../data/hero-preview.json'),personas=read('../data/ai-personas.json');
test('AI personas are independent selectable heads and bodies with verified shared WebP',()=>{
 for(const {headId,bodyId} of Object.values(personas.characters)){
  assert.ok(validHeroBodyId(bodyId,'girl'));assert.equal(validHeroBodyId(bodyId,'boy'),false);
  const head=manifest.heads[headId],body=manifest.bodyVariants[bodyId];assert.equal(head.recommendedBodyId,bodyId);assert.ok(!body.recommendedHeadId);
  for(const art of [head,body]){const bytes=readFileSync(new URL('../'+art.local,import.meta.url));assert.ok(bytes.length<=200000);assert.equal(createHash('sha256').update(bytes).digest('hex'),art.sha256);assert.match(art.cdn,/^https:\/\/cdn.keepwork.com\//);}
 }
});
test('all persona combinations use their own frame anchors and stay grounded',()=>{
 const r=new HeroRenderer(manifest,{mounts:[]});
 for(const p of Object.values(personas.characters)){r.images.set('head:'+p.headId,{id:p.headId});r.images.set('walk:'+p.bodyId,{id:p.bodyId});}
 for(const {headId} of Object.values(personas.characters))for(const {bodyId} of Object.values(personas.characters))for(let facing=0;facing<4;facing++)for(let frame=-1;frame<6;frame++){
  const draws=[],c={save(){},restore(){},translate(){},scale(){},rotate(){},drawImage(...a){draws.push(a);}};
  const result=r.draw(c,{gender:'female',headId,bodyId},{facing,moving:frame>=0,walkTime:Math.max(0,frame)/10+.001});
  assert.ok(result.ready);assert.equal(draws[0][0].id,bodyId);assert.equal(draws[1][0].id,headId);
  const geometry=manifest.bodyVariants[bodyId].geometry,f=frame<0?geometry.frames[facing]:geometry.walk.frames[facing*6+frame];
  assert.ok(Math.abs(result.bodyRect.y+f.footY*result.bodyRect.h/f.crop[3])<1e-8);
 }
});
