import test from 'node:test';
import assert from 'node:assert/strict';
import {actorPose,battleActorAction} from '../js/actor_animation_core.js';
test('actor death persists after lethal damage and living units recover their idle pose',()=>{
    assert.deepEqual(battleActorAction('mob0',0,{type:'damage',target:'mob0'},.5),{action:'death',progress:.5});
    assert.deepEqual(battleActorAction('mob0',0,{type:'cast',caster:'hero'},0),{action:'death',progress:1});
    assert.equal(actorPose('death',1).alpha,0);
    assert.equal(battleActorAction('mob0',10,null).action,'idle');
    assert.equal(battleActorAction('mob0',10,{type:'damage',target:'mob0',amount:0}).action,'idle');
    assert.equal(battleActorAction('mob0',10,{type:'cast',caster:'mob0'}).action,'cast');
});
test('shared poses stay finite and reduced motion removes displacement',()=>{
    for(const action of ['idle','cast','hit','death'])for(const p of [0,.25,.5,.75,1]) {
        const pose=actorPose(action,p,-1);
        assert.ok(Object.values(pose).every(Number.isFinite));
        assert.ok(pose.alpha>=0&&pose.alpha<=1);
        const quiet=actorPose(action,p,1,true);
        assert.equal(quiet.x,0);assert.equal(quiet.y,0);assert.equal(quiet.rotation,0);
    }
    assert.equal(actorPose('hit',1).brightness,1);
    assert.equal(actorPose('cast',1).alpha,1);
});
