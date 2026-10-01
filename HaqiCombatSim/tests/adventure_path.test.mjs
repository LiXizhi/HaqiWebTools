import test from 'node:test';
import assert from 'node:assert/strict';
import {findPath,followPath,clearSegment,distance,walkable} from '../js/adventure_world_core.js';

function bendWorld(){
    const coast=[[0,0],[900,0],[900,900],[0,900]];
    const paths=[{a:{x:200,y:200},b:{x:200,y:700},width:50}];
    for(let i=0;i<12;i++)paths.push({a:{x:200,y:200},b:{x:30+i*10,y:70},width:30});
    return {
        w:900,h:900,
        layout:{coast,lakes:[],bridges:[],rivers:[]},
        buildings:[],trees:[{x:320,y:450},{x:248,y:400}],npcs:[],encounters:[],landmarks:[],
        paths,
    };
}
function length(start,path){
    let total=0,cursor=start;
    for(const point of path){total+=distance(cursor,point);cursor=point;}
    return total;
}

test('a visible later junction is taken directly instead of the nearest vertex',()=>{
    const world=bendWorld();
    const start={x:320,y:220},destination={x:320,y:680};
    assert.equal(walkable(world,start.x,start.y),true);
    assert.equal(walkable(world,destination.x,destination.y),true);
    assert.equal(clearSegment(world,start,destination),false);
    assert.equal(clearSegment(world,start,{x:200,y:700}),true);
    const path=findPath(world,start,destination);
    assert.ok(path.length);
    assert.ok(distance(path[0],{x:200,y:700})<1,JSON.stringify(path));
    const viaNearest=distance(start,{x:200,y:200})+distance({x:200,y:200},{x:200,y:700})+distance({x:200,y:700},destination);
    assert.ok(length(start,path)<viaNearest-80);
    const step=followPath(world,start,path,30).position;
    assert.ok(step.y>start.y);
    assert.ok(step.x<start.x);
});

test('an open straight line does not detour through a road vertex',()=>{
    const world=bendWorld();
    world.trees=[];
    const start={x:320,y:220},destination={x:340,y:260};
    const path=findPath(world,start,destination);
    assert.deepEqual(path,[{x:destination.x,y:destination.y}]);
});
