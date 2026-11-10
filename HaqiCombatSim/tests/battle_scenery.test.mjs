import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {battleSceneFor,battleArtMode,BATTLE_SCENES,battleDiskRect} from '../js/battle_scenery_core.js';
import {drawBattleDisk} from '../js/battle_scenery.js';

test('battle art uses actual area biomes before island defaults',()=>{
 const content={worldMaps:{town:{regions:[{x:0,y:0,rx:100,ry:100,biome:'beach'},{x:500,y:0,rx:100,ry:100,biome:'snow'}]}}};
 assert.equal(battleSceneFor({zone:'town',position:{x:0,y:0}},content).id,'beach');
 assert.equal(battleSceneFor({zone:'town',position:{x:500,y:0}},content).id,'snow');
 assert.equal(battleSceneFor({zone:'town',position:{x:1000,y:0}},content).id,'academy');
 assert.equal(battleSceneFor({zone:'unknown'},{}).id,'forest');
 assert.equal(new Set(Object.values(BATTLE_SCENES).map(s=>s.disk)).size,3);
});
test('local battle-art preview cannot silently become a production local asset default',()=>{
 assert.equal(battleArtMode('127.0.0.1','?battleArt=local'),'local');
 assert.equal(battleArtMode('keepwork.com','?battleArt=local'),'cdn');
 assert.equal(battleArtMode('localhost',''),'cdn');
});
test('all nine generated WebP sources fit budget and match recorded hashes',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../data/adventure/battle-scenery.json',import.meta.url)));
 assert.equal(Object.keys(manifest.assets).length,9);
 for(const [id,row] of Object.entries(manifest.assets)){
  const bytes=fs.readFileSync(new URL('../'+row.local,import.meta.url));
  assert.equal(bytes.length,row.size,id);assert.ok(bytes.length<=200000,id);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),row.sha256,id);
  assert.equal(bytes.toString('ascii',8,12),'WEBP',id);
 }
});
test('cinematic disk uses projected texture instead of switching to the old flat floor',()=>{
 let draws=0;const c={drawImage(){draws++;},save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},clip(){},transform(...n){assert.ok(n.every(Number.isFinite));}};
 drawBattleDisk(c,{}, {active:false},{cx:512,cy:320,r:400});assert.equal(draws,1);
 const camera={active:true,blend:.5,center:{x:512,y:320},focus:{x:300,y:230},yaw:.3,pitch:.32,focusHeight:50,distance:2400,zoom:2,screenX:512,screenY:320};
 drawBattleDisk(c,{},camera,{cx:512,cy:320,r:400});assert.equal(draws,321);
 const rect=battleDiskRect(512,320,400);assert.ok(rect.x<512&&rect.y<320);
});


test('replacement disks preserve the original arena ellipse bounds for every theme',()=>{
 for(const r of [120,240,400])assert.deepEqual(battleDiskRect(512,320,r),{x:512-r,y:320-r*.54,w:r*2,h:r*1.08});
});
test('real island region centers automatically select their background and disk',()=>{
 const worldMaps=Object.fromEntries(['camp','town','ice','fire','dark'].map(zone=>[zone,JSON.parse(fs.readFileSync(new URL('../data/adventure/maps/'+zone+'.json',import.meta.url)))]));
 for(const [zone,biome,id,disk] of [['town','beach','beach','disk-a'],['camp','forest','forest','disk-c'],['ice','snow','snow','disk-b'],['camp','town','academy','disk-a'],['fire','volcanic','canyon','disk-c'],['dark','dark','starlight','disk-b']]){
  const region=worldMaps[zone].regions.find(r=>r.biome===biome);assert.ok(region,zone+':'+biome);
  const actual=battleSceneFor({zone,position:{x:region.x,y:region.y}},{worldMaps});
  assert.equal(actual.id,id);assert.equal(actual.disk,disk);
 }
});
