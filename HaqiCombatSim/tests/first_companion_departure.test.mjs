import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
const departure=app.slice(app.indexOf('function leaveFirstPetWelcome(){'),app.indexOf('function paintPanel()')).replace('let firstWelcomePetId=null;','');
function setup({formation=['starter',null,null,null],heroSlot=1,fail=false}={}){
 const save={tips:{pendingCompanionWelcome:'rabbit'},pets:{rabbit:{speciesId:'legacy_gululu'}},formation,heroSlot},calls=[];
 let callbacks;
 const context=vm.createContext({save,firstWelcomePetId:'rabbit',nodes:{overlay:{}},model:()=>({save}),
  renderPetWelcome:(_root,_model,_petId,cb)=>{callbacks=cb;},close:()=>calls.push('close'),
  persist:()=>{},queueCloudSave:()=>{},storageWarning:false,
   openPanel:name=>calls.push(name),track:()=>calls.push('track'),
  performAction:action=>{calls.push(JSON.parse(JSON.stringify(action)));if(fail)return false;save.formation=action.slots;return true;}});
 vm.runInContext(departure+';paintFirstPetWelcome();',context);
 return {save,calls,go:()=>callbacks.go()};
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
