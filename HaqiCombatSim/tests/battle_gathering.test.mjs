import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canPetAssistGathering} from '../js/adventure_gathering_core.js';
import {groundDecorations} from '../js/adventure_ground_decorations_core.js';
import {smeltGroundDrop,applyGroundPickup,gatheringPetPower,gatheringNodes,gatheringRemaining,collectGathering,advanceGathering,gatheringParams} from '../js/adventure_gathering_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url)));
const config=read('adventure/gathering.json'),params=gatheringParams({});
test('pets only help the owner at the same actively gathered node; never idle or after movement',()=>{
    const progress={id:'stone',x:10,y:10,elapsed:2},node={id:'stone'},position={x:10,y:10};
    assert.equal(canPetAssistGathering(progress,node,position,params),true);
    assert.equal(canPetAssistGathering(null,node,position,params),false);
    assert.equal(canPetAssistGathering(progress,{id:'ground-drop'},position,params),false);
    assert.equal(canPetAssistGathering(progress,node,{x:12,y:10},params),false);
    assert.equal(canPetAssistGathering(progress,node,position,params,false),false);
    assert.equal(canPetAssistGathering({...progress,elapsed:.5},node,position,params),false);
});
test('smelting spends exactly 60, preserves remainder, persists unclaimed drops and uses seeded currencies',()=>{
    const base={day:'2026-10-06',bags:{a:{stone:5}},depleted:{}};
    assert.equal(smeltGroundDrop(base,'a','ice',{x:100,y:100},params),null);
    base.bags.a.stone=13;
    const one=smeltGroundDrop(base,'a','ice',{x:100,y:100},params);
    assert.equal(one.state.credits.a,70);assert.deepEqual(one.state.bags.a,{});
    assert.deepEqual(one,smeltGroundDrop(base,'a','ice',{x:100,y:100},params));
    const two=smeltGroundDrop(JSON.parse(JSON.stringify(one.state)),'a','ice',{x:100,y:100},params);
    assert.equal(two.state.credits.a,10);assert.equal(two.state.drops.length,2);assert.notEqual(one.drop.id,two.drop.id);
    assert.equal(smeltGroundDrop(two.state,'a','ice',{x:100,y:100},params),null);
    for(const [chance,currency] of [[0,100],[1,17213]])assert.equal(smeltGroundDrop(base,'a','ice',{x:0,y:0},{...params,gatherFairyChance:chance}).drop.currency,currency);
});
test('pickup rewards only the recipient and replaying the durable receipt cannot pay twice',()=>{
    const save={inventory:{100:7,17213:2},rewardedEncounters:[],revision:1};
    for(const currency of [100,17213]){
        const drop={id:'ground:test:'+currency,currency,amount:5};
        const paid=applyGroundPickup(save,drop);
        assert.equal(paid.inventory[currency],save.inventory[currency]+5);
        assert.deepEqual(applyGroundPickup(paid,drop),paid);
        assert.equal(save.revision,1);
    }
});
test('healthy carried pets help occasionally and gathering traits increase work speed',()=>{
    assert.equal(gatheringPetPower(null,{}),0);
    assert.equal(gatheringPetPower({hp:0,hunger:100},{}),0);
    assert.equal(gatheringPetPower({hp:100,hunger:0},{}),0);
    assert.equal(gatheringPetPower({hp:100,hunger:100},{}),1);
    assert.ok(gatheringPetPower({hp:100,hunger:100,passiveTraits:{gathering:9}}, {})>gatheringPetPower({hp:100,hunger:100,passiveTraits:{gathering:1}},{}));
});
test('all six islands gather from exact baked decoration positions with stable identities',()=>{
    for(const zone of ['camp','town','ice','fire','desert','dark']){
        const layout=read(`adventure/maps/${zone}.json`),world={zone,layout,paths:layout.paths,trees:layout.trees,buildings:layout.buildings,center:layout.center||layout.spawn};
        const art=groundDecorations(world,{x:0,y:0,w:layout.w,h:layout.h});
        const sample=art.find(d=>config.items.some(i=>i.frames.includes(d.frame)));
        assert.ok(sample,zone);
        const nodes=gatheringNodes(world,sample,config,params),node=nodes.find(n=>n.id===sample.id);
        assert.ok(node);assert.equal(node.x,sample.x);assert.equal(node.y,sample.y);assert.equal(node.frame,sample.frame);
        assert.deepEqual(nodes,gatheringNodes(world,sample,config,params));
    }
});
test('one unit per cycle, shared partial stock persists and depletes for both players',()=>{
    const node={id:'ice:ground:1:2',itemId:'ore',units:3};
    let state={day:'2026-10-06',depleted:{},bags:{}};
    for(const owner of ['a','b','a'])state=collectGathering(JSON.parse(JSON.stringify(state)),node,owner,'2026-10-06');
    assert.equal(state.bags.a.ore,2);assert.equal(state.bags.b.ore,1);
    assert.equal(gatheringRemaining(state,node,'2026-10-06'),0);
    assert.throws(()=>collectGathering(state,node,'b','2026-10-06'));
    assert.equal(gatheringRemaining(state,node,'2026-10-05'),0);
    assert.equal(gatheringRemaining(state,node,'2026-10-07'),3);
    assert.equal(gatheringRemaining({...state,depleted:{[node.id]:true}},node,'2026-10-06'),0);
});
test('stationary dwell precedes progress; movement, pauses, node change and long frames reset',()=>{
    const args={position:{x:0,y:0},node:{id:'one'},dt:.1,enabled:true,params};
    let state=advanceGathering(null,args);
    for(let i=0;i<9;i++)state=advanceGathering(state,args);
    assert.equal(state.progress,0);
    for(let i=0;i<17;i++)state=advanceGathering(state,args);
    assert.equal(state.ready,true);
    for(const change of [{enabled:false},{dt:10},{node:{id:'two'}},{position:{x:1,y:0}}])assert.equal(advanceGathering(state,{...args,...change}).elapsed,0);
    state=advanceGathering(null,args);
    state=advanceGathering(state,{...args,position:{x:.3,y:0}});
    assert.equal(advanceGathering(state,{...args,position:{x:.6,y:0}}).elapsed,0);
});
