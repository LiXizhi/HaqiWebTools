import test from 'node:test';
import assert from 'node:assert/strict';
import {warmSceneActors} from '../js/adventure_actor_assets.js';

function fixture(ensureImage){
    return {world:{npcs:[{portrait:'npc:a'},{portrait:{id:'npc:a',crop:[0,0,20,20]}}],encounters:[{monsterIds:['boss','pet','boss']}]},
        save:{pets:{dragon_green:{}},appearance:'girl'},socialActors:[{profile:{id:'friend',school:'ice'}}],
        content:{pets:{dragon_green:{art:{},school:'fire'},ice_pet:{art:{},school:'ice'}},monsters:{boss:{id:'boss',model:'boss'},pet:{speciesId:'ice_pet'}}},
        monsterArt:{models:{boss:{kind:'portrait',id:'boss-art'}}},
        hero:{appearance:p=>p,ensure:async()=>({fallback:false})},ensureImage};
}
test('scene readiness waits for NPCs, monster portraits, pet sheets and hero appearances',async()=>{
    const requested=[],releases=[];
    const options=fixture(id=>{requested.push(id);return new Promise(resolve=>releases.push(resolve));});
    options.hero.ensure=()=>new Promise(resolve=>releases.push(resolve));
    let ready=false;const warming=warmSceneActors(options).then(()=>{ready=true;});
    await Promise.resolve();
    assert.equal(ready,false);
    assert.deepEqual(requested.sort(),['monster:boss-art','npc:a','pet:dragon_green','pet:ice_pet']);
    assert.equal(releases.length,6);
    for(const resolve of releases.slice(1))resolve({fallback:false});
    await Promise.resolve();assert.equal(ready,false);
    releases[0]();await warming;assert.equal(ready,true);
});
test('missing image or failed hero art rejects readiness instead of exposing placeholders',async()=>{
    await assert.rejects(warmSceneActors(fixture(async()=>{throw Error('missing portrait');})),/missing portrait/);
    const options=fixture(async()=>{});options.hero.ensure=async()=>({fallback:true});
    await assert.rejects(warmSceneActors(options),/角色外观加载失败/);
});
test('scene preload bounds image concurrency to eight',async()=>{
    let active=0,peak=0;const options=fixture(async()=>{peak=Math.max(peak,++active);await new Promise(resolve=>setImmediate(resolve));active--;});
    options.world.npcs=Array.from({length:25},(_,i)=>({portrait:'npc:'+i}));
    await warmSceneActors(options);assert.equal(peak,8);assert.equal(active,0);
});
