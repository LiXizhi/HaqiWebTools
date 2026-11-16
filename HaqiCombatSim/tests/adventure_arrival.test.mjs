import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {campArrivalPet,pendingCompanionWelcome} from '../js/adventure_arrival_core.js';

const app=fs.readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
const fresh=(target='en')=>({zone:'camp',level:1,quests:{},tips:{},pets:{chosen:{speciesId:'dragon_orange'}},
 languageLearning:{target},...(target==='en'?{openingJourney:{phase:'offer'}}:{})});

test('entry ceremony waits for the scene, then runs once after loading is hidden',()=>{
 const calls=[],context=vm.createContext({sceneLoading:{active:true},stage:'world',roleEpoch:1,world:{},action:()=>calls.push('welcome')});
 vm.runInContext('let pendingSceneIntro=null;'+app.slice(app.indexOf('function afterSceneReady('),app.indexOf('const sceneLoading=createIslandSceneLoading(')),context);
 vm.runInContext('afterSceneReady(action)',context);assert.deepEqual(calls,[]);
 context.sceneLoading.active=false;vm.runInContext('resumeSceneIntro();resumeSceneIntro()',context);
 assert.deepEqual(calls,['welcome']);
 vm.runInContext('afterSceneReady(action)',context);assert.deepEqual(calls,['welcome','welcome']);
});

test('a delayed entry ceremony cannot spill into another role, world or the title',()=>{
 for(const change of [context=>context.roleEpoch++,context=>context.world={},context=>context.stage='title']){
  const calls=[],context=vm.createContext({sceneLoading:{active:true},stage:'world',roleEpoch:1,world:{},action:()=>calls.push('welcome')});
  vm.runInContext('let pendingSceneIntro=null;'+app.slice(app.indexOf('function afterSceneReady('),app.indexOf('const sceneLoading=createIslandSceneLoading('))+';afterSceneReady(action)',context);
  change(context);vm.runInContext('resumeSceneIntro()',context);assert.deepEqual(calls,[]);
 }
});

for(const language of ['en','ja','ko'])test(`${language}: a new arrival keeps its chosen dragon until acknowledged`,()=>{
 const save=fresh(language);
 assert.equal(campArrivalPet(save),'chosen');
 assert.equal(campArrivalPet(JSON.parse(JSON.stringify(save))),'chosen');
 save.tips.campArrivalSeen=true;
 assert.equal(campArrivalPet(JSON.parse(JSON.stringify(save))),null);
});

test('arrival guidance does not replay over established roles, travel or combat',()=>{
 for(const patch of [{level:2},{quests:{63002:{status:'accepted'}}},{zone:'forest'},
  {pendingEncounter:{}},{openingJourney:{phase:'guide'}},{openingJourney:{phase:'showcase'}},{pets:{}}]){
  assert.equal(campArrivalPet({...fresh(),...patch}),null,JSON.stringify(patch));
 }
});

test('an unconfirmed earned companion survives reload without welcoming missing or starter pets',()=>{
 const save=fresh();save.pets.rabbit={speciesId:'legacy_gululu'};save.tips.pendingCompanionWelcome='rabbit';
 assert.equal(pendingCompanionWelcome(JSON.parse(JSON.stringify(save))),'rabbit');
 for(const id of [null,'missing','chosen']){save.tips.pendingCompanionWelcome=id;assert.equal(pendingCompanionWelcome(save),null);}
});

function arrivalUi(language,{fail=false}={}){
 const save=fresh(language),calls=[];let callbacks,copy;
 const context=vm.createContext({save,storageWarning:false,panel:null,nodes:{overlay:{}},campArrivalPet,
  close:()=>calls.push('close'),model:()=>({save}),openingJourney:s=>s.openingJourney,
  renderPetWelcome:(_root,_model,id,cb,text)=>{calls.push(id);callbacks=cb;copy=text;},
  playOpeningPetWelcome:()=>true,spellSound:{play:name=>calls.push(name)},
  persist:()=>{context.storageWarning=fail;calls.push('save');},queueCloudSave:()=>calls.push('cloud'),
  trackOpeningJourney:()=>calls.push('opening-route'),track:()=>calls.push('quest-route')});
 vm.runInContext(app.slice(app.indexOf('function openCampArrival(){'),app.indexOf('function leaveFirstPetWelcome(){'))+';openCampArrival();',context);
 return {save,calls,copy,go:()=>callbacks.go(),close:()=>callbacks.close()};
}

for(const language of ['en','ja','ko'])test(`${language}: one short welcome leads directly to the correct first conversation`,()=>{
 const ui=arrivalUi(language);assert.equal(ui.save.tips.campArrivalSeen,undefined);
 assert.equal(ui.copy.line,'跟我去见青龙！');assert.equal(ui.copy.actionLabel,'一起出发');
 assert.equal(ui.calls.filter(call=>call==='petJoin').length,1);
 assert.equal(ui.go(),true);assert.equal(ui.save.tips.campArrivalSeen,true);
 assert.equal(ui.calls.at(-1),language==='en'?'opening-route':'quest-route');
});

test('closing the arrival still leads onward, but a failed save keeps the welcome retryable',()=>{
 const ui=arrivalUi('ko');ui.close();assert.equal(ui.calls.at(-1),'quest-route');
 const failed=arrivalUi('en',{fail:true});assert.equal(failed.go(),false);
 assert.equal(campArrivalPet(failed.save),'chosen');
 assert.equal(failed.calls.includes('opening-route'),false);
});

test('earned companion acknowledgement is durable and does not dismiss on save failure',()=>{
 for(const fail of [false,true]){
  const save={tips:{pendingCompanionWelcome:'rabbit'}},calls=[];
  const context=vm.createContext({save,storageWarning:false,persist:()=>{context.storageWarning=fail;},
   queueCloudSave:()=>calls.push('cloud'),close:()=>calls.push('close')});
  vm.runInContext(app.slice(app.indexOf('function leaveFirstPetWelcome(){'),app.indexOf('let firstWelcomePetId=')),context);
  assert.equal(vm.runInContext('leaveFirstPetWelcome()',context),!fail);
  assert.equal(save.tips.pendingCompanionWelcome,fail?'rabbit':null);
  assert.deepEqual(calls,fail?[]:['cloud','close']);
 }
});

test('earned welcome is saved before its deferred display and can recover after a role switch',()=>{
 const save=fresh('ko'),jobs=[],calls=[];save.pets.rabbit={speciesId:'legacy_gululu'};
 const context=vm.createContext({save,assets:{content:{},dataset:{cards:{}}},storageWarning:false,
  roleEpoch:1,stage:'world',rewardChanges:()=>({items:[{kind:'pet',key:'rabbit',name:'咕噜噜',count:1}]}),
  firstCompanionReward:()=>({id:'rabbit'}),queueCloudSave:()=>{},rewardFeedback:{push:()=>{}},
  globalReward:{show:()=>{}},rewardSound:()=>null,persist:()=>calls.push('saved'),
  queueMicrotask:job=>jobs.push(job),close:()=>calls.push('close'),nodes:{overlay:{}},
  paintFirstPetWelcome:()=>calls.push('card'),playOpeningPetWelcome:()=>true,spellSound:{play:()=>{}}});
 vm.runInContext(app.slice(app.indexOf('function showRewards('),app.indexOf('function toast('))+';showRewards({});',context);
 assert.deepEqual(calls,['saved']);assert.equal(pendingCompanionWelcome(JSON.parse(JSON.stringify(save))),'rabbit');
 context.roleEpoch=2;jobs[0]();assert.deepEqual(calls,['saved']);
});

test('English companion showcase is acknowledged only when its departure saves successfully',()=>{
 for(const fail of [false,true]){
  const save={openingJourney:{phase:'showcase',petId:'rabbit'}},calls=[];let callbacks;
  const context=vm.createContext({save,panel:'opening-journey',openingJourney:s=>s.openingJourney,
   storageWarning:false,openingWelcomeKey:null,roleStore:{catalog:{activeId:'test'}},nodes:{overlay:{}},
   model:()=>({save}),renderOpeningJourney:(_root,_model,cb)=>{callbacks=cb;},
   persist:()=>{context.storageWarning=fail;},queueCloudSave:()=>calls.push('cloud'),
   close:()=>calls.push('close'),trackOpeningJourney:()=>calls.push('route'),playOpeningPetWelcome:()=>false});
  vm.runInContext(app.slice(app.indexOf('function paintOpeningJourney(){'),app.indexOf('async function drainOpeningPractice(){'))+';paintOpeningJourney();',context);
  callbacks.go();assert.equal(!!save.openingJourney.welcomeSeen,!fail);
  assert.deepEqual(calls,fail?[]:['cloud','close','route']);
 }
});
