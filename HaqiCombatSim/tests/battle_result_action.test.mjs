import test from 'node:test';
import assert from 'node:assert/strict';
import {bindResultSettlement} from '../js/views/adventure/view_battle_result_action.js';

function control(){return {textContent:'收下奖励',isConnected:true,disabled:false,attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}};}
const write=(node,text)=>{node.textContent=text;};
test('pending settlement has one action and keeps a visible waiting state until completion',async()=>{
 const node=control();let release,calls=0;
 bindResultSettlement(node,()=>{calls++;return new Promise(resolve=>{release=resolve;});},write,()=>assert.fail('unexpected error'));
 const pending=node.onclick();await node.onclick();
 assert.equal(calls,1);assert.equal(node.disabled,true);assert.equal(node.attrs['aria-busy'],'true');assert.equal(node.textContent,'正在结算…');
 release();await pending;
 assert.equal(node.disabled,false);assert.equal(node.textContent,'收下奖励');assert.equal(node.attrs['aria-busy'],undefined);
});
test('a failed settlement offers a usable retry instead of locking the result',async()=>{
 const node=control();let errors=0,calls=0;
 bindResultSettlement(node,async()=>{if(++calls===1)throw Error('offline');},write,()=>{errors++;});
 await node.onclick();assert.equal(errors,1);assert.equal(node.disabled,false);
 await node.onclick();assert.equal(calls,2);assert.equal(errors,1);
});
test('late settlement callbacks cannot rewrite a result that has already been closed',async()=>{
 const node=control();let release;
 bindResultSettlement(node,()=>new Promise(resolve=>{release=resolve;}),write,()=>assert.fail('closed result'));
 const pending=node.onclick();node.isConnected=false;node.textContent='new screen';release();await pending;
 assert.equal(node.textContent,'new screen');
});

test('retry clears the old failure while settlement is pending and reports a new failure if needed',async()=>{
 const node=control();let message='',release,calls=0;
 bindResultSettlement(node,()=>{
  if(++calls===1)return Promise.reject(Error('offline'));
  return new Promise((resolve,reject)=>{release=()=>reject(Error('still offline'));});
 },write,()=>{message='retry';},()=>{message='';});
 await node.onclick();assert.equal(message,'retry');
 const pending=node.onclick();assert.equal(message,'');assert.equal(node.disabled,true);
 await node.onclick();assert.equal(calls,2);
 release();await pending;assert.equal(message,'retry');assert.equal(node.disabled,false);
});
