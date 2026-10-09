import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderer} from '../js/adventure_renderer.js';

test('player two scene hides its mount independently and displays only its name',()=>{
    const keys=['matchMedia','window','document'],originals=keys.map(key=>Object.getOwnPropertyDescriptor(globalThis,key));
    let draws=[],labels=[];
    const ctx=new Proxy({measureText:()=>({width:20}),createRadialGradient:()=>({addColorStop(){}}),fillText:value=>labels.push(value)},
        {get:(object,key)=>key in object?object[key]:()=>{}});
    Object.assign(globalThis,{matchMedia:()=>({matches:true}),window:{devicePixelRatio:1},document:{createElement:()=>({style:{},getContext:()=>ctx})}});
    try{
        const assets={effects:{cards:{}},content:{quests:[],pets:{}},hero:{drawSave(c,s,x,y,time,moving,scale,pose){draws.push({name:s.name,mountId:s.mountId,facing:s.facing,pose});return {nameY:y};}},tile(){}};
        const world={zone:'camp',w:1800,h:1600,trees:[],paths:[],decorations:[],buildings:[],npcs:[],encounters:[],center:{x:900,y:800},portal:{hidden:true}};
        const leader={seed:530,position:{x:900,y:800},quests:{},name:'甲',pets:{},formation:[],heroSlot:0,mountId:1};
        const peer={...leader,seed:531,name:'乙',position:{x:940,y:800},mountId:2};
        const renderer=createRenderer({clientWidth:1280,clientHeight:720,getContext:()=>ctx},assets);
        for(const [firstHidden,secondHidden]of [[false,false],[false,true],[true,false],[true,true],[false,false]]){
            leader.mountHidden=firstHidden;peer.mountHidden=secondHidden;
            const before=JSON.stringify([leader,peer]);draws=[];labels=[];
            renderer.render(world,leader,1000,{localSecond:peer});
            assert.equal(draws.find(s=>s.name==='甲').mountId,firstHidden?null:1);
            assert.equal(draws.find(s=>s.name==='乙').mountId,secondHidden?null:2);
            assert.ok(labels.includes('乙'));assert.ok(!labels.some(s=>String(s).includes('玩家2')));
            assert.equal(JSON.stringify([leader,peer]),before,'scene projection must not unequip either mount');
        }
        const render=(time,options={})=>{draws=[];const before=JSON.stringify([leader,peer]);renderer.render(world,leader,time,{localSecond:peer,...options});assert.equal(JSON.stringify([leader,peer]),before,'gaze must not mutate saves');return [draws.find(s=>s.name==='甲'),draws.find(s=>s.name==='乙')];};
        let pair=render(1100);
        assert.deepEqual(pair.map(s=>s.facing),[2,1],'nearby idle players face each other');
        assert.ok(pair.every(s=>Number.isFinite(s.pose.head)),'both use the shared animated head pose');
        pair=render(1200,{localFollowing:true});
        assert.deepEqual(pair.map(s=>s.facing),[0,0],'following suppresses mutual gaze for both players');
        pair=render(1300);
        assert.deepEqual(pair.map(s=>s.facing),[2,1],'stopping follow restores gaze');
        peer.position={x:1000,y:800};pair=render(1400,{localSecondMoving:true});
        assert.deepEqual(pair.map(s=>s.facing),[0,0],'moving or distant players retain travel facing');
        peer.position={x:940,y:800};peer.facing=1;pair=render(1500,{localSecondMoving:true});
        assert.equal(pair[0].facing,0,'the leader does not gaze at a walking partner');
        leader.position.x=910;leader.facing=2;pair=render(1600,{moving:true});
        assert.equal(pair[1].facing,1,'the partner does not gaze at the walking leader');
        leader.facing=0;peer.facing=0;pair=render(1700);
        assert.deepEqual(pair.map(s=>s.facing),[2,1],'both resume gaze after stopping');
        render(1800,{localSecond:null});peer.position={x:900,y:750};pair=render(1900);
        assert.deepEqual(pair.map(s=>s.facing),[3,0],'rejoining initializes a fresh partner pose');
    }finally{keys.forEach((key,index)=>originals[index]?Object.defineProperty(globalThis,key,originals[index]):delete globalThis[key]);}
});
