import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {timeScenery} from '../js/adventure_time_scenery_core.js';
import {createTimeScenery} from '../js/view_time_scenery.js';
import {streetArtResource,validateStreetArtFrames} from '../js/adventure_city_art_core.js';
const read=p=>JSON.parse(readFileSync(new URL('../data/adventure/'+p,import.meta.url),'utf8'));
const data=read('earth/time-scroll/common.json'),manifest=read('earth/street-art.json');
test('time scenery uses registered bounded frames, deterministic neighbouring stations and a clear walking lane',()=>{
    validateStreetArtFrames(manifest);
    for(const x of [0,640,1280,1920]){
        const objects=timeScenery(data,x);assert.deepEqual(objects,timeScenery(data,x));assert.ok(objects.length<=18);
        for(const o of objects){assert.ok(Math.abs(o.station-Math.round(x/data.spacing))<=1);assert.ok(o.dy<0||o.dy-o.h>30);const r=streetArtResource(manifest,o.art);assert.ok(r.bytes<=200000);assert.match(r.cdn,/^https:\/\/cdn.keepwork.com\//);}
    }
});
test('optional scenery retries neither failed atlases each frame nor late callbacks after close',async()=>{
    const images=[];
    const scenery=createTimeScenery({data,assets:{content:{cityStreetArt:manifest}},imageFactory:()=>{const image={};images.push(image);return image;}});
    scenery.prepare(0);const count=images.length;assert.ok(count>0);
    for(const image of images)image.onerror();
    scenery.prepare(0);scenery.prepare(640);scenery.prepare(0);
    assert.equal(images.filter(i=>i.src===images[0].src).length,1);
    const pending=images.filter(i=>i.onload);const late=pending.map(i=>i.onload);
    scenery.close();for(const callback of late)callback();
    scenery.draw({drawImage(){assert.fail('closed scenery painted');}},'back',0,300,800);
    assert.ok(pending.every(i=>i.onload===null));
    // A manifest arriving after exit cannot start any image requests.
    let resolve;const other=createTimeScenery({data,assets:{},read:()=>new Promise(r=>{resolve=r;}),imageFactory:()=>{assert.fail('late image request');}});
    await Promise.resolve();other.close();resolve(manifest);await Promise.resolve();other.prepare(0);
});
