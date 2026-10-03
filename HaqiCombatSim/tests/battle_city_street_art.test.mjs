import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createStreetPainter} from '../js/view_city_street.js';
import {emptyStreet} from '../js/adventure_city_street_layout_core.js';
import {createHash} from 'node:crypto';
import {registerLazyImage} from '../js/adventure_assets.js';
test('re-registering the shared resident atlas keeps pending loads valid; changed art invalidates them',async()=>{
    const entries=new Map(),images=new Map();let releaseCount=0;
    const release=id=>{entries.delete(id);images.delete(id);releaseCount++;};
    const original={local:'residents.webp',cdn:'https://cdn.keepwork.com/residents.webp',sha256:'v1'};
    registerLazyImage(entries,'residents',original,release);
    const pending=Promise.resolve().then(()=>{if(entries.get('residents')===original)images.set('residents','decoded');});
    registerLazyImage(entries,'residents',structuredClone(original),release);
    await pending;assert.equal(images.get('residents'),'decoded');assert.equal(releaseCount,0);
    registerLazyImage(entries,'residents',{...original,sha256:'v2'},release);
    assert.equal(releaseCount,1);assert.equal(images.has('residents'),false);assert.notEqual(entries.get('residents'),original);
});
test('street cache is bounded, reuses baked tiles and releases art on leaving',()=>{
    let canvases=0,released=0;const context=new Proxy({},{get:()=>()=>{},set:()=>true});
    const art={entries:{test:{id:'street:test'}}},painter=createStreetPainter({content:{cityStreetArt:art},registerImage:()=>{},releaseImage:()=>released++},{makeCanvas:()=>{canvases++;return{getContext:()=>context};}});
    const scene={streetscape:emptyStreet()},world={w:8192,h:8192,dungeon:{scene}};
    painter.ground(context,world,{x:0,y:0,w:500,h:500});assert.equal(canvases,1);painter.ground(context,world,{x:0,y:0,w:500,h:500});assert.equal(canvases,1);
    painter.ground(context,world,{x:0,y:0,w:8192,h:8192});assert.ok(painter.stats().tiles<=48);
    painter.reset();assert.equal(painter.stats().tiles,0);assert.equal(released,1);painter.reset();assert.equal(released,1);
});
test('shared street WebP files match their manifest and budget',()=>{
    const art=JSON.parse(fs.readFileSync(new URL('../data/adventure/earth/street-art.json',import.meta.url),'utf8'));
    assert.equal(Object.keys(art.entries).length,16);
    for(const entry of Object.values(art.entries)){const data=fs.readFileSync(new URL('../'+entry.local,import.meta.url));assert.ok(data.length<=200000);assert.equal(data.length,entry.bytes);assert.equal(data.toString('ascii',8,12),'WEBP');assert.equal(createHash('sha256').update(data).digest('hex'),entry.sha256);assert.equal(new URL(entry.cdn).hostname,'cdn.keepwork.com');}
});
