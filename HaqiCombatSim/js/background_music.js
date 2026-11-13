import {audioActivityActive,subscribeAudioActivity} from './audio_activity.js';

// One original music loop. Dialogue ducks it; visibility/user preference pauses it.
// Autoplay rejection is retried by the next real gesture, not a timer.
export function createBackgroundMusic(url,{audioFactory=src=>new Audio(src),onError=()=>{}}={}){
    const audio=audioFactory(url);audio.loop=true;audio.preload='none';audio.volume=0;
    let wanted=false,pending=null,timer=null,disposed=false,reported=false,base=.18;
    function fade(){
        if(timer!=null)clearInterval(timer);timer=null;if(disposed)return;
        const target=wanted?(audioActivityActive()?base*.2:base):0;
        if(!wanted&&audio.paused){audio.volume=0;return;}
        timer=setInterval(()=>{const next=audio.volume+(target-audio.volume)*.22;audio.volume=Math.abs(target-next)<.003?target:next;if(audio.volume===target){if(timer!=null)clearInterval(timer);timer=null;if(!wanted)audio.pause();}},30);
    }
    const unsubscribe=subscribeAudioActivity(fade);
    audio.onerror=()=>{if(!reported){reported=true;onError();}};
    return{
        get paused(){return audio.paused;},get element(){return audio;},
        play(){wanted=true;fade();if(disposed||!audio.paused||pending)return pending||Promise.resolve();pending=audio.play().catch(()=>{}).finally(()=>{pending=null;if(disposed||!wanted)audio.pause();});return pending;},
        pause(){wanted=false;if(timer!=null)clearInterval(timer);timer=null;audio.pause();audio.volume=0;},
        setVolume(value){if(Number.isFinite(value)){base=Math.max(0,Math.min(.35,value));fade();}},
        dispose(){disposed=true;wanted=false;if(timer!=null)clearInterval(timer);timer=null;unsubscribe();audio.pause();audio.onerror=null;},
    };
}
