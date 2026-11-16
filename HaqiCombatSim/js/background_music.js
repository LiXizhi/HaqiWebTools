import {audioActivityActive,subscribeAudioActivity} from './audio_activity.js';

const MUSIC_ROOT='audio/haqi/ariesregionbgmusics/';
export function backgroundMusicId(stage,zone,defaultId){
    if(stage==='battle')return MUSIC_ROOT+'combat_teen_common_trialversion.ogg';
    if(stage==='world'&&zone==='ice')return MUSIC_ROOT+'area_snow.ogg';
    if(stage==='world'&&['camp','dark'].includes(zone))return MUSIC_ROOT+'area_forest.ogg';
    return defaultId;
}
// Original Haqi loops. Dialogue ducks music; visibility/user preference pauses it.
// Autoplay rejection is retried by the next real gesture, not a timer.
export function createBackgroundMusic(url,{audioFactory=src=>new Audio(src),onError=()=>{}}={}){
    let audio,track=null,wanted=false,pending=null,timer=null,disposed=false,reported=false,base=.18;
    function clearFade(){if(timer!=null)clearInterval(timer);timer=null;}
    function fade(){
        clearFade();if(disposed)return;
        const target=wanted?(audioActivityActive()?base*.2:base):0;
        if(!wanted&&audio.paused){audio.volume=0;return;}
        timer=setInterval(()=>{const next=audio.volume+(target-audio.volume)*.22;audio.volume=Math.abs(target-next)<.003?target:next;if(audio.volume===target){clearFade();if(!wanted)audio.pause();}},30);
    }
    function setTrack(next){
        if(disposed||next===track)return false;
        clearFade();if(audio){audio.pause();audio.onerror=null;}
        track=next;pending=null;reported=false;audio=audioFactory(next);audio.loop=true;audio.preload='none';audio.volume=0;
        audio.onerror=()=>{if(!reported){reported=true;onError();}};
        return true;
    }
    setTrack(url);
    const unsubscribe=subscribeAudioActivity(fade);
    return{
        get paused(){return audio.paused;},get element(){return audio;},setTrack,
        play(){
            if(disposed)return Promise.resolve();wanted=true;fade();
            if(!audio.paused||pending)return pending||Promise.resolve();
            const playing=audio;
            const request=playing.play().catch(()=>{}).finally(()=>{if(pending===request)pending=null;if(disposed||!wanted||playing!==audio)playing.pause();});
            pending=request;return request;
        },
        pause(){wanted=false;clearFade();audio.pause();audio.volume=0;},
        setVolume(value){if(Number.isFinite(value)){base=Math.max(0,Math.min(.35,value));fade();}},
        dispose(){disposed=true;wanted=false;clearFade();unsubscribe();audio.pause();audio.onerror=null;},
    };
}
