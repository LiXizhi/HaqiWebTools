import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {homeObjectSurfaceLift,homeObjectVisualBounds} from '../js/view_home_art.js';
import {createHomeBuildingCache} from '../js/home_building_cache.js';
import {footprint} from '../js/home_core.js';
const catalog=JSON.parse(readFileSync(new URL('../data/adventure/home/catalog.json',import.meta.url))).items;

test('tabletop elevation follows the support sprite at scaled and mirrored sizes without mutating saved coordinates',()=>{
 for(const sizeScale of [.5,1,2])for(const rotation of [0,1,2,3]){
  const table={id:'support',itemId:'table',x:0,y:1,sizeScale,rotation},book={id:'book',itemId:'book',x:.5,y:1.5,parentId:'support'},before=JSON.stringify(book),byId=new Map([[table.id,table]]);
  const box=footprint(table,catalog),item=catalog.find(i=>i.id==='table');
  assert.equal(homeObjectSurfaceLift(book,byId,catalog),homeObjectVisualBounds(item,table,0,0,box.w,box.h).h*.45);
  assert.equal(homeObjectSurfaceLift({...book,parentId:undefined},byId,catalog),0);
  assert.equal(homeObjectSurfaceLift(book,new Map(),catalog),0);
  assert.equal(homeObjectSurfaceLift({...book,itemId:'chair'},byId,catalog),0);
  assert.equal(JSON.stringify(book),before);
 }
});

test('cached and live furniture share surface elevation and changing only the support changes the child cache signature',()=>{
 const cache=createHomeBuildingCache({enabled:false,imageFor:()=>null});
 try{
  const table={id:'support',itemId:'table',x:0,y:1},book={id:'book',itemId:'book',x:.5,y:1.5,parentId:'support'};
  const group=cache.prepare([table,book],catalog,{x:-200,y:-200,w:800,h:800},1).find(g=>g.rows[0].o.id==='book');
  const lift=homeObjectSurfaceLift(book,new Map([[table.id,table]]),catalog);
  assert.equal(group.rows[0].lift,lift);
  const moves=[],ctx=new Proxy({}, {get:(_,key)=>key==='translate'?((...v)=>moves.push(v)):()=>{}});
  cache.draw(ctx,group);assert.deepEqual(moves[0],[40,(1.5-lift)*40+20]);
  const changed=cache.prepare([{...table,sizeScale:2},book],catalog,{x:-200,y:-200,w:800,h:800},1).find(g=>g.rows[0].o.id==='book');
  assert.equal(changed.rows[0].lift,2*lift);assert.notEqual(changed.signature,group.signature);
 }finally{cache.dispose();}
});
