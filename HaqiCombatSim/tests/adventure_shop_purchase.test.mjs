import test from 'node:test';
import assert from 'node:assert/strict';
import {createShopPurchase} from '../js/adventure_shop_purchase_core.js';

test('VIP authorization locks one order until completion and uses the replaced save on success',async()=>{
 let resolve,calls=0,opened='',save={coins:100};const original=save,pending=[];
 const authorization=new Promise(done=>resolve=done);
 const buy=createShopPurchase({
  purchase:async()=>{calls++;await authorization;save={coins:0};return true;},
  onSuccess:()=>{assert.notEqual(save,original);opened='inventory';},onPending:value=>pending.push(value)
 });
 const first=buy();assert.deepEqual(pending,[true]);assert.equal(opened,'');
 assert.equal(await buy(),false);assert.equal(calls,1);assert.deepEqual(pending,[true]);
 resolve();assert.equal(await first,true);assert.equal(opened,'inventory');assert.deepEqual(pending,[true,false]);
});

test('failed persistence keeps the confirmation available for a successful retry',async()=>{
 let attempts=0,navigation=0;const pending=[];
 const buy=createShopPurchase({purchase:async()=>++attempts===2,onSuccess:()=>navigation++,onPending:value=>pending.push(value)});
 assert.equal(await buy(),false);assert.equal(navigation,0);assert.deepEqual(pending,[true,false]);
 assert.equal(await buy(),true);assert.equal(navigation,1);assert.deepEqual(pending,[true,false,true,false]);
});

test('rejected authorization reports its error, releases the lock and never navigates',async()=>{
 const failure=Error('membership refresh failed'),errors=[],pending=[];let navigation=0;
 const buy=createShopPurchase({purchase:()=>Promise.reject(failure),onSuccess:()=>navigation++,onPending:value=>pending.push(value),onError:error=>errors.push(error)});
 assert.equal(await buy(),false);assert.deepEqual(errors,[failure]);assert.deepEqual(pending,[true,false]);assert.equal(navigation,0);
});

test('synchronous purchases also wait for an explicit successful result',async()=>{
 let result,navigation=0;
 const buy=createShopPurchase({purchase:()=>result,onSuccess:()=>navigation++,onPending:()=>{}});
 for(result of [undefined,null,{},'true',false])assert.equal(await buy(),false);
 assert.equal(navigation,0);result=true;assert.equal(await buy(),true);assert.equal(navigation,1);
});
