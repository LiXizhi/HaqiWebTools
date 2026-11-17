import test from 'node:test';
import assert from 'node:assert/strict';
import {applyForestCommission,validateForestCommission} from '../js/forest_commission_core.js';
import {flushForestCommissionPractice} from '../js/forest_commission_learning.js';
const fresh=(phase='delivery')=>({zone:'camp',position:{x:0,y:0},forestCommission:{version:1,phase}});
const access={forestTarget:{id:36200,kind:'npc',x:0,y:0}};
const label=(save,word='boots',text=word)=>applyForestCommission(save,{}, {step:'label',word,text,learning:{at:20,attempts:1,assisted:false}},access);

test('labels require a real typed match at the carried-object stage and recipient',()=>{
 const save=fresh();
 for(const text of ['', 'hat', 'boots please'])assert.throws(()=>label(save,'boots',text),/标签还没写对/);
 assert.throws(()=>label(save,'note'),/先把对应物品/);
 assert.throws(()=>applyForestCommission(save,{}, {step:'label',word:'boots',text:'boots'}, {forestTarget:{...access.forestTarget,x:999}}),/靠近/);
 assert.equal(save.forestCommission.labels,undefined);
 label(save,'boots',' BOOT ');validateForestCommission(save);
 assert.deepEqual(save.forestCommission.labels,['boots']);
 assert.equal(save.forestCommission.phase,'delivery');
 assert.equal(label(save).changed,false);
 assert.equal(save.forestCommission.labelPractice.length,1);
});

test('new label fields remain optional for legacy saves; malformed receipts fail validation',()=>{
 validateForestCommission(fresh());
 const save=fresh();label(save);
 const bad=structuredClone(save);bad.forestCommission.labelPractice[0].word='hat';
 assert.throws(()=>validateForestCommission(bad),/标签练习/);
 const wrongPhase=structuredClone(save);wrongPhase.forestCommission.phase='boots';
 assert.throws(()=>validateForestCommission(wrongPhase),/物品标签/);
 const duplicate=structuredClone(save);duplicate.forestCommission.labels.push('boots');
 assert.throws(()=>validateForestCommission(duplicate),/物品标签/);
});

test('both typed labels drain in order, separately from the legacy guided-reading receipt',async()=>{
 const save=fresh();label(save);save.forestCommission.phase='briefing';label(save,'note');
 save.forestCommission.practice={id:'forest:camp-patrol-supplies:boots:1',at:10,attempts:1,assisted:true};
 const seen=[];
 assert.equal(await flushForestCommissionPractice(save,{valid:()=>true,persist:()=>true,record:async event=>{seen.push(event);return {persisted:true};}}),true);
 assert.deepEqual(seen.map(e=>[e.words[0],e.input]),[['boots','read'],['boots','text'],['note','text']]);
 assert.equal(seen[1].assisted,false);assert.equal(save.forestCommission.labelPractice.length,0);
 assert.equal(await flushForestCommissionPractice(save,{valid:()=>true,persist:()=>true,record:async()=>assert.fail('already flushed')}),false);
 validateForestCommission(save);
});

test('label write failure preserves the receipt and retry reuses its id',async()=>{
 const save=fresh();label(save);const event=save.forestCommission.labelPractice[0],ids=[];
 const record=async e=>{ids.push(e.id);return {persisted:true};};
 assert.equal(await flushForestCommissionPractice(save,{record,valid:()=>true,persist:()=>false}),false);
 assert.equal(save.forestCommission.labelPractice[0],event);
 assert.equal(await flushForestCommissionPractice(save,{record,valid:()=>true,persist:()=>true}),true);
 assert.deepEqual(ids,[event.id,event.id]);
});

test('role changes and failed word-tree writes never discard pending labels',async()=>{
 const save=fresh();label(save);let active=true,persisted=0;
 assert.equal(await flushForestCommissionPractice(save,{valid:()=>active,persist:()=>{persisted++;return true;},record:async()=>{active=false;return {persisted:true};}}),false);
 assert.equal(persisted,0);assert.equal(save.forestCommission.labelPractice.length,1);
 await assert.rejects(flushForestCommissionPractice(save,{valid:()=>true,persist:()=>true,record:async()=>{throw Error('offline');}}),/offline/);
 assert.equal(save.forestCommission.labelPractice.length,1);
});
