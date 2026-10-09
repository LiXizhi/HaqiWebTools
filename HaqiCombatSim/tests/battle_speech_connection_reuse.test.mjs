import test from 'node:test';
import assert from 'node:assert/strict';
import {createLearningVoice} from '../js/language_adventure_voice.js';

function sdkMock(){
    const sessions=[];
    const sdk={token:'one',speechRTC:{createSession(config){
        const listeners=new Map();const row={config,starts:0,finishes:0,syntheses:0,stops:[],
            on:(name,fn)=>listeners.set(name,fn),off:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);},
            startASR:async()=>{row.starts++;},finishASR:async()=>{row.finishes++;listeners.get('asr')?.({text:'Answer '+row.finishes});},
            sendAudio(){},synthesize:async()=>{row.syntheses++;return {audioUrl:'data:audio/mpeg;base64,YQ=='};},
            cancel:async()=>{},stop:async options=>{row.stops.push(options);},listeners};sessions.push(row);return row;
        },synthesizeCached(){throw Error('must not close cached-helper transport');}}};return {sdk,sessions};
}

test('alternating speakers reuse per-voice sessions and never explicitly close their connections',async t=>{
    const audio=globalThis.Audio;globalThis.Audio=class{play(){queueMicrotask(()=>this.onended());return Promise.resolve();}pause(){}};t.after(()=>{globalThis.Audio=audio;});
    const {sdk,sessions}=sdkMock();let voiceType='a';const voice=createLearningVoice({load:async()=>sdk,getSettings:()=>({voiceType})});
    for(const [speaker,text] of [['a','First line'],['b','Second line'],['a','Third line'],['b','Fourth line']]){voiceType=speaker;await voice.speak(text,'en',new AbortController().signal);}
    assert.equal(sessions.length,2);assert.deepEqual(sessions.map(s=>s.syntheses),[2,2]);assert.ok(sessions.every(s=>s.stops.every(o=>o.closeConnection===false)));
    await voice.cancel();await voice.speak('Fifth line','en',new AbortController().signal);assert.equal(sessions.length,2);
    sdk.token='two';await voice.speak('New account line','en',new AbortController().signal);assert.equal(sessions.length,3);await voice.cancel();
});

test('consecutive ASR recordings reuse one session, finish each segment, detach listeners and stop microphone',async t=>{
    const nav=Object.getOwnPropertyDescriptor(globalThis,'navigator'),context=globalThis.AudioContext;let stopped=0;
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++;}}]})}}});
    globalThis.AudioContext=class{sampleRate=16000;resume=async()=>{};close=async()=>{};createMediaStreamSource(){return {connect(){},disconnect(){}};}createScriptProcessor(){return {connect(){},disconnect(){}};}};
    t.after(()=>{if(nav)Object.defineProperty(globalThis,'navigator',nav);else delete globalThis.navigator;globalThis.AudioContext=context;});
    const {sdk,sessions}=sdkMock(),voice=createLearningVoice({load:async()=>sdk});
    for(let i=1;i<=3;i++){await voice.start(new AbortController().signal);assert.equal(await voice.finish(),'Answer '+i);assert.equal(sessions[0].listeners.size,0);}
    assert.equal(sessions.length,1);assert.equal(sessions[0].starts,3);assert.equal(sessions[0].finishes,3);assert.ok(stopped>=3);
    const partials=[];await voice.start(new AbortController().signal,{onPartial:text=>partials.push(text)});const oldListener=sessions[0].listeners.get('asr');oldListener({text:'live'});oldListener({text:'live corrected'});assert.deepEqual(partials,['live','live corrected']);await voice.cancel();oldListener({text:'stale'});assert.deepEqual(partials,['live','live corrected']);assert.equal(sessions[0].finishes,4);assert.equal(sessions[0].listeners.size,0);
    await voice.start(new AbortController().signal);assert.equal(await voice.finish(),'Answer 5');assert.equal(sessions.length,1);
    assert.ok(sessions[0].stops.every(o=>o.closeConnection===false));
});
