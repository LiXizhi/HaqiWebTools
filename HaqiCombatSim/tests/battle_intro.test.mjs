import test from 'node:test';
import assert from 'node:assert/strict';
import {battleIntroRoster,battleIntroDuration,battleIntroFrame} from '../js/battle_intro_core.js';
import {createBattleIntro} from '../js/adventure_battle_intro.js';
import {createBattleIntroView} from '../js/view_battle_intro.js';
function battle(count=4){
    const monsterTemplates=Array.from({length:count},(_,i)=>({id:`template${i}`,name:`Enemy ${i}`,level:10+i,school:['fire','ice','storm','life'][i]}));
    return {monsterTemplates,sides:{far:monsterTemplates.map((m,i)=>({...m,id:`mob${i}`}))},turn:1};
}
function session(reduced=false){
    const events=[],frames=[],done=[];let clock=0,callbacks;
    const intro=createBattleIntro({root:{},now:()=>clock,reducedMotion:()=>reduced,onDone:b=>done.push(b),viewFactory:(_root,cb)=>{
        callbacks=cb;return {open:model=>events.push(['open',model]),update:f=>frames.push(f),close:()=>events.push(['close'])};
    }});
    return {intro,events,frames,done,skip:()=>callbacks.skip(),tick:(dt=50,paused=false)=>{clock+=dt;intro.tick(clock,{paused});}};
}
test('one to four opponents use the actual battle roster and preserve duplicates without mutation',()=>{
    for(let count=1;count<=4;count++){
        const b=battle(count),before=JSON.stringify(b),rows=battleIntroRoster(b);
        assert.equal(rows.length,count);assert.equal(new Set(rows.map(r=>r.id)).size,count);
        assert.equal(rows[0].template,b.monsterTemplates[0]);assert.equal(rows[0].level,10);
        assert.equal(JSON.stringify(b),before);
    }
    const b=battle(4);b.monsterTemplates.fill(b.monsterTemplates[0]);
    assert.equal(battleIntroRoster(b).length,4,'same species still gets four appearances');
});
test('portraits and banners arrive in order, hold for reading and close in under four seconds',()=>{
    const start=battleIntroFrame(0,4),middle=battleIntroFrame(850,4),hold=battleIntroFrame(2200,4);
    assert.ok(start.rows.every(r=>r.entry===0&&r.banner===0));
    assert.ok(middle.rows[0].entry>middle.rows[3].entry);
    assert.ok(middle.rows[0].banner>middle.rows[3].banner);
    assert.ok(hold.rows.every(r=>r.entry===1&&r.banner===1));assert.equal(hold.exit,0);
    assert.ok(battleIntroDuration(4)<4000);
    assert.equal(battleIntroFrame(battleIntroDuration(4),4).done,true);
    const reduced=battleIntroFrame(0,4,true);assert.ok(reduced.rows.every(r=>r.entry===1&&r.banner===1));assert.equal(reduced.curtain,1);
});
test('intro gates presentation only and auto-completes exactly once',()=>{
    const s=session(),b=battle(),before=JSON.stringify(b);s.intro.open(b,{});
    assert.equal(s.intro.active,true);
    for(let i=0;i<80;i++)s.tick();
    assert.equal(s.intro.active,false);assert.deepEqual(s.done,[b]);assert.equal(JSON.stringify(b),before);
    s.skip();s.tick();assert.equal(s.done.length,1);
});
test('skip is immediate and cancellation or replacement never starts a stale battle',()=>{
    const s=session(),a=battle(1),b=battle(2);s.intro.open(a,{});s.skip();s.skip();assert.deepEqual(s.done,[a]);
    s.intro.open(a,{});s.intro.close();for(let i=0;i<100;i++)s.tick();assert.deepEqual(s.done,[a]);
    s.intro.open(a,{});s.intro.open(b,{});s.skip();assert.deepEqual(s.done,[a,b]);
});
test('backgrounding pauses the whole timeline without missing the reveal on return',()=>{
    const s=session();s.intro.open(battle(),{});s.tick(100);const before=s.frames.at(-1).elapsed;
    s.intro.suspend();s.tick(60000,true);s.tick(60000,false);
    assert.equal(s.frames.at(-1).elapsed,before);assert.equal(s.done.length,0);
    s.tick(50);assert.equal(s.frames.at(-1).elapsed,before+50);
});
test('reduced motion presents all labels at once and missing opponents cannot trap entry',()=>{
    const s=session(true);s.intro.open(battle(),{});assert.ok(s.frames[0].rows.every(r=>r.entry===1&&r.banner===1));
    for(let i=0;i<53;i++)s.tick();assert.equal(s.done.length,1);
    const empty=battle(0);s.intro.open(empty,{});assert.equal(s.intro.active,false);assert.equal(s.done.at(-1),empty);
});
function dom(t){
    const previous=globalThis.document,nodes=[];
    const context=new Proxy({}, {get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
    function node(tag){
        const classes=new Set();
        const n={tag,children:[],dataset:{},attributes:{},styles:{},listeners:{},
            style:{setProperty(k,v){n.styles[k]=v;}},classList:{add(...names){names.forEach(k=>classes.add(k));},remove(...names){names.forEach(k=>classes.delete(k));},contains:k=>classes.has(k)},
            append(...children){n.children.push(...children);children.forEach(c=>c.parent=n);},setAttribute(k,v){n.attributes[k]=v;},
            addEventListener(k,v){n.listeners[k]=v;},remove(){n.parent.children=n.parent.children.filter(c=>c!==n);},focus(){globalThis.document.activeElement=n;},getContext:()=>context};
        nodes.push(n);return n;
    }
    globalThis.document={createElement:node};t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
    return {root:node('div'),nodes};
}
test('view shows all names/levels, retries delayed art, traps focus and releases its fullscreen layer',t=>{
    const {root,nodes}=dom(t);let skipped=0,available=false,draws=0;
    const view=createBattleIntroView(root,{skip:()=>skipped++});
    view.open({roster:battleIntroRoster(battle()),assets:{drawMonster(){draws++;return available;}}});
    const screen=nodes.find(n=>n.className==='battle-intro-screen');
    assert.equal(screen.dataset.count,'4');assert.equal(screen.styles['--count'],4);
    assert.equal(nodes.filter(n=>n.tag==='h3').length,4);assert.ok(nodes.some(n=>n.textContent?.includes('10')));
    view.update(battleIntroFrame(100,4));assert.equal(draws,4);available=true;
    view.update(battleIntroFrame(200,4));view.update(battleIntroFrame(300,4));assert.equal(draws,8,'ready portraits are not redrawn every frame');
    let stopped=0,prevented=0;
    screen.listeners.keydown({key:'Tab',stopPropagation(){stopped++;},preventDefault(){prevented++;}});
    assert.equal(document.activeElement.tag,'button');assert.equal(prevented,1);
    screen.listeners.keydown({key:'Escape',stopPropagation(){stopped++;},preventDefault(){prevented++;}});
    assert.equal(skipped,1);assert.equal(stopped,2);
    view.close();assert.equal(root.children.length,0);assert.equal(root.classList.contains('battle-intro-overlay'),false);
});
