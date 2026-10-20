import {buildingItem,buildingPlacement} from '../js/home_building_core.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {homeFurnitureDragPosition} from '../js/home_edit_core.js';

test('furniture keeps its grabbed corner across zoom levels and negative world coordinates',()=>{
 for(const scale of [20,40,80]){
  const origin={x:-12,y:8},start={sx:237,sy:165};
  assert.deepEqual(homeFurnitureDragPosition(origin,start,start,scale),origin);
  assert.deepEqual(homeFurnitureDragPosition(origin,start,{sx:start.sx+3*scale,sy:start.sy-2*scale},scale),{x:-9,y:6});
  assert.deepEqual(origin,{x:-12,y:8});
 }
});

test('sub-cell pointer movement preserves fractional positions across zoom levels',()=>{
 for(const scale of [20,40,80]){
  assert.deepEqual(homeFurnitureDragPosition({x:-5.25,y:6.125},{sx:199,sy:202},{sx:204,sy:197},scale),{x:-5.25+5/scale,y:6.125-5/scale});
 }
});

// Execute the production handlers with isolated callbacks, without a DOM or player saves.
import {readFileSync} from 'node:fs';
const appSource=readFileSync(new URL('../js/home_app.js',import.meta.url),'utf8');
const viewSource=readFileSync(new URL('../js/view_home.js',import.meta.url),'utf8');
test('canvas pointer coordinates preserve fractional world positions for catalog drops',()=>{
 const source=viewSource.slice(viewSource.indexOf(' function position(e)'),viewSource.indexOf(' function render(next)'));
 const position=new Function('canvas','model',source+';return position;')(
  {getBoundingClientRect:()=>({left:10,top:20,width:800,height:600})},
  {camera:{x:-.25,y:.125},scale:40});
 assert.deepEqual(position({clientX:415,clientY:315}),{sx:405,sy:295,x:-.125,y:0});
});
test('clicking the ground after selecting existing or catalog furniture never writes a placement',async()=>{
 const source=appSource.slice(appSource.indexOf(' async function tap('),appSource.indexOf(' async function drop('));
 for(const selection of [{id:'placed-chair',itemId:'chair'},{itemId:'chair'}]){
  const writes=[],walks=[];
  const tap=new Function('selection','build','navigate','emit','commit','placeItemAt','buildingItem','catalog','requiresReading',source+';return tap;')(
   selection,true,p=>walks.push(p),()=>{},action=>writes.push(action),(...args)=>writes.push(args),buildingItem,{items:[{id:'chair'}]},item=>item?.requiresReading!==false );
  await tap(null,{x:9,y:12});
  assert.equal(writes.length,0);
  assert.deepEqual(walks,[{x:9,y:12}]);
 }
});
test('moving the mouse without a pressed drag never previews selected furniture',()=>{
 const source=viewSource.slice(viewSource.indexOf('  canvas.onpointermove=e=>{'),viewSource.indexOf('  canvas.onpointerup=e=>{'));
 const canvas={},previews=[];
 new Function('canvas','gesture','position','cb','paintStroke','model',source)(canvas,null,()=>({x:9,y:12}),{hover:p=>previews.push(p)},null,{build:false});
 canvas.onpointermove({pointerId:1,buttons:0});
 assert.deepEqual(previews,[]);
});

import {footprint,validateHomePart} from '../js/home_core.js';
import {applyHomeAction} from '../js/home_actions_core.js';
const resizeCatalog=[{id:'box',size:[2,1],layer:'solid'}];
const resizeParts=()=>({inventory:{},'chunk:0,0':{a:{id:'a',itemId:'box',x:0,y:0}}});
test('fractional furniture placement survives movement across chunks and save validation',()=>{
 const parts={inventory:{'box:':1},'chunk:0,0':{},'chunk:-1,1':{}};
 applyHomeAction(parts,{type:'place',object:{id:'a',itemId:'box',x:.125,y:.375}},resizeCatalog);
 applyHomeAction(parts,{type:'move',id:'a',position:{x:-.25,y:32.625}},resizeCatalog);
 const restored=JSON.parse(JSON.stringify(parts));
 assert.deepEqual(restored['chunk:0,0'],{});
 validateHomePart('chunk',restored['chunk:-1,1'],resizeCatalog);
 assert.equal(restored['chunk:-1,1'].a.x,-.25);
 assert.equal(restored['chunk:-1,1'].a.y,32.625);
 for(const x of [NaN,Infinity,'1.25',null,1e9+1]){
  assert.throws(()=>validateHomePart('chunk',{a:{...restored['chunk:-1,1'].a,x}},resizeCatalog));
  assert.throws(()=>applyHomeAction(parts,{type:'move',id:'a',position:{x}},resizeCatalog));
 }
});

test('placement resolver keeps the exact drop point even when another object occupies it',()=>{
 const source=appSource.slice(appSource.indexOf(' function at('),appSource.indexOf(' async function placeItemAt('));
 const resolve=new Function('selection','rotation','catalog','currentObjects','parts','footprint','buildingPlacement','showRoofs','isRoofDecoration',source+';return resolvePlacement;')(
  null,0,{items:resizeCatalog},()=>[{id:'other',itemId:'box',x:0,y:0}],{},footprint,buildingPlacement,false,()=>false);
 const obj=resolve('box',{x:.125,y:.375},{id:'a'});
 assert.equal(obj.x,.125);assert.equal(obj.y,.375);
 assert.throws(()=>applyHomeAction({inventory:{'box:':1},'chunk:0,0':{other:{id:'other',itemId:'box',x:0,y:0}}},{type:'place',object:obj},resizeCatalog),/这里已有物品/);
});
test('resizing persists per furniture, changes footprint and clamps to 50–200 percent',()=>{
 const parts=resizeParts();
 for(let i=0;i<8;i++)applyHomeAction(parts,{type:'resize',id:'a',delta:.25},resizeCatalog);
 const large=parts['chunk:0,0'].a;
 assert.equal(large.sizeScale,2);assert.equal(footprint(large,resizeCatalog).w,4);
 const restored=JSON.parse(JSON.stringify(parts['chunk:0,0']));
 validateHomePart('chunk',restored,resizeCatalog);assert.equal(restored.a.sizeScale,2);
 for(let i=0;i<8;i++)applyHomeAction(parts,{type:'resize',id:'a',delta:-.25},resizeCatalog);
 assert.equal(parts['chunk:0,0'].a.sizeScale,.5);
 assert.equal(footprint(parts['chunk:0,0'].a,resizeCatalog).w,1);
 assert.deepEqual(parts.inventory,{});
});
test('enlarging into another object fails without modifying either object',()=>{
 const parts=resizeParts();parts['chunk:0,0'].b={id:'b',itemId:'box',x:2,y:0};
 const before=structuredClone(parts);
 assert.throws(()=>applyHomeAction(parts,{type:'resize',id:'a',delta:.25},resizeCatalog),/这里已有物品/);
 assert.deepEqual(parts,before);
});
test('legacy sizes default to one and malformed imported sizes are rejected',()=>{
 const parts=resizeParts();assert.equal(footprint(parts['chunk:0,0'].a,resizeCatalog).w,2);
 for(const sizeScale of [0,3,NaN,Infinity,'1',null]){
  assert.throws(()=>validateHomePart('chunk',{a:{...parts['chunk:0,0'].a,sizeScale}},resizeCatalog));
 }
 assert.throws(()=>applyHomeAction(parts,{type:'resize',id:'a',delta:Infinity},resizeCatalog));
});

import {homeObjectInteractive} from '../js/home_core.js';
const realCatalog=JSON.parse(readFileSync(new URL('../data/adventure/home/catalog.json',import.meta.url),'utf8')).items;
test('portable items default to interaction on, plants and fixed furniture default off',()=>{
 for(const itemId of ['cup','book','ball','rubber-duck','watering-can'])assert.equal(homeObjectInteractive({itemId},realCatalog),true,itemId);
 for(const itemId of ['flower','tree','apple-tree','planter','bush','bed','wall'])assert.equal(homeObjectInteractive({itemId},realCatalog),false,itemId);
 assert.equal(homeObjectInteractive({itemId:'tree',interactionEnabled:true},realCatalog),true);
 assert.equal(homeObjectInteractive({itemId:'cup',interactionEnabled:false},realCatalog),false);
});
test('interaction toggle persists as a boolean override and does not change effects or inventory',()=>{
 const parts={inventory:{},'chunk:0,0':{a:{id:'a',itemId:'tree',x:0,y:0}}};
 applyHomeAction(parts,{type:'toggleInteraction',id:'a'},realCatalog);
 const restored=JSON.parse(JSON.stringify(parts['chunk:0,0']));
 validateHomePart('chunk',restored,realCatalog);
 assert.equal(homeObjectInteractive(restored.a,realCatalog),true);
 assert.equal(restored.a.active,undefined);
 applyHomeAction(parts,{type:'toggleInteraction',id:'a'},realCatalog);
 assert.equal(parts['chunk:0,0'].a.interactionEnabled,false);
 assert.deepEqual(parts.inventory,{});
 assert.throws(()=>validateHomePart('chunk',{a:{...restored.a,interactionEnabled:'true'}},realCatalog));
});
test('normal-mode drag commits only enabled objects, while editing can move disabled objects',async()=>{
 const source=appSource.slice(appSource.indexOf(' async function drop('),appSource.indexOf(' async function rotate('));
 for(const [build,enabled,expected] of [[false,false,0],[false,true,1],[true,false,1]]){
  const obj={id:'a',itemId:'cup',x:0,y:0,interactionEnabled:enabled},writes=[];
  const drop=new Function('build','currentObjects','parts','homeObjectInteractive','catalog','commit','resolvePlacement',source+';return drop;')(
   build,()=>[obj],{},homeObjectInteractive,{items:realCatalog},action=>writes.push(action),(_,p)=>p);
  await drop({kind:'object',id:'a'},{x:5,y:3});
  assert.equal(writes.length,expected);
  if(expected)assert.deepEqual(writes[0],{type:'move',id:'a',position:{x:5,y:3}});
 }
});
