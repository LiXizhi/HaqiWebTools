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

import { createWorldInteractionController } from '../js/adventure/world_interaction_controller.js';

test('animation gate bypasses background updates and refreshes clocks until resumed',()=>{
    const originalDoc=globalThis.document,originalRaf=globalThis.requestAnimationFrame;
    let scheduled=0,lastFrame=0,lastCare=0;
    const social={},pet={};
    globalThis.requestAnimationFrame=()=>scheduled++;
    globalThis.document={hidden:true,body:{append(){}}};
    try{
        const ctrl=createWorldInteractionController({
            nodes:{},
            getContext:()=>({
                renderer:{pauseFrameMeter(){}},
                setLastFrame:v=>{lastFrame=v;},
                setLastCare:v=>{lastCare=v;},
            }),
            islandSocial:()=>social,
            petScene:()=>pet,
            localPlay:()=>({}),
            wordLearning:{wordPractice:{active:false}},
            adaptiveGraphics:{suspend(){}},
            perf:{frame(){}},
        });
        ctrl.frame(1000);ctrl.frame(9000);
        assert.equal(scheduled,2);assert.equal(lastFrame,9000);assert.equal(lastCare,9000);
        assert.equal(social.lastFrame,9000);assert.equal(pet.lastFrame,9000);
        globalThis.document.hidden=false;
        // The first regular-frame dependency is deliberately absent: reaching it
        // proves the released gate no longer suppresses the normal game loop.
        assert.throws(()=>ctrl.frame(9016),/Cannot read properties of undefined/);
    }finally{globalThis.document=originalDoc;globalThis.requestAnimationFrame=originalRaf;}
});
