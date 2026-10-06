import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdaptiveGraphics,normalizeGameSettings} from '../js/game_settings_core.js';
import {createGameSettings,legacyLocalMusic} from '../js/game_settings.js';
import {DEFAULT_LOCAL_KEYS} from '../js/local_controls_core.js';
import {durableSave,coreCatalogKey} from '../js/adventure_storage_core.js';
import {createMotionTrail,motionStyle} from '../js/adventure_motion_effects.js';
import {createJsonReader} from '../js/runtime_data.js';
const emptyStorage=()=>({getItem:()=>null});
test('adaptive quality needs two sustained windows, excludes paused/scene grace and latches',()=>{
 const q=createAdaptiveGraphics(),scene={};
 for(let t=0;t<13000;t+=50)q.sample(t,{scene});
 assert.equal(q.reduced,false);q.sample(13000,{scene});assert.equal(q.reduced,true);
 assert.deepEqual(q.effects({particles:'on',trails:'auto'}),{particles:true,trails:false,earthLight:'day',earthWeather:'clear',low:true});
 for(let t=13016;t<20000;t+=16)q.sample(t,{scene});assert.equal(q.reduced,true);
 q.reset(20000);for(let t=20000;t<40000;t+=50)q.sample(t,{active:false,scene});assert.equal(q.reduced,false);
 for(let t=40000;t<50000;t+=50)q.sample(t,{scene});assert.equal(q.reduced,false);
 q.sample(50000,{scene:{}});assert.equal(q.reduced,false);
});
test('local fallback migrates sound once and never replaces explicit device preferences',async()=>{
 const settings=createGameSettings({indexedDB:null,legacyStorage:()=>({getItem:key=>key.includes('volume')?'.8':'off'})});
 await settings.open({music:true});assert.deepEqual(settings.value,{version:1,environmentVersion:2,particles:'auto',trails:'auto',earthLight:'day',earthWeather:'clear',music:true,sound:false,volume:.8,localKeys:DEFAULT_LOCAL_KEYS,playerInputs:[{type:'keyboard-left'},{type:'keyboard-right'}]});
 settings.set({music:false,particles:'off',volume:2});await settings.flush();await settings.open({music:true});assert.equal(settings.value.music,false);assert.equal(settings.value.volume,1);
 assert.equal(normalizeGameSettings({volume:NaN,trails:'bogus'}).trails,'auto');
});
function fakeIDB(saved){const writes=[];return {writes,open(){const req={};queueMicrotask(()=>{req.result={createObjectStore(){},close(){},transaction(){const tx={objectStore:()=>({get(){const r={};queueMicrotask(()=>{r.result=saved; r.onsuccess();});return r;},put(value){saved=structuredClone(value);writes.push(saved);queueMicrotask(()=>tx.oncomplete());}})};return tx;}};req.onupgradeneeded();req.onsuccess();});return req;}};}
test('IndexedDB serializes writes and restores settings in a new session without legacy override',async()=>{
 const indexedDB=fakeIDB(),first=createGameSettings({indexedDB,legacyStorage:emptyStorage});await first.open();
 first.set({particles:'off'});first.set({trails:'on',volume:.7});await first.flush();
 const second=createGameSettings({indexedDB,legacyStorage:emptyStorage});await second.open({music:true});
 assert.deepEqual(second.value,first.value);assert.equal(second.value.music,false);assert.equal(indexedDB.writes.at(-1).trails,'on');
});
test('device settings and legacy music cannot enter durable cloud state or dirty comparison',()=>{
 const save={revision:1,name:'test',inventory:{},music:true,gameSettings:{particles:'off'},graphicsSettings:{}};
 const stripped=durableSave(save);for(const key of ['music','gameSettings','graphicsSettings'])assert.equal(Object.hasOwn(stripped,key),false);
 const catalog={roles:[{id:'test',save}]};const before=coreCatalogKey(catalog);save.music=false;save.gameSettings.particles='on';assert.equal(coreCatalogKey(catalog),before);
});
test('source JSON readers deduplicate concurrent requests, isolate mutations and retry errors',async()=>{
 let calls=0,fail=true;const read=createJsonReader({packed:false,request:async()=>{calls++;if(fail)throw Error('offline');return {ok:true,json:async()=>({rows:[]})};}});
 const failures=await Promise.allSettled([read('a'),read('a')]);assert.ok(failures.every(r=>r.status==='rejected'));assert.equal(calls,1);
 fail=false;const [a,b]=await Promise.all([read('a'),read('a')]);assert.equal(calls,2);a.rows.push(1);assert.deepEqual(b.rows,[]);
});
test('disabled trails clear and resume without a catch-up burst',()=>{
 const trail=createMotionTrail(),style=motionStyle({school:'fire'},{}),scope={};
 trail.step({x:0,y:0},0,style,{moving:true,scope});trail.step({x:30,y:0},100,style,{moving:true,scope});
 const disabled=trail.step({x:60,y:0},200,style,{moving:true,scope,hidden:true});assert.equal(disabled.particles.length,0);
 const resumed=trail.step({x:600,y:0},300,style,{moving:true,scope});assert.equal(resumed.particles.length,0);
});

test('migration reads the last account local cache only and safely handles corrupt storage',()=>{
 const rows={'haqi.roles.last-account.v1':'local-account','haqi.roles.v1.account.local-account':JSON.stringify({catalog:{activeId:'a',roles:[{id:'a',save:{music:true}}]}})};
 assert.equal(legacyLocalMusic({getItem:k=>rows[k]||null}),true);
 assert.equal(legacyLocalMusic({getItem:()=>'{bad'}),false);
});
test('failed IndexedDB opens keep the same usable session preferences',async()=>{
 const settings=createGameSettings({indexedDB:{open(){throw Error('blocked');}},legacyStorage:emptyStorage});await settings.open();settings.set({trails:'off',sound:false});await settings.flush();assert.equal(settings.value.trails,'off');assert.equal(settings.value.sound,false);
});

test('explicit automatic weather survives a device settings reopen',async()=>{const indexedDB=fakeIDB(),first=createGameSettings({indexedDB,legacyStorage:emptyStorage});await first.open();assert.equal(first.value.earthLight,'day');assert.equal(first.value.earthWeather,'clear');first.set({earthLight:'auto',earthWeather:'auto'});await first.flush();const second=createGameSettings({indexedDB,legacyStorage:emptyStorage});await second.open();assert.equal(second.value.earthWeather,'auto');assert.equal(second.value.earthLight,'auto');});

test('legacy default automatic environment migrates to daylight and clear sky',async()=>{const indexedDB=fakeIDB({version:1,earthLight:'auto',earthWeather:'auto',particles:'off'}),settings=createGameSettings({indexedDB,legacyStorage:emptyStorage});await settings.open();assert.equal(settings.value.earthLight,'day');assert.equal(settings.value.earthWeather,'clear');assert.equal(settings.value.particles,'off');assert.equal(indexedDB.writes.at(-1).environmentVersion,2);});
