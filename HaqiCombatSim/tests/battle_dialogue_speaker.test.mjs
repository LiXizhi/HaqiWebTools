import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {dialogueSpeaker,selectDialogueVoice} from '../js/dialogue_speaker_core.js';
import {createLearningVoice} from '../js/language_adventure_voice.js';
import {projectRuntimeData} from '../scripts/package_runtime_data.mjs';
import {installNpcCatalog} from '../js/adventure_npc_core.js';
const read=name=>JSON.parse(fs.readFileSync(new URL(`../data/adventure/${name}.json`,import.meta.url)));
const valid=row=>{assert.ok(['male','female'].includes(row.sex),row.name||row.speaker);assert.ok(Number.isInteger(row.age)&&row.age>=1&&row.age<=80);};
test('every resident, course, companion, fixed profile and dungeon speaker has casting metadata',()=>{
 const catalog=read('npc-catalog'),chapter=read('chapter');
 for(const row of [...catalog.npcs,...Object.values(chapter.npcs),...read('camp-conversations').profiles,...read('social').personas,...Object.values(read('character-memories').entries).map(e=>e.profile)])valid(row);
 for(const e of read('dungeon-journeys').entries)for(const row of e.story)if(row.role!=='player')valid(row);
 const packed=projectRuntimeData('adventure/npc-catalog.json',catalog);packed.npcs.forEach(valid);installNpcCatalog(chapter,packed);Object.values(chapter.npcs).forEach(valid);
 const same=new Map();for(const row of catalog.npcs){const fields={sex:row.sex,age:row.age};if(same.has(row.name))assert.deepEqual(fields,same.get(row.name));same.set(row.name,fields);}
});
test('casting uses sex and age boundaries, and hero appearance uses male/female voices',()=>{
 for(const sex of ['male','female']){for(const age of [1,12,13,20,21,45,46,80])assert.ok(selectDialogueVoice({sex,age}).includes(`_${sex}_`));
 assert.notEqual(selectDialogueVoice({sex,age:12}),selectDialogueVoice({sex,age:13}));assert.notEqual(selectDialogueVoice({sex,age:20}),selectDialogueVoice({sex,age:21}));assert.notEqual(selectDialogueVoice({sex,age:45}),selectDialogueVoice({sex,age:46}));}
 assert.ok(selectDialogueVoice({appearance:'boy'}).includes('_male_'));assert.ok(selectDialogueVoice({appearance:'girl'}).includes('_female_'));
 for(const age of [0,81,NaN,1.5,'10'])assert.equal(dialogueSpeaker({sex:'female',age}).age,25);
 assert.equal(selectDialogueVoice({sex:'male',age:8},[{id:'zh_male_yangguangqingnian_moon_bigtts'}]),'zh_male_yangguangqingnian_moon_bigtts');
 assert.throws(()=>selectDialogueVoice({sex:'male'},[{id:'zh_female_cancan_mars_bigtts'}]),/匹配/);
});
test('reusable SDK sessions carry each speaker voice instead of saved global female voice',async()=>{
 const calls=[],oldAudio=globalThis.Audio;globalThis.Audio=class{play(){queueMicrotask(()=>this.onended());return Promise.resolve();}pause(){}};
 const voice=createLearningVoice({getSettings:()=>({voiceType:'zh_female_cancan_mars_bigtts'}),load:async()=>({speechRTC:{createSession(options){return {synthesize:async()=>{calls.push(options);return {audioUrl:'blob:test'};},stop:async()=>{}};}}})});
 try{const signal=new AbortController().signal;for(const speaker of [{sex:'male',age:8},{sex:'male',age:68},{sex:'female',age:28},{appearance:'boy'},{appearance:'girl'}])await voice.speak('同一句话','zh-CN',signal,speaker);
 assert.match(calls[0].voiceType,/male_tiancaitongsheng/);assert.match(calls[1].voiceType,/male_jieshuo/);assert.match(calls[2].voiceType,/_female_/);assert.match(calls[3].voiceType,/_male_/);assert.match(calls[4].voiceType,/_female_/);
 }finally{await voice.cancel();globalThis.Audio=oldAudio;}
});
