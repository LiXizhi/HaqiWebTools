import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/adventure/home/catalog.json',import.meta.url))).items;
test('new atlas is bounded WebP with sixteen stable independent crops and permanent CDN references',()=>{
 const art=JSON.parse(fs.readFileSync(new URL('../data/adventure/home/building-expansion-art.json',import.meta.url))),bytes=fs.readFileSync(new URL('../'+art.local,import.meta.url));
 assert.ok(bytes.length<=200000);assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.equal(art.frames.length,16);
 for(const f of art.frames){const [x,y,w,h]=f.crop;assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=640&&y+h<=640);}
 assert.equal(catalog.filter(i=>i.art?.local===art.local).length,16);assert.match(art.cdn,/^https:\/\/cdn.keepwork.com\//);
});

import {applyHomeAction} from '../js/home_actions_core.js';
import {buildingSlot,buildingConnectionMask} from '../js/home_building_core.js';
import {isHomePassable} from '../js/home_walk_core.js';
test('stairs are ordinary ground decorations without a supporting floor or climb requirement',()=>{
 const parts={'chunk:0,0':{}},stairs={id:'s',itemId:'build-oak-stairs',x:3,y:3};
 applyHomeAction(parts,{type:'create',object:stairs},catalog);
 applyHomeAction(parts,{type:'resize',id:'s',delta:.25},catalog);
 assert.equal(parts['chunk:0,0'].s.sizeScale,1.25);
 applyHomeAction(parts,{type:'recall',id:'s'},catalog);assert.deepEqual(parts['chunk:0,0'],{});
});
test('legacy object levels share ordinary ground slots, neighbours and collision',()=>{
 const item=catalog.find(i=>i.id==='build-brick-floor'),floor={id:'f',itemId:item.id,x:0,y:0},upper={...floor,id:'u',level:2};
 assert.equal(buildingSlot(floor,item),buildingSlot(upper,item));
 assert.equal(buildingConnectionMask(floor,[{...upper,x:1}],catalog),2);
 const wall={id:'w',itemId:'build-brick-wall',x:0,y:0,level:2};
 assert.equal(isHomePassable(.5,.5,[wall],catalog),false);
 const parts={'chunk:0,0':{w:wall}};applyHomeAction(parts,{type:'recall',id:'w'},catalog);assert.deepEqual(parts['chunk:0,0'],{});
 assert.equal(isHomePassable(20,20,[],catalog),true);
});
