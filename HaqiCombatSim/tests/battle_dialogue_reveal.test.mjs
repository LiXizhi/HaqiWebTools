import test from 'node:test';
import assert from 'node:assert/strict';
import {createDialogueReveal,waitForDialogueReveal} from '../js/dialogue_reveal.js';

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


test('the complete answer bubble stays hidden until the question finishes',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const question={textContent:'ABC'},answer={textContent:'DEF'},bubble={hidden:false},translation={hidden:false};
 const reveal=createDialogueReveal({reduced:()=>false,stepMs:10});
 reveal.start([{node:question},{node:answer,translation,container:bubble}]);
 assert.equal(bubble.hidden,true);assert.equal(answer.textContent,'');
 t.mock.timers.tick(10);assert.equal(bubble.hidden,true);
 t.mock.timers.tick(10);assert.equal(question.textContent,'ABC');assert.equal(bubble.hidden,true);
 t.mock.timers.tick(10);assert.equal(bubble.hidden,false);assert.equal(answer.textContent,'D');assert.equal(translation.hidden,true);
 reveal.finish();assert.equal(bubble.hidden,false);assert.equal(translation.hidden,false);
});


test('layout updates follow new characters, answer appearance and translation expansion',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const question={textContent:'AB'},answer={textContent:'CD'},bubble={hidden:false},translation={hidden:false},updates=[];
 const reveal=createDialogueReveal({reduced:()=>false,stepMs:10,onUpdate:()=>updates.push([question.textContent,answer.textContent,bubble.hidden,translation.hidden])});
 reveal.start([{node:question},{node:answer,container:bubble,translation}]);
 assert.deepEqual(updates.at(-1),['A','',true,true]);
 t.mock.timers.tick(10);t.mock.timers.tick(10);assert.deepEqual(updates.at(-1),['AB','C',false,true]);
 t.mock.timers.tick(10);assert.deepEqual(updates.at(-1),['AB','CD',false,false]);
 reveal.finish();const count=updates.length;reveal.finish();assert.equal(updates.length,count,'idle renders do not force scrolling');
});


test('cached annotations wait for reveal and survive finishing later rows',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const first={textContent:'AB'},second={textContent:'CD'},reveal=createDialogueReveal({reduced:()=>false,stepMs:10});
 reveal.start([first,second]);let ready=false;
 const applied=waitForDialogueReveal(first).then(()=>{ready=true;first.textContent='mapped';});
 await Promise.resolve();assert.equal(ready,false);
 t.mock.timers.tick(10);await applied;assert.equal(ready,true);
 reveal.finish();assert.equal(first.textContent,'mapped');assert.equal(second.textContent,'CD');
});
