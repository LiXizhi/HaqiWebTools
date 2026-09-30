import test from 'node:test';
import assert from 'node:assert/strict';
import {drawMonsterTerritory} from '../js/view_monster_territory.js';

// Sample actual emitted gradient stops where ground remains visible beside a sprite.
function sample(distance,time=0,reduced=true) {
    const gradients=[];
    const ctx={save(){},restore(){},translate(){},fillRect(){},
        createRadialGradient(){const stops=[];gradients.push(stops);return {addColorStop(at,color){stops.push({at,alpha:Number(color.match(/,([^,]+)\)$/)[1])});}};},
    };
    drawMonsterTerritory(ctx,{x:0,y:0},{x:distance,y:0},
        {territoryRadius:84,perceptionMultiplier:2},time,reduced);
    return gradients;
}

test('nearby territory stays visible on grass and snow outside the sprite footprint',()=>{
    const stops=sample(126)[0],alpha=stops.find(s=>s.at===.72).alpha;
    for(const ground of [[158,183,126],[168,204,212]]){
        const tint=[143,65,49];
        const change=Math.max(...ground.map((v,i)=>Math.abs(v-(v*(1-alpha)+tint[i]*alpha))));
        assert.ok(change>=15,`ground contrast ${change} must remain discernible`);
    }
    assert.ok(sample(60)[0][0].alpha>sample(126)[0][0].alpha*1.4);
});

test('territory fades at perception edge, has no colour jump at danger boundary and respects reduced motion',()=>{
    assert.deepEqual(sample(168),[]);
    assert.ok(sample(167.99)[0][0].alpha<.00001);
    assert.ok(Math.abs(sample(83.99)[0][0].alpha-sample(84.01)[0][0].alpha)<.00001);
    assert.deepEqual(sample(126,0),sample(126,3));
    assert.notDeepEqual(sample(126,0,false),sample(126,3,false));
    assert.ok(sample(126).every(stops=>stops.at(-1).alpha===0));
});
