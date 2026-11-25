import test from 'node:test';
import assert from 'node:assert/strict';
import {createHudController} from '../js/adventure/hud_controller.js';

function harness(kind='arrival',failure='warning',joined=true){
 const save={zone:'camp',level:1,quests:{},tips:kind==='arrival'?{}:{pendingCompanionWelcome:'new'},
  pets:{chosen:{speciesId:'dragon_orange'},new:{speciesId:6}},formation:joined?['hero','new',null,null]:['hero',null,null,null],heroSlot:0,
  openingJourney:{version:1,phase:kind==='arrival'?'offer':'done'}};
 const state={save},calls=[];let blocked=true,callbacks;
 const controller=createHudController({nodes:{overlay:{}},getContext:()=>state,model:()=>({save}),
  persist:()=>{calls.push('persist');if(blocked&&failure==='throw')throw Error('storage unavailable');state.storageWarning=blocked;},
  queueCloudSave:()=>calls.push('cloud'),close:()=>calls.push('close'),track:()=>calls.push('track'),
  opening:{trackOpeningJourney:()=>calls.push('opening')},
  performAction:action=>{calls.push('formation');if(blocked)return false;save.formation=action.slots;return true;},
  renderPetWelcomeFn:(_root,_model,_pet,cb)=>{callbacks=cb;},
 });
 if(kind==='arrival')controller.paintCampArrival();
 else{controller.setFirstWelcomePetId('new');controller.paintFirstPetWelcome();}
 return {state,calls,invoke:action=>callbacks[action](),retry:()=>{blocked=false;}};
}

for(const kind of ['arrival','companion'])for(const failure of ['warning','throw'])for(const action of ['close','go'])test(`${kind}: ${action} can retry a ${failure} without skipping the welcome save`,()=>{
 const h=harness(kind,failure);assert.equal(h.invoke(action),false);
 assert.deepEqual(h.calls,['persist']);
 if(kind==='arrival')assert.equal(h.state.save.tips.campArrivalSeen,undefined);
 else assert.equal(h.state.save.tips.pendingCompanionWelcome,'new');
 h.calls.length=0;h.retry();assert.equal(h.invoke(action),true);
 const destination=kind==='arrival'?['opening']:action==='go'?['close','track']:['close'];
 assert.deepEqual(h.calls,['persist','cloud',...destination]);
 if(kind==='arrival')assert.equal(h.state.save.tips.campArrivalSeen,true);
 else assert.equal(h.state.save.tips.pendingCompanionWelcome,null);
});

test('failed first-companion formation save stays retryable without clearing its welcome',()=>{
 const h=harness('companion','warning',false);assert.equal(h.invoke('go'),false);
 assert.deepEqual(h.calls,['formation']);assert.equal(h.state.save.tips.pendingCompanionWelcome,'new');
 assert.equal(h.state.save.formation.includes('new'),false);
 h.calls.length=0;h.retry();assert.equal(h.invoke('go'),true);
 assert.deepEqual(h.calls,['formation','persist','cloud','close','track']);
 assert.equal(h.state.save.formation[1],'new');
});
