import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('./fixtures/battle-scenery.html',import.meta.url),'utf8');
test('preview retreat and finish leave the fixture, without starting another battle',()=>{
 const urls=[];let callbacks;
 const scope={URL,location:{replace:url=>urls.push(url)},document:{baseURI:'http://127.0.0.1:8766/'},root:{},assets:{},save:{},battle:{},selected:null,renderBattle(_root,_model,cb){callbacks=cb;},target(){}};
 vm.createContext(scope);
 vm.runInContext(html.slice(html.indexOf('function exitPreview()'),html.indexOf('function step('))+html.slice(html.indexOf('function paint()'),html.indexOf('function frame(')),scope);
 scope.paint();callbacks.retreat();callbacks.finish();
 assert.deepEqual(urls,['http://127.0.0.1:8766/Haqi.html','http://127.0.0.1:8766/Haqi.html']);
});
test('preview ignores wrong-side targets and accepts a legal target without losing selection',()=>{
 const actions=[];const scope={selected:{key:'attack',seq:2},battle:{sides:{near:[{id:'hero'}]},resolved:{cards:{attack:{}}}},validTargets:()=>[{id:'enemy'}],step:action=>actions.push(action)};
 vm.createContext(scope);vm.runInContext(html.slice(html.indexOf('function target('),html.indexOf('function paint(')),scope);
 scope.target('hero');assert.equal(actions.length,0);scope.target('enemy');assert.equal(actions.length,1);assert.equal(actions[0].targetId,'enemy');assert.equal(actions[0].seq,2);
 scope.battle.finished=true;scope.target('enemy');assert.equal(actions.length,1);
});
