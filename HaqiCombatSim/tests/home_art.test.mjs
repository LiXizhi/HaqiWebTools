import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {drawHomeObject,HOME_FURNITURE_SCALE,HOME_GROUND_SCALE} from '../js/view_home_art.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../data/adventure/home/catalog.json',import.meta.url))).items;
const manifest=JSON.parse(fs.readFileSync(new URL('../data/adventure/home/home-art.json',import.meta.url)));
function draw(item,thumb=false){
 const calls=[];
 const ctx=new Proxy({}, {get:(_,key)=>key==='drawImage'?(...args)=>calls.push(args):()=>{}});
 drawHomeObject(ctx,item,{active:false},0,0,40,40,{complete:true,naturalWidth:768},0,thumb);
 return calls[0];
}
test('home crops match the manifest and stay inside each atlas cell',()=>{
 for(const item of catalog){
  const a=item.art,frame=manifest.atlases[a.atlas].frames[item.id];
  assert.deepEqual(a.crop,frame.rect,item.id);
  const [x,y,w,h]=a.crop,cell=a.atlasWidth/4;
  assert.ok(x>=frame.cell%4*cell&&y>=Math.floor(frame.cell/4)*cell,item.id);
  assert.ok(x+w<=(frame.cell%4+1)*cell&&y+h<=(Math.floor(frame.cell/4)+1)*cell,item.id);
 }
});
test('regenerated garden sprites use native alpha and the same frame in scene and thumbnail',()=>{
 for(const id of ['bush','flower-bed','vegetable-patch','watering-can']){
  const item=catalog.find(i=>i.id===id);
  assert.equal(manifest.atlases[item.art.atlas].source.transparentBackground,true,id);
  assert.equal(manifest.atlases[item.art.atlas].frames[id].cropCorrection,undefined,id);
  for(const thumb of [false,true])assert.deepEqual(draw(item,thumb).slice(1,5),item.art.crop);
 }
});
test('seats are larger at the same ground anchor without enlarging catalog thumbnails',()=>{
 for(const item of catalog.filter(i=>i.renderScale)){
  const old={...item,renderScale:1},before=draw(old),after=draw(item);
  assert.ok(Math.abs(after[7]/before[7]-1.45)<1e-10,item.id);
  assert.ok(Math.abs((after[6]+after[8])-(before[6]+before[8]))<1e-10,item.id);
  assert.deepEqual(draw(item,true).slice(5),draw(old,true).slice(5));
 }
});
test('ground thumbnails preserve the crop aspect ratio',()=>{
 const item=catalog.find(i=>i.id==='vegetable-patch'),call=draw(item,true);
 assert.ok(Math.abs(call[7]/call[8]-item.art.width/item.art.height)<1e-10);
});
test('scene furniture grows without moving its foot anchor or enlarging thumbnails',()=>{
 for(const item of catalog.filter(i=>i.layer!=='ground')){
  const call=draw(item),thumb=draw(item,true),[,,sw,sh]=item.art.crop;
  const indoor=['bedroom','kitchen','bathroom','living'].includes(item.category)&&!['picnic-table','hot-spring'].includes(item.id);
  const oldScale=Math.min(40*(indoor?.82:1.24)/sw,40*(indoor?.86:1.34)/sh)*(item.renderScale||1);
  assert.ok(Math.abs(call[7]/(sw*oldScale)-HOME_FURNITURE_SCALE)<1e-10,item.id);
  assert.ok(Math.abs(call[6]+call[8]-40*(indoor?.36:.46))<1e-10,item.id);
  assert.ok(Math.abs(thumb[7]-sw*Math.min(43.2/sw,43.2/sh))<1e-10,item.id);
 }
 for(const item of catalog.filter(i=>i.layer==='ground'))assert.equal(draw(item)[7],40*1.04*HOME_GROUND_SCALE);
});
test('draw returns the visible sprite bounds for build-mode picking',()=>{
 const item=catalog.find(i=>i.id==='chair'),calls=[];
 const ctx=new Proxy({}, {get:(_,key)=>key==='drawImage'?(...args)=>calls.push(args):()=>{}});
 const bounds=drawHomeObject(ctx,item,{active:false},100,200,40,40,{complete:true,naturalWidth:768});
 const call=calls[0];
 assert.deepEqual(bounds,{x:120+call[5],y:220+call[6],w:call[7],h:call[8]});
});
