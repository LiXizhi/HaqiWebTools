import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCampDetour,campDetourGoal,validateCampDetour,CAMP_DETOUR_RUNE} from '../js/camp_detour_core.js';
const content={items:{[CAMP_DETOUR_RUNE]:{name:'普通抓宠符文'}}};
const fresh=()=>({zone:'camp',position:{x:10,y:20},inventory:{},openingJourney:{version:1,phase:'done'}});
const act=(save,step,id)=>applyCampDetour(save,content,{step,id},{campToy:{id,x:10,y:20}});
test('detour requires real ordered nearby interactions and grants one usable rune only once',()=>{
 const s=fresh();act(s,'start');assert.equal(campDetourGoal(s).id,'mushroom');
 assert.equal(act(s,'touch','crystal').changed,false);
 act(s,'touch','mushroom');act(s,'touch','bells');
 act(s,'touch','crystal');act(s,'touch','crystal');assert.equal(s.inventory[CAMP_DETOUR_RUNE],undefined);
 act(s,'touch','crystal');assert.equal(s.inventory[CAMP_DETOUR_RUNE],1);assert.equal(campDetourGoal(s),null);
 act(s,'start');act(s,'touch','crystal');assert.equal(s.inventory[CAMP_DETOUR_RUNE],1);validateCampDetour(s);
});
test('pause and reload preserve discoveries without blocking the main adventure',()=>{
 let s=fresh();act(s,'start');act(s,'touch','mushroom');act(s,'pause');assert.equal(campDetourGoal(s),null);
 s=JSON.parse(JSON.stringify(s));validateCampDetour(s);act(s,'start');assert.equal(campDetourGoal(s).id,'bells');
 s.zone='town';assert.equal(campDetourGoal(s),null);assert.throws(()=>act(s,'touch','bells'),/营地/);
});
test('remote clicks, battles and unfinished opening cannot advance discoveries',()=>{
 const s=fresh();act(s,'start');s.position.x=500;assert.throws(()=>act(s,'touch','mushroom'),/靠近/);assert.equal(s.openingJourney.detour.step,0);
 s.position.x=10;s.pendingEncounter={};assert.throws(()=>act(s,'touch','mushroom'),/结束挑战/);
 delete s.pendingEncounter;s.openingJourney.phase='showcase';assert.throws(()=>act(s,'start'),/结束挑战/);
});
test('legacy saves remain valid and malformed progress is rejected',()=>{
 validateCampDetour({});const s=fresh();act(s,'start');s.openingJourney.detour.crystals=3;assert.throws(()=>validateCampDetour(s),/不一致/);
 s.openingJourney.detour.step=99;assert.throws(()=>validateCampDetour(s),/无效/);
});

test('missing reward leaves the last crystal hit retryable without mutating progress',()=>{
 const s=fresh();act(s,'start');act(s,'touch','mushroom');act(s,'touch','bells');act(s,'touch','crystal');act(s,'touch','crystal');
 const before=JSON.stringify(s);
 assert.throws(()=>applyCampDetour(s,{items:{}},{step:'touch',id:'crystal'},{campToy:{id:'crystal',x:10,y:20}}),/尚未准备好/);
 assert.equal(JSON.stringify(s),before);validateCampDetour(s);act(s,'touch','crystal');assert.equal(s.inventory[CAMP_DETOUR_RUNE],1);
});
