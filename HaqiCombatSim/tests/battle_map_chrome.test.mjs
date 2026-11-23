import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createMapHeader} from '../js/ui/controls.js';
import {loadMapUiArt} from '../js/map_ui_art.js';
import {renderMaps} from '../js/views/adventure/view_adventure_maps.js';

function documentStub(){
 const styles=[],classes=new Set();
 class Element{
  constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.dataset={};this.style={};this.className='';this.classList={add:(...names)=>{this.className=[this.className,...names].filter(Boolean).join(' ');}};}
  append(...rows){for(const row of rows){if(row&&typeof row==='object')row.parent=this;this.children.push(row);}}
  replaceChildren(...rows){this.children=[];this.append(...rows);}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(){}
  querySelector(selector){const match=node=>selector.startsWith('.')?node.className?.split(' ').includes(selector.slice(1)):node.tag===selector;for(const row of this.children){if(match(row))return row;const found=row.querySelector?.(selector);if(found)return found;}return null;}
  replaceWith(node){const index=this.parent.children.indexOf(this);this.parent.children.splice(index,1,node);node.parent=this.parent;this.parent=null;}
  focus(){globalThis.document.activeElement=this;}
 }
 return {baseURI:'https://example.test/game/',createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag),getElementById:()=>null,head:{append:node=>styles.push(node)},documentElement:{classList:{add:name=>classes.add(name)}},styles,classes};
}
const fixture=()=>({assets:Object.fromEntries(['banner','haqi','earth'].map(id=>[id,{local:`assets/${id}.webp`,cdn:`https://cdn.keepwork.com/test/${id}.webp`,width:20,height:10}]))});

test('map header keeps navigation and session tools separate, with accessible live callbacks',()=>{
 const previous=globalThis.document;globalThis.document=documentStub();
 try{
  const calls=[],header=createMapHeader('现实世界','earth',id=>calls.push(id),()=>calls.push('close'));
  const [identity,tools,navigation]=header.children;
  assert.equal(identity.children[0].textContent,'现实世界');assert.equal(tools.children[0].attributes['aria-label'],'关闭');
  const group=navigation.children[0];assert.equal(group.attributes.role,'group');
  const [haqi,earth]=group.children;
  assert.equal(haqi.type,'button');assert.equal(earth.attributes['aria-pressed'],'true');assert.equal(haqi.attributes['aria-pressed'],'false');
  assert.equal(earth.attributes['aria-label'],'现实世界');assert.equal(earth.children[0].attributes['aria-hidden'],'true');
  haqi.onclick();earth.onclick();tools.children[0].onclick();assert.deepEqual(calls,['haqi','earth','close']);
  assert.equal(createMapHeader('当前地图','haqi',null,()=>{}).children[2].children.length,0);
 }finally{globalThis.document=previous;}
});

test('dungeon map focuses its replacement close button and keeps navigation live',()=>{
 const previous=globalThis.document;globalThis.document=documentStub();
 try{
  const root=document.createElement('div'),calls=[],world={isDungeon:true,w:2000,h:1600,layout:{name:'走失的火种',regions:[]},landmarks:[]};
  renderMaps(root,world,{save:{position:{x:100,y:100}}},{close:()=>calls.push('close'),draw:()=>calls.push('draw'),switchMap:view=>calls.push(view),switchWorld:world=>calls.push(world)});
  const close=root.querySelector('.close-button');
  assert.equal(document.activeElement,close,'focus must remain on the attached replacement header');
  assert.equal(close.parent,root.querySelector('.map-header-tools'));
  close.onclick();root.querySelector('.map-view-toggle').onclick();
  root.querySelector('.world-switch-button').onclick();
  assert.deepEqual(calls,['draw','close','world','haqi']);
 }finally{globalThis.document=previous;}
});

test('illustrations decode atomically, resolve local paths, and retain fallbacks on failure',async()=>{
 const previous={document:globalThis.document,Image:globalThis.Image};
 globalThis.document=documentStub();
 class Picture{naturalWidth=20;naturalHeight=10;set src(url){this.url=url;queueMicrotask(()=>this.onload());}}
 globalThis.Image=Picture;
 try{
  await loadMapUiArt('local',async()=>fixture());
  assert.ok(document.classes.has('map-art-ready'));assert.equal(document.styles.length,1);
  assert.match(document.styles[0].textContent,/https:\/\/example.test\/game\/assets\/haqi.webp/);
  globalThis.document=documentStub();
  const bad=fixture();bad.assets.earth.width=99;
  await assert.rejects(loadMapUiArt('cdn',async()=>bad),/尺寸/);
  assert.equal(document.styles.length,0);assert.equal(document.classes.size,0);
  bad.assets.earth.cdn='https://example.test/untrusted.webp';
  await assert.rejects(loadMapUiArt('cdn',async()=>bad),/资源地址/);
  assert.equal(document.styles.length,0);
 }finally{Object.assign(globalThis,previous);}
});

test('map illustrations match recorded content hashes, preserve icon alpha, and meet delivery budgets',()=>{
 const root=new URL('../',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('data/adventure/map-ui.json',root)));
 for(const[id,row]of Object.entries(manifest.assets)){
  const bytes=fs.readFileSync(new URL(row.local,root));assert.equal(bytes.length,row.size);assert.ok(bytes.length<=200000);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);assert.notEqual(row.source.sha256,row.sha256);
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
  if(id!=='banner'){assert.ok(bytes[20]&0x10);assert.equal(bytes.readUIntLE(24,3)+1,row.width);assert.equal(bytes.readUIntLE(27,3)+1,row.height);}
  if(manifest.status==='cdn-verified')assert.ok(row.cdn.startsWith('https://cdn.keepwork.com/'));
 }
});
