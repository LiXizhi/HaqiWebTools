import test from 'node:test';
import assert from 'node:assert/strict';
import { bindHandGesture } from '../js/view_adventure_hand.js';
import { resolveHandSwipe } from '../js/adventure_hand_core.js';

function classes(){const set=new Set();return {add:x=>set.add(x),remove:(...xs)=>xs.forEach(x=>set.delete(x)),contains:x=>set.has(x),toggle:(x,on)=>on?set.add(x):set.delete(x)};}
function setup(){
    const hand=new EventTarget(),doc=new EventTarget(),win=new EventTarget(),root=new EventTarget(),calls=[],captures=new Set(),timers=[];
    win.setTimeout=fn=>timers.push(fn);doc.defaultView=win;hand.ownerDocument=doc;hand.parentElement=root;hand.classList=classes();
    hand.children=[0,1,2].map(i=>{
        const node={dataset:{seq:String(i)},classList:classes(),style:{setProperty(){},removeProperty(){}},getBoundingClientRect:()=>({left:i*40,right:i*40+100,top:400,bottom:550})};
        const face={disabled:false,parentElement:node,closest:()=>face};node.face=face;node.querySelector=()=>face;return node;
    });
    hand.contains=face=>hand.children.some(n=>n.face===face);
    hand.getBoundingClientRect=()=>({left:0,right:180,top:400,bottom:550});
    hand.setPointerCapture=id=>captures.add(id);hand.hasPointerCapture=id=>captures.has(id);hand.releasePointerCapture=id=>captures.delete(id);
    const hint={textContent:'选择卡牌'};
    const dispose=bindHandGesture(hand,{select:seq=>calls.push(['select',seq]),play:seq=>calls.push(['play',seq]),discard:seq=>calls.push(['discard',seq]),hint});
    function send(type,props={},surface=hand){
        const event=new Event(type,{cancelable:true});
        Object.assign(event,{pointerId:1,pointerType:'touch',button:0,isPrimary:true,clientX:20,clientY:480},props);
        Object.defineProperty(event,'target',{value:props.target||hand.children[0].face});
        surface.dispatchEvent(event);return event;
    }
    return {hand,doc,win,root,calls,captures,hint,dispose,send,timers};
}
test('touch browses overlapping cards without committing until release, then selects exactly once',()=>{
    const s=setup();s.send('pointerdown');s.send('pointermove',{clientX:60});
    assert.ok(s.hand.children[1].classList.contains('touch-preview'));assert.deepEqual(s.calls,[]);
    s.send('pointermove',{clientX:110});s.send('pointerup',{clientX:110});
    assert.deepEqual(s.calls,[['select',2]]);assert.equal(s.captures.size,0);assert.equal(s.hint.textContent,'选择卡牌');
});
test('upward drag locks the browsed card and only casts after release beyond threshold',()=>{
    const s=setup();s.send('pointerdown');s.send('pointermove',{clientX:60});
    s.send('pointermove',{clientX:110,clientY:410});
    assert.ok(s.hand.classList.contains('hand-aiming'));
    assert.ok(s.hand.children[1].classList.contains('touch-ready'));assert.deepEqual(s.calls,[]);
    s.send('pointerup',{clientX:110,clientY:410});s.send('pointerup',{clientY:400});
    assert.deepEqual(s.calls,[['play',1]]);
    assert.equal(s.hand.classList.contains('hand-aiming'),false);
    const click=s.send('click',{clientX:110,clientY:410,detail:1},s.root);assert.ok(click.defaultPrevented);
});
test('dragging back cancels the cast; sideways release outside the hand does nothing',()=>{
    const s=setup();s.send('pointerdown');s.send('pointermove',{clientY:400});
    assert.ok(s.hand.classList.contains('hand-aiming'));
    s.send('pointermove',{clientY:480});assert.equal(s.hand.classList.contains('hand-aiming'),false);
    s.send('pointerup',{clientY:470});
    assert.deepEqual(s.calls,[['select',0]]);
    for(const point of [{clientX:260,clientY:400}]){
        const t=setup();t.send('pointerdown');t.send('pointerup',point);assert.deepEqual(t.calls,[]);
    }
});
test('pointer cancellation, capture loss, blur, second touch and disposal never play a card',()=>{
    for(const reason of ['pointercancel','lostpointercapture','blur','second','dispose','hidden']){
        const s=setup();s.send('pointerdown');s.send('pointermove',{clientY:400});
        if(reason==='blur')s.win.dispatchEvent(new Event('blur'));
        else if(reason==='second')s.send('pointerdown',{pointerId:2,isPrimary:false},s.doc);
        else if(reason==='dispose')s.dispose();
        else if(reason==='hidden'){s.doc.hidden=true;s.doc.dispatchEvent(new Event('visibilitychange'));}
        else s.send(reason);
        s.send('pointerup',{clientY:400});assert.deepEqual(s.calls,[],reason);assert.equal(s.captures.size,0);
    }
});
test('right mouse button and disabled buttons retain their existing behavior; short taps only select',()=>{
    const s=setup();s.send('pointerdown',{pointerType:'mouse',button:2});s.send('pointerup',{pointerType:'mouse',button:2,clientY:400});assert.deepEqual(s.calls,[]);
    s.hand.children[0].face.disabled=true;s.send('pointerdown');s.send('pointerup',{clientY:400});assert.deepEqual(s.calls,[]);
    s.hand.children[0].face.disabled=false;s.send('pointerdown');s.send('pointerup');assert.deepEqual(s.calls,[['select',0]]);
});

test('downward mouse, pen and touch drags discard exactly once even below the hand',()=>{
    for(const pointerType of ['mouse','pen','touch']){
        const s=setup();s.send('pointerdown',{pointerType});
        s.send('pointermove',{pointerType,clientY:540,clientX:110});
        assert.deepEqual(s.calls,[]);
        s.send('pointerup',{pointerType,clientY:600,clientX:110});
        s.send('pointerup',{pointerType,clientY:600});
        assert.deepEqual(s.calls,[['discard',0]]);assert.equal(s.captures.size,0);
        assert.ok(s.send('click',{clientX:110,clientY:600,detail:1},s.root).defaultPrevented);
    }
});

test('cancelled downward drags never discard and mouse clicks still select',()=>{
    const s=setup();s.send('pointerdown');s.send('pointermove',{clientY:550});s.send('pointercancel');s.send('pointerup',{clientY:600});
    assert.deepEqual(s.calls,[]);
    s.send('pointerdown',{pointerType:'mouse'});s.send('pointerup',{pointerType:'mouse'});
    assert.deepEqual(s.calls,[['select',0]]);
});

function battle(target='hostile'){
    const hero={id:'hero',side:'near',hp:100,school:'ice',pips:{normal:2,power:0},cooldowns:{},deckMap:[1],deckSeq:['spell']};
    return {finished:false,sides:{near:[hero],far:[{id:'mob0',side:'far',hp:100}]},resolved:{version:'kids',cards:{spell:{key:'spell',type:'SingleAttack',target,spellName:'spell',spellSchool:'ice',pipcost:1}}}};
}
const pick={seq:0,key:'spell'};
test('swipe only auto-casts a unique legal target; multiple enemies/allies require an explicit choice',()=>{
    const b=battle();assert.equal(resolveHandSwipe(b,pick).decision.targetId,'mob0');
    b.sides.far.push({id:'mob1',side:'far',hp:50});assert.equal(resolveHandSwipe(b,pick).message,'请选择施法目标');
    b.sides.far[0].hp=0;assert.equal(resolveHandSwipe(b,pick).decision.targetId,'mob1');
    b.sides.far[1].hp=0;assert.equal(resolveHandSwipe(b,pick).message,'当前没有可用的施法目标');
    const heal=battle('friendly');heal.sides.near.push({id:'pet',side:'near',hp:50});assert.equal(resolveHandSwipe(heal,pick).message,'请选择施法目标');
    heal.resolved.cards.spell.target='self';assert.equal(resolveHandSwipe(heal,pick).decision.targetId,'hero');
    const all=battle('all');assert.equal(resolveHandSwipe(all,pick).message,'请选择施法目标');
});
test('swipe rejects discarded, unaffordable, cooling down, stale and finished hands without mutating battle',()=>{
    const b=battle(),before=JSON.stringify(b);
    const discards=[2];const intent=resolveHandSwipe(b,pick,discards);assert.deepEqual(intent.decision.discardSeqs,[2]);assert.notEqual(intent.decision.discardSeqs,discards);
    assert.equal(JSON.stringify(b),before);assert.equal(resolveHandSwipe(b,pick,[0]).message,'这张卡牌已弃掉');
    b.sides.near[0].pips.normal=0;assert.ok(resolveHandSwipe(b,pick).message);
    b.sides.near[0].pips.normal=2;b.sides.near[0].cooldowns.spell=1;assert.ok(resolveHandSwipe(b,pick).message);
    b.sides.near[0].cooldowns.spell=0;b.sides.near[0].hp=0;assert.ok(resolveHandSwipe(b,pick).message);
    assert.equal(resolveHandSwipe(b,{...pick,key:'missing'}),null);
    b.finished=true;assert.equal(resolveHandSwipe(b,pick),null);
});
