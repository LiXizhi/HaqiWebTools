import test from 'node:test';
import assert from 'node:assert/strict';
import {createDialogueReveal} from '../js/dialogue_reveal.js';

test('script reveal streams NPC before player text and finish restores both',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const a={textContent:'ABC'},b={textContent:'DEF'},reveal=createDialogueReveal({reduced:()=>false,stepMs:10});
 reveal.start([a,b]);assert.equal(a.textContent,'A');assert.equal(b.textContent,'');
 t.mock.timers.tick(10);assert.equal(a.textContent,'AB');assert.equal(b.textContent,'');
 t.mock.timers.tick(10);assert.equal(a.textContent,'ABC');assert.equal(b.textContent,'');
 t.mock.timers.tick(10);assert.equal(b.textContent,'D');
 reveal.finish();assert.equal(b.textContent,'DEF');t.mock.timers.tick(100);assert.equal(b.textContent,'DEF');
});
test('reduced motion shows complete text immediately',()=>{
 const node={textContent:'完整句子'},reveal=createDialogueReveal({reduced:()=>true});reveal.start([node]);assert.equal(node.textContent,'完整句子');reveal.finish();
});


test('each original finishes before its translation, then the next line begins',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const a={textContent:'ABC'},b={textContent:'DEF'},first={hidden:false},second={hidden:false};
 const reveal=createDialogueReveal({reduced:()=>false,stepMs:10});
 reveal.start([{node:a,translation:first},{node:b,translation:second}]);
 assert.equal(first.hidden,true);assert.equal(second.hidden,true);assert.equal(b.textContent,'');
 t.mock.timers.tick(10);assert.equal(first.hidden,true);
 t.mock.timers.tick(10);assert.equal(a.textContent,'ABC');assert.equal(first.hidden,false);assert.equal(second.hidden,true);
 t.mock.timers.tick(10);assert.equal(b.textContent,'D');assert.equal(second.hidden,true);
 reveal.finish();assert.equal(b.textContent,'DEF');assert.equal(second.hidden,false);
});
