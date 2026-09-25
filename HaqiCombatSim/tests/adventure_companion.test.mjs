import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanion, stepCompanion, selectCompanionId } from '../js/adventure_companion_core.js';
import { walkable, distance } from '../js/adventure_world_core.js';

const world={w:1800,h:1600,buildings:[],trees:[]};
const content={pets:{dragon_green:{},dragon_purple:{},cat:{},dog:{}}};
test('companion prefers the shared slot, then nearest slot with stable ties',()=>{
    const save={heroSlot:2,formation:['dragon_green','cat','dog',null],pets:{dragon_green:{},cat:{},dog:{}}};
    const before=structuredClone(save);
    assert.equal(selectCompanionId(save,content),'dog');
    assert.deepEqual(save,before);
    save.formation[2]=null;
    assert.equal(selectCompanionId(save,content),'cat');
    save.formation[3]='dog';
    assert.equal(selectCompanionId(save,content),'cat');
    save.heroSlot=3;
    assert.equal(selectCompanionId(save,content),'dog');
});
test('empty formations use an owned dragon, then another owned pet, then a visual default',()=>{
    const save={heroSlot:0,formation:[null,null,null,null],pets:{cat:{},dragon_purple:{}}};
    assert.equal(selectCompanionId(save,content),'dragon_purple');
    delete save.pets.dragon_purple;
    assert.equal(selectCompanionId(save,content),'cat');
    save.formation[0]='missing';
    assert.equal(selectCompanionId(save,content),'cat');
    save.pets={};
    const before=structuredClone(save);
    assert.equal(selectCompanionId(save,content),'dragon_green');
    assert.deepEqual(save,before);
    assert.equal(selectCompanionId({},content),'dragon_green');
});
test('a stranded companion returns when the hero gradually leaves it behind',()=>{
    const hero={x:1100,y:800},pet=createCompanion(world,{x:700,y:800},123);
    // No single-frame teleport: the last hero position is still nearby.
    pet.lastHero={x:1097,y:800};
    const before={...hero};
    stepCompanion(pet,world,hero,1/60,{deferSearch:true});
    assert.ok(distance(pet.position,hero)<60);
    assert.ok(walkable(world,pet.position.x,pet.position.y));
    assert.deepEqual(hero,before);
});
test('companion wanders independently and reproducibly without changing the hero',()=>{
    const hero={x:900,y:800},a=createCompanion(world,hero,123),b=createCompanion(world,hero,123);
    const start={...a.position};let moved=false,left=false,right=false,paused=false;
    for(let i=0;i<900;i++){
        stepCompanion(a,world,hero,1/60);stepCompanion(b,world,hero,1/60);
        assert.deepEqual(a.position,b.position);
        assert.ok(distance(a.position,hero)<100);
        moved ||= distance(a.position,start)>20;
        left ||= a.moving&&a.facing===-1;right ||= a.moving&&a.facing===1;paused ||= !a.moving;
    }
    assert.ok(moved&&left&&right&&paused);assert.deepEqual(hero,{x:900,y:800});
});
test('companion catches a moving hero and stops nearby',()=>{
    const hero={x:700,y:800},pet=createCompanion(world,hero,123);
    for(let i=0;i<180;i++){hero.x+=210/60;stepCompanion(pet,world,hero,1/60);}
    assert.ok(distance(pet.position,hero)<150);
    for(let i=0;i<90;i++)stepCompanion(pet,world,hero,1/60);
    assert.ok(distance(pet.position,hero)<80);assert.equal(pet.following,false);
});
test('companion routes around obstacles and resets after a teleport',()=>{
    const blocked={...world,buildings:[{x:900,y:800,w:180,h:180}]};
    const hero={x:780,y:800},pet=createCompanion(blocked,hero,123);
    hero.x=1040;
    for(let i=0;i<600;i++){
        stepCompanion(pet,blocked,hero,1/60);
        assert.ok(walkable(blocked,pet.position.x,pet.position.y));
    }
    assert.ok(distance(pet.position,hero)<100);
    hero.x=600;hero.y=1100;stepCompanion(pet,blocked,hero,1/60);
    assert.ok(distance(pet.position,hero)<60);
});
