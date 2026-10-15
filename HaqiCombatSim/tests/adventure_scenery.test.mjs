import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneryAtlases} from '../js/adventure_scenery_core.js';

test('camp warms camp buildings, town boats, camp trees and refined terrain props, never ice buildings or snow trees',()=>{
    const camp={zone:'camp',trees:[{snow:false}],layout:{coast:[[0,0],[1,0]],regions:[{biome:'town',weather:{kind:'motes'}},{biome:'forest',weather:{kind:'motes'}}],rules:{terrain:{campRefined:true},biomes:{town:{weather:{kind:'motes'}},forest:{weather:{kind:'motes'}}}}}};
    assert.deepEqual(sceneryAtlases(camp),{building:['camp','town'],environment:['campTrees'],terrain:['meadow','stones','shore','campProps','camp']});
});

test('ice island requests ice buildings and snow trees only when present',()=>{
    const ice={zone:'ice',trees:[{snow:true}],layout:{coast:[[0,0]],regions:[{biome:'ice',weather:{kind:'snow'}},{biome:'snow',weather:{kind:'snow'}}],rules:{biomes:{ice:{weather:{kind:'snow'}},snow:{weather:{kind:'snow'}}}}}};
    assert.deepEqual(sceneryAtlases(ice),{building:['ice'],environment:['trees'],terrain:['stones','shore']});
});

test('fire island loads weather atlas for embers',()=>{
    const fire={zone:'fire',trees:[],layout:{coast:[],regions:[{biome:'volcanic',weather:{kind:'embers'}}],rules:{biomes:{volcanic:{weather:{kind:'embers'}}}}}};
    assert.deepEqual(sceneryAtlases(fire),{building:['fire'],environment:['weather'],terrain:['stones']});
});

test('classic islands with full layout warm islandLandmarks, islandTrees and islandPlazasProps',async ()=>{
    const {islandSceneryFloorSteps}=await import('../js/adventure_camp_scenery_core.js');
    for(const zone of ['town','fire','ice','desert','dark']){
        const world={
            zone,w:6000,h:5200,center:{x:3000,y:2600},
            trees:[{snow:zone==='ice'}],
            layout:{w:6000,h:5200,coast:[[500,500],[5500,500],[5500,4700],[500,4700]],regions:[{biome:zone==='ice'?'ice':'grass'}],farms:zone==='town'?[{x:1480,y:2840,cols:6,rows:3}]:[],rules:{plaza:{radiusX:280,radiusY:170}}},
        };
        const atlases=sceneryAtlases(world);
        assert.ok(atlases.terrain.includes('islandPlazasProps'),`${zone} warms islandPlazasProps`);
        assert.ok(atlases.terrain.includes('islandLandmarks'),`${zone} warms islandLandmarks`);
        if(zone!=='ice')assert.ok(atlases.environment.includes('islandTrees'),`${zone} warms islandTrees`);
        const full=[...islandSceneryFloorSteps(world,{x:0,y:0,w:6000,h:5200})];
        assert.ok(full.length>=6,`${zone} emits plaza/landmark floor props`);
    }
});

