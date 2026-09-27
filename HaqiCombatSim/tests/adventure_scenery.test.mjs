import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneryAtlases} from '../js/adventure_scenery_core.js';

test('camp warms town pier and meadow terrain, never ice buildings or snow trees',()=>{
    const camp={zone:'camp',trees:[{snow:false}],layout:{coast:[[0,0],[1,0]],regions:[{biome:'town',weather:{kind:'motes'}},{biome:'forest',weather:{kind:'motes'}}],rules:{biomes:{town:{weather:{kind:'motes'}},forest:{weather:{kind:'motes'}}}}}};
    assert.deepEqual(sceneryAtlases(camp),{building:['town'],environment:[],terrain:['meadow','stones','shore']});
});

test('ice island requests ice buildings and snow trees only when present',()=>{
    const ice={zone:'ice',trees:[{snow:true}],layout:{coast:[[0,0]],regions:[{biome:'ice',weather:{kind:'snow'}},{biome:'snow',weather:{kind:'snow'}}],rules:{biomes:{ice:{weather:{kind:'snow'}},snow:{weather:{kind:'snow'}}}}}};
    assert.deepEqual(sceneryAtlases(ice),{building:['ice'],environment:['trees'],terrain:['stones','shore']});
});

test('fire island loads weather atlas for embers',()=>{
    const fire={zone:'fire',trees:[],layout:{coast:[],regions:[{biome:'volcanic',weather:{kind:'embers'}}],rules:{biomes:{volcanic:{weather:{kind:'embers'}}}}}};
    assert.deepEqual(sceneryAtlases(fire),{building:['fire'],environment:['weather'],terrain:['stones']});
});
