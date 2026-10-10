import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderer} from '../js/adventure_renderer.js';

test('player two following uses the exact solo camera and releases back to the shared camera',()=>{
    const keys=['matchMedia','window','document'],originals=keys.map(key=>Object.getOwnPropertyDescriptor(globalThis,key));
    const ctx=new Proxy({measureText:()=>({width:20}),createRadialGradient:()=>({addColorStop(){}})},
        {get:(object,key)=>key in object?object[key]:()=>{}});
    Object.assign(globalThis,{matchMedia:()=>({matches:true}),window:{devicePixelRatio:1},document:{createElement:()=>({style:{},getContext:()=>ctx})}});
    try{
        const assets={effects:{cards:{}},content:{quests:[],pets:{dragon_green:{art:{cdn:'test'}}}},
            hero:{drawSave:(c,s,x,y)=>({nameY:y})},tile(){},draw:()=>true,drawPet:()=>true};
        const world={zone:'camp',w:8000,h:6000,trees:[],paths:[],decorations:[],buildings:[],npcs:[],encounters:[],center:{x:3000,y:2000},portal:{hidden:true}};
        const save={seed:530,position:{x:3000,y:2000},quests:{},name:'队长',pets:{dragon_green:{level:1}},formation:['dragon_green',null,null,null],heroSlot:0};
        const peer={...save,seed:531,name:'队友',position:{x:3100,y:2100}};
        for(const width of [1280,1920]){
            const renderer=createRenderer({clientWidth:width,clientHeight:720,getContext:()=>ctx},assets);
            const camera=()=>({view:{...renderer.viewRect()},leader:{...renderer.worldToScreen(save.position)},point:{...renderer.worldToScreen({x:3300,y:2250})}});
            renderer.render(world,save,1000);const solo=camera();
            for(const position of [{x:2958,y:2000},{x:2972,y:2010},{x:5000,y:3800}]){
                peer.position=position;
                renderer.render(world,save,1000,{localSecond:peer,localFollowing:true,localSecondFollowing:true});
                assert.deepEqual(camera(),solo,'follower position must affect neither camera center nor zoom');
            }
            renderer.render(world,save,1000,{localSecond:peer,localFollowing:false,localSecondFollowing:false});
            const shared=camera();assert.notDeepEqual(shared,solo);
            // Player one following player two still uses the existing shared view.
            renderer.render(world,save,1000,{localSecond:peer,localFollowing:true,localSecondFollowing:false});assert.deepEqual(camera(),shared);
            renderer.render(world,save,1000,{localSecond:peer,localFollowing:true,localSecondFollowing:true});assert.deepEqual(camera(),solo);
        }
    }finally{
        keys.forEach((key,index)=>originals[index]?Object.defineProperty(globalThis,key,originals[index]):delete globalThis[key]);
    }
});
