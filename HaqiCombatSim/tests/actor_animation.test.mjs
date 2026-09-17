import test from 'node:test';
import assert from 'node:assert/strict';
import {actorPose,battleActorAction,castHitReactions,HIT_DURATION_MS,PREVIEW_HIT_DURATION_MS,previewTargetAction} from '../js/actor_animation_core.js';
test('preview targets recoil at impact, recover, and respect friendly and manual modes',()=>{
    const timeline={impact:.7,summonImpact:.78},duration=1800;
    for(const kind of ['burst','summon']) {
        const spec={kind},start=timeline[kind==='summon'?'summonImpact':'impact']*duration;
        assert.equal(previewTargetAction(spec,timeline,start-1,duration).action,'idle');
        const hit=previewTargetAction(spec,timeline,start+PREVIEW_HIT_DURATION_MS*.2,duration);
        assert.equal(hit.action,'hit');assert.ok(actorPose(hit.action,hit.progress,-1).x>15);
        assert.equal(previewTargetAction(spec,timeline,start+PREVIEW_HIT_DURATION_MS,duration).action,'idle');
        assert.equal(previewTargetAction({...spec,friendly:true},timeline,start+40,duration).action,'idle');
    }
    assert.deepEqual(previewTargetAction({},timeline,180,360,'hit'),{action:'hit',progress:.5});
});
test('actor death persists after lethal damage and living units recover their idle pose',()=>{
    assert.deepEqual(battleActorAction('mob0',0,{type:'damage',target:'mob0'},.5),{action:'death',progress:.5});
    assert.deepEqual(battleActorAction('mob0',0,{type:'cast',caster:'hero'},0),{action:'death',progress:1});
    assert.equal(actorPose('death',1).alpha,0);
    assert.equal(battleActorAction('mob0',10,null).action,'idle');
    assert.equal(battleActorAction('mob0',10,{type:'damage',target:'mob0',amount:0}).action,'idle');
    assert.equal(battleActorAction('mob0',10,{type:'cast',caster:'mob0'}).action,'cast');
});

test('cast impact recoils only actual damaged targets and does not repeat at HP settlement',()=>{
    const events=[{type:'cast',caster:'hero'},{type:'damage',target:'mob0',amount:50},{type:'damage',target:'mob1',amount:0},{type:'heal',target:'hero',amount:10},{type:'cast',caster:'mob0'},{type:'damage',target:'hero',amount:25}];
    const before=JSON.stringify(events),duration=2400,impact=.7;
    assert.deepEqual(castHitReactions(events,0,.69,duration,impact),[]);
    const reactions=castHitReactions(events,0,impact+HIT_DURATION_MS*.2/duration,duration,impact);
    assert.equal(reactions.length,1);assert.equal(reactions[0].target,'mob0');assert.equal(reactions[0].eventIndex,1);
    assert.ok(Math.abs(reactions[0].progress-.2)<1e-10);
    assert.ok(Math.abs(actorPose('hit',reactions[0].progress,-1).x)>10);
    assert.deepEqual(castHitReactions(events,0,.9,duration,impact),[]);
    assert.equal(battleActorAction('mob0',50,{...events[1],recoilPlayed:true},.2).action,'idle');
    assert.equal(battleActorAction('mob0',50,events[1],.2).action,'hit');
    assert.equal(battleActorAction('mob0',0,{...events[1],recoilPlayed:true},.2).action,'death');
    assert.deepEqual(castHitReactions([{type:'fizzle'},events[1]],0,.72,duration,impact),[]);
    assert.deepEqual(castHitReactions([events[0],{...events[1],periodic:true}],0,.72,duration,impact),[]);
    assert.equal(castHitReactions([events[0],events[1],{...events[1],target:'mob2'}],0,.72,duration,impact).length,2);
    assert.equal(JSON.stringify(events),before);
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
