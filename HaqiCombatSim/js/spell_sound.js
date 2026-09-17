import {createRng,hashSeed} from './rng_core.js';
import {spellSoundCues,crossedSoundCues} from './spell_sound_core.js';
const KEY='haqi.spell-sound.v1';
export function createSpellSound({defaultEnabled=false,contextFactory=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)()}={}) {
    let enabled=defaultEnabled,context,master,noise,previous=null,lastKey='',unlocked=false;
    try{const stored=localStorage.getItem(KEY);if(stored!==null)enabled=stored==='on';}catch{}
    const voices=new Set();
    function stop(){for(const voice of [...voices]){try{voice.source.stop();}catch{}voice.cleanup();}previous=null;lastKey='';}
    async function unlock(){
        if(!enabled)return false;
        try{
            if(!context){context=contextFactory();master=context.createGain();master.gain.value=.3;master.connect(context.destination);
                noise=context.createBuffer(1,context.sampleRate,context.sampleRate);const data=noise.getChannelData(0),rng=createRng(hashSeed('haqi-spell-noise'));
                for(let i=0;i<data.length;i++)data[i]=rng.float()*2-1;
            }
            if(context.state==='suspended')await context.resume();unlocked=context.state==='running';return unlocked;
        }catch{unlocked=false;return false;}
    }
    function voice(cue,noisy){
        if(voices.size>=24)return;
        const t=context.currentTime,source=noisy?context.createBufferSource():context.createOscillator(),gain=context.createGain(),filter=context.createBiquadFilter();
        filter.type='lowpass';filter.frequency.value=cue.filter;
        if(noisy){source.buffer=noise;}else{source.type=cue.wave;source.frequency.setValueAtTime(cue.frequency,t);source.frequency.exponentialRampToValueAtTime(cue.end,t+cue.duration);}
        const peak=cue.gain*(noisy?cue.noise:1);gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(Math.max(.0001,peak),t+.012);gain.gain.exponentialRampToValueAtTime(.0001,t+cue.duration);
        source.connect(filter);filter.connect(gain);gain.connect(master);
        const handle={source,cleanup(){source.disconnect();filter.disconnect();gain.disconnect();voices.delete(handle);}};
        voices.add(handle);source.onended=handle.cleanup;source.start(t);source.stop(t+cue.duration+.02);
    }
    function track(config,card,progress,{active=true,failed=false,reducedMotion=false,instance=''}={}){
        if(!active||!enabled||!unlocked||context?.state!=='running'){stop();return;}
        const key=card.key+':'+failed+':'+instance;
        if(key!==lastKey){stop();lastKey=key;previous=progress<.08?-.001:null;}
        const cues=spellSoundCues(config,card,{failed,reducedMotion});
        for(const cue of crossedSoundCues(cues,previous,progress)){voice(cue,false);if(cue.noise)voice(cue,true);}
        previous=progress;
    }
    return {get enabled(){return enabled;},unlock,track,stop,
        async setEnabled(value){enabled=!!value;try{localStorage.setItem(KEY,enabled?'on':'off');}catch{}if(!enabled){stop();return false;}return unlock();},
        async dispose(){stop();await context?.close();context=null;unlocked=false;}
    };
}
