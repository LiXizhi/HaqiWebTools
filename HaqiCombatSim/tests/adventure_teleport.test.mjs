import test from 'node:test';
import assert from 'node:assert/strict';
import {drawTeleportEffect,TELEPORT_EFFECT_MS} from '../js/view_adventure_teleport.js';

function canvas(){
    const calls=[];
    const ctx=Object.fromEntries(['save','restore','translate','beginPath','ellipse','fill','stroke','fillRect','arc'].map(name=>[name,(...args)=>calls.push([name,...args])]));
    ctx.createLinearGradient=()=>({addColorStop(){}});
    return {ctx,calls};
}
test('teleport feedback draws at its arrival point and expires after one second',()=>{
    const {ctx,calls}=canvas(),effect={x:120,y:240,started:100};
    drawTeleportEffect(ctx,effect,600);
    assert.ok(calls.some(call=>call[0]==='translate'&&call[1]===120&&call[2]===240));
    assert.ok(calls.some(call=>call[0]==='fillRect'));
    assert.equal(calls.at(-1)[0],'restore');
    calls.length=0;
    drawTeleportEffect(ctx,effect,99);
    drawTeleportEffect(ctx,effect,100+TELEPORT_EFFECT_MS);
    drawTeleportEffect(ctx,null,600);
    assert.equal(calls.length,0);
    assert.equal(TELEPORT_EFFECT_MS,1000);
});
test('reduced motion keeps the arrival halo without beam or particles',()=>{
    const {ctx,calls}=canvas();
    drawTeleportEffect(ctx,{x:0,y:0,started:0},500,true);
    assert.equal(calls.filter(call=>call[0]==='ellipse').length,1);
    assert.ok(!calls.some(call=>['fillRect','arc'].includes(call[0])));
    assert.equal(calls.at(-1)[0],'restore');
});
