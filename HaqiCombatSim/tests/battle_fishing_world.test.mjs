import test from 'node:test';
import assert from 'node:assert/strict';
import {isOcean,castFishing} from '../js/adventure_fishing_core.js';
import {fishingSpot} from '../js/adventure_fishing_spot_core.js';

const island={w:1500,h:1200,paths:[],layout:{coast:[[0,0],[1000,0],[1000,1000],[0,1000]],bridges:[],rivers:[]}};
const hero={x:950,y:500},water={x:1100,y:500};

test('only Haqi water clicks offer a fishing spot',()=>{
    assert.ok(fishingSpot(island,hero,water));
    assert.equal(fishingSpot(island,hero,{x:900,y:500}),null);
    for(const terrain of ['ocean','water','urban',null]){
        const earth={...island,isEarth:true,zone:'earth',terrainAt:()=>terrain};
        assert.equal(isOcean(earth,water.x,water.y),false);
        assert.equal(fishingSpot(earth,hero,water),null);
    }
    assert.equal(isOcean({...island,zone:'earth'},water.x,water.y),false);
});

test('Earth fishing settlement rejects before consuming supplies or rolling rewards',()=>{
    const save={zone:'earth',inventory:{17113:5},stamina:100,revision:3};
    const before=structuredClone(save);
    assert.throws(()=>castFishing(save,{}, {netId:17113,hit:true}, {int(){assert.fail('must not roll rewards');}}),/现实世界不能钓鱼/);
    assert.deepEqual(save,before);
});
