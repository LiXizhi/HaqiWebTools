import test from 'node:test';
import assert from 'node:assert/strict';
import {createEarthPlaces} from '../js/adventure_earth_places.js';

test('only the latest city is retained; favorite coordinates survive reopening and removal',async()=>{
    let record;
    const store={read:async()=>structuredClone(record),update:async(_,reduce)=>record=structuredClone(reduce(record))};
    const places=createEarthPlaces({store});
    assert.deepEqual(await places.read(),{recent:null,favorites:[]});
    await places.visit({id:'a',name:'甲城',lon:10,lat:20});
    await places.add({name:'海边',lon:179.9,lat:-20});
    await places.visit({id:'b',name:'乙城',lon:30,lat:40});
    await places.add({name:'海边新名字',lon:179.9,lat:-20});
    const reopened=createEarthPlaces({store}),state=await reopened.read();
    assert.equal(state.recent.id,'b');assert.equal(state.favorites.length,1);
    assert.equal(state.favorites[0].lon,179.9);assert.equal(state.favorites[0].favorite,true);
    await reopened.remove(state.favorites[0].id);
    assert.deepEqual((await reopened.read()).favorites,[]);
    assert.equal((await reopened.read()).recent.id,'b');
    assert.throws(()=>places.add({lon:NaN,lat:20}),/坐标无效/);
    assert.throws(()=>places.visit({lon:0,lat:91}),/坐标无效/);
});

test('storage failures propagate rather than claiming a favorite was saved',async()=>{
    const places=createEarthPlaces({store:{update:async()=>{throw Error('quota');},read:async()=>{throw Error('unavailable');}}});
    await assert.rejects(places.add({lon:0,lat:0}),/quota/);
    await assert.rejects(places.read(),/unavailable/);
});
