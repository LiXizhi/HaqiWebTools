import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultParams} from '../js/combat_params_core.js';
import {destinationInteraction,takeAutoInteraction} from '../js/adventure_world_core.js';
import {stepMonsterWander,monsterScenePositions,inMonsterTerritory,releaseFieldPursuit} from '../js/adventure_monster_motion_core.js';

const view={x:0,y:0,w:800,h:600};
function setup(){
    const encounter={id:'quest-monster',monsterId:'ice',x:300,y:300};
    const world={zone:'ice',encounters:[encounter],interactionParams:defaultParams('kids').adventure,monsterSceneParams:defaultParams('kids').monsterScene};
    return {world,encounter,target:{...encounter,kind:'encounter'}};
}
function arrival(world,hero,target){
    return takeAutoInteraction(world,hero)||destinationInteraction(world,hero,target,82);
}
test('quest tracking a nearby monster waits through its normal warning before combat',()=>{
    const {world,encounter,target}=setup(),hero={x:300,y:300};
    assert.equal(destinationInteraction(world,hero,target,85),null,'starting tracking beside a monster must not enter combat');
    for(let i=0;i<29;i++){
        assert.equal(arrival(world,hero,target),null);
        stepMonsterWander(world,encounter,.05,view,{hero,ambient:false});
        assert.equal(arrival(world,hero,target),null);
    }
    assert.equal(monsterScenePositions(world,encounter)[0].mode,'warning');
    stepMonsterWander(world,encounter,.05,view,{hero,ambient:false});
    assert.equal(arrival(world,hero,target)?.id,encounter.id);
    assert.equal(arrival(world,hero,target),null,'completed contact enters only once');
});
test('pausing beside a warned monster holds combat until the player leaves and returns',()=>{
    const {world,encounter}=setup(),hero={x:300,y:300},viewStep=(at,options)=>stepMonsterWander(world,encounter,.05,view,{hero:at,ambient:false,...options});
    for(let i=0;i<10;i++)viewStep(hero);
    assert.equal(monsterScenePositions(world,encounter)[0].mode,'warning');
    releaseFieldPursuit(world,hero);
    const pose=monsterScenePositions(world,encounter)[0];
    assert.equal(pose.mode,'idle');assert.equal(pose.holdUntilExit,true);
    for(let i=0;i<40;i++){viewStep(hero);assert.equal(takeAutoInteraction(world,hero),null);}
    assert.notEqual(pose.mode,'chase');
    const outside={x:900,y:300};
    assert.equal(inMonsterTerritory(world,encounter,outside),false);
    viewStep(outside);
    assert.equal(pose.holdUntilExit,false);
    for(let i=0;i<10;i++)viewStep(hero);
    assert.equal(pose.mode,'warning');
    assert.equal(takeAutoInteraction(world,hero),null);
});
test('tracking from outside the territory does not use arrival distance to skip warning',()=>{
    const {world,encounter,target}=setup();
    for(const x of [400,380,360,340,320,300]){
        const hero={x,y:300};
        assert.equal(destinationInteraction(world,hero,target,85),null);
        stepMonsterWander(world,encounter,.05,view,{hero,ambient:false});
        assert.equal(arrival(world,hero,target),null);
    }
    assert.equal(monsterScenePositions(world,encounter)[0].mode,'warning');
});
test('NPC tracking and dungeon arrivals retain their existing automatic interaction',()=>{
    const {world,target}=setup(),hero={x:300,y:300},npc={...target,kind:'npc'};
    assert.equal(destinationInteraction(world,hero,npc,85),npc);
    assert.equal(destinationInteraction(world,{x:400,y:300},npc,85),null);
    assert.equal(destinationInteraction({...world,isDungeon:true},hero,target,82),target);
    assert.equal(destinationInteraction(world,hero,null,82),null);
});
