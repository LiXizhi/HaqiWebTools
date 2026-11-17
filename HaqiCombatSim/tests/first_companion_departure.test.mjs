import test from 'node:test';
import assert from 'node:assert/strict';
import {createPanelController} from '../js/adventure/panel_controller.js';

function setup({formation=['starter',null,null,null],heroSlot=1,fail=false}={}){
 const save={tips:{pendingCompanionWelcome:'rabbit'},pets:{rabbit:{speciesId:'legacy_gululu'}},formation,heroSlot},calls=[];
 let callbacks;
 const state={save,storageWarning:false};
 const panels=createPanelController({
  nodes:{hud:{},overlay:{}},
  getContext:()=>state,
  model:()=>({save}),
  close:()=>calls.push('close'),
  persist:()=>{},
  queueCloudSave:()=>{},
  track:()=>calls.push('track'),
  onOpenPanel:name=>calls.push(name),
  performAction:action=>{calls.push(JSON.parse(JSON.stringify(action)));if(fail)return false;save.formation=action.slots;return true;},
  renderPetWelcomeFn:(_root,_model,_petId,cb)=>{callbacks=cb;},
 });
 panels.setFirstWelcomePetId('rabbit');
 panels.paintFirstPetWelcome();
 return {
  save,
  calls,
  go:()=>callbacks.go(),
 };
}
test('departing with the first companion joins a free pet position and continues in one action',()=>{
 const ui=setup();assert.deepEqual(ui.calls,[]);ui.go();
 assert.deepEqual(Array.from(ui.save.formation),['starter',null,'rabbit',null]);
 assert.equal(ui.calls.at(-1),'track');assert.equal(ui.calls[0].heroSlot,1);
});
test('a companion already in formation departs without another formation write',()=>{
 const ui=setup({formation:['starter',null,'rabbit',null]});ui.go();assert.deepEqual(ui.calls,['close','track']);assert.equal(ui.save.tips.pendingCompanionWelcome,null);
});
test('a full formation opens pet management and a failed save does not start walking',()=>{
 const full=setup({formation:['starter',null,'fox','bird']});full.go();assert.deepEqual(full.calls,['pet']);
 const failed=setup({fail:true});failed.go();assert.equal(failed.calls.includes('track'),false);
 assert.deepEqual(failed.save.formation,['starter',null,null,null]);
});
