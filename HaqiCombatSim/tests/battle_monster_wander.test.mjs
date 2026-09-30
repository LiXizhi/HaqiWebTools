import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultParams} from '../js/combat_params_core.js';
import {monsterScenePositions,stepMonsterWander,monsterInteractionTargets,monsterInViewport,inMonsterTerritory,monsterTerritoryWarning} from '../js/adventure_monster_motion_core.js';
import {autoInteraction,nearbyWorldObjects} from '../js/adventure_world_core.js';
const view={x:0,y:0,w:800,h:600};
function setup(group=false){
    const encounter={id:'guard',monsterId:'fire',x:300,y:300,...(group?{monsterIds:['fire','ice','life']}: {})};
    const world={zone:'camp',encounters:[encounter],interactionParams:defaultParams('kids').adventure,monsterSceneParams:defaultParams('kids').monsterScene};
    return {world,encounter};
}
function step(world,encounter,count=1,options={},rect=view){for(let i=0;i<count;i++)stepMonsterWander(world,encounter,.05,rect,options);}
test('each field member wanders deterministically inside the fixed group territory and rests',()=>{
    const a=setup(true),b=setup(true),original=JSON.stringify(a.encounter);let moves=0,rests=0;
    for(let i=0;i<1600;i++){
        step(a.world,a.encounter);step(b.world,b.encounter);
        const poses=monsterScenePositions(a.world,a.encounter);
        assert.deepEqual(poses.map(({x,y})=>({x,y})),monsterScenePositions(b.world,b.encounter).map(({x,y})=>({x,y})));
        for(const p of poses){assert.ok(Math.hypot(p.x-a.encounter.x,p.y-a.encounter.y)<=84.00001);p.moving?moves++:rests++;}
    }
    assert.ok(moves>100&&rests>100);
    const poses=monsterScenePositions(a.world,a.encounter);
    assert.notEqual(poses[0].x-poses[0].spawn.x,poses[1].x-poses[1].spawn.x);
    assert.equal(JSON.stringify(a.encounter),original,'authored positions and save input remain immutable');
});
test('offscreen, hidden and disabled monsters do no motion or collision work and resume without catch-up',()=>{
    const {world,encounter}=setup();let checks=0;
    const options={canWalk:()=>{checks++;return true;}};
    const offscreen={x:1000,y:1000,w:100,h:100};
    step(world,encounter,200,options,offscreen);
    assert.equal(monsterScenePositions(world,encounter)[0].rng,undefined);
    assert.equal(checks,0);
    step(world,encounter,140,options);
    const pose=monsterScenePositions(world,encounter)[0],snapshot=JSON.stringify(pose),rng=pose.rng.state(),before=checks;
    step(world,encounter,200,options,offscreen);
    encounter.hidden=true;step(world,encounter,200,options);encounter.hidden=false;
    step(world,encounter,200,{...options,enabled:false});
    assert.equal(JSON.stringify(pose),snapshot);assert.equal(pose.rng.state(),rng);assert.equal(checks,before);
    const old={x:pose.x,y:pose.y};stepMonsterWander(world,encounter,500,view,options);
    assert.ok(Math.hypot(pose.x-old.x,pose.y-old.y)<=15*.055+.00001);
});
test('only visible members of a partially visible group advance',()=>{
    const {world,encounter}=setup(true),narrow={x:210,y:210,w:15,h:120};
    step(world,encounter,200,{},narrow);
    const poses=monsterScenePositions(world,encounter);
    assert.ok(poses[0].rng);
    assert.equal(poses[1].rng,undefined);assert.equal(poses[2].rng,undefined);
    assert.equal(monsterInViewport({x:50,y:105,scale:.8},{x:0,y:0,w:100,h:50}),true,'visible sprite above offscreen feet counts');
});
test('blocked terrain cancels bounded probes without walking through obstacles',()=>{
    const {world,encounter}=setup();let checks=0;
    step(world,encounter,1000,{canWalk:()=>{checks++;return false;}});
    const pose=monsterScenePositions(world,encounter)[0];
    assert.deepEqual({x:pose.x,y:pose.y},{x:300,y:300});assert.equal(pose.moving,false);
    assert.ok(checks>0&&checks<100,'failed probes wait before retrying');
});
test('click and touch targets follow members while the static world index retains spawn coordinates',()=>{
    const {world,encounter}=setup(true);
    nearbyWorldObjects(world,view);
    step(world,encounter,300);
    step(world,encounter,30,{hero:encounter});
    const poses=monsterScenePositions(world,encounter),targets=monsterInteractionTargets(world,encounter);
    for(let i=0;i<poses.length;i++){
        assert.equal(targets[i].x,poses[i].x);assert.equal(targets[i].y,poses[i].y);
        assert.equal(targets[i].id,encounter.id);assert.equal(autoInteraction(world,poses[i])?.id,encounter.id);
    }
    assert.equal(nearbyWorldObjects(world,view)[0].x,300);
    encounter.hidden=true;assert.equal(autoInteraction(world,poses[0]),null);
    const fresh=setup(true);assert.equal(monsterScenePositions(fresh.world,fresh.encounter)[0].rng,undefined,'new scene resets motion');
});

test('touch follows the moved sprite instead of an invisible spawn point',()=>{
    const {world,encounter}=setup();world.interactionParams.fieldEncounterRadius=1;
    step(world,encounter,200);
    const pose=monsterScenePositions(world,encounter)[0];
    assert.ok(Math.hypot(pose.x-encounter.x,pose.y-encounter.y)>1);
    assert.equal(autoInteraction(world,encounter),null);
    assert.equal(autoInteraction(world,pose)?.id,encounter.id,'direct contact does not wait for pursuit');
    step(world,encounter,30,{hero:{x:pose.x,y:pose.y}});
    assert.equal(autoInteraction(world,pose)?.id,encounter.id);
});

test('dungeon trigger stays at the authored spawn even while its sprite wanders',()=>{
    const {world,encounter}=setup();Object.assign(world,{isDungeon:true,layout:{route:[]},portal:{hidden:true}});
    const edge={x:encounter.x+83,y:encounter.y};
    for(let i=0;i<500;i++){
        step(world,encounter,1,{hero:edge});
        assert.equal(autoInteraction(world,edge)?.id,encounter.id);
        assert.equal(autoInteraction(world,{x:encounter.x+84,y:encounter.y}),null);
        assert.equal(inMonsterTerritory(world,encounter,edge),false);
        const pose=monsterScenePositions(world,encounter)[0];
        assert.notEqual(pose.mode,'chase');
        assert.ok(Math.hypot(pose.x-encounter.x,pose.y-encounter.y)<=22.00001);
    }
});
test('entering a field circle warns and chases; contact, not the circle boundary, starts battle',()=>{
    const {world,encounter}=setup(),hero={x:380,y:300};
    assert.equal(inMonsterTerritory(world,encounter,hero),true);
    assert.equal(inMonsterTerritory(world,encounter,{x:384,y:300}),false);
    assert.equal(autoInteraction(world,hero),null);
    step(world,encounter,1,{hero});
    const pose=monsterScenePositions(world,encounter)[0];
    assert.equal(pose.mode,'warning');assert.equal(pose.facing,1);assert.equal(pose.x,300);
    step(world,encounter,28,{hero});assert.equal(pose.mode,'warning');assert.equal(pose.x,300);
    step(world,encounter,1,{hero});assert.equal(pose.mode,'chase');assert.equal(pose.x,300);
    for(let i=0;i<20&&!autoInteraction(world,hero);i++)step(world,encounter,1,{hero});
    assert.equal(autoInteraction(world,hero)?.id,encounter.id);
});
test('escaping the fixed circle drops contact immediately and returns monsters to their own spawn',()=>{
    const {world,encounter}=setup(),hero={x:383,y:300};
    step(world,encounter,41,{hero});
    const pose=monsterScenePositions(world,encounter)[0],outside={x:384,y:300};
    assert.ok(Math.hypot(pose.x-outside.x,pose.y-outside.y)<24,'exit while still within touch range');
    assert.equal(autoInteraction(world,outside),null);
    const before=pose.x;step(world,encounter,1,{hero:outside});
    assert.equal(pose.mode,'return');assert.ok(pose.x<before);assert.equal(pose.facing,-1);
    step(world,encounter,30,{hero:outside,ambient:false});
    assert.equal(pose.mode,'idle');assert.deepEqual({x:pose.x,y:pose.y},pose.spawn);
    step(world,encounter,1,{hero});assert.equal(pose.mode,'warning','re-entry grants a fresh warning');
});
test('pursuit respects obstacles and stays inside the circle, including local detours',()=>{
    const {world,encounter}=setup(),hero={x:370,y:300};
    // A narrow wall stops direct movement but leaves a route around its ends.
    const canWalk=(x,y)=>!(x>320&&x<334&&y>279&&y<321);
    for(let i=0;i<180&&!autoInteraction(world,hero);i++){
        step(world,encounter,1,{hero,canWalk});
        const pose=monsterScenePositions(world,encounter)[0];
        assert.equal(canWalk(pose.x,pose.y),true);
        assert.ok(Math.hypot(pose.x-300,pose.y-300)<=84.00001);
    }
    assert.equal(autoInteraction(world,hero)?.id,encounter.id);
    step(world,encounter,160,{hero:{x:400,y:300},canWalk,ambient:false});
    const pose=monsterScenePositions(world,encounter)[0];
    assert.equal(pose.mode,'idle');assert.deepEqual({x:pose.x,y:pose.y},pose.spawn);
});
test('reduced motion disables ambient wandering but preserves essential chase and escape',()=>{
    const {world,encounter}=setup();step(world,encounter,200,{ambient:false});
    const pose=monsterScenePositions(world,encounter)[0];assert.equal(pose.x,300);
    step(world,encounter,32,{ambient:false,hero:{x:230,y:300}});
    assert.equal(pose.mode,'chase');assert.equal(pose.facing,-1);assert.ok(pose.x<300);
    const frozen=JSON.stringify(pose);step(world,encounter,200,{hero:{x:230,y:300}}, {x:1000,y:1000,w:200,h:200});
    assert.equal(JSON.stringify(pose),frozen,'offscreen pursuit does no work either');
    encounter.hidden=true;assert.equal(inMonsterTerritory(world,encounter,{x:230,y:300}),false);
});

test('outer perception reveals the activity circle in green without starting a warning',()=>{
    const {world,encounter}=setup(),hero={x:450,y:300};
    assert.equal(monsterTerritoryWarning(world,encounter,{x:468,y:300}),null);
    assert.equal(monsterTerritoryWarning(world,encounter,hero),'nearby');
    assert.equal(monsterTerritoryWarning(world,encounter,{x:384,y:300}),'nearby');
    assert.equal(monsterTerritoryWarning(world,encounter,{x:383,y:300}),'danger');
    step(world,encounter,40,{hero,ambient:false});
    assert.equal(monsterScenePositions(world,encounter)[0].mode,'idle');
    assert.equal(autoInteraction(world,hero),null);
    encounter.hidden=true;assert.equal(monsterTerritoryWarning(world,encounter,hero),null);
    encounter.hidden=false;encounter.blocked=['unsupported'];assert.equal(monsterTerritoryWarning(world,encounter,hero),null);
    encounter.blocked=[];world.isDungeon=true;assert.equal(monsterTerritoryWarning(world,encounter,hero),null);
});
test('warning delays pursuit and pauses offscreen while direct touch starts immediately',()=>{
    const {world,encounter}=setup(),hero={x:300,y:300};let checks=0;
    const options={hero,canWalk:()=>{checks++;return true;}};
    assert.equal(autoInteraction(world,hero)?.id,encounter.id,'direct touch before motion starts battle');
    step(world,encounter,10,options);
    const pose=monsterScenePositions(world,encounter)[0],remaining=pose.alertRemaining;
    assert.equal(pose.mode,'warning');assert.equal(pose.moving,false);assert.equal(autoInteraction(world,hero)?.id,encounter.id);
    assert.equal(checks,0,'warning has no movement or path checks');
    step(world,encounter,100,options,{x:1000,y:1000,w:200,h:200});
    step(world,encounter,100,{...options,enabled:false});
    assert.equal(pose.alertRemaining,remaining);
    step(world,encounter,19,options);assert.equal(pose.mode,'warning');assert.equal(pose.x,300);
    step(world,encounter,1,options);assert.equal(autoInteraction(world,hero)?.id,encounter.id);
});
test('escaping during the warning cancels it and re-entry restarts the full countdown',()=>{
    const {world,encounter}=setup(),hero={x:330,y:300};
    step(world,encounter,20,{hero});const pose=monsterScenePositions(world,encounter)[0];
    assert.equal(pose.mode,'warning');assert.equal(pose.x,300);
    step(world,encounter,1,{hero:{x:400,y:300}});
    assert.notEqual(pose.mode,'warning');assert.equal(pose.alertRemaining,0);
    assert.equal(monsterTerritoryWarning(world,encounter,{x:400,y:300}),'nearby');
    step(world,encounter,1,{hero});assert.equal(pose.mode,'warning');assert.ok(pose.alertRemaining>1.4);
    step(world,encounter,28,{hero});assert.equal(pose.mode,'warning');assert.equal(pose.x,300);
});
