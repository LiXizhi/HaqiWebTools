import test from 'node:test';
import assert from 'node:assert/strict';
import {homeObjectPixelHit} from '../js/view_home_art.js';

test('furniture hit mask follows crop alpha and horizontal mirror without swallowing transparent corners',()=>{
 const previous=globalThis.document;let reads=0,cropped;
 globalThis.document={createElement:()=>({getContext:()=>({drawImage(...args){cropped=args.slice(1,5);},getImageData(){reads++;return {data:new Uint8ClampedArray([0,0,0,0,0,0,0,255,0,0,0,255,0,0,0,0])};}})})};
 try{
  const image={complete:true,naturalWidth:20,naturalHeight:20},item={layer:'solid',art:{crop:[4,6,2,2]}},bounds={x:10,y:20,w:100,h:80};
  assert.equal(homeObjectPixelHit(item,{},image,bounds,25,30),false);
  assert.equal(homeObjectPixelHit(item,{},image,bounds,90,30),true);
  assert.equal(homeObjectPixelHit(item,{rotation:1},image,bounds,25,30),true);
  assert.equal(homeObjectPixelHit(item,{rotation:2},image,bounds,90,30),false);
  assert.equal(homeObjectPixelHit(item,{rotation:3},image,bounds,25,30),false);
  assert.equal(homeObjectPixelHit(item,{},image,bounds,111,30),false);
  assert.equal(reads,1);assert.deepEqual(cropped,[4,6,2,2]);
  assert.equal(homeObjectPixelHit(item,{},null,bounds,25,30),true);
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
