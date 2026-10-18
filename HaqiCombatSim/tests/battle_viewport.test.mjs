import test from 'node:test';
import assert from 'node:assert/strict';
import {battleViewport} from '../js/battle_viewport_core.js';
import {battleTargetRects,pickBattleTarget} from '../js/battle_target_pick_core.js';

test('large screens preserve the arena, actor and effect proportions in design coordinates',()=>{
    const reference=battleViewport(1024,640);
    for(const multiplier of [1,1.5,2,3,4]){
        const view=battleViewport(1024*multiplier,640*multiplier);
        assert.equal(view.w,reference.w);
        assert.equal(view.h,reference.h);
        assert.equal(view.scale,multiplier);
        const radius=Math.min(view.w*.46,view.h*.76);
        assert.equal(90*view.scale/(radius*view.scale),90/(1024*.46));
        const positions={hero:{x:200,y:320},enemy:{x:800,y:320}};
        const rects=battleTargetRects(positions,{},view.scale);
        assert.equal(pickBattleTarget(rects,{}, {x:200*view.scale,y:250*view.scale}),'hero');
    }
});

test('height limits ultrawide scaling and compact layouts retain their existing sizes',()=>{
    assert.deepEqual(battleViewport(2560,1080),{scale:1080/640,w:2560/(1080/640),h:640});
    for(const [width,height] of [[878,585],[390,844],[844,390],[640,240]]){
        const view=battleViewport(width,height);
        assert.equal(view.scale,Math.min(1,height/270));
        assert.equal(view.w*view.scale,width);
        assert.equal(view.h*view.scale,height);
    }
});
