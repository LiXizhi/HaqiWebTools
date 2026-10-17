import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {showHanziAnimation,hanziAnimationActive} from '../js/view_hanzi_animation.js';

test('fullscreen player releases its pause on close, skip and repeated cleanup',()=>{
    const original=globalThis.document;
    class Node {
        style={};dataset={};children=[];events={};isConnected=true;
        setAttribute(){} append(...nodes){this.children.push(...nodes);}
        addEventListener(name,fn){this.events[name]=fn;}
        showModal(){this.modal=true;} close(){this.modal=false;}
        remove(){this.isConnected=false;} focus(){document.activeElement=this;}
    }
    const body=new Node(),opener=new Node();
    globalThis.document={body,activeElement:opener,createElement:()=>new Node(),createElementNS:()=>new Node()};
    try{
        let dispose,skipped=0;
        dispose=showHanziAnimation(new Node(),{close:()=>dispose(),skip:()=>{skipped++;dispose();}});
        assert.equal(hanziAnimationActive(),true);
        const dialog=body.children.at(-1);assert.equal(dialog.modal,true);
        dialog.children.at(-1).onclick();assert.equal(skipped,1);
        assert.equal(hanziAnimationActive(),false);assert.equal(document.activeElement,opener);
        dispose();assert.equal(hanziAnimationActive(),false);
        dispose=showHanziAnimation(new Node(),{close:()=>dispose()});
        body.children.at(-1).events.cancel({preventDefault(){}});
        assert.equal(hanziAnimationActive(),false);
    }finally{globalThis.document=original;}
});

test('animation gate bypasses background updates and refreshes clocks until resumed',()=>{
    const source=readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
    const code=source.slice(source.indexOf('function frame(now) {'),source.indexOf('// Opt-in, local diagnostics.'));
    let active=true,scheduled=0;
    const c=vm.createContext({wordPractice:{active:false},hanziAnimationActive:()=>active,requestAnimationFrame:()=>scheduled++,lastFrame:0,lastCare:0,islandSocial:{},petScene:{},renderer:{pauseFrameMeter(){}},adaptiveGraphics:{suspend(){}},perf:{frame(){}}});
    vm.runInContext(code+';frame(1000);frame(9000);',c);
    assert.equal(scheduled,2);assert.equal(c.lastFrame,9000);assert.equal(c.lastCare,9000);
    assert.equal(c.islandSocial.lastFrame,9000);assert.equal(c.petScene.lastFrame,9000);
    active=false;
    // The first regular-frame dependency is deliberately absent: reaching it
    // proves the released gate no longer suppresses the normal game loop.
    assert.throws(()=>vm.runInContext('frame(9016)',c),/stage is not defined/);
});
