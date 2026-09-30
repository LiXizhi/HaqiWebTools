import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {awardDailySpeech} from '../js/language_daily_buff_core.js';
import {speechRewardStatus,claimSpeechReward,validateSpeechClaims} from '../js/language_speech_rewards_core.js';
import {durableSave,restoreRuntime} from '../js/adventure_storage_core.js';
import {createAdventure,applyAction} from '../js/adventure_core.js';
import {checkedProgress} from '../js/adventure_cloud_core.js';
const load=n=>JSON.parse(fs.readFileSync(new URL(`../data/adventure/${n}.json`,import.meta.url)));
const content=load('chapter'),dataset=load('combat'),now=new Date(2026,9,1,12).getTime();
function speak(save,n,at=now){for(let i=0;i<n;i++)awardDailySpeech(save,content,String(i),at);}
test('speaking milestones unlock exact rewards and reject early or duplicate claims',()=>{
 const save=createAdventure(content);const before={...save.inventory};
 assert.throws(()=>claimSpeechReward(save,content,0,now),/练习/);
 speak(save,4);assert.equal(speechRewardStatus(save,content,now).rewards[0].ready,false);
 awardDailySpeech(save,content,'4',now);claimSpeechReward(save,content,0,now);
 assert.equal(save.inventory[100],(before[100]||0)+10);
 assert.throws(()=>claimSpeechReward(save,content,0,now),/已领取/);
 speak(save,40);for(let i=1;i<5;i++)claimSpeechReward(save,content,i,now);
 assert.equal(save.inventory[100],(before[100]||0)+60);assert.equal(save.inventory[17213],(before[17213]||0)+15);
 assert.ok(speechRewardStatus(save,content,now).rewards.every(r=>r.claimed));
});
test('claim action and cloud reload retain claim flags without uploading local buffs',()=>{
 const save=createAdventure(content);speak(save,5);
 const result=applyAction(save,content,{type:'speech-reward',index:0,now});
 assert.ok(result);assert.deepEqual(save.languageSpeechClaims.claimed,[0]);
 const durable=durableSave(save);assert.equal(durable.dailyLanguageBuff,undefined);
 const restored=checkedProgress(restoreRuntime(durable,content),content,dataset).save;
 assert.deepEqual(restored.languageSpeechClaims,save.languageSpeechClaims);
 speak(restored,5);assert.throws(()=>claimSpeechReward(restored,content,0,now),/已领取/);
});
test('new day resets progress and eligibility; clock rollback cannot repeat claims',()=>{
 const save=createAdventure(content);speak(save,5);claimSpeechReward(save,content,0,now);
 const tomorrow=now+86400000;assert.equal(speechRewardStatus(save,content,tomorrow).count,0);
 assert.throws(()=>claimSpeechReward(save,content,0,tomorrow),/练习/);
 speak(save,5,tomorrow);claimSpeechReward(save,content,0,tomorrow);
 speak(save,5,now);assert.throws(()=>claimSpeechReward(save,content,0,now),/已领取/);
});
test('malformed claim records are rejected',()=>{
 for(const row of [{day:'bad',claimed:[]},{day:'2026-10-01',claimed:[0,0]},{day:'2026-10-01',claimed:[5]}])assert.throws(()=>validateSpeechClaims({languageSpeechClaims:row}));
});
