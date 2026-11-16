import test from 'node:test';
import assert from 'node:assert/strict';
import {rewardSnapshot,rewardChanges,firstCompanionReward} from '../js/adventure_reward_feedback_core.js';
const content={items:{},pets:{dragon_green:{name:'抱抱龙'},legacy_gululu:{name:'咕噜噜'},fox:{name:'狐狸'}}};
function starter(){return {xp:0,level:1,inventory:{},cards:{},pets:{starter1:{speciesId:'dragon_green'}}};}
for(const target of ['en','ja','ko'])test(`first earned companion welcomes independently of ${target} learning route`,()=>{
 const s=starter();s.languages={target};const before=rewardSnapshot(s);
 s.pets.rabbit1={speciesId:'legacy_gululu'};
 const raw=JSON.stringify(s),event=rewardChanges(before,s,content);
 assert.equal(firstCompanionReward(before,s,event)?.id,'rabbit1');assert.equal(JSON.stringify(s),raw);
 assert.equal(firstCompanionReward(rewardSnapshot(s),s,rewardChanges(rewardSnapshot(s),s,content)),null);
});
test('starter choices and later companions do not replay the first companion ceremony',()=>{
 const s=starter(),before=rewardSnapshot(s);s.pets.starter2={speciesId:'dragon_green'};
 assert.equal(firstCompanionReward(before,s,rewardChanges(before,s,content)),null);
 s.pets.rabbit1={speciesId:'legacy_gululu'};const afterFirst=rewardSnapshot(s);s.pets.fox1={speciesId:'fox'};
 assert.equal(firstCompanionReward(afterFirst,s,rewardChanges(afterFirst,s,content)),null);
});
