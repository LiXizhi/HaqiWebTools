import test from 'node:test';
import assert from 'node:assert/strict';
import {fishingPullMotion,FISHING_PULL_MS} from '../js/view_adventure_fishing_motion.js';
import {drawFishingScene} from '../js/view_adventure_fishing_art.js';
test('each direction pulls the rod tip toward that direction and returns to rest',()=>{
    const zero={x:0,y:0,strength:0};
    function tip(pull){
        const curves=[];
        const c=new Proxy({quadraticCurveTo:(...args)=>curves.push(args)}, {get:(t,k)=>t[k]||(()=>{}),set:(t,k,v)=>(t[k]=v,true)});
        drawFishingScene(c,{phase:'wait',elapsed:0,time:0,hero:{x:400,y:400},target:{x:260,y:400},scale:1,pose:{pullX:pull.x,pullY:pull.y},reduced:false},{content:{items:{}}});
        return curves[0].slice(2);
    }
    const origin=tip(zero);
    for(const [direction,axis,sign] of [['left',0,-1],['right',0,1],['up',1,-1],['down',1,1]]){
        const peak=fishingPullMotion(direction,FISHING_PULL_MS*.2);
        assert.ok((tip(peak)[axis]-origin[axis])*sign>30);
        assert.ok(fishingPullMotion(direction,FISHING_PULL_MS*.7).strength<peak.strength);
        assert.deepEqual(fishingPullMotion(direction,FISHING_PULL_MS),zero);
        assert.deepEqual(fishingPullMotion(direction,50,true),zero);
    }
});
