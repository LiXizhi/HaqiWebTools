import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {urbanResidentProfiles,streetPeopleProfiles} from '../js/adventure_city_people_core.js';
import {createStreetMotion,stepStreetMotion} from '../js/adventure_city_street_core.js';
import {emptyStreet} from '../js/adventure_city_street_layout_core.js';
import {createStreetPainter} from '../js/view_city_street.js';
import {warmSceneActors} from '../js/adventure_actor_assets.js';
const manifest=JSON.parse(fs.readFileSync(new URL('../data/adventure/hero-art.json',import.meta.url),'utf8'));
function street(count=6){const s=emptyStreet();s.routes=[{id:'walk',kind:'pedestrian',count,speed:80,points:[{x:100,y:100},{x:500,y:100},{x:500,y:500},{x:100,y:500},{x:100,y:100}]}];return s;}
test('street residents use all 20 paired hero appearances with deterministic children/adults/seniors',()=>{
    const pool=urbanResidentProfiles(manifest);assert.equal(pool.length,20);
    const s=street(10);s.routes.push({...s.routes[0],id:'walk2'});
    const a=streetPeopleProfiles(s,manifest,'nantou'),b=streetPeopleProfiles(s,manifest,'nantou');assert.deepEqual(a,b);assert.equal(new Set([...a.values()].map(p=>p.headId)).size,20);
    const few=[...streetPeopleProfiles(street(),manifest,'bay').values()];assert.equal(new Set(few.map(p=>p.headId)).size,6);
    assert.ok(few.some(p=>/school|teen-/.test(p.headId)));assert.ok(few.some(p=>/retired|teacher|florist|gardener/.test(p.headId)));assert.ok(few.some(p=>p.appearance==='girl'));assert.ok(few.some(p=>p.appearance==='boy'));
    for(const p of a.values()){const head=manifest.heads[p.headId],body=manifest.bodyVariants[p.bodyId];assert.equal(head.recommendedBodyId,body.id);assert.equal(head.gender,body.gender);assert.equal(p.mountId,null);}
});
test('authored heads and outfits can be chosen independently, mismatched or missing art falls back to a valid pair',()=>{
    const s=street(2),pool=urbanResidentProfiles(manifest),women=pool.filter(p=>p.appearance==='girl');s.routes[0].characters=[{...women[0],bodyId:women[1].bodyId},{appearance:'boy',headId:'missing',bodyId:women[0].bodyId}];
    const profiles=streetPeopleProfiles(s,manifest,'explicit');assert.equal(profiles.get('walk:0').bodyId,women[1].bodyId);assert.ok(manifest.heads[profiles.get('walk:1').headId]);
});
test('walk distance follows actual progress and does not jump at route wrap; stopping freezes movement',()=>{
    const s=street(1),state=createStreetMotion(s),a=state.actors[0];a.distance=1599;
    stepStreetMotion(state,s,.1,null);assert.equal(a.distance,7);assert.equal(a.walkDistance,8);assert.equal(a.moving,true);
    stepStreetMotion(state,s,0,null);assert.equal(a.moving,false);assert.equal(a.walkDistance,8);
});
test('walking people draw layered heroes at player scale in all four directions, never sliding portraits',()=>{
    const calls=[],assets={content:{},hero:{manifest,drawSave(c,p,x,y,t,moving,scale,options){calls.push({p,moving,scale,options});return{ready:true};}},draw(){throw Error('a pedestrian must not draw a static portrait');}};
    const ctx=new Proxy({},{get:()=>()=>{},set:()=>true}),painter=createStreetPainter(assets),s=street(1),world={dungeon:{id:'city:test:place',scene:{streetscape:s}}};
    const first=painter.objects(world,{x:0,y:0,w:600,h:600},1000,null,false).find(o=>o.kind==='street-actor');
    for(const angle of [Math.PI/2,Math.PI,0,-Math.PI/2])painter.draw(ctx,{...first,angle,moving:true,dx:Math.cos(angle),dy:Math.sin(angle),time:2,walkDistance:210},null);
    assert.deepEqual(calls.map(c=>c.p.facing),[0,1,2,3]);for(const c of calls){assert.equal(c.scale,1);assert.equal(c.moving,true);assert.equal(c.options.walkTime,1);assert.ok(c.p.headId.startsWith('urban-'));}
    assert.equal(painter.stats().people,1);painter.reset();assert.equal(painter.stats().people,0);
});
test('scene warming loads walking hero parts and optional fixed characters with bounded concurrency',async()=>{
    const s=street(),profiles=[...streetPeopleProfiles(s,manifest,'city:test').values()],fixed=urbanResidentProfiles(manifest)[0];let active=0,peak=0;const warmed=[];
    const hero={manifest,appearance:p=>p,ensure:async p=>{warmed.push(p);active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,1));active--;return{};}};
    await warmSceneActors({world:{dungeon:{id:'city:test',scene:{streetscape:s}},npcs:[{character:fixed,portrait:'unused'}]},save:{},content:{pets:{}},hero,ensureImage:()=>{throw Error('fixed character should not load a portrait');}});
    for(const p of profiles)assert.ok(warmed.some(w=>w.headId===p.headId&&w.bodyId===p.bodyId));assert.ok(warmed.some(w=>w.headId===fixed.headId));assert.ok(peak<=5);
});
