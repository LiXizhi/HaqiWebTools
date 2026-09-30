import test from 'node:test';
import assert from 'node:assert/strict';
import {drawBattlePips} from '../js/view_battle_pips.js';
import {captureBattlePresentation} from '../js/view_battle_presentation.js';

function dots(pips,hp=100){
    const marks=[];
    const ctx={save(){},restore(){},beginPath(){},stroke(){},arc(x,y,r){this.point={x,y,r};},fill(){marks.push({...this.point,color:this.fillStyle});}};
    drawBattlePips(ctx,{x:100,y:200},pips,{hp});return marks;
}
test('seven foot markers stay in front, distinguish mana types and dim empty slots',()=>{
    const marks=dots({normal:2,power:3});
    assert.equal(marks.length,7);
    assert.ok(marks.every(p=>p.y>200&&p.y<=213));
    assert.ok(marks.every((p,i)=>!i||p.x>marks[i-1].x));
    assert.equal(marks.filter(p=>p.color==='#99eaff').length,2);
    assert.equal(marks.filter(p=>p.color==='#ffdc69').length,3);
    assert.equal(marks.filter(p=>p.color==='#28474b').length,2);
    assert.equal(dots({normal:0,power:7}).filter(p=>p.color==='#ffdc69').length,7);
    assert.ok(dots({normal:3,power:4},0).every(p=>p.color==='#28474b'));
});
test('mana playback snapshots keep later spending from appearing before its cast',()=>{
    const hero={id:'hero',hp:100,pips:{normal:2,power:1}},battle={unitsById:{hero},events:[],resolved:{}};
    const playback=captureBattlePresentation(battle,()=>{
        const emit=event=>{battle.events.push(event);battle.onEvent(event);};
        emit({type:'pass',caster:'hero'});
        hero.pips.normal=0;hero.pips.power=0;
        emit({type:'cast',caster:'hero'});
    });
    assert.deepEqual(playback.initialPips.hero,{normal:2,power:1});
    assert.deepEqual(playback.events[0].pips.hero,{normal:2,power:1});
    assert.deepEqual(playback.events[1].pips.hero,{normal:0,power:0});
    assert.ok(battle.events.every(e=>!Object.hasOwn(e,'pips')));
});
