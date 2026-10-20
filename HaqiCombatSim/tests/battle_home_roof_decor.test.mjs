import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {applyHomeAction,homeObjects} from '../js/home_actions_core.js';
import {canPlace,validateHomePart} from '../js/home_core.js';
import {obstruction} from '../js/home_building_core.js';
import {createHomeBuildingCache} from '../js/home_building_cache.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/adventure/home/catalog.json',import.meta.url))).items;
const roof={id:'r',itemId:'build-wood-roof',x:31,y:0},prop={id:'p',itemId:'brick-chimney',x:31,y:0,parentId:'r',properties:{surface:'roof'}};
const make=()=>({inventory:{'brick-chimney:':2},'chunk:0,0':{r:structuredClone(roof)},'chunk:1,0':{}});
test('roof props coexist with interiors, never obstruct actors, reject unsupported and duplicate placements',()=>{
 const p=make();p['chunk:0,0'].chair={id:'chair',itemId:'chair',x:31,y:0};
 applyHomeAction(p,{type:'place',object:prop,actors:[{x:31.5,y:.5}]},catalog);
 assert.equal(obstruction(prop,catalog.find(i=>i.id===prop.itemId)),null);
 assert.equal(canPlace({...prop,id:'p2'},homeObjects(p),catalog).ok,false);
 assert.equal(canPlace({...prop,id:'p2',x:29},homeObjects(p),catalog).ok,false);
 assert.throws(()=>applyHomeAction(p,{type:'properties',id:'p',properties:{surface:'ground'}},catalog),/已有/);
 validateHomePart('chunk',p['chunk:0,0'],catalog);assert.throws(()=>validateHomePart('chunk',{p:{...prop,properties:{surface:'invalid'}}},catalog));
});
test('moving roof moves ornaments across chunks; recalling roof refunds both',()=>{
 const p=make();applyHomeAction(p,{type:'place',object:prop},catalog);applyHomeAction(p,{type:'move',id:'r',position:{x:32,y:0}},catalog);
 assert.equal(p['chunk:1,0'].p.x,32);assert.deepEqual(p['chunk:0,0'],{});
 applyHomeAction(p,{type:'recall',id:'r'},catalog);assert.equal(homeObjects(p).length,0);assert.equal(p.inventory['brick-chimney:'],2);
});
test('cached and selected live roof props share connected roof visibility group; indoor furniture stays world-level',()=>{
 const cache=createHomeBuildingCache({imageFor:()=>null}),indoor={id:'indoor',itemId:'chair',x:31,y:0},objects=[roof,prop,indoor];
 try{for(const selected of ['',prop.id]){const groups=cache.prepare(objects,catalog,{x:1000,y:-100,w:500,h:500},1,selected);const decor=groups.find(g=>g.rows.some(r=>r.o.id==='p')),top=groups.find(g=>g.rows.some(r=>r.o.id==='r'));
 assert.equal(decor.roof,true);assert.equal(decor.section,top.section);assert.equal(!!decor.dynamic,!!selected);assert.equal(groups.find(g=>g.rows.some(r=>r.o.id==='indoor')).roof,false);}}
 finally{cache.dispose();}
});
