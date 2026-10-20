import test from 'node:test';import assert from 'node:assert/strict';
import {homeCapacity,assertHomeCapacity,HOME_OBJECT_LIMIT} from '../js/home_capacity_core.js';
test('capacity counts all known chunks including unloaded chunks, excludes residents and terrain',()=>{
 assert.equal(HOME_OBJECT_LIMIT,20000);
 assert.deepEqual(homeCapacity({parts:{'chunk:0,0':1,'chunk:99,99':1,residents:1},objectCounts:{'chunk:0,0':5,'chunk:99,99':19995}}),{used:20000,limit:20000});
 assert.equal(homeCapacity({parts:{'chunk:99,99':1}}).used,null);
 assert.equal(homeCapacity({parts:{'chunk:99,99':1},objectCounts:{'chunk:99,99':-1}}).used,null);
});
test('exact capacity allowed, growth rejected atomically, existing oversized homes remain editable',()=>{
 assert.doesNotThrow(()=>assertHomeCapacity(19999,20000));assert.throws(()=>assertHomeCapacity(20000,20001),/容量不足/);
 assert.throws(()=>assertHomeCapacity(19990,20100),/容量不足/);
 assert.doesNotThrow(()=>assertHomeCapacity(21000,21000));assert.doesNotThrow(()=>assertHomeCapacity(21000,20999));
});
