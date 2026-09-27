import {createRng,hashSeed} from './rng_core.js';
import {spellSoundCues,crossedSoundCues} from './spell_sound_core.js';
import {gameSoundRecipe} from './game_sound_core.js';
import {audioActivityActive,subscribeAudioActivity} from './audio_activity.js';
const KEY='haqi.spell-sound.v1',VOLUME_KEY='haqi.game-sound.volume.v1';
export function createSpellSound({defaultEnabled=false,contextFactory=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)(),now=()=>globalThis.performance.now()}={}) {
    let enabled=defaultEnabled,volume=.3,context,master,noise,previous=null,lastKey='',unlocked=false,disposed=false;
    try{const stored=localStorage.getItem(KEY);if(stored!==null)enabled=stored==='on';const value=localStorage.getItem(VOLUME_KEY);if(value!==null&&Number.isFinite(Number(value)))volume=Math.max(0,Math.min(1,Number(value)));}catch{}
    const groups=new Set(),lastPlayed=new Map(),tokens=new Set();
    const muted=()=>tokens.size>0||audioActivityActive();
    function remove(group){for(const voice of [...group.voices]){try{voice.source.stop();}catch{}voice.cleanup();}groups.delete(group);}
    function stopCast(){for(const group of [...groups])if(group.cast)remove(group);previous=null;lastKey='';}
    function stop(){for(const group of [...groups])remove(group);previous=null;lastKey='';lastPlayed.clear();}
    const unsubscribe=subscribeAudioActivity(active=>{if(active)stop();});
    async function unlock(){
        if(!enabled||disposed)return false;
        try{
            if(!context){context=contextFactory();master=context.createGain();master.gain.value=volume;
                if(context.createDynamicsCompressor){const limiter=context.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=6;limiter.ratio.value=12;limiter.attack.value=.003;limiter.release.value=.12;master.connect(limiter);limiter.connect(context.destination);}else master.connect(context.destination);
                noise=context.createBuffer(1,context.sampleRate,context.sampleRate);const data=noise.getChannelData(0),rng=createRng(hashSeed('haqi-spell-noise'));
                for(let i=0;i<data.length;i++)data[i]=rng.float()*2-1;
            }
            if(context.state==='suspended')await context.resume();unlocked=context.state==='running';return unlocked;
        }catch{unlocked=false;return false;}
    }
    function voice(cue,noisy,group,delay=0){
        const t=context.currentTime+delay+(cue.delay||0),source=noisy?context.createBufferSource():context.createOscillator(),gain=context.createGain(),filter=context.createBiquadFilter();
        filter.type='lowpass';filter.frequency.value=cue.filter;
        if(noisy){source.buffer=noise;}else{source.type=cue.wave;source.frequency.setValueAtTime(cue.frequency,t);source.frequency.exponentialRampToValueAtTime(cue.end,t+cue.duration);}
        const peak=cue.gain*(noisy?cue.noise:1);gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(Math.max(.0001,peak),t+.012);gain.gain.exponentialRampToValueAtTime(.0001,t+cue.duration);
        source.connect(filter);filter.connect(gain);gain.connect(master);
        let cleaned=false;
        const handle={source,cleanup(){if(cleaned)return;cleaned=true;source.disconnect();filter.disconnect();gain.disconnect();group.voices.delete(handle);if(!group.voices.size)groups.delete(group);}};
        group.voices.add(handle);source.onended=handle.cleanup;source.start(t);source.stop(t+cue.duration+.02);
    }
    function ready(){return enabled&&volume>0&&!muted()&&unlocked&&context?.state==='running'&&!globalThis.document?.hidden&&!disposed;}
    function emit(cues,priority,cast=false){
        if(!ready())return false;
        if(priority===0&&[...groups].some(g=>g.priority>0))return false;
        if(priority>0)for(const g of [...groups])if(g.priority===0)remove(g);
        if(groups.size>=8){const lowest=[...groups].sort((a,b)=>a.priority-b.priority)[0];if(lowest.priority>=priority)return false;remove(lowest);}
        const group={priority,cast,voices:new Set()};groups.add(group);
        try{for(const cue of cues){voice(cue,false,group,priority===0?.035:0);if(cue.noise)voice(cue,true,group,priority===0?.035:0);}return true;}
        catch{remove(group);return false;}
    }
    function play(name){
        const recipe=gameSoundRecipe(name);if(!recipe||!ready()||(name==='click'&&groups.size))return false;
        const time=now();if(time-(lastPlayed.get(name)??-Infinity)<100)return false;
        if(!emit(recipe.cues,recipe.priority))return false;lastPlayed.set(name,time);return true;
    }
    function track(config,card,progress,{active=true,failed=false,reducedMotion=false,instance=''}={}){
        if(!active||!ready()){stopCast();return;}
        const key=card.key+':'+failed+':'+instance;
        if(key!==lastKey){stopCast();lastKey=key;previous=progress<.08?-.001:null;}
        const cues=spellSoundCues(config,card,{failed,reducedMotion});
        for(const cue of crossedSoundCues(cues,previous,progress))emit([cue],1,true);
        previous=progress;
    }
    return {get enabled(){return enabled;},get volume(){return volume;},unlock,track,play,stop,stopCast,
        setVolume(value){if(!Number.isFinite(Number(value)))return;volume=Math.max(0,Math.min(1,Number(value)));if(master){if(master.gain.setTargetAtTime)master.gain.setTargetAtTime(volume,context.currentTime,.015);else master.gain.setValueAtTime(volume,context.currentTime);}if(!volume)stop();try{localStorage.setItem(VOLUME_KEY,String(volume));}catch{}},
        acquireMute(){const token={};tokens.add(token);stop();return ()=>tokens.delete(token);},
        async setEnabled(value){enabled=!!value;try{localStorage.setItem(KEY,enabled?'on':'off');}catch{}if(!enabled){stop();return false;}return unlock();},
        async dispose(){disposed=true;unsubscribe();stop();await context?.close();context=null;unlocked=false;}
    };
}
