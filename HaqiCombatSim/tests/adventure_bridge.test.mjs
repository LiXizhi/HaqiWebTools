import test from 'node:test';
import assert from 'node:assert/strict';
import {generateRoadBridges,onBridge} from '../js/adventure_bridge_core.js';
import {riverBlocks} from '../js/adventure_island_layout_core.js';

const rules={sideMargin:6,landing:4};
const rivers=[{points:[[-500,0],[500,0]],width:80}];
const road=(a,b,width=82)=>({a:{x:a[0],y:a[1]},b:{x:b[0],y:b[1]},width});
const bridgeWorld=paths=>({layout:{rivers,lakes:[],bridges:generateRoadBridges(paths,rivers,rules)}});

test('bridge follows oblique road, stays only 12 units wider, and ends on dry land',()=>{
    const paths=[road([-200,-300],[200,300])],world=bridgeWorld(paths),[b]=world.layout.bridges;
    assert.equal(b.h,94);assert.equal(b.angle,Math.atan2(600,400));
    assert.ok(b.w<400);
    for(let t=0;t<=1;t+=.01){
        assert.equal(riverBlocks(world,-200+t*400,-300+t*600),false);
    }
    assert.equal(riverBlocks(world,120,0),true,'water beside the narrower bridge stays blocked');
});

test('Y junction joins all three branches and removes internal side beams',()=>{
    const paths=[road([0,260],[0,0]),road([0,0],[-240,-240]),road([0,0],[240,-240])];
    const world=bridgeWorld(paths),bridges=world.layout.bridges;
    assert.equal(bridges.length,3);
    for(let x=-30.3;x<30;x+=3)for(let y=-30.7;y<30;y+=3){
        assert.equal(bridges.filter(b=>onBridge(b,x,y)).length,1,'mitred junction has one deck surface, without stacked arms or holes');
    }
    for(const path of paths)for(let step=0;step<=100;step++){
        const t=step/100;
        assert.equal(riverBlocks(world,path.a.x+(path.b.x-path.a.x)*t,path.a.y+(path.b.y-path.a.y)*t),false);
    }
    for(const b of bridges)for(const edge of b.edges){
        const {a,b:q}=edge,len=Math.hypot(q.x-a.x,q.y-a.y);
        const x=(a.x+q.x)/2+(q.y-a.y)/len*.1,y=(a.y+q.y)/2-(q.x-a.x)/len*.1;
        assert.equal(bridges.some(other=>onBridge(other,x,y)),false,'edge faces water/outside, never another deck');
    }
    assert.equal(riverBlocks(world,180,0),true);
});

test('reverse duplicates, river bends and short spurs do not duplicate decks or miss crossings',()=>{
    const paths=[road([0,-300],[0,300]),road([0,300],[0,-300]),road([0,0],[120,0],46)];
    const before=JSON.stringify({paths,rivers,rules});
    const a=generateRoadBridges(paths,rivers,rules),b=generateRoadBridges(paths,rivers,rules);
    assert.equal(a.length,2);assert.equal(a[1].h,58);assert.deepEqual(a,b);
    assert.equal(JSON.stringify({paths,rivers,rules}),before);
    const bent=[{width:60,points:[[-100,-20],[0,30],[100,-20]]}];
    const crossing=generateRoadBridges([road([0,-200],[0,200])],bent,rules);
    assert.equal(crossing.length,1);
    assert.ok(crossing.some(b=>onBridge(b,0,30,7)));
});

test('dry roads do not generate bridges; two separated river crossings remain separate',()=>{
    assert.deepEqual(generateRoadBridges([road([-100,300],[100,300])],rivers,rules),[]);
    const two=[...rivers,{points:[[-500,500],[500,500]],width:80}];
    const b=generateRoadBridges([road([0,-300],[0,800])],two,rules);
    assert.equal(b.length,2);
    assert.equal(b.some(span=>onBridge(span,0,250)),false);
});
