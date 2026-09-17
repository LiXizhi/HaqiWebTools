import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spellSoundCues,crossedSoundCues} from '../js/spell_sound_core.js';
import {createSpellSound} from '../js/spell_sound.js';
const config=JSON.parse(fs.readFileSync(new URL('../data/adventure/spell-effects.json',import.meta.url)));
const cards=JSON.parse(fs.readFileSync(new URL('../data/kids/cards.json',import.meta.url)));
test('all sound recipes are bounded, deterministic and preserve secondary timing',()=>{
 for(const card of Object.values(cards))for(const options of [{},{failed:true},{reducedMotion:true}]){
  const cues=spellSoundCues(config,card,options);assert.deepEqual(cues,spellSoundCues(config,card,options));
  for(const c of cues){assert.ok(c.at>=0&&c.at<1);assert.ok(c.frequency>0&&c.end>0&&c.duration>0&&c.duration<1);assert.ok(c.gain<=.18&&c.noise<=.4);}
 }
 const ice=spellSoundCues(config,cards.Ice_SingleAttack_Level6);assert.equal(ice.length,6);
 assert.equal(ice[1].at,config.timeline.summonAttack);
 const cues=[{at:0},{at:.4},{at:.7}];
 assert.deepEqual(crossedSoundCues(cues,-.001,.01),[cues[0]]);
 assert.deepEqual(crossedSoundCues(cues,.39,.42),[cues[1]]);
 assert.deepEqual(crossedSoundCues(cues,.42,.42),[]);
 assert.deepEqual(crossedSoundCues(cues,null,.8),[]);
 assert.deepEqual(crossedSoundCues(cues,.1,.8),[]);
 assert.deepEqual(crossedSoundCues(cues,.98,.02),[cues[0]]);
});
test('audio requires unlock, plays once per cue, caps voices, cancels on pause and mute',async()=>{
 let starts=0,stops=0,closed=0;
 const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(value){assert.ok(value>0);}});
 const node=()=>({connect(){},disconnect(){},gain:param(),frequency:param()});
 const source=()=>({...node(),start(){starts++;},stop(){stops++;}});
 const context={state:'suspended',currentTime:1,sampleRate:100,destination:{},createGain:node,createBiquadFilter:node,createOscillator:source,createBufferSource:source,createBuffer:()=>({getChannelData:()=>new Float32Array(100)}),async resume(){this.state='running';},async close(){closed++;}};
 const sound=createSpellSound({defaultEnabled:true,contextFactory:()=>context}),card=cards.Ice_SingleAttack_Level6;
 sound.track(config,card,0);assert.equal(starts,0);
 assert.equal(await sound.unlock(),true);
 sound.track(config,card,0);const once=starts;assert.ok(once>0);
 sound.track(config,card,0);assert.equal(starts,once);
 for(let i=1;i<=100;i++)sound.track(config,card,i/100);
 assert.ok(starts<=24);sound.track(config,card,1,{active:false});assert.ok(stops>=starts);
 await sound.setEnabled(false);sound.track(config,card,0);const muted=starts;
 sound.track(config,card,.7);assert.equal(starts,muted);
 await sound.dispose();assert.equal(closed,1);
 const unsupported=createSpellSound({defaultEnabled:true,contextFactory:()=>{throw Error('unsupported');}});
 assert.equal(await unsupported.unlock(),false);unsupported.track(config,card,0);
});
