import test from 'node:test';
import assert from 'node:assert/strict';
import {stepSocialActors,socialTrailGap} from '../js/adventure_social_motion_core.js';
import {createCompanion,stepCompanion} from '../js/adventure_companion_core.js';
import {SOCIAL_DEFAULTS} from '../js/adventure_social_core.js';
const world=()=>({zone:'test',w:2000,h:2000,buildings:[],trees:[],npcs:[]});
const party=()=>Array.from({length:3},(_,i)=>({profile:{id:`ally${i}`},position:{x:300,y:300},path:[],facing:0}));
function sample(points,back){for(let i=points.length-1;i>0;i--){const a=points[i],b=points[i-1],d=Math.hypot(a.x-b.x,a.y-b.y);if(d>=back&&d)return {x:a.x+(b.x-a.x)*back/d,y:a.y+(b.y-a.y)*back/d};back-=d;}return points[0];}
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
