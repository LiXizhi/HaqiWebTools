import test from 'node:test';import assert from 'node:assert/strict';
import {createAudioSamples} from '../js/audio_samples.js';
import {createBackgroundMusic} from '../js/background_music.js';
import {acquireAudioActivity} from '../js/audio_activity.js';
test('sample cache bounds downloads, deduplicates unlocks and ignores bad/oversized audio',async()=>{
 let fetches=0,active=0,maximum=0;
 const assets=Object.fromEntries(['click_003','open_001','close_001','chop'].map(id=>[id,{cdn:'https://cdn.keepwork.com/'+id}]));
 const samples=createAudioSamples({read:async()=>({assets}),mode:()=> 'cdn',fetcher:async url=>{fetches++;active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,1));active--;return{ok:!url.endsWith('chop'),arrayBuffer:async()=>new ArrayBuffer(url.endsWith('close_001')?500001:10)};}});
 const context={decodeAudioData:async()=>({duration:.2})};await Promise.all([samples.load(context),samples.load(context)]);
 assert.equal(fetches,4);assert.ok(maximum<=3);assert.equal(samples.count,2);assert.ok(samples.get('click'));assert.equal(samples.get('hit'),undefined);samples.dispose();assert.equal(samples.count,0);
});
test('audio decoded after disposal cannot become live',async()=>{
 let finish;const decoding=new Promise(r=>finish=r),samples=createAudioSamples({read:async()=>({assets:{click_003:{cdn:'https://cdn.keepwork.com/click'}}}),fetcher:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)})});
 const loaded=samples.load({decodeAudioData:()=>decoding});await new Promise(r=>setTimeout(r,0));samples.dispose();finish({duration:.1});await loaded;assert.equal(samples.count,0);
});
function audio(){return {paused:true,volume:0,plays:0,play(){this.plays++;this.paused=false;return Promise.resolve();},pause(){this.paused=true;}};}
test('music fades in, ducks spoken dialogue and immediately pauses on hide/mute',async t=>{
 t.mock.timers.enable({apis:['setInterval']});const element=audio(),music=createBackgroundMusic('original.ogg',{audioFactory:()=>element});
 await music.play();for(let i=0;i<30;i++)t.mock.timers.tick(30);assert.equal(element.volume,.18);assert.equal(element.loop,true);
 const release=acquireAudioActivity();for(let i=0;i<30;i++)t.mock.timers.tick(30);assert.equal(element.volume,.036);
 release();for(let i=0;i<30;i++)t.mock.timers.tick(30);assert.equal(element.volume,.18);
 music.pause();assert.equal(element.paused,true);assert.equal(element.volume,0);music.dispose();
});
test('autoplay rejection retries only on another gesture and late play cannot undo pause',async()=>{
 const element=audio();element.play=function(){this.plays++;return Promise.reject(Error('not allowed'));};const music=createBackgroundMusic('original.ogg',{audioFactory:()=>element});
 await music.play();assert.equal(element.plays,1);await music.play();assert.equal(element.plays,2);
 let finish;element.play=function(){return new Promise(r=>finish=()=>{this.paused=false;r();});};const pending=music.play();music.pause();finish();await pending;assert.equal(element.paused,true);music.dispose();
});
