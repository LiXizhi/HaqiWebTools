import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createLineAttempt,startLineAttempt,finishLineAttempt,dungeonLanguageBuff,awardDungeonLine,applyDungeonLanguageBuff,dungeonLanguageBaseHp} from '../js/adventure_dungeon_language_core.js';
import {pauseBackgroundScene} from '../js/adventure_scene_pause_core.js';
import {durableSave,runtimeValues} from '../js/adventure_storage_core.js';
import {normalizeStats} from '../js/combat_unit_core.js';
const entries=JSON.parse(fs.readFileSync(new URL('../data/adventure/dungeon-journeys.json',import.meta.url))).entries;
const content={dungeons:entries};
test('all 18 entrances have complete bilingual, alternating scripts and three distinct player rewards',()=>{
 assert.equal(entries.length,18);
 for(const d of entries){assert.equal(d.story.length,8);assert.equal(new Set(d.story.map(l=>l.id)).size,8);assert.deepEqual(d.story.filter(l=>l.role==='player').map(l=>l.reward),['hp','attack','defense']);for(const l of d.story){assert.ok(l.text.length>0);assert.match(l.en,/[A-Za-z]/);}}
});
test('speech has no start deadline; only matching ASR awards once',()=>{
 const line=entries[0].story[2];const a=createLineAttempt(line,100,content);
 assert.equal(startLineAttempt(a,60000),true);assert.equal(finishLineAttempt(a,line.en,line.en,'en'),true);
 const b=createLineAttempt(line,100,content);assert.equal(startLineAttempt(b,5099),true);assert.equal(startLineAttempt(b,5099),false);
 assert.equal(finishLineAttempt(b,line.en,line.en,'en'),true);assert.equal(finishLineAttempt(b,line.en,line.en,'en'),false);
 for(const spoken of ['', 'hello', 'give me a buff']){const c=createLineAttempt(line,0,content);startLineAttempt(c,1);assert.equal(finishLineAttempt(c,spoken,line.en,'en'),false);}
});
test('run reward is bound to the dungeon, deduplicated and local-only',()=>{
 const d=entries[0],save={zone:d.id,dungeonLanguageBuff:{dungeonId:d.id,lines:[]}};
 for(const l of d.story.filter(l=>l.role==='player')){assert.equal(awardDungeonLine(save,content,l.id),true);assert.equal(awardDungeonLine(save,content,l.id),false);}
 assert.deepEqual(dungeonLanguageBuff(save,content),{hp:1,attack:1,defense:1});
 assert.equal(durableSave(save).dungeonLanguageBuff,undefined);assert.deepEqual(runtimeValues(save).values.dungeonLanguageBuff,save.dungeonLanguageBuff);
 assert.throws(()=>dungeonLanguageBuff({...save,zone:'camp'},content));assert.throws(()=>awardDungeonLine(save,content,'invented-line'));
 assert.equal(save.dungeonLanguageBuff.lines.length,3);
});
test('language bonuses affect combat stats, keep dead heroes dead and return base health without permanent growth',()=>{
 const u={maxHp:415,hp:415,stats:normalizeStats()};applyDungeonLanguageBuff(u,{hp:1,attack:1,defense:1},{maxPercent:3});
 assert.equal(u.maxHp,420);assert.equal(u.hp,420);assert.equal(u.stats.damagePct.all,1);assert.equal(u.stats.resistPct.all,1);assert.equal(dungeonLanguageBaseHp(u),415);
 u.hp=210;assert.equal(dungeonLanguageBaseHp(u),208);
 const dead={maxHp:415,hp:0,stats:normalizeStats()};applyDungeonLanguageBuff(dead,{hp:1},{maxPercent:3});assert.equal(dead.hp,0);
 assert.throws(()=>applyDungeonLanguageBuff(u,{attack:99},{maxPercent:3}));
});
test('common scene gate pauses every blocking screen but resumes the world',()=>{
 assert.equal(pauseBackgroundScene({stage:'world'}),false);
 for(const state of [{stage:'battle'},{stage:'world',panel:'dungeon-story'},{panel:'map'},{dialog:{}},{learning:true},{conversation:true},{fullscreen:true},{hidden:true}])assert.equal(pauseBackgroundScene(state),true);
});
