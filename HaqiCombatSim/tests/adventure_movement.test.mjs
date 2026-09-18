import test from 'node:test';
import assert from 'node:assert/strict';
import { bindTouchMovement } from '../js/view_adventure_movement.js';
import { createRenderer } from '../js/adventure_renderer.js';

function setup() {
    const surface=new EventTarget(),captures=new Set(),values=[],zooms=[];
    surface.clientHeight=720;
    surface.setPointerCapture=id=>captures.add(id);
    surface.hasPointerCapture=id=>captures.has(id);
    surface.releasePointerCapture=id=>captures.delete(id);
    const indicator={hidden:true,style:{},firstElementChild:{style:{}}};
    let enabled=true;
    const input=bindTouchMovement(surface,indicator,{enabled:()=>enabled,steer:(x,y)=>values.push([x,y]),zoom:factor=>zooms.push(factor)});
    const send=(type,props={})=>{
        const event=new Event(type,{cancelable:true});
        Object.assign(event,{pointerId:1,pointerType:'touch',button:0,clientX:200,clientY:300},props);
        surface.dispatchEvent(event);
        return event;
    };
    return {send,input,indicator,captures,values,zooms,disable:()=>{enabled=false;},last:()=>values.at(-1)};
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
test('pinch stops steering and does not resume walking until every finger is released',()=>{
    const s=setup();s.send('pointerdown',{pointerType:'mouse'});assert.equal(s.values.length,0);
    s.send('pointerdown');s.send('pointermove',{clientX:243});
    s.send('pointerdown',{pointerId:2,clientX:343});
    assert.deepEqual(s.last(),[0,0]);assert.ok(s.indicator.hidden);
    s.send('pointermove',{pointerId:2,clientX:443});assert.equal(s.zooms.at(-1),2);
    s.send('pointerup',{pointerId:2});s.send('pointermove',{clientX:400});
    assert.deepEqual(s.last(),[0,0]);assert.equal(s.zooms.length,1);
    s.send('pointerup');assert.equal(s.captures.size,0);
    s.send('pointerdown');s.send('pointermove',{clientX:243});assert.deepEqual(s.last(),[1,0]);
});
test('wheel normalizes units, caps sudden deltas and leaves disabled overlays alone',()=>{
    const s=setup();
    assert.ok(s.send('wheel',{deltaY:-40,deltaMode:0}).defaultPrevented);
    assert.ok(s.zooms.at(-1)>1);
    s.send('wheel',{deltaY:1,deltaMode:1});assert.ok(s.zooms.at(-1)<1);
    s.send('wheel',{deltaY:1,deltaMode:2});const page=s.zooms.at(-1);
    s.send('wheel',{deltaY:100000,deltaMode:0});assert.equal(s.zooms.at(-1),page);
    s.disable();const count=s.zooms.length;
    assert.equal(s.send('wheel',{deltaY:20}).defaultPrevented,false);assert.equal(s.zooms.length,count);
});
test('third finger, near-zero span, capture loss and reset leave no stale pinch or steering',()=>{
    const s=setup();s.send('pointerdown');s.send('pointerdown',{pointerId:2});
    s.send('pointermove',{pointerId:2,clientX:201});assert.equal(s.zooms.length,0);
    s.send('pointermove',{pointerId:2,clientX:300});assert.equal(s.zooms.length,0);
    s.send('pointerdown',{pointerId:3,clientX:350});s.send('lostpointercapture',{pointerId:1});
    s.send('pointermove',{pointerId:3,clientX:400});assert.equal(s.zooms.at(-1),2);
    s.input.reset();assert.equal(s.captures.size,0);
    s.send('pointermove',{pointerId:3,clientX:500});assert.equal(s.zooms.length,1);assert.deepEqual(s.last(),[0,0]);
});
test('scene zoom clamps, keeps hero anchored and updates world picking without rebaking terrain',()=>{
    const previous={matchMedia:globalThis.matchMedia,window:globalThis.window,document:globalThis.document};
    let created=0;
    const ctx=new Proxy({measureText:()=>({width:20}),createRadialGradient:()=>({addColorStop(){}})},
        {get:(o,k)=>k in o?o[k]:()=>{}});
    globalThis.matchMedia=()=>({matches:true});globalThis.window={devicePixelRatio:1};
    globalThis.document={createElement:()=>{created++;return {getContext:()=>ctx};}};
    try {
        for(const width of [1280,390]){
            const canvas={clientWidth:width,clientHeight:720,getContext:()=>ctx};
            const renderer=createRenderer(canvas,{effects:{cards:{}},content:{quests:[]},tile(){}});
            const world={zone:'camp',w:1800,h:1600,trees:[],paths:[],decorations:[],buildings:[],npcs:[],encounters:[],center:{x:900,y:800},portal:{x:900,y:1300,name:'出口'}};
            const save={position:{x:900,y:800},quests:{},name:'测试'};
            renderer.render(world,save,1000);const initial=created;
            const base=width<650?.82:1,heroY=360-(width<650?50:25)*base;
            for(const [factor,expected] of [[100,1.4],[NaN,1.4],[-1,1.4],[.001,.75],[Infinity,.75]]){
                assert.equal(renderer.zoomBy(factor),expected);renderer.render(world,save,1000);
                const hero=renderer.screenToWorld(width/2,heroY);
                assert.ok(Math.abs(hero.x-900)<1e-8&&Math.abs(hero.y-800)<1e-8);
                const target=renderer.screenToWorld(width/2+100,heroY);
                assert.ok(Math.abs(target.x-900-100/(base*expected))<1e-8);
                assert.equal(created,initial);
            }
        }
    } finally {Object.assign(globalThis,previous);}
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
