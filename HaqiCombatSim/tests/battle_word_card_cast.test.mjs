import test from 'node:test';
import assert from 'node:assert/strict';
import {openWordCardForCast} from '../js/word_card_cast.js';
function harness(){
 let accept,close,current=true,active=true;const casts=[],activations=[];
 const decision={seq:7,key:'shield',targetId:'ally-2',discardSeqs:[2]};
 openWordCardForCast({practice:{open(row,a,c){accept=a;close=c;}},row:{id:'zh:shan'},decision,isCurrent:()=>current,onActivated:r=>activations.push(r),cast:d=>{assert.equal(active,false);casts.push(d);}});
 return {decision,casts,activations,accept:r=>accept(r),close:()=>{active=false;close();},invalidate:()=>current=false};
}
test('targeted word activation casts exactly once after close, preserving target and discards',()=>{
 const h=harness();h.decision.targetId='changed';h.decision.discardSeqs.push(3);h.accept({audio:null});assert.equal(h.casts.length,0);h.close();h.close();assert.deepEqual(h.casts,[{seq:7,key:'shield',targetId:'ally-2',discardSeqs:[2]}]);
});
test('cancel and late acceptance never cast or activate',()=>{
 const h=harness();h.close();h.accept({audio:null});assert.equal(h.casts.length,0);assert.equal(h.activations.length,0);
});
test('changed battle, turn or target invalidates pending cast before and after acceptance',()=>{
 const h=harness();h.invalidate();h.accept({});h.close();assert.equal(h.activations.length,0);assert.equal(h.casts.length,0);
 const accepted=harness();accepted.accept({});accepted.invalidate();accepted.close();assert.equal(accepted.casts.length,0);
});
