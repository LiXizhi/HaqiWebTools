import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HeroRenderer} from '../js/hero_renderer.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const manifest=read('../data/hero-preview.json'),catalog=read('../data/adventure/mount-catalog.json');

test('creation portraits keep all hairstyles and costumes inside the frame with aligned feet',()=>{
 const r=new HeroRenderer(manifest,catalog);
 for(const [key,b] of Object.entries(manifest.bodies)){
  r.images.set('body:'+(b.atlas||key),{});
  if(b.walk)r.images.set('walk:'+key.split('-')[0],{});
 }
 for(const id of Object.keys(manifest.bodyVariants))r.images.set('walk:'+id,{});
 for(const id of Object.keys(manifest.heads))r.images.set('head:'+id,{});
 let checked=0;
 for(const gender of ['male','female']){
  const heads=Object.values(manifest.heads).filter(h=>h.gender===gender);
  const bodies=[null,...Object.values(manifest.bodyVariants).filter(b=>b.gender===gender).map(b=>b.id)];
  for(const head of heads)for(const bodyId of bodies)for(let facing=0;facing<4;facing++){
   const ctx={save(){},restore(){},translate(){},scale(){},rotate(){},drawImage(){}};
   const result=r.draw(ctx,{gender,headId:head.id,bodyId},{facing,reducedMotion:true,lookAround:false,bodyRect:{x:0,y:0,w:192,h:224},portraitFrame:{w:192,h:224,padding:10}});
   const tag=`${gender}/${head.id}/${bodyId}/${facing}`;
   assert.ok(result.ready,tag);const b=result.portraitBounds;assert.ok(b,tag);
   assert.ok(b.x>=9.999&&b.y>=9.999,tag+' top/left crop');
   assert.ok(b.x+b.w<=182.001&&b.y+b.h<=214.001,tag+' bottom/right crop');
   assert.ok(Math.abs(b.y+b.h-214)<.001,tag+' feet baseline');
   assert.ok(Math.abs(b.x+b.w/2-96)<.001,tag+' horizontal centering');
   checked++;
  }
 }
 assert.ok(checked>1000,'exercise actual catalog combinations');
});
