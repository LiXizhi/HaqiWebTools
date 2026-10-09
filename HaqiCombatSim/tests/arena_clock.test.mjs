import test from 'node:test';
import assert from 'node:assert/strict';
import {createArenaClock} from '../js/adventure_arena_clock.js';
import {gameSoundRecipe} from '../js/game_sound_core.js';
function harness(){
    let now=0,id=0,expired=0;const tasks=new Map(),seconds=[];
    const clock=createArenaClock({now:()=>now,schedule:fn=>{tasks.set(++id,fn);return id;},cancel:id=>tasks.delete(id),onSecond:s=>seconds.push(s),onExpire:()=>expired++});
    return {clock,seconds,get expired(){return expired;},stall(ms){now+=ms;},advance(ms){now+=ms;const work=[...tasks.values()];tasks.clear();for(const fn of work)fn();}};
}
test('ready 15s starts once, stalls catch up to wall clock instead of extending',()=>{
    const h=harness();h.clock.start(15000);assert.deepEqual(h.seconds,[15]);h.advance(14900);assert.equal(h.expired,0);h.advance(5000);assert.equal(h.expired,1);h.advance(99999);assert.equal(h.expired,1);
});
test('30-second turns emit final five exactly once and late clicks expire',()=>{
    const h=harness();h.clock.start(30000);h.advance(25000);
    for(let i=0;i<5;i++){h.advance(200);h.advance(800);}
    assert.deepEqual(h.seconds.filter(s=>s>0&&s<=5),[5,4,3,2,1]);assert.equal(h.expired,1);
    h.clock.start(30000);h.advance(29900);assert.deepEqual(h.clock.claim(),{expired:false});h.advance(200);assert.equal(h.expired,1);
    h.clock.start(30000);h.stall(30001);assert.deepEqual(h.clock.claim(),{expired:true});h.advance(100);assert.equal(h.expired,1);
    assert.ok(gameSoundRecipe('countdown'));assert.ok(gameSoundRecipe('countdownFinal'));
});
test('manual readiness and stop cancel expiry; remaining calls never reset deadline',()=>{
    const h=harness();h.clock.start(15000);h.advance(7000);assert.equal(h.clock.remaining(),8);assert.equal(h.clock.remaining(),8);h.clock.stop();h.advance(15000);assert.equal(h.expired,0);
});

test('opponents join in order over 3–5 seconds, then readiness starts; cancellation rejects stale joins',async()=>{
    const {createArenaArrivals}=await import('../js/adventure_arena_clock.js');
    for(const count of [1,2,3,4])for(const duration of [3000,5000]){
        const tasks=[],joined=[];let ready=0;
        const arrivals=createArenaArrivals({schedule:(fn,ms)=>{tasks.push({fn,ms});return tasks.length;},cancel:()=>{},onJoin:n=>joined.push(n),onReady:()=>ready++});
        arrivals.start(count,duration);
        assert.equal(tasks.at(-1).ms,duration);assert.equal(ready,0);
        for(let i=0;i<count;i++){assert.equal(ready,0);tasks[i].fn();assert.deepEqual(joined,Array.from({length:i+1},(_,j)=>j+1));}
        assert.equal(ready,1);
        arrivals.start(count,duration);const stale=tasks.slice(count);arrivals.stop();for(const task of stale)task.fn();assert.equal(ready,1);assert.equal(joined.length,count);
    }
});
