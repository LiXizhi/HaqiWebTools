import test from 'node:test';
import assert from 'node:assert/strict';
import {createLearningVoice} from '../js/audio/language_adventure_voice.js';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(t,options={}){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldContext=globalThis.AudioContext,oldAudio=globalThis.Audio;
 const sessions=[];let stopped=0;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++;}}]})}}});
 globalThis.AudioContext=class{sampleRate=16000;resume=async()=>{};close=()=>options.close?.()??Promise.resolve();createMediaStreamSource(){return {connect(){},disconnect(){}};}createScriptProcessor(){return {connect(){},disconnect(){}};}};
 globalThis.Audio=class{play(){queueMicrotask(()=>this.onended?.());return Promise.resolve();}pause(){}};
 t.after(()=>{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;globalThis.AudioContext=oldContext;globalThis.Audio=oldAudio;});
 const sdk={token:'recovery-test',speechRTC:{createSession(config){
  const listeners=new Map(),id=sessions.length;
  const stream={config,listeners,stops:[],spoken:[],on:(k,fn)=>listeners.set(k,fn),off:(k,fn)=>{if(listeners.get(k)===fn)listeners.delete(k);},
   startASR:()=>options.start?.(id)??Promise.resolve(),
   finishASR:()=>options.finish?.(id,listeners)??Promise.resolve().then(()=>listeners.get('asr')?.({text:'こんにちは'})),
   sendAudio(){},cancel:()=>options.cancel?.(id)??Promise.resolve(),stop(settings){this.stops.push(settings);return options.stop?.(id)??Promise.resolve();},
   async synthesize(text){this.spoken.push(text);return {audioUrl:URL.createObjectURL(new Blob(['test'],{type:'audio/mpeg'}))};}};
  sessions.push(stream);return stream;
 }}};
 const voice=createLearningVoice({load:async()=>sdk,asrFinishTimeoutMs:15,cleanupTimeoutMs:15});
 return {voice,sessions,get stopped(){return stopped;}};
}

test('unresolved ASR finish times out, releases mic, discards session and permits a fresh attempt',{timeout:1000},async t=>{
 const stuck=deferred(),f=fixture(t,{finish:id=>id===0?stuck.promise:undefined});
 await f.voice.start(new AbortController().signal);
 await assert.rejects(f.voice.finish(),/超时/);
 assert.ok(f.stopped>0);assert.equal(f.sessions[0].listeners.size,0);
 assert.equal(f.sessions[0].stops.at(-1).closeConnection,true);
 await f.voice.start(new AbortController().signal);assert.equal(f.sessions.length,2);
 // Even a delayed result from the abandoned connection cannot become this answer.
 stuck.resolve();assert.equal(await f.voice.finish(),'こんにちは');
 await f.voice.cancel();
});

test('cancel does not wait forever for startASR and late start cannot reuse the retired session',{timeout:1000},async t=>{
 const start=deferred(),f=fixture(t,{start:id=>id===0?start.promise:undefined});
 const pending=f.voice.start(new AbortController().signal);const rejected=assert.rejects(pending,/对话已结束/);
 while(!f.sessions.length)await new Promise(r=>setImmediate(r));
 await f.voice.cancel();await rejected;
 start.resolve();await f.voice.start(new AbortController().signal);
 assert.equal(f.sessions.length,2);assert.equal(await f.voice.finish(),'こんにちは');await f.voice.cancel();
});

test('stuck audio context or SDK stop cannot block successful recognition or the next cancel',{timeout:1000},async t=>{
 const never=new Promise(()=>{}),f=fixture(t,{close:()=>never,stop:()=>never});
 await f.voice.start(new AbortController().signal);assert.equal(await f.voice.finish(),'こんにちは');
 await f.voice.cancel();await f.voice.start(new AbortController().signal);
 assert.equal(f.sessions.length,2);await f.voice.cancel();
});

test('Japanese demo synthesizes Japanese text with the native Japanese voice; stuck playback cleanup is bounded',{timeout:1000},async t=>{
 const f=fixture(t,{cancel:()=>new Promise(()=>{})});
 await f.voice.speak('こんにちは！','ja',new AbortController().signal);
 assert.deepEqual(f.sessions[0].spoken,['こんにちは！']);
 assert.equal(f.sessions[0].config.voiceType,'ja_male_bv524_uranus_bigtts');
 assert.equal(f.sessions[0].stops.at(-1).closeConnection,true);await f.voice.cancel();
});
