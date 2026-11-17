import {audioActivityActive,subscribeAudioActivity} from './audio_activity.js';

const MUSIC_ROOT='audio/haqi/ariesregionbgmusics/';
export function backgroundMusicId(stage,zone,defaultId){
    if(stage==='battle')return MUSIC_ROOT+'combat_teen_common_trialversion.ogg';
    if(stage==='world'&&zone==='ice')return MUSIC_ROOT+'area_snow.ogg';
    if(stage==='world'&&['camp','dark'].includes(zone))return MUSIC_ROOT+'area_forest.ogg';
    return defaultId;
}
// Keep a small set of original loops so short battles do not restart the forest.
// Only the current loop and its fading predecessor may be audible. A blocked
// incoming play keeps the predecessor until the next real gesture can retry.
export function createBackgroundMusic(url,{audioFactory=src=>new Audio(src),onError=()=>{}}={}){
    const loops=new Map();
    let current,outgoing=null,track=null,wanted=false,timer=null,disposed=false,base=.18;
    function clearFade(){if(timer!=null)clearInterval(timer);timer=null;}
    function stop(entry){if(entry){entry.audio.pause();entry.audio.volume=0;}}
    function fade(){
        clearFade();if(disposed)return;
        const level=wanted?(audioActivityActive()?base*.2:base):0;
        const ready=!current.audio.paused&&!current.pending;
        const targets=[[current,ready?level:0],[outgoing,ready?0:level]].filter(([entry])=>entry);
        if(targets.every(([entry,target])=>entry.audio.volume===target)){
            if(outgoing&&ready){stop(outgoing);outgoing=null;}
            return;
        }
        timer=setInterval(()=>{
            let settled=true;
            for(const [entry,target]of targets){
                const next=entry.audio.volume+(target-entry.audio.volume)*.22;
                entry.audio.volume=Math.abs(target-next)<.003?target:next;
                if(entry.audio.volume!==target)settled=false;
            }
            if(settled){clearFade();if(outgoing&&ready){stop(outgoing);outgoing=null;}}
        },30);
    }
    function setTrack(next){
        if(disposed||next===track)return false;
        clearFade();
        let incoming=loops.get(next);
        if(!incoming){
            const audio=audioFactory(next);audio.loop=true;audio.preload='none';audio.volume=0;
            incoming={audio,pending:null,reported:false};
            audio.onerror=()=>{if(current===incoming&&!incoming.reported){incoming.reported=true;onError();}};
            loops.set(next,incoming);
        }
        if(outgoing&&outgoing!==incoming)stop(outgoing);
        outgoing=wanted&&current&&!current.audio.paused&&current.audio.volume>0?current:null;
        if(current&&!outgoing)stop(current);
        current=incoming;track=next;
        if(!wanted)stop(current);
        // Four original scene themes are enough; do not retain arbitrary URLs.
        for(const [id,entry]of loops){
            if(loops.size<=4)break;
            if(entry===current||entry===outgoing)continue;
            stop(entry);entry.audio.onerror=null;loops.delete(id);
        }
        fade();
        return true;
    }
    setTrack(url);
    const unsubscribe=subscribeAudioActivity(fade);
    return{
        get paused(){return current.audio.paused;},get element(){return current.audio;},setTrack,
        play(){
            if(disposed)return Promise.resolve();wanted=true;fade();
            const entry=current;
            if(!entry.audio.paused||entry.pending)return entry.pending||Promise.resolve();
            const request=entry.audio.play().catch(()=>{}).finally(()=>{
                if(entry.pending===request)entry.pending=null;
                if(disposed||!wanted||(entry!==current&&entry!==outgoing))stop(entry);
                if(!disposed)fade();
            });
            entry.pending=request;return request;
        },
        pause(){wanted=false;clearFade();for(const entry of loops.values())stop(entry);outgoing=null;},
        setVolume(value){if(Number.isFinite(value)){base=Math.max(0,Math.min(.35,value));fade();}},
        dispose(){disposed=true;wanted=false;clearFade();unsubscribe();for(const entry of loops.values()){stop(entry);entry.audio.onerror=null;}loops.clear();outgoing=null;},
    };
}
