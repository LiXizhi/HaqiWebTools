import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as W from '../js/adventure_world_core.js';
import {earthRules} from '../js/adventure_earth_core.js';
import {bindTouchMovement} from '../js/view_adventure_movement.js';

const source=fs.readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
const line=prefix=>source.split(/\r?\n/).find(row=>row.startsWith(prefix));
// Run actual HUD, touch wiring and frame movement with a camera following the player.
const start=source.indexOf("        let dx=Number(keys.has('right'))");
const movement=new vm.Script('{'+source.slice(start,source.indexOf('        const cell=world.zone',start))+'}');
function harness(terrain){
    const captures=new Set(),surface=new EventTarget();
    surface.setPointerCapture=id=>captures.add(id);
    surface.hasPointerCapture=id=>captures.has(id);
    surface.releasePointerCapture=id=>captures.delete(id);
    surface.getBoundingClientRect=()=>({left:0,top:0});
    let renders=0,layoutReads=0;surface.getBoundingClientRect=()=>{layoutReads++;return {left:0,top:0};};
    const context=vm.createContext({W,bindTouchMovement,
        world:{isEarth:true,earthBoating:true,w:8640000,h:4320000,earthRules:earthRules(),terrainAt:()=>terrain,paths:[],buildings:[],landmarks:[]},
        save:{position:{x:800,y:600}},assets:{content:{}},dt:1/60,now:1000,moving:false,
        keys:new Set(),joystick:{x:0,y:0},heldPointer:null,path:[],destination:null,talkApproach:null,
        stage:'world',panel:null,dialog:null,languageAdventure:{active:false,close(){}},
        nodes:{world:surface,hud:{}},touchIndicator:{hidden:true,style:{},firstElementChild:{style:{}}},
        V:{renderHud(){renders++;}},model:()=>({}),openPanel(){},track(){},untrack(){},exitDungeon(){},interactNearest(){},
    });
    context.renderer={screenToWorld:(x,y)=>({x:context.save.position.x+x-400,y:context.save.position.y+y-300})};
    vm.runInContext([line('const touchMovement='),line('function resetMovementInput()'),line('function paintHud()')].join('\n'),context);
    return {context,captures,get renders(){return renders;},get layoutReads(){return layoutReads;},pointer(type,x){
        const event=new Event(type);Object.assign(event,{pointerType:'touch',pointerId:1,button:0,clientX:x,clientY:300});surface.dispatchEvent(event);
    }};
}

for(const terrain of ['water','ocean','grass'])for(const input of ['mouse','keyboard','touch']){
    test(`${input} keeps moving over ${terrain} through repeated streaming HUD refreshes`,()=>{
        const h=harness(terrain),c=h.context;
        if(input==='mouse')c.heldPointer={x:650,y:300,since:0,active:true};
        if(input==='keyboard')c.keys.add('right');
        if(input==='touch'){h.pointer('pointerdown',400);h.pointer('pointermove',460);}
        for(let i=0;i<120;i++){
            vm.runInContext('paintHud()',c);
            const previous=c.save.position.x;c.moving=false;movement.runInContext(c);
            assert.equal(c.moving,true,`frame ${i} must not stop`);
            assert.ok(Math.abs(c.save.position.x-previous-W.WALK_SPEED/60)<1e-6,'constant speed without stop/start jitter');
            if(input==='touch')assert.equal(h.captures.has(1),true);
            c.now+=1000/60;
        }
        assert.equal(h.renders,120);if(input==='mouse')assert.equal(h.layoutReads,1,'held movement reuses canvas bounds across all 120 frames');
        vm.runInContext('resetMovementInput()',c);
        const stopped=c.save.position.x;c.moving=false;movement.runInContext(c);
        assert.equal(c.save.position.x,stopped);assert.equal(c.moving,false);
        assert.equal(c.keys.size,0);assert.equal(c.heldPointer,null);assert.equal(h.captures.size,0);
    });
}

test('touch release after HUD refresh stops movement and releases capture',()=>{
    const h=harness('water');h.pointer('pointerdown',400);h.pointer('pointermove',460);
    vm.runInContext('paintHud()',h.context);h.pointer('pointerup',460);
    movement.runInContext(h.context);
    assert.equal(h.context.save.position.x,800);assert.equal(h.captures.size,0);
});
