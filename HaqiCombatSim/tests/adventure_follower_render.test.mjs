import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRenderer } from '../js/adventure_renderer.js';

test('follower stays visible while its sheet is unavailable, independently of riding', () => {
    const keys=['matchMedia','window','document'];
    const originals=keys.map(key=>Object.getOwnPropertyDescriptor(globalThis,key));
    const ctx=new Proxy({measureText:()=>({width:20}),createRadialGradient:()=>({addColorStop(){}})},
        {get:(object,key)=>key in object?object[key]:()=>{}});
    Object.assign(globalThis,{matchMedia:()=>({matches:true}),window:{devicePixelRatio:1},document:{createElement:()=>({getContext:()=>ctx})}});
    try {
        const catalog=JSON.parse(fs.readFileSync(new URL('../data/adventure/mount-catalog.json',import.meta.url)));
        const mount=catalog.mounts.find(row=>row.rideable);
        let ready=false,petDraws=0,fallbacks=0,mountDraws=0;
        const assets={effects:{cards:{}},content:{quests:[],pets:{dragon_green:{art:{cdn:'test'}}},mountCatalog:catalog,mountByItem:{1:{mountId:mount.id}}},
            tile(c,sheet,index){if(sheet==='creatures'&&index===6)fallbacks++;},
            draw(c,ref){if(ref.id===`mount:${mount.id}`)mountDraws++;return true;},
            drawPet(c,id){assert.equal(id,'dragon_green');petDraws++;return ready;}};
        const world={zone:'camp',w:1800,h:1600,trees:[],paths:[],decorations:[],buildings:[],npcs:[],encounters:[],center:{x:900,y:800},portal:{hidden:true}};
        for(const width of [1280,390]){
            const renderer=createRenderer({clientWidth:width,clientHeight:720,getContext:()=>ctx},assets);
            const save={seed:530,position:{x:900,y:800},quests:{},name:'测试',pets:{dragon_green:{level:1}},formation:['dragon_green',null,null,null],heroSlot:0};
            for(const mounted of [false,true,false]){
                save.mountId=mounted?1:null;
                const snapshot=JSON.stringify(save);
                for(const loaded of [false,true,false]){
                    ready=loaded;petDraws=0;fallbacks=0;mountDraws=0;
                    renderer.render(world,save,1000);
                    assert.equal(petDraws,1);
                    assert.equal(fallbacks,loaded?0:1);
                    assert.equal(mountDraws>0,mounted);
                    assert.equal(JSON.stringify(save),snapshot);
                }
            }
        }
    } finally {
        keys.forEach((key,index)=>originals[index]?Object.defineProperty(globalThis,key,originals[index]):delete globalThis[key]);
    }
});
