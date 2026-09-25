import test from 'node:test';
import assert from 'node:assert/strict';
import {fishingCatchLayout,drawFishingScene} from '../js/view_adventure_fishing_art.js';
const scene=(grams,compact=false)=>({phase:'show',elapsed:500,time:500,hero:{x:compact?422:195,y:compact?170:382},target:{x:60,y:382},scale:1.4,width:compact?844:390,height:compact?390:844,compact,reduced:false,result:{caught:true,items:[{id:17108,count:1}],catches:[{itemId:17108,grams}]}});
test('large fish actually draw a larger icon and stay inside portrait and landscape viewports',()=>{
    for(const compact of [false,true]){
        const small=fishingCatchLayout(scene(200,compact)),large=fishingCatchLayout(scene(18000,compact));
        assert.ok(large.size>small.size*1.5);assert.equal(large.tier,'huge');
        const s=scene(18000,compact);assert.ok(large.y-large.size/2>0);assert.ok(large.x-large.size/2>0);assert.ok(large.x+large.size/2<s.width);
        const draws=[],context=new Proxy({}, {get:(t,k)=>t[k]||(()=>{}),set:(t,k,v)=>(t[k]=v,true)});
        const assets={content:{items:{17108:{art:'fish'}}},draw:(...args)=>{draws.push(args);return true;}};
        drawFishingScene(context,s,assets);assert.equal(draws[0][4],large.size);
        s.reduced=true;drawFishingScene(context,s,assets);assert.equal(draws[1][4],large.size);
    }
});
