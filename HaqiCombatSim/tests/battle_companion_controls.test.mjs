import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanionAI} from '../js/adventure_companion_ai.js';
import fs from 'node:fs';
import {createCompanionChatView} from '../js/view_companion_chat.js';
import {createLocalPeerControl} from '../js/view_local_peer_controls.js';
import {localSocialBubbles} from '../js/adventure_social_motion_core.js';
import {createLocalFollowMotion} from '../js/adventure_local_follow_core.js';
import {SOCIAL_DEFAULTS} from '../js/adventure_social_core.js';
import {distance} from '../js/adventure_world_core.js';

class Node {
    children=[];style={};attributes={};dataset={};hidden=false;
    classList={toggle(){}};
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.children=nodes;}
    setAttribute(key,value){this.attributes[key]=value;}
    addEventListener(){}
    focus(){}
}
const followWorld=(extra={})=>({zone:'camp',w:10000000,h:10000000,buildings:[],trees:[],npcs:[],paths:[],...extra});
const followRoles=()=>[{zone:'camp',position:{x:300,y:300},facing:2},{zone:'camp',position:{x:342,y:300},facing:2}];
test('manual follow survives world transfer and same-world map teleports while paused',()=>{
    const motion=createLocalFollowMotion(),roles=followRoles(),following=[false,true],camp=followWorld();
    motion.step(camp,roles,following,.02);
    const earth=followWorld({zone:'earth',isEarth:true,earthBoating:true,terrainAt:()=> 'ocean'});
    roles[0].zone='earth';roles[0].position={x:6000000,y:4000000};
    motion.step(earth,roles,following,.02,{paused:true});
    assert.equal(roles[1].zone,'earth');assert.ok(distance(roles[0].position,roles[1].position)<100);assert.deepEqual(following,[false,true]);
    roles[0].position={x:7000000,y:3000000};motion.sync(earth,roles,{force:true});
    assert.ok(distance(roles[0].position,roles[1].position)<100);motion.step(earth,roles,following,.02);
    assert.ok(distance(roles[0].position,roles[1].position)<SOCIAL_DEFAULTS.followSpacing);
    roles[0].zone='camp';roles[0].position={x:300,y:300};motion.step(camp,roles,following,.02);
    assert.equal(roles[1].zone,'camp');assert.ok(distance(roles[0].position,roles[1].position)<100);assert.deepEqual(following,[false,true]);
});
test('manual follow keeps the route through shore, water and boat transitions despite a large initial gap',()=>{
    const motion=createLocalFollowMotion(),roles=followRoles(),following=[false,true];
    const world=followWorld({zone:'earth',isEarth:true,earthBoating:true,terrainAt:(x,y)=>x<400?'land':x<600?'water':'ocean'});
    motion.sync(world,roles);roles[1].position={x:0,y:0};
    for(let x=300;x<=850;x+=4){
        roles[0].position={x,y:300};motion.step(world,roles,following,.02);
        assert.deepEqual(following,[false,true]);assert.ok(distance(roles[0].position,roles[1].position)<100);
    }
    const boatingGap=distance(roles[0].position,roles[1].position);
    assert.ok(boatingGap>0&&boatingGap<SOCIAL_DEFAULTS.followSpacing);
    assert.notEqual(roles[1].position.y,roles[0].position.y);
    roles[0].facing=1;
    for(let x=846;x>=200;x-=4){roles[0].position={x,y:300};motion.step(world,roles,following,.02);assert.deepEqual(following,[false,true]);}
    assert.equal(distance(roles[0].position,roles[1].position),SOCIAL_DEFAULTS.followSpacing);
    following[1]=false;const stopped={...roles[1].position};roles[0].position.x-=20;motion.step(world,roles,following,.02);assert.deepEqual(roles[1].position,stopped);
});
test('either local player can follow and spacing comes from balance params',()=>{
    const motion=createLocalFollowMotion(),roles=followRoles(),world=followWorld();motion.sync(world,roles);
    const following=[true,false],params={...SOCIAL_DEFAULTS,followSpacing:60};
    for(let x=350;x<=700;x+=5){roles[1].position={x,y:300};motion.step(world,roles,following,.02,{params});}
    assert.equal(distance(roles[0].position,roles[1].position),60);assert.deepEqual(following,[true,false]);
    const before=structuredClone(roles);motion.step(world,roles,following,.02,{paused:true,params});assert.deepEqual(roles,before);
});

test('companion control stays beside player two and disappears throughout combat',()=>{
    const previous=globalThis.document;
    const anchor={getBoundingClientRect:()=>({left:16,right:140,top:260}),querySelector:()=>({getBoundingClientRect:()=>({right:56})})};
    globalThis.document={body:new Node(),createElement:()=>new Node(),createElementNS:()=>new Node(),querySelector:()=>anchor};
    try{
        let toggles=0;
        const view=createCompanionChatView({toggle:()=>toggles++});
        const model={active:true,ai:true,inBattle:false,memory:{messages:[],events:[]}};
        view.render(model);
        const toggle=view.root.children[0];
        assert.equal(view.root.hidden,false);
        assert.equal(view.root.style.left,'60px');assert.equal(view.root.style.top,'260px');
        assert.equal(toggle.attributes['aria-pressed'],'true');
        assert.ok(toggle.innerHTML.includes('<svg'));
        toggle.onclick();assert.equal(toggles,1);
        view.render({...model,inBattle:true});assert.equal(view.root.hidden,true);
        view.render({...model,ai:false});assert.equal(view.root.hidden,false);
        assert.equal(toggle.attributes['aria-pressed'],'false');
        assert.equal(view.root.children.length,2);
    }finally{globalThis.document=previous;}
});

test('NPC invitations consider both players and shared NPCs use the nearer player',()=>{
    const actor=(id,x)=>({profile:{id},position:{x,y:0}});
    const npc=actor('npc',100);
    let bubbles=localSocialBubbles([npc],[{x:0,y:0},{x:90,y:0}]);
    assert.equal(bubbles.length,1);assert.equal(bubbles[0].owner,1);
    bubbles=localSocialBubbles([npc],[{x:95,y:0},{x:80,y:0}]);assert.equal(bubbles[0].owner,0);
    bubbles=localSocialBubbles([npc],[{x:90,y:0},{x:110,y:0}]);assert.equal(bubbles[0].owner,0);
    bubbles=localSocialBubbles([npc],[{x:-1000,y:0},{x:110,y:0}]);assert.equal(bubbles[0].owner,1);
    bubbles=localSocialBubbles([actor('a',0),actor('b',1000)],[{x:10,y:0},{x:990,y:0}]);
    assert.deepEqual(bubbles.map(b=>[b.profile.id,b.owner]),[['a',0],['b',1]]);
    const gesture={ids:['local-hero-1','npc'],action:'jump',at:1000,until:4600};
    assert.deepEqual(localSocialBubbles([npc],[{x:90,y:0},{x:110,y:0}],{gesture,at:1200}),[]);
    assert.equal(localSocialBubbles([npc],[{x:90,y:0},{x:110,y:0}],{gesture,at:4600}).length,1);
    npc.inParty=true;assert.deepEqual(localSocialBubbles([npc],[{x:100,y:0},{x:100,y:0}]),[]);
});

test('peer interaction moves into the player two toolbar and hides when proximity is lost',()=>{
    const previous=globalThis.document;
    globalThis.document={createElement:()=>new Node()};
    try{
        let opens=0;
        const control=createLocalPeerControl(()=>opens++),first=new Node(),replacement=new Node();
        control.render(first,true);
        assert.equal(control.node.hidden,false);assert.equal(first.children[0],control.node);
        control.node.onclick({stopPropagation(){}});assert.equal(opens,1);
        control.render(first,false);assert.equal(control.node.hidden,true);
        control.render(replacement,true);assert.equal(replacement.children[0],control.node);
        control.render(null,true);assert.equal(control.node.hidden,true);
    }finally{globalThis.document=previous;}
});

test('offline companion answers commands, pauses only for drafts, and stops repeated proactive speech',async()=>{
    const previous={document:globalThis.document,fetch:globalThis.fetch},rows=new Map(),nodes=[];
    class Element extends Node {
        constructor(tag){super();this.tagName=tag.toUpperCase();this.value='';}
        contains(node){return this===node||this.children.some(child=>child.contains?.(node));}
        querySelectorAll(selector){return this.children.flatMap(child=>[...(selector===child.tagName?.toLowerCase()||selector.startsWith('.')&&child.className?.split(' ').includes(selector.slice(1))?[child]:[]),...(child.querySelectorAll?.(selector)||[])]);}
        querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
        focus(){document.activeElement=this;}
    }
    globalThis.document={body:new Element('body'),createElement:tag=>{const node=new Element(tag);nodes.push(node);return node;},createElementNS:(_ns,tag)=>new Element(tag),querySelector:()=>null,activeElement:null};
    globalThis.fetch=async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(new URL('../data/adventure/companion-ai.json',import.meta.url)))});
    let command=null,goal='idle',requests=0;
    const store={read:async key=>rows.get(key),update:async(key,fn)=>{const row=fn(rows.get(key));rows.set(key,row);return row;}};
    const voice={cancel:async()=>{},speak:async()=>{},judge:async()=>{requests++;throw Error('offline');}};
    const api={owner:()=>null,settings:()=>({native:'zh-CN'}),content:()=>({}),isAI:()=>true,switching:()=>false,name:()=> '伙伴',paused:()=>false,scene:()=> 'camp',speechDelay:()=>1,command:value=>command=value,snapshot:()=>({language:'zh-CN',native:'zh-CN',scene:'营地',stage:'world',goal,candidates:[]})};
    const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
    const controller=createCompanionAI(api,{store,voice});
    try{
        await controller.start({owner:null,memoryKey:'pair',quotaKey:'quota'});
        controller.openChat();const input=nodes.find(n=>n.tagName==='INPUT'),form=nodes.find(n=>n.tagName==='FORM');
        assert.equal(controller.conversing,false);input.value='跟着我';assert.equal(controller.conversing,true);
        form.onsubmit({preventDefault(){}});await flush();
        assert.equal(command,'follow');assert.equal(controller.conversing,false);assert.equal(requests,0);
        assert.match(rows.get('pair').messages.at(-1).text,/跟着/);
        controller.tick(performance.now()+1000);await flush();const count=rows.get('pair').messages.length;
        controller.tick(performance.now()+100000);await flush();assert.equal(rows.get('pair').messages.length,count);
        goal='gather';controller.tick(performance.now()+200000);await flush();assert.match(rows.get('pair').messages.at(-1).text,/采集/);
        goal='pickup';controller.tick(performance.now()+300000);await flush();assert.equal(rows.get('pair').messages.length,count+1);
        assert.equal(rows.has('quota'),false);
    }finally{controller.stop();globalThis.document=previous.document;globalThis.fetch=previous.fetch;}
});
