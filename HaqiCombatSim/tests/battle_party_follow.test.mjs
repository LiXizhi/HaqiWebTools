import test from 'node:test';
import assert from 'node:assert/strict';
import {stepSocialActors,socialTrailGap} from '../js/adventure_social_motion_core.js';
import {createCompanion,stepCompanion} from '../js/adventure_companion_core.js';
import {SOCIAL_DEFAULTS} from '../js/adventure_social_core.js';
import {walkable,distance,clearSegment} from '../js/adventure_world_core.js';
const world=()=>({zone:'test',w:2000,h:2000,buildings:[],trees:[],npcs:[],paths:[]});
const party=()=>Array.from({length:3},(_,i)=>({profile:{id:`ally${i}`},position:{x:300,y:300},path:[],facing:0}));
function sample(points,back){for(let i=points.length-1;i>0;i--){const a=points[i],b=points[i-1],d=Math.hypot(a.x-b.x,a.y-b.y);if(d>=back&&d)return {x:a.x+(b.x-a.x)*back/d,y:a.y+(b.y-a.y)*back/d};back-=d;}return points[0];}
test('earth streaming retains one train for a local peer plus one or two guests',()=>{
    for(const count of [1,2]){
        const w={...world(),isEarth:true,earthBoating:false,terrainAt:()=> 'land'},peer={position:{x:300,y:300},facing:2},key={};
        let actors=party().slice(0,count);const team=actors.map(a=>a.profile.id),points=[];
        for(let x=300;x<=600;x+=2){
            const leader={x,y:300};points.push(leader);actors=[...actors];
            stepSocialActors(actors,w,.02,{leader,team,localSecond:peer,partyKey:key});
        }
        for(let y=302;y<=500;y+=2){
            const leader={x:600,y};points.push(leader);actors=[...actors];
            stepSocialActors(actors,w,.02,{leader,team,localSecond:peer,partyKey:key});
            [peer,...actors].forEach((a,i)=>assert.deepEqual(a.position,sample(points,socialTrailGap()*(i+1))));
        }
        const before=structuredClone(peer);stepSocialActors(actors,w,.02,{leader:{x:800,y:500},team:[],localSecond:peer,partyKey:key,paused:true});assert.deepEqual(peer,before);
        stepSocialActors([],w,.02,{leader:{x:800,y:500},team:[],localSecond:peer,partyKey:key});assert.deepEqual(peer,before);
    }
});
test('boat train uses compact staggered slots without overlap and returns to walking gaps',()=>{
    const w={...world(),isEarth:true,earthBoating:true,terrainAt:()=> 'ocean'},actors=party(),team=actors.map(a=>a.profile.id),key={};
    for(let x=300;x<=600;x+=2)stepSocialActors(actors,w,.02,{leader:{x,y:300,facing:2},team,partyKey:key});
    const positions=[{x:600,y:300},...actors.map(a=>a.position)];
    for(let i=1;i<positions.length;i++){const gap=distance(positions[i-1],positions[i]);assert.ok(gap>0&&gap<socialTrailGap());}
    assert.ok(actors[0].position.y!==actors[1].position.y);
    for(let i=0;i<100;i++)stepSocialActors(actors,w,.05,{leader:{x:600,y:300},team,partyKey:key});
    assert.deepEqual(actors.map(a=>a.position),positions.slice(1));
    w.earthBoating=false;stepSocialActors(actors,w,.02,{leader:{x:602,y:300},team,partyKey:key});
    actors.forEach((a,i)=>assert.deepEqual(a.position,{x:602-socialTrailGap()*(i+1),y:300}));
});
test('compact party follows exact turns, loops and reversals outside the viewport',()=>{
    const w=world(),actors=party(),team=actors.map(a=>a.profile.id),points=[{x:300,y:300}];
    const step=p=>{points.push(p);stepSocialActors(actors,w,.02,{leader:p,team,view:{x:0,y:0,w:1,h:1}});actors.forEach((a,i)=>{assert.deepEqual(a.position,sample(points,socialTrailGap()*(i+1)));assert.equal(a.inParty,true);});};
    step(points[0]);
    for(const [dx,dy] of [[2,0],[0,2],[-2,0],[0,-2],[2,0],[-2,0],[1,1]])for(let i=0;i<100;i++){const p=points.at(-1);step({x:p.x+dx,y:p.y+dy});}
    assert.ok(socialTrailGap()<=50);
});
test('stopped party stays near its slots and resumes its exact trail',()=>{
    const w=world(),actors=party(),team=actors.map(a=>a.profile.id);
    for(let x=300;x<=600;x+=2)stepSocialActors(actors,w,.02,{team,leader:{x,y:300}});
    const slots=actors.map(a=>({...a.position}));
    for(let i=0;i<100;i++){stepSocialActors(actors,w,.05,{team,leader:{x:600,y:300}});actors.forEach((a,j)=>assert.ok(Math.hypot(a.position.x-slots[j].x,a.position.y-slots[j].y)<=SOCIAL_DEFAULTS.partyIdleRadius*Math.SQRT2+.01));}
    assert.notDeepEqual(actors.map(a=>a.position),slots);
    stepSocialActors(actors,w,.02,{team,leader:{x:602,y:300}});
    actors.forEach((a,i)=>assert.deepEqual(a.position,{x:602-socialTrailGap()*(i+1),y:300}));
});
test('pets stay in a parallel train through turns instead of chasing or wandering',()=>{
    const w=world(),owners=[{x:500,y:500},{x:458,y:500},{x:416,y:500}],pets=owners.map((p,i)=>createCompanion(w,p,i));
    for(const [dx,dy] of [[2,0],[0,2],[-2,0],[0,-2]])for(let i=0;i<80;i++)owners.forEach((p,j)=>{p.x+=dx;p.y+=dy;stepCompanion(pets[j],w,p,.02,{inParty:true});assert.deepEqual(pets[j].position,{x:p.x+SOCIAL_DEFAULTS.partyPetOffsetX,y:p.y+SOCIAL_DEFAULTS.partyPetOffsetY});assert.equal(pets[j].path.length,0);});
});

const roadWorld=()=>{const a={x:100,y:500},b={x:1500,y:500};return {...world(),layout:{route:[a,b]},paths:[{a,b,width:100}]};};

test('party pets close to a dungeon road edge do not snap between the owner and side slot',()=>{
    const w=roadWorld(),hero={x:500,y:523.9},pet=createCompanion(w,hero,1);
    stepCompanion(pet,w,hero,1/60,{inParty:true});
    for(let i=0;i<180;i++){
        const previous={...pet.position};
        // The desired side slot alternates just inside/outside the y=542 edge.
        hero.x+=1;hero.y=i%2?523.9:524.1;
        stepCompanion(pet,w,hero,1/60,{inParty:true});
        assert.ok(walkable(w,pet.position.x,pet.position.y));
        assert.ok(distance(previous,pet.position)<2,'a tiny owner movement must not cause a full-slot jump');
        assert.ok(pet.position.x-hero.x>30,'retain the available side space');
    }
});

test('idle party pets remain smooth when their sway crosses the road edge',()=>{
    const w=roadWorld(),hero={x:500,y:524},pet=createCompanion(w,hero,2);
    stepCompanion(pet,w,hero,1/60,{inParty:true});
    for(let i=0;i<1800;i++){
        const previous={...pet.position};
        stepCompanion(pet,w,hero,1/60,{inParty:true});
        assert.ok(walkable(w,pet.position.x,pet.position.y));
        assert.ok(distance(previous,pet.position)<1,'idle sway must not teleport to the owner');
    }
});

test('party pet side placement stops at the first obstruction even when its endpoint is walkable',()=>{
    const w=roadWorld(),hero={x:500,y:500};
    w.movementExclusions=[{x:516,y:509,radius:6}];
    const pet=createCompanion(w,hero,3);
    stepCompanion(pet,w,hero,1/60,{inParty:true});
    assert.ok(clearSegment(w,hero,pet.position));
    assert.ok(distance(hero,pet.position)>0);
    assert.ok(distance(hero,pet.position)<distance(hero,w.movementExclusions[0]));
});

test('party pets move continuously when a dungeon bend alternately opens the side slot',()=>{
    const route=[{x:350,y:200},{x:350,y:350},{x:520,y:435},{x:740,y:510},{x:950,y:600}];
    const w={...world(),layout:{route},paths:route.slice(1).map((b,i)=>({a:route[i],b,width:96}))};
    const hero={x:389.99,y:325},pet=createCompanion(w,hero,4);
    stepCompanion(pet,w,hero,1/60,{inParty:true});
    for(let i=0;i<240;i++){
        const previous={...pet.position};hero.y=i%2?325:325.2;
        stepCompanion(pet,w,hero,1/60,{inParty:true});
        assert.ok(walkable(w,pet.position.x,pet.position.y));
        assert.ok(distance(previous,pet.position)<=SOCIAL_DEFAULTS.dungeonFollowSpeed/60+1e-6,'opening a bend must not teleport the pet');
    }
    // Continuing past the bend must not strand the pet until a regroup teleport.
    for(let i=0;i<60;i++){
        const previous={...pet.position};hero.y+=1;
        stepCompanion(pet,w,hero,1/60,{inParty:true});
        assert.ok(distance(previous,pet.position)<=SOCIAL_DEFAULTS.dungeonFollowSpeed/60+1e-6);
        assert.ok(walkable(w,pet.position.x,pet.position.y));
    }
    assert.ok(distance(pet.position,{x:hero.x+32,y:hero.y+18})<1,'pet must recover its side slot after the bend');
});
