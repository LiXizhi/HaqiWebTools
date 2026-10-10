import test from 'node:test';
import assert from 'node:assert/strict';
import {earthSeasonAt,earthNatureMonth,earthDecorationFrames as frames,earthDecorationSize,earthDecorationIsTree,NATURE_SEASONS} from '../js/adventure_earth_nature_core.js';
test('local season follows calendar, hemispheres and longitude at month boundaries',()=>{
 for(const [month,season] of [[2,'spring'],[5,'summer'],[8,'autumn'],[11,'winter']]){
  const at=Date.UTC(1951,month,15);assert.equal(earthSeasonAt(at,117,34),season);assert.equal(earthSeasonAt(at,151,-34),NATURE_SEASONS[(NATURE_SEASONS.indexOf(season)+2)%4]);
 }
 const at=Date.UTC(2026,8,1,0);assert.equal(earthSeasonAt(at,120,40),'autumn');assert.equal(earthSeasonAt(at,-120,40),'summer');assert.notEqual(earthNatureMonth(at,120),earthNatureMonth(at,-120));assert.equal(earthNatureMonth(at,540),earthNatureMonth(at,-180));
});
test('geographic and seasonal palettes exclude out-of-place palms, cactus, snow and autumn foliage',()=>{
 assert.ok(frames('forest',34,117,'autumn').includes(3));assert.ok(!frames('forest',34,117,'spring').includes(3));
 assert.ok(!frames('forest',34,117,'summer').includes(0));assert.ok(!frames('forest',34,117,'summer').includes(1));
 assert.ok(frames('forest',46,125,'winter').includes(16));assert.ok(!frames('forest',46,125,'summer').includes(16));
 for(const season of NATURE_SEASONS){assert.ok(frames('forest',1,104,season).includes(0));assert.ok(!frames('forest',1,104,season).includes(16));assert.ok(!frames('forest',1,104,season).includes(3));}
 assert.ok(frames('barren',25,-105,'summer').includes(21));assert.ok(!frames('barren',25,110,'summer').includes(21));assert.ok(!frames('scrub',34,117,'autumn').includes(21));
 assert.ok(!frames('crops',34,117,'spring').includes(20));assert.ok(frames('crops',34,117,'summer').includes(20));assert.ok(!frames('crops',34,117,'winter').includes(20));
 for(let f=0;f<24;f++)for(const v of [0,.5,1])assert.ok(earthDecorationSize(f,v)<=(earthDecorationIsTree(f)?90:28));
});
