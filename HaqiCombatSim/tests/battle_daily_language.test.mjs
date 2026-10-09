import test from 'node:test';
import assert from 'node:assert/strict';
import {awardDailySpeech,previewDailySpeech,dailyBuffs,localBuffDay,validateDailyBuff} from '../js/language_daily_buff_core.js';
import {durableSave,runtimeValues,restoreRuntime,coreCatalogKey} from '../js/adventure_storage_core.js';
import {applyDungeonLanguageBuff,dungeonLanguageBaseHp} from '../js/adventure_dungeon_language_core.js';
import {normalizeStats} from '../js/combat_unit_core.js';
const at=new Date(2026,8,30,23,59,59).getTime();
test('30 spoken turns fill primary attributes, then 10 fill power pips; duplicate callbacks cannot award',()=>{
 const a={seed:42},b={seed:42};
 for(let i=0;i<40;i++){
  assert.deepEqual(awardDailySpeech(a,{},String(i),at),awardDailySpeech(b,{},String(i),at));
  assert.equal(awardDailySpeech(a,{},String(i),at),null);
  if(i===29)assert.deepEqual(dailyBuffs(a,at),{hp:10,attack:10,defense:10,powerPip:0});
 }
 assert.deepEqual(dailyBuffs(a,at),{hp:10,attack:10,defense:10,powerPip:10});
 assert.equal(awardDailySpeech(a,{},'overflow',at),null);assert.equal(a.dailyLanguageBuff.events.length,40);
 assert.equal(localBuffDay(at+1000),'2026-10-01');assert.equal(Object.values(dailyBuffs(a,at+1000)).reduce((a,b)=>a+b),0);
 assert.equal(awardDailySpeech(a,{},'0',at+1000).total,1);
});
test('local runtime survives zone/revision changes and never changes cloud dirty state',()=>{
 const s={seed:2,zone:'camp',revision:1};const before=coreCatalogKey({roles:[{id:'one',save:s}]});
 awardDailySpeech(s,{},'one');const runtime=runtimeValues(s);
 assert.equal(durableSave(s).dailyLanguageBuff,undefined);
 assert.equal(coreCatalogKey({roles:[{id:'one',save:s}]}),before);
 const content={worldMapIndex:{islands:{camp:{initialSpawn:{x:0,y:0}}}}};const restored=restoreRuntime({...durableSave(s),revision:9},content,runtime);
 assert.deepEqual(restored.dailyLanguageBuff,s.dailyLanguageBuff);
 assert.equal(restoreRuntime(durableSave(s),content).dailyLanguageBuff,undefined);
 runtime.dailyLanguageBuff.day='2000-01-01';assert.equal(restoreRuntime(durableSave(s),content,runtime).dailyLanguageBuff,undefined);
});
test('daily battle snapshot is bounded and health settlement removes temporary max HP',()=>{
 const buff={hp:10,attack:10,defense:10,powerPip:10},u={maxHp:500,hp:250,stats:normalizeStats()};
 applyDungeonLanguageBuff(u,validateDailyBuff(buff),{maxPercent:10});
 assert.equal(u.maxHp,550);assert.equal(u.hp,275);assert.equal(dungeonLanguageBaseHp(u),250);
 assert.equal(u.stats.damagePct.all,10);assert.equal(u.stats.resistPct.all,10);assert.equal(u.stats.powerPipPct,10);
 assert.throws(()=>validateDailyBuff({...buff,hp:11}));assert.throws(()=>validateDailyBuff({...buff,hp:1}));
});

test('concrete line reward preview does not mutate progress and is the awarded attribute',()=>{
 const save={seed:42};for(let i=0;i<40;i++){
  const before=JSON.stringify(save),key=previewDailySpeech(save,{},at);assert.equal(JSON.stringify(save),before);
  assert.ok(key);assert.equal(awardDailySpeech(save,{},String(i),at,key).key,key);
 }
 assert.equal(previewDailySpeech(save,{},at),null);
});
