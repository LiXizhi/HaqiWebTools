import test from 'node:test';
import assert from 'node:assert/strict';
import {campArrivalPet,pendingCompanionWelcome} from '../js/adventure_arrival_core.js';
import {createActionRewardController} from '../js/adventure/action_reward_controller.js';
import {createOpeningController} from '../js/adventure/opening_controller.js';
import {createPanelController} from '../js/adventure/panel_controller.js';
import {createWorldSessionController} from '../js/adventure/world_session_controller.js';

const fresh=(target='en')=>({zone:'camp',level:1,quests:{},tips:{},pets:{chosen:{speciesId:'dragon_orange'}},
 languageLearning:{target},...(target==='en'?{openingJourney:{version:1,phase:'offer'}}:{})});

function createSceneCeremonyHarness(){
 const calls=[],state={sceneLoading:{active:true},stage:'world',roleEpoch:1,world:{}};
 const controller=createWorldSessionController({
  nodes:{},
  getContext:()=>state,
  sceneLoading:state.sceneLoading,
 });
 return {calls,state,afterSceneReady:controller.afterSceneReady,resumeSceneIntro:controller.resumeSceneIntro,action:()=>calls.push('welcome')};
}

test('entry ceremony waits for the scene, then runs once after loading is hidden',()=>{
 const h=createSceneCeremonyHarness();
 h.afterSceneReady(h.action);assert.deepEqual(h.calls,[]);
 h.state.sceneLoading.active=false;h.resumeSceneIntro();h.resumeSceneIntro();
 assert.deepEqual(h.calls,['welcome']);
 h.afterSceneReady(h.action);assert.deepEqual(h.calls,['welcome','welcome']);
});

test('a delayed entry ceremony cannot spill into another role, world or the title',()=>{
 for(const change of [s=>s.roleEpoch++,s=>s.world={},s=>s.stage='title']){
  const h=createSceneCeremonyHarness();
  h.afterSceneReady(h.action);
  change(h.state);h.resumeSceneIntro();assert.deepEqual(h.calls,[]);
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
  {pendingEncounter:{}},{openingJourney:{version:1,phase:'guide'}},{openingJourney:{version:1,phase:'showcase'}},{pets:{}}]){
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
 const state={save,storageWarning:false,panel:null,setPanel:next=>{state.panel=next;}};
 const panels=createPanelController({
  nodes:{hud:{},overlay:{}},
  getContext:()=>state,
  model:()=>({save}),
  close:()=>calls.push('close'),
  persist:()=>{state.storageWarning=fail;calls.push('save');},
  queueCloudSave:()=>calls.push('cloud'),
  opening:{trackOpeningJourney:()=>calls.push('opening-route')},
  track:()=>calls.push('quest-route'),
  spellSound:{play:name=>calls.push(name)},
  renderPetWelcomeFn:(_root,_model,id,cb,text)=>{calls.push(id);callbacks=cb;copy=text;},
  playOpeningPetWelcomeFn:()=>true,
 });
 panels.openCampArrival();
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
  const save={tips:{pendingCompanionWelcome:'rabbit'}},calls=[],state={save,storageWarning:false};
  const panels=createPanelController({
   nodes:{hud:{},overlay:{}},
   getContext:()=>state,
   persist:()=>{state.storageWarning=fail;},
   queueCloudSave:()=>calls.push('cloud'),
   close:()=>calls.push('close'),
  });
  assert.equal(panels.leaveFirstPetWelcome(),!fail);
  assert.equal(save.tips.pendingCompanionWelcome,fail?'rabbit':null);
  assert.deepEqual(calls,fail?[]:['cloud','close']);
 }
});

test('earned welcome is saved before its deferred display and can recover after a role switch',()=>{
 const save=fresh('ko'),jobs=[],calls=[];save.pets.rabbit={speciesId:'legacy_gululu'};
 const state={save,assets:{content:{},dataset:{cards:{}}},storageWarning:false,roleEpoch:1,stage:'world',setPanel(){}};
 const controller=createActionRewardController({
  nodes:{overlay:{}},
  getContext:()=>state,
  persist:()=>calls.push('saved'),
  queueCloudSave:()=>{},
  close:()=>calls.push('close'),
  paintFirstPetWelcome:()=>calls.push('card'),
  globalReward:{show:()=>{}},
  spellSound:{play:()=>{}},
  rewardChangesFn:()=>({items:[{kind:'pet',key:'rabbit',name:'咕噜噜',count:1}]}),
  firstCompanionRewardFn:()=>({id:'rabbit'}),
  rewardSoundFn:()=>null,
  playOpeningPetWelcomeFn:()=>true,
  queueMicrotaskFn:job=>jobs.push(job),
 });
 controller.showRewards({});
 assert.deepEqual(calls,['saved']);assert.equal(pendingCompanionWelcome(JSON.parse(JSON.stringify(save))),'rabbit');
 state.roleEpoch=2;jobs[0]();assert.deepEqual(calls,['saved']);
});

test('English companion showcase is acknowledged only when its departure saves successfully',()=>{
 for(const fail of [false,true]){
  const save={languageLearning:{target:'en'},openingJourney:{version:1,phase:'showcase',petId:'rabbit'}},calls=[];let callbacks;
  const state={save,panel:'opening-journey',storageWarning:false,roleStore:{catalog:{activeId:'test'}}};
  const opening=createOpeningController({
   nodes:{overlay:{}},
   getContext:()=>state,
   model:()=>({save}),
   persist:()=>{state.storageWarning=fail;},
   queueCloudSave:()=>calls.push('cloud'),
   close:()=>calls.push('close'),
   onTrackOpeningJourney:()=>calls.push('route'),
   renderOpeningJourneyView:(_root,_model,cb)=>{callbacks=cb;},
   playOpeningPetWelcomeFn:()=>false,
  });
  opening.paintOpeningJourney();
  callbacks.go();assert.equal(!!save.openingJourney.welcomeSeen,!fail);
  assert.deepEqual(calls,fail?[]:['cloud','close','route']);
 }
});
