import test from 'node:test';
import assert from 'node:assert/strict';
import {gameSoundRecipe,rewardSound,battleEventSound} from '../js/game_sound_core.js';
import {createSpellSound} from '../js/spell_sound.js';
import {acquireAudioActivity,audioActivityActive} from '../js/audio_activity.js';
import {createLearningVoice} from '../js/language_adventure_voice.js';
import {speakBrowserText,cancelBrowserSpeech} from '../js/browser_speech.js';
import fs from 'node:fs';
import {createAdventure,beginEncounter} from '../js/adventure_core.js';
import {restorePveBattle,playPveRound} from '../js/combat_pve_core.js';
import {SimpleBot} from '../js/combat_policy_core.js';
import {captureBattlePresentation} from '../js/view_battle_presentation.js';

function harness(){
    let time=0;
    const sources=[],gains=[];
    const param=()=>({value:0,setValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;}});
    const node=()=>({connect(){},disconnect(){},gain:param(),frequency:param()});
    const source=()=>{const s={...node(),start(t){this.started=t;},stop(t){if(t===undefined)this.cancelled=true;}};sources.push(s);return s;};
    const context={state:'suspended',currentTime:0,sampleRate:100,destination:{},createGain(){const n=node();gains.push(n);return n;},createBiquadFilter:node,createOscillator:source,createBufferSource:source,createBuffer:()=>({getChannelData:()=>new Float32Array(100)}),async resume(){this.state='running';},async close(){this.state='closed';}};
    return {sound:createSpellSound({defaultEnabled:true,contextFactory:()=>context,now:()=>time}),sources,gains,advance(){time+=101;},context};
}
test('all gameplay recipes are short, bounded and deterministic',()=>{
    for(const name of ['click','open','close','select','discard','hit','heal','shield','fizzle','capture','miss','victory','defeat','level','quest','reward','purchase','equip','teleport','splash','catch','feed','friendship','adopt']){
        const recipe=gameSoundRecipe(name);assert.deepEqual(recipe,gameSoundRecipe(name));
        for(const cue of recipe.cues){assert.ok(cue.duration+cue.delay<=1.2);assert.ok(cue.gain<=.11);assert.ok(cue.frequency>0&&cue.end>0);}
    }
    assert.equal(gameSoundRecipe('unknown'),null);
    assert.equal(rewardSound({level:2,items:[{}]},'claim'),'level');
    assert.equal(rewardSound({items:[{}]},'claim'),'quest');
    assert.equal(rewardSound({items:[{}]},'buy'),'purchase');
    assert.equal(rewardSound({items:[],xp:0}),null);
});
test('cast impact is not duplicated by damage, healing or status; periodic effects remain audible',()=>{
    const events=[{type:'movearrow'},{type:'cast'},{type:'damage'},{type:'damage'},{type:'heal'},{type:'status'},{type:'damage',periodic:true}];
    for(let i=2;i<6;i++)assert.equal(battleEventSound(events,i),null);
    assert.equal(battleEventSound(events,6),'hit');
    assert.equal(battleEventSound([{type:'heal',periodic:true}],0),'heal');
    assert.equal(battleEventSound([{type:'capture',success:true}],0),'capture');
    assert.equal(battleEventSound([{type:'capture',success:false}],0),'miss');
});
test('unlock, rate limiting, cast-only cleanup, priority and eight-group limit',async()=>{
    const h=harness(),s=h.sound;
    assert.equal(s.play('click'),false);await s.unlock();
    assert.equal(s.play('click'),true);assert.equal(s.play('click'),false);
    s.stopCast();assert.equal(h.sources[0].cancelled,undefined);
    assert.equal(s.play('level'),true);assert.equal(h.sources[0].cancelled,true);
    assert.equal(s.play('click'),false);
    s.stop();
    for(let i=0;i<8;i++){h.advance();assert.equal(s.play('hit'),true);}
    h.advance();assert.equal(s.play('hit'),false);
    assert.equal(s.play('victory'),true);
    s.setVolume(2);assert.equal(s.volume,1);assert.equal(h.gains[0].gain.value,1);
    s.setVolume(0);assert.equal(s.play('heal'),false);
    s.setVolume(.3);await s.setEnabled(false);assert.equal(s.play('heal'),false);
    await s.dispose();
});
test('overlapping speech and local mute tokens stop audio without changing preference',async()=>{
    const {sound:s}=harness();await s.unlock();assert.equal(s.play('heal'),true);
    const first=acquireAudioActivity(),second=acquireAudioActivity();
    assert.equal(s.enabled,true);assert.equal(s.play('heal'),false);
    first();first();assert.equal(audioActivityActive(),true);
    second();assert.equal(audioActivityActive(),false);assert.equal(s.play('heal'),true);
    const a=s.acquireMute(),b=s.acquireMute();a();assert.equal(s.play('hit'),false);b();assert.equal(s.play('hit'),true);
    await s.dispose();
});
test('failed recording releases its audio token',async()=>{
    const voice=createLearningVoice({load:async()=>{assert.equal(audioActivityActive(),true);throw Error('offline');}});
    await assert.rejects(voice.start(new AbortController().signal),/offline/);
    assert.equal(audioActivityActive(),false);await voice.cancel();
});
test('failed speech synthesis releases its audio token',async()=>{
    const voice=createLearningVoice({load:async()=>({speechRTC:{createSession(){return {async synthesize(){assert.equal(audioActivityActive(),true);throw Error('offline');},stop:async()=>{}};}}})});
    await assert.rejects(voice.speak('你好','zh',new AbortController().signal),/offline/);
    assert.equal(audioActivityActive(),false);await voice.cancel();
});
test('native speech completion, replacement, cancellation and failure release tokens',t=>{
    const prior=globalThis.speechSynthesis,priorUtterance=globalThis.SpeechSynthesisUtterance;
    let utterance;
    globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
    globalThis.speechSynthesis={cancel(){},speak(value){utterance=value;}};
    t.after(()=>{cancelBrowserSpeech();if(prior===undefined)delete globalThis.speechSynthesis;else globalThis.speechSynthesis=prior;if(priorUtterance===undefined)delete globalThis.SpeechSynthesisUtterance;else globalThis.SpeechSynthesisUtterance=priorUtterance;});
    assert.equal(speakBrowserText('你好','zh-CN'),true);assert.equal(audioActivityActive(),true);
    const old=utterance;speakBrowserText('欢迎','zh-CN');old.onend();assert.equal(audioActivityActive(),true);
    utterance.onend();assert.equal(audioActivityActive(),false);
    speakBrowserText('你好','zh-CN');cancelBrowserSpeech();assert.equal(audioActivityActive(),false);
    globalThis.speechSynthesis.speak=()=>{throw Error('unsupported');};assert.equal(speakBrowserText('你好','zh-CN'),false);assert.equal(audioActivityActive(),false);
});
test('page hidden and completed nodes cannot replay old sounds or exhaust the cap',async t=>{
    const previous=globalThis.document;globalThis.document={hidden:false};
    t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
    const h=harness();await h.sound.unlock();
    for(let i=0;i<20;i++){h.advance();assert.equal(h.sound.play('hit'),true);for(const source of h.sources)source.onended();}
    globalThis.document.hidden=true;assert.equal(h.sound.play('victory'),false);
    globalThis.document.hidden=false;assert.equal(h.sound.play('victory'),true);
    await h.sound.dispose();
});
test('complete real PVE battle with sound preserves combat events and RNG',async()=>{
    const read=file=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+file,import.meta.url)));
    const content=read('chapter.json'),dataset=read('combat.json'),config=read('spell-effects.json');
    const save=createAdventure(content,{seed:530});beginEncounter(save,content,'ice-scout');
    const h=harness();await h.sound.unlock();
    function run(audible){
        const battle=restorePveBattle(dataset,content,save.pendingEncounter),bot=new SimpleBot();let round=0;
        while(!battle.finished&&round++<100){
            const decision=bot.pick(battle,battle.sides.near[0]);
            if(!audible){playPveRound(battle,decision);continue;}
            const {events}=captureBattlePresentation(battle,()=>playPveRound(battle,decision));
            for(const [index,event] of events.entries()){
                if(event.type==='cast'||event.type==='fizzle'){
                    for(let frame=0;frame<=100;frame++)h.sound.track(config,battle.resolved.cards[event.card],frame/100,{failed:event.type==='fizzle',instance:`${round}:${index}`});
                    h.sound.stopCast();
                }else{const cue=battleEventSound(events,index);if(cue)h.sound.play(cue);}
                h.advance();for(const source of h.sources)source.onended();
            }
        }
        assert.equal(battle.finished,true);
        if(audible)assert.equal(h.sound.play(battle.winner==='near'?'victory':'defeat'),true);
        return {events:battle.events,winner:battle.winner,nextRandom:battle.rng.float()};
    }
    assert.deepEqual(run(true),run(false));assert.ok(h.sources.length>0);await h.sound.dispose();
});
