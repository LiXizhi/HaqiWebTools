import test from 'node:test';
import assert from 'node:assert/strict';
import {streamSocialActors,socialSpawnDescriptors} from '../js/adventure_social_stream_core.js';
import {SOCIAL_DEFAULTS} from '../js/adventure_social_core.js';
import {petSceneProfiles} from '../js/adventure_pet_scene.js';
import {socialNavigationWorld,createSocialActors,stepSocialActors} from '../js/adventure_social_motion_core.js';
import {earthRules} from '../js/adventure_earth_core.js';
import {walkable,nearestWalkable} from '../js/adventure_world_core.js';

const spawns=Array.from({length:12},(_,i)=>({profile:{id:`resident:${i}`},position:{x:100+i*40,y:200},facing:0,hotspot:{x:100,y:200}}));
const options={leader:{x:200,y:200},view:{x:0,y:0,w:800,h:600}};
const step=(actors,pool=spawns,opts=options)=>streamSocialActors(actors,pool,.1,opts);
const advance=(actors,n,pool=spawns,opts=options)=>{for(let i=0;i<n;i++)actors=step(actors,pool,opts);return actors;};

function entranceWorld(){return {isEarth:true,zone:'earth',w:8640000,h:4320000,revision:1,earthRules:earthRules(),terrainAt:()=> 'grass',
    center:{x:1000,y:1000},layout:{spawn:{x:1000,y:1000}},paths:[{a:{x:300,y:1000},b:{x:1700,y:1000},width:52}],
    buildings:[],npcs:[],encounters:[],landmarks:[{id:'city:test',dungeonId:'test',x:1000,y:1000}]};}

test('Earth entrance clearance applies to actor placement and snapping while players retain access',()=>{
    const world=entranceWorld(),navigation=socialNavigationWorld(world),mark=world.landmarks[0];
    assert.equal(walkable(world,mark.x,mark.y),true);
    assert.equal(walkable(navigation,mark.x,mark.y),false);
    const snapped=nearestWalkable(navigation,mark.x,mark.y);
    assert.ok(Math.hypot(snapped.x-mark.x,snapped.y-mark.y)>=SOCIAL_DEFAULTS.entranceClearance);
    const actors=createSocialActors(world,[{id:'resident'}],12);
    assert.ok(Math.hypot(actors[0].position.x-mark.x,actors[0].position.y-mark.y)>=SOCIAL_DEFAULTS.entranceClearance);
    actors[0].position={x:mark.x,y:mark.y};
    stepSocialActors(actors,world,.1,{leader:mark});
    assert.ok(Math.hypot(actors[0].position.x-mark.x,actors[0].position.y-mark.y)>=SOCIAL_DEFAULTS.entranceClearance,'existing resident moves aside even near the player');
});

test('streaming refreshes actor-only entrance exclusions and respects hidden entrances',()=>{
    const world=entranceWorld();socialNavigationWorld(world);
    world.landmarks=[{id:'city:next',dungeonId:'next',x:1400,y:1000}];world.revision++;
    let navigation=socialNavigationWorld(world);
    assert.equal(walkable(navigation,1000,1000),true);
    assert.equal(walkable(navigation,1400,1000),false);
    world.landmarks[0].x=1600;world.revision++;
    navigation=socialNavigationWorld(world);
    assert.equal(walkable(navigation,1400,1000),true);
    assert.equal(walkable(navigation,1600,1000),false);
    world.landmarks[0].hidden=true;world.revision++;
    assert.equal(walkable(socialNavigationWorld(world),1600,1000),true);
    assert.equal(world.movementExclusions,undefined);
});

test('nearby residents enter transparent, fade in and share opacity with their pets; scene stays bounded',()=>{
    let actors=step([]);assert.equal(actors.length,6);assert.ok(actors.every(a=>a.sceneOpacity===0));
    actors=advance(actors,4);assert.ok(actors.every(a=>a.sceneOpacity>0&&a.sceneOpacity<1));
    const profiles=petSceneProfiles({world:{npcs:[]},socialActors:actors});assert.equal(profiles[0].sceneOpacity,actors[0].sceneOpacity);
    actors=advance(actors,10);assert.ok(actors.every(a=>a.sceneOpacity===1));assert.equal(actors.length,SOCIAL_DEFAULTS.sceneMaxActors);
});

test('offscreen residents survive a brief camera change, then fade out and unload',()=>{
    let actors=advance(step([]),10),first=actors[0];
    const hidden={...options,view:{x:800,y:0,w:800,h:600}};
    actors=advance(actors,5,spawns,hidden);assert.ok(actors.includes(first));assert.equal(first.sceneOpacity,1);
    actors=advance(actors,12,spawns,hidden);assert.ok(first.sceneOpacity>0&&first.sceneOpacity<1);
    actors=advance(actors,10,spawns,hidden);assert.equal(actors.length,0);
    actors=step(actors);assert.equal(actors.length,6);assert.ok(actors.every(a=>a.sceneOpacity===0));
});

test('far away actors unload immediately even when a zoomed out camera contains them',()=>{
    const far={...spawns[0],position:{x:1500,y:200},sceneOpacity:1};
    assert.deepEqual(step([far],[],{...options,view:{x:0,y:0,w:3000,h:2000}}),[]);
    assert.deepEqual(step([], [{...spawns[0],position:far.position}],{...options,view:{x:0,y:0,w:3000,h:2000}}),[]);
});

test('city roster changes fade old residents out before reusing their bounded slots',()=>{
    let actors=advance(step([]),10),first=actors[0];const next=spawns.map(s=>({...s,profile:{id:`next:${s.profile.id}`}}));
    actors=step(actors,next);assert.ok(actors.includes(first));assert.ok(first.sceneOpacity<1);assert.equal(actors.length,6);
    actors=advance(actors,6,next);assert.equal(actors.length,6);assert.ok(actors.every(a=>a.profile.id.startsWith('next:')));
});

test('accepted teammates remain loaded and have priority within the total scene budget',()=>{
    let actors=advance(step([]),10);const member={...spawns[11],position:{x:4000,y:200}};
    const opts={...options,team:[member.profile.id]};actors=step(actors,[...spawns.slice(0,11),member],opts);
    assert.equal(actors.length,6);const partner=actors.find(a=>a.profile.id===member.profile.id);assert.ok(partner);assert.deepEqual(partner.position,options.leader);
    partner.position={x:4000,y:200};actors=advance(actors,30,[],opts);assert.deepEqual(actors,[partner]);assert.equal(partner.sceneOpacity,1);
});

test('dormant descriptors drop active navigation state and activation is deterministic',()=>{
    const descriptors=socialSpawnDescriptors(step([]));assert.ok(descriptors.every(s=>!('rng' in s)&&!('path' in s)));
    const a=step([],descriptors),b=step([],descriptors);assert.deepEqual(a.map(r=>[r.profile.id,r.position,r.wait,r.rng.float()]),b.map(r=>[r.profile.id,r.position,r.wait,r.rng.float()]));
});
