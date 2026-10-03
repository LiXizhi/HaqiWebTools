import test from 'node:test';
import assert from 'node:assert/strict';
import {createPathQueue} from '../js/path_queue_core.js';
import {createRng} from '../js/rng_core.js';
test('path frontier keeps stable ties, supports cheaper routes and never duplicates nodes',()=>{
    const q=createPathQueue();q.push('a','a',8);q.push('b','b',3);q.push('c','c',3);q.push('a-new','a',2);
    assert.equal(q.length,3);assert.equal(q.shift(),'a-new');assert.equal(q.shift(),'b');assert.equal(q.shift(),'c');assert.equal(q.shift(),undefined);
});
test('path frontier agrees with a sorted reference through seeded updates and pops',()=>{
    const q=createPathQueue(),rng=createRng(981),rows=new Map();let order=0;
    for(let i=0;i<5000;i++){
        if(rows.size&&rng.float()<.3){const first=[...rows.values()].sort((a,b)=>a.score-b.score||a.order-b.order)[0];assert.equal(q.shift(),first.key);rows.delete(first.key);}
        else{const key=rng.int(0,200),score=rng.int(0,100),row=rows.get(key);if(!row)rows.set(key,{key,score,order:order++});else if(score<row.score)row.score=score;q.push(key,key,score);}
        assert.equal(q.length,rows.size);
    }
});
