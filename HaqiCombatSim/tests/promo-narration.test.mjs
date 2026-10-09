import test from 'node:test';
import assert from 'node:assert/strict';
import {createPromoNarration} from '../js/promo_narration.js';
const state={text:'欢迎来到深圳',key:'earth',lang:'zh-CN',playing:true};
function fixture({play=async()=>{}}={}){const configs=[],requests=[],sounds=[],revoked=[],errors=[],voices=[{id:'a',name:'声音甲',language:'zh-CN'},{id:'b',name:'声音乙',language:'en'}];let stops=0;const sdk={speech:{getSupportedVoices:()=>voices},speechRTC:{createSession(config){configs.push(config);return{synthesize(text){return new Promise(resolve=>requests.push({text,resolve}));},async interrupt(){stops++;}};}}};const n=createPromoNarration({load:async()=>sdk,makeAudio:url=>{const a={url,play,pause(){a.paused=true;},removeAttribute(){},load(){}};sounds.push(a);return a;},revoke:u=>revoked.push(u),onError:e=>errors.push(e)});return{n,configs,requests,sounds,revoked,errors,voices,get stops(){return stops;}};}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test('下一句提前合成，开播复用；音频真正开始前保持starting',async()=>{
 let start;const f=fixture({play:()=>new Promise(resolve=>{start=resolve;})});
 f.n.prefetch(state);await flush();assert.equal(f.requests.length,1);assert.equal(f.sounds.length,0);
 f.requests[0].resolve({audioUrl:'blob:warm'});await flush();
 const task=f.n.speak(state);assert.equal(f.n.starting,true);await flush();
 assert.equal(f.requests.length,1);assert.equal(f.n.starting,true);assert.equal(f.n.speak(state),task);
 start();await task;assert.equal(f.n.starting,false);assert.equal(f.n.pending,true);
 f.sounds[0].onended();assert.equal(f.n.pending,false);f.n.stop();assert.deepEqual(f.revoked,['blob:warm']);
});
test('换音色会替换预取，取消后迟到的音频被释放',async()=>{
 const f=fixture();f.n.prefetch(state);await flush();f.n.prefetch({...state,voiceURI:'b'});await flush();
 f.requests[0].resolve({audioUrl:'blob:old-warm'});await flush();assert.deepEqual(f.revoked,['blob:old-warm']);
 f.requests[1].resolve({audioUrl:'blob:new-warm'});await flush();f.n.clearPrefetch();assert.deepEqual(f.revoked,['blob:old-warm','blob:new-warm']);assert.equal(f.sounds.length,0);
});
test('Keepwork API音色列表、显式选音、字幕去重与停止音频',async()=>{
 const f=fixture();await f.n.ready();assert.deepEqual(f.n.voices(),f.voices);
 const task=f.n.speak({...state,voiceURI:'b',rate:8});await flush();assert.equal(f.configs[0].voiceType,'b');assert.equal(f.configs[0].autoPlay,false);
 f.requests[0].resolve({audioUrl:'blob:first'});await task;assert.equal(f.sounds[0].playbackRate,2);
 await f.n.speak({...state,voiceURI:'b',rate:8});assert.equal(f.requests.length,1);
 f.n.stop();assert.equal(f.sounds[0].paused,true);assert.deepEqual(f.revoked,['blob:first']);assert.ok(f.stops>0);
});
test('暂停或切字幕后迟到的合成不会播放，旧资源被释放',async()=>{
 const f=fixture(),old=f.n.speak(state);await flush();f.n.stop();f.requests[0].resolve({audioUrl:'blob:old'});await old;
 assert.equal(f.sounds.length,0);assert.deepEqual(f.revoked,['blob:old']);
 await f.n.speak({...state,playing:false});assert.equal(f.requests.length,1);
 await f.n.speak({...state,enabled:false});assert.equal(f.requests.length,1);
});
test('SDK失败不回退系统音色，也不中断影片',async()=>{
 const errors=[],n=createPromoNarration({load:async()=>{throw Error('服务不可用');},onError:e=>errors.push(e)});
 await n.speak(state);assert.deepEqual(errors,['服务不可用']);assert.equal(n.pending,false);n.stop();
});
test('合成和播放期间持续等待，ended才放行；完成字幕不会重复朗读',async()=>{
 const f=fixture(),task=f.n.speak(state);assert.equal(f.n.pending,true);await flush();
 f.requests[0].resolve({audioUrl:'blob:complete'});await task;assert.equal(f.n.pending,true);
 f.sounds[0].onended();assert.equal(f.n.pending,false);
 await f.n.speak(state);assert.equal(f.requests.length,1);assert.equal(f.n.pending,false);
});
test('关闭朗读、播放失败和旧音频回调不会阻塞或提前放行新字幕',async()=>{
 const f=fixture(),first=f.n.speak(state);await flush();f.requests[0].resolve({audioUrl:'blob:first'});await first;
 const next=f.n.speak({...state,text:'下一句'});await flush();f.sounds[0].onended();assert.equal(f.n.pending,true);
 f.requests[1].resolve({audioUrl:'blob:next'});await next;f.sounds[1].onerror();assert.equal(f.n.pending,false);assert.deepEqual(f.errors,['语音播放失败']);
 const third=f.n.speak({...state,text:'第三句'});await flush();await f.n.speak({...state,enabled:false});assert.equal(f.n.pending,false);
 f.requests[2].resolve({audioUrl:'blob:cancelled'});await third;assert.equal(f.n.pending,false);
});
