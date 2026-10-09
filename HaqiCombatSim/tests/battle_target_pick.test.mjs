import test from 'node:test';
import assert from 'node:assert/strict';
import {pickBattleTarget} from '../js/battle_target_pick_core.js';

test('clicks on a tall mounted rider select its owner instead of a closer foot point',()=>{
    const positions={hero:{x:220,y:560},pet:{x:250,y:440}};
    const rects=[{id:'hero',x:165,y:390,width:110,height:220},{id:'pet',x:290,y:370,width:90,height:110}];
    assert.equal(pickBattleTarget(rects,positions,{x:205,y:410}),'hero');
    assert.equal(pickBattleTarget(rects,positions,{x:210,y:530}),'hero');
    assert.equal(pickBattleTarget(rects,positions,{x:220,y:590}),'hero');
    assert.equal(pickBattleTarget(rects,positions,{x:320,y:400}),'pet');
});
test('empty scenes and nearest-foot fallback remain safe',()=>{
    assert.equal(pickBattleTarget([],{}, {x:0,y:0}),null);
    assert.equal(pickBattleTarget([],{hero:{x:10,y:100},enemy:{x:200,y:100}},{x:190,y:80}),'enemy');
});
