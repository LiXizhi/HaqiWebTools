import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {recordFishingCatch,validateFishingRecords} from '../js/adventure_fishing_records_core.js';
import {createAdventure,parseSave} from '../js/adventure_core.js';
import {castFishing,installFishing} from '../js/adventure_fishing_core.js';
import {createRng} from '../js/rng_core.js';
import {persistReward} from '../js/adventure_reward_persistence.js';
import {makeCloudSnapshot,parseCloudSnapshot} from '../js/adventure_cloud_core.js';
const read=n=>JSON.parse(fs.readFileSync(new URL(`../data/adventure/${n}.json`,import.meta.url)));
const content=read('chapter'),dataset=read('combat');installFishing(content,read('fishing'));
const id='12345678-1234-1234-1234-123456789abc';

test('one correct pull always catches a small fish; perfect play raises weight without changing inventory rewards',()=>{
    for(let seed=1;seed<=100;seed++){
        const a=createAdventure(content,{seed}),b=structuredClone(a);a.inventory[17113]=b.inventory[17113]=1;
        const small=castFishing(a,content,{netId:17113,hit:true,fishingPerformance:{hits:1,rounds:3,mistakes:0}},createRng(seed));
        const big=castFishing(b,content,{netId:17113,hit:true,fishingPerformance:{hits:3,rounds:3,mistakes:0}},createRng(seed));
        assert.equal(small.caught,true);assert.equal(big.caught,true);
        assert.ok(small.catches[0].grams<3500);assert.ok(big.catches[0].grams>small.catches[0].grams);
        assert.deepEqual(a.inventory,b.inventory);assert.equal(a.stamina,b.stamina);
    }
});
test('scene apparatus escapes are rare and deterministic while legacy rolls remain available',()=>{
    let escaped=0;
    for(let seed=1;seed<=3000;seed++){
        const a={seed,revision:seed,inventory:{17467:1}},b=structuredClone(a);
        const action={netId:17467,hit:true,fishingPerformance:{hits:1,rounds:2,mistakes:0}};
        const result=castFishing(a,content,action,createRng(seed));
        assert.deepEqual(result,castFishing(b,content,action,createRng(seed)));
        if(!result.caught)escaped++;
    }
    assert.ok(escaped>0&&escaped<30,`escaped ${escaped}/3000`);
});
test('invalid performance is rejected before consuming inventory',()=>{
    for(const performance of [null,{hits:5,rounds:3,mistakes:0},{hits:1,rounds:0,mistakes:0},{hits:1,rounds:3,mistakes:-1}]){
        const save=createAdventure(content);save.inventory[17113]=1;const before=structuredClone(save);
        assert.throws(()=>castFishing(save,content,{netId:17113,hit:true,fishingPerformance:performance},createRng(1)),/操作记录/);
        assert.deepEqual(save,before);
    }
});

test('each species keeps its own deterministic top ten, including individual double catches',()=>{
    const a={seed:42},b={seed:42},all=[];
    for(let i=0;i<80;i++){
        const items=[{id:17106,count:2},{id:17107,count:1}];
        const result=recordFishingCatch(a,items);all.push(...result);
        assert.deepEqual(result,recordFishingCatch(b,items));
    }
    assert.equal(a.fishingRecords.total,240);
    for(const itemId of [17106,17107]){
        const expected=all.filter(r=>r.itemId===itemId).sort((a,b)=>b.grams-a.grams||a.serial-b.serial).slice(0,10).map(({serial,grams})=>({serial,grams}));
        assert.deepEqual(a.fishingRecords.byFish[itemId],expected);
    }
    assert.doesNotThrow(()=>validateFishingRecords(a));
    assert.deepEqual(recordFishingCatch(a,[{id:17113,count:1}]),[]);
});
test('record rank and personal best reflect each fish species independently',()=>{
    const save={seed:10};
    const [first]=recordFishingCatch(save,[{id:17106,count:1}]);assert.equal(first.newBest,true);assert.equal(first.rank,1);
    const [other]=recordFishingCatch(save,[{id:17107,count:1}]);assert.equal(other.newBest,true);assert.equal(other.rank,1);
});
test('weight history never changes reward rolls, inventory or stamina; misses create no records',()=>{
    const a=createAdventure(content),b=structuredClone(a);a.inventory[17113]=b.inventory[17113]=2;
    recordFishingCatch(b,[{id:17106,count:10}]);
    const ra=createRng(123),rb=createRng(123);
    assert.deepEqual(castFishing(a,content,{netId:17113,hit:true},ra).items,castFishing(b,content,{netId:17113,hit:true},rb).items);
    assert.deepEqual(a.inventory,b.inventory);assert.equal(a.stamina,b.stamina);assert.equal(ra.state(),rb.state());
    const miss=createAdventure(content);miss.inventory[17113]=1;
    castFishing(miss,content,{netId:17113,hit:false},createRng(1));assert.equal(miss.fishingRecords,undefined);
});
test('weights persist atomically with rewards and survive export and cloud roundtrip',()=>{
    const save=createAdventure(content);save.inventory[17349]=2;
    const before=structuredClone(save),data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
    assert.throws(()=>persistReward(save,content,{type:'fish',netId:17349,hit:true},{},{...storage,setItem:()=>{throw Error('quota');}}),/quota/);
    assert.deepEqual(save,before);
    const next=persistReward(save,content,{type:'fish',netId:17349,hit:true},{},storage).save;
    assert.ok(next.fishingRecords.total>0);
    assert.deepEqual(parseSave(JSON.stringify(next),content).fishingRecords,next.fishingRecords);
    const snapshot=makeCloudSnapshot(next,content,dataset,'2026-09-25T00:00:00.000Z',id);
    assert.deepEqual(parseCloudSnapshot(JSON.stringify(snapshot),content,dataset).save.fishingRecords,next.fishingRecords);
});
test('old saves remain valid and corrupt rankings fail validation',()=>{
    assert.doesNotThrow(()=>parseSave(createAdventure(content),content));
    const save=createAdventure(content);recordFishingCatch(save,[{id:17106,count:12}]);
    for(const mutate of [s=>s.fishingRecords.byFish[17106].reverse(),s=>s.fishingRecords.byFish[17106][0].grams=-1,s=>s.fishingRecords.byFish[17106].push(s.fishingRecords.byFish[17106][0]),s=>s.fishingRecords.total=0,s=>s.fishingRecords.byFish[999]=[]]){
        const broken=structuredClone(save);mutate(broken);assert.throws(()=>parseSave(broken,content),/钓鱼/);
    }
});
