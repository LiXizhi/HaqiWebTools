import test from 'node:test';
import assert from 'node:assert/strict';
import { bindTouchMovement } from '../js/view_adventure_movement.js';

function setup() {
    const surface=new EventTarget(),captures=new Set(),values=[];
    surface.setPointerCapture=id=>captures.add(id);
    surface.hasPointerCapture=id=>captures.has(id);
    surface.releasePointerCapture=id=>captures.delete(id);
    const indicator={hidden:true,style:{},firstElementChild:{style:{}}};
    let enabled=true;
    const input=bindTouchMovement(surface,indicator,{enabled:()=>enabled,steer:(x,y)=>values.push([x,y])});
    const send=(type,props={})=>{
        const event=new Event(type,{cancelable:true});
        Object.assign(event,{pointerId:1,pointerType:'touch',button:0,clientX:200,clientY:300},props);
        surface.dispatchEvent(event);
    };
    return {send,input,indicator,captures,values,disable:()=>{enabled=false;},last:()=>values.at(-1)};
}
test('touch starts stationary at the contact point, steers relative to it and stops on release',()=>{
    const s=setup();s.send('pointerdown');assert.deepEqual(s.last(),[0,0]);
    assert.equal(s.indicator.style.left,'200px');assert.equal(s.indicator.style.top,'300px');
    s.send('pointermove',{clientX:203});assert.equal(Math.hypot(...s.last()),0);
    s.send('pointermove',{clientX:220});assert.ok(s.last()[0]>0&&s.last()[0]<1);
    s.send('pointermove',{clientX:400,clientY:500});assert.ok(Math.abs(Math.hypot(...s.last())-1)<1e-10);
    assert.equal(s.last()[0],s.last()[1]);
    s.send('pointermove',{clientX:157});assert.deepEqual(s.last(),[-1,0]);
    s.send('pointerup');assert.deepEqual(s.last(),[0,0]);assert.ok(s.indicator.hidden);assert.equal(s.captures.size,0);
});
test('mouse is left to desktop controls and additional fingers cannot replace or stop the active touch',()=>{
    const s=setup();s.send('pointerdown',{pointerType:'mouse'});assert.equal(s.values.length,0);
    s.send('pointerdown');s.send('pointermove',{clientX:243});
    s.send('pointerdown',{pointerId:2});s.send('pointermove',{pointerId:2,clientX:0});s.send('pointerup',{pointerId:2});
    assert.deepEqual(s.last(),[1,0]);assert.equal(s.indicator.hidden,false);
});
test('cancellation, capture loss, disabled play and lifecycle reset stop movement',()=>{
    for(const ending of ['pointercancel','lostpointercapture','disable','reset']){
        const s=setup();s.send('pointerdown');s.send('pointermove',{clientX:243});
        if(ending==='disable'){s.disable();s.send('pointermove');}
        else if(ending==='reset')s.input.reset();else s.send(ending);
        assert.deepEqual(s.last(),[0,0]);assert.ok(s.indicator.hidden);
        s.send('pointermove',{clientX:400});assert.deepEqual(s.last(),[0,0]);
    }
    const s=setup();s.disable();s.send('pointerdown');assert.equal(s.values.length,0);
});
