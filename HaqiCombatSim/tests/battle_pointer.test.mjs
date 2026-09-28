import test from 'node:test';
import assert from 'node:assert/strict';
import {withBattlePointer,battlePointerAngle,POINTER_TURN_MS,nextBattlePointer} from '../js/battle_pointer_core.js';
import {battleActorAction,castHitReactions} from '../js/actor_animation_core.js';

test('pointer rotates before each action without altering combat events or following damage targets',()=>{
    const events=[{type:'cast',caster:'hero',target:'mob'},{type:'damage',target:'mob',amount:10},{type:'fizzle',caster:'pet'},{type:'pass',caster:'mob'},{type:'dot',caster:'hero',target:'mob'}];
    const original=structuredClone(events),queue=withBattlePointer(events,'mob');
    assert.deepEqual(events,original);
    assert.deepEqual(queue.filter(e=>e.type!=='movearrow'),events);
    assert.deepEqual(queue.filter(e=>e.type==='movearrow').map(e=>[e.from,e.caster]),[['mob','hero'],['hero','pet'],['pet','mob']]);
    assert.equal(POINTER_TURN_MS,200);
    assert.equal(battleActorAction('hero',100,queue[0],.5).action,'idle');
    assert.deepEqual(castHitReactions(queue,1,.5,1000,.5).map(r=>r.target),['mob']);
});

test('rotation wraps forward and lands exactly on the actor, including reduced motion',()=>{
    const center={x:0,y:0},point=a=>({x:Math.cos(a),y:Math.sin(a)*(.39/.76)});
    const from=point(170*Math.PI/180),to=point(-170*Math.PI/180);
    assert.ok(Math.abs(battlePointerAngle(center,from,to,.5)-Math.PI)<1e-9);
    assert.ok(Math.abs(battlePointerAngle(center,from,to,1)-190*Math.PI/180)<1e-9);
    assert.equal(battlePointerAngle(center,from,to,0,true),battlePointerAngle(center,from,to,1));
    assert.equal(battlePointerAngle(center,to,to,.5),battlePointerAngle(center,to,to,1));
});

test('round ends by resetting to the next living actor; finished battles do not reset',()=>{
    const battle={sides:{near:[{id:'hero',slot:2,hp:20},{id:'pet',slot:0,hp:10},{id:'dead',slot:1,hp:0}],far:[{id:'mob',hp:30}]}};
    assert.equal(nextBattlePointer(battle),'pet');
    const events=[{type:'cast',caster:'hero'},{type:'cast',caster:'mob'},{type:'damage',target:'hero',amount:5}];
    assert.deepEqual(withBattlePointer(events,'pet',nextBattlePointer(battle)).at(-1),{type:'movearrow',from:'mob',caster:'pet'});
    battle.sides.near[1].hp=0;assert.equal(nextBattlePointer(battle),'hero');
    const queue=withBattlePointer(events,'pet',nextBattlePointer(battle));
    assert.deepEqual(queue.at(-1),{type:'movearrow',from:'mob',caster:'hero'});
    assert.equal(queue.at(-2).type,'damage');
    assert.equal(battleActorAction('hero',100,queue.at(-1),.5).action,'idle');
    battle.firstActingSide='far';assert.equal(nextBattlePointer(battle),'mob');
    battle.finished=true;assert.equal(nextBattlePointer(battle),null);
    assert.equal(withBattlePointer(events,'hero',nextBattlePointer(battle)).at(-1).type,'damage');
});

test('scripted before-round casts take precedence over the normal first side without mutating battle state',()=>{
    const mob={id:'mob',hp:30,aiMemory:{round:0},template:{sequences:[[{round:'1-',card:'IceBlade'},{round:'2-',card:'IceBlade'}]]}};
    const battle={firstActingSide:'near',sides:{near:[{id:'hero',hp:20}],far:[mob]}};
    const original=structuredClone(battle);
    assert.equal(nextBattlePointer(battle),'mob');
    assert.deepEqual(battle,original);
    mob.aiMemory.round=1;mob.aiMemory.sequence_before=0;
    assert.equal(nextBattlePointer(battle),'mob');
    assert.deepEqual(withBattlePointer([{type:'cast',caster:'hero'}],'mob',nextBattlePointer(battle)).at(-1),{type:'movearrow',from:'hero',caster:'mob'});
    mob.aiMemory.round=2;assert.equal(nextBattlePointer(battle),'hero');
    mob.aiMemory.round=0;mob.hp=0;assert.equal(nextBattlePointer(battle),'hero');
});

test('enemy-first rounds rotate through actions then return to the enemy for card selection',()=>{
    const battle={firstActingSide:'far',sides:{near:[{id:'hero',hp:20}],far:[{id:'mob',hp:30}]}};
    const first=nextBattlePointer(battle);
    const queue=withBattlePointer([{type:'cast',caster:'mob'},{type:'capture',caster:'hero'}],first,first);
    assert.equal(first,'mob');
    assert.deepEqual(queue.filter(event=>event.type==='movearrow').map(event=>[event.from,event.caster]),[['mob','mob'],['mob','hero'],['hero','mob']]);
});
