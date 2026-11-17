import test from 'node:test';import assert from 'node:assert/strict';
import {createAudioSamples} from '../js/audio/audio_samples.js';
import {backgroundMusicId,createBackgroundMusic} from '../js/audio/background_music.js';
import {acquireAudioActivity} from '../js/audio/audio_activity.js';
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
function intervalClock(t){
 const intervals=new Map();let serial=0;
 t.mock.method(globalThis,'setInterval',fn=>{const id=++serial;intervals.set(id,fn);return id;});
 t.mock.method(globalThis,'clearInterval',id=>intervals.delete(id));
 return (steps=30)=>{for(let i=0;i<steps;i++)for(const [id,fn]of [...intervals])if(intervals.has(id))fn();};
}
test('music fades in, ducks spoken dialogue and immediately pauses on hide/mute',async t=>{
 // Node 20.11 MockTimers cannot reliably cancel an interval inside its callback.
 // A bounded interval clock keeps this test deterministic on the supported runtime.
 const tick=intervalClock(t);
 const element=audio(),music=createBackgroundMusic('original.ogg',{audioFactory:()=>element});
 await music.play();tick();assert.equal(element.volume,.18);assert.equal(element.loop,true);
 const release=acquireAudioActivity();tick();assert.equal(element.volume,.036);
 release();tick();assert.equal(element.volume,.18);
 music.pause();assert.equal(element.paused,true);assert.equal(element.volume,0);music.dispose();
});
test('autoplay rejection retries only on another gesture and late play cannot undo pause',async()=>{
 const element=audio();element.play=function(){this.plays++;return Promise.reject(Error('not allowed'));};const music=createBackgroundMusic('original.ogg',{audioFactory:()=>element});
 await music.play();assert.equal(element.plays,1);await music.play();assert.equal(element.plays,2);
 let finish;element.play=function(){return new Promise(r=>finish=()=>{this.paused=false;r();});};const pending=music.play();music.pause();finish();await pending;assert.equal(element.paused,true);music.dispose();
});

test('original music follows world and combat without changing the title theme',()=>{
 assert.match(backgroundMusicId('battle','ice','town.ogg'),/combat_teen_common_trialversion/);
 assert.match(backgroundMusicId('world','camp','town.ogg'),/area_forest/);
 assert.match(backgroundMusicId('world','dark','town.ogg'),/area_forest/);
 assert.match(backgroundMusicId('world','ice','town.ogg'),/area_snow/);
 assert.equal(backgroundMusicId('title','ice','town.ogg'),'town.ogg');
 assert.equal(backgroundMusicId('world','town','town.ogg'),'town.ogg');
});
test('switching tracks retires late playback and does not restart the same loop',async()=>{
 const elements=[];let finish;
 const music=createBackgroundMusic('forest.ogg',{audioFactory:src=>{const a=audio();a.src=src;elements.push(a);return a;}});
 elements[0].play=function(){return new Promise(r=>finish=()=>{this.paused=false;r();});};
 const old=music.play();assert.equal(music.setTrack('snow.ogg'),true);await music.play();
 assert.equal(elements[0].paused,true);assert.equal(music.element.src,'snow.ogg');assert.equal(music.setTrack('snow.ogg'),false);
 finish();await old;assert.equal(elements[0].paused,true);assert.equal(music.element.paused,false);assert.equal(elements.length,2);
 music.pause();music.setTrack('battle.ogg');assert.equal(music.element.paused,true);music.dispose();
});

test('scene music crossfades, ducks both layers and resumes its position after combat',async t=>{
 const tick=intervalClock(t),elements=[];
 const music=createBackgroundMusic('forest.ogg',{audioFactory:src=>{const a=audio();a.src=src;elements.push(a);return a;}});
 await music.play();tick();const forest=music.element;forest.currentTime=38;
 music.setTrack('combat.ogg');await music.play();tick(2);
 const combat=music.element;assert.ok(forest.volume>0&&forest.volume<.18);assert.ok(combat.volume>0&&combat.volume<.18);
 const release=acquireAudioActivity();tick();assert.equal(combat.volume,.036);assert.equal(forest.paused,true);release();tick();
 music.setTrack('forest.ogg');await music.play();tick();
 assert.equal(music.element,forest);assert.equal(forest.currentTime,38);assert.equal(combat.paused,true);assert.equal(combat.volume,0);assert.equal(elements.length,2);music.dispose();
});

test('rapid scene changes and mute leave no orphan playing loops',async t=>{
 const tick=intervalClock(t),elements=[];
 const music=createBackgroundMusic('forest.ogg',{audioFactory:src=>{const a=audio();a.src=src;elements.push(a);return a;}});
 await music.play();tick();music.setTrack('combat.ogg');await music.play();tick(2);
 music.setTrack('snow.ogg');await music.play();assert.equal(elements[0].paused,true);
 tick();assert.deepEqual(elements.map(a=>a.paused),[true,true,false]);
 music.setTrack('forest.ogg');await music.play();tick(2);music.pause();
 assert.ok(elements.every(a=>a.paused&&a.volume===0));tick();assert.ok(elements.every(a=>a.paused&&a.volume===0));music.dispose();
});

test('blocked incoming theme keeps the scene audible until a gesture retries',async t=>{
 const tick=intervalClock(t),elements=[];
 const music=createBackgroundMusic('forest.ogg',{audioFactory:src=>{const a=audio();a.src=src;elements.push(a);return a;}});
 await music.play();tick();const forest=music.element;
 music.setTrack('combat.ogg');const combat=music.element;
 combat.play=()=>Promise.reject(Error('autoplay'));await music.play();tick();
 assert.equal(forest.paused,false);assert.equal(forest.volume,.18);assert.equal(combat.volume,0);
 combat.play=audio().play;await music.play();tick();assert.equal(forest.paused,true);assert.equal(combat.volume,.18);music.dispose();
});

test('late playback after disposal stays silent, and inactive theme errors stay quiet',async()=>{
 const elements=[];let finish,errors=0;
 const music=createBackgroundMusic('forest.ogg',{audioFactory:src=>{const a=audio();a.src=src;elements.push(a);return a;},onError:()=>errors++});
 music.setTrack('combat.ogg');elements[0].onerror();assert.equal(errors,0);music.element.onerror();music.element.onerror();assert.equal(errors,1);
 music.element.play=function(){return new Promise(r=>finish=()=>{this.paused=false;r();});};
 const pending=music.play();music.dispose();finish();await pending;
 assert.ok(elements.every(a=>a.paused&&a.volume===0));assert.ok(elements.every(a=>a.onerror===null));
});
