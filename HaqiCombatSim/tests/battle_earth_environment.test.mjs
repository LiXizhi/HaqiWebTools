import test from 'node:test';
import assert from 'node:assert/strict';
import {earthEnvironment,earthSolarElevation} from '../js/adventure_earth_environment_core.js';
import {createEarthEnvironmentPainter} from '../js/adventure_earth_environment.js';
import {earthRules,earthPoint} from '../js/adventure_earth_core.js';
import {createAdaptiveGraphics,normalizeGameSettings} from '../js/game_settings_core.js';
const at=Date.parse('2026-03-21T12:00:00Z');
test('solar time follows longitude, polar seasons and readable day/night presets',()=>{
    assert.ok(earthSolarElevation(at,0,0)>85);
    assert.ok(earthSolarElevation(at,180,0)<-85);
    assert.ok(earthSolarElevation(Date.parse('2026-06-21T00:00Z'),0,89)>0);
    assert.ok(earthSolarElevation(Date.parse('2026-12-21T12:00Z'),0,89)<0);
    assert.equal(earthEnvironment({at,light:'night'}).night,1);
    assert.equal(earthEnvironment({at,light:'day'}).night,0);
    assert.equal(earthEnvironment({at,light:'dusk'}).warm,1);
});
test('weather is deterministic, biome appropriate and explicit presets bypass simulation',()=>{
    for(const biome of ['urban','grass','forest','crops','scrub','wetland','barren','snow','water','ocean']){
        const input={at,lon:114,lat:22,biome};assert.deepEqual(earthEnvironment(input),earthEnvironment(input));
        for(let i=0;i<30;i++){
            const state=earthEnvironment({...input,at:at+i*1800000});
            if(biome==='barren')assert.ok(['clear','sand'].includes(state.kind));
            if(biome==='snow')assert.ok(['clear','snow'].includes(state.kind));
            assert.ok(Number.isFinite(state.elevation));
        }
    }
    for(const kind of ['rain','snow','fog','sand','clear'])assert.equal(earthEnvironment({at,weather:kind}).kind,kind);
    assert.equal(earthEnvironment({at,weather:'off'}).kind,'clear');
});
const world=()=>({isEarth:true,earthRules:earthRules(),revision:1,terrainAt:()=> 'ocean'});
const camera={x:100,y:200,scale:1};
function context(){const calls={lines:0,fills:0,strokes:0,depth:0};return {calls,save(){calls.depth++;},restore(){calls.depth--;},beginPath(){},moveTo(){},lineTo(){calls.lines++;},quadraticCurveTo(){},stroke(){calls.strokes++;},fillRect(){calls.fills++;}};}
test('weather fades smoothly with a fixed 48 stroke budget and zero disabled work',()=>{
    const p=createEarthEnvironmentPainter(),w=world(),c=context(),position=earthPoint(114,22,w.earthRules);
    p.update(w,position,0,{at,light:'day',weather:'rain'});p.weather(c,camera,800,600,0);assert.equal(c.calls.lines,48);assert.equal(c.calls.strokes,1);
    p.update(w,position,16,{at,light:'night',weather:'snow'});assert.ok(p.stats.night>0&&p.stats.night<.1);
    const before=c.calls.lines;p.weather(c,camera,800,600,16);assert.ok(c.calls.lines-before<=48);assert.equal(c.calls.depth,0);
    const snapshot={...c.calls};p.weather(c,camera,800,600,32,{enabled:false});p.weather(c,camera,800,600,32,{reducedMotion:true});assert.deepEqual(c.calls,snapshot);
    for(let t=32;t<4000;t+=16)p.update(w,position,t,{at,light:'night',weather:'snow'});assert.ok(p.stats.night>.99);
    const start=c.calls.lines;p.weather(c,camera,800,600,4000,{low:true});assert.equal(c.calls.lines-start,24);
    p.update({},position,4001,{at});p.tint(c,800,600);assert.equal(p.stats.active,false);
});
test('water sampling is bounded, reused within a camera cell and refreshed for new terrain',()=>{
    const p=createEarthEnvironmentPainter(),w=world(),c=context();let samples=0;
    w.terrainAt=()=>{samples++;return 'water';};
    p.update(w,earthPoint(114,22,w.earthRules),0,{at});p.ground(c,w,camera,800,600,0);assert.ok(samples<=161);
    const before=samples;for(let i=0;i<100;i++)p.ground(c,w,{...camera,x:camera.x+i*.1},800,600,i*16);
    assert.equal(samples,before);assert.ok(p.stats.water<=80);
    w.revision++;p.ground(c,w,camera,800,600,2000);assert.ok(samples>before);
    w.revision++;w.terrainAt=()=> 'grass';p.ground(c,w,camera,800,600,2100);assert.equal(p.stats.water,0);
});
test('environment preferences are normalized and propagated through adaptive quality',()=>{
    const settings=normalizeGameSettings({earthLight:'night',earthWeather:'sand'}),q=createAdaptiveGraphics();
    assert.equal(q.effects(settings).earthLight,'night');assert.equal(q.effects(settings).earthWeather,'sand');
    assert.equal(normalizeGameSettings({earthLight:'bogus',earthWeather:'bogus'}).earthLight,'day');
    const scene={};for(let t=0;t<=14000;t+=50)q.sample(t,{scene});
    assert.equal(q.effects(settings).particles,false);assert.equal(q.effects(settings).low,true);
});
test('night doorway lights reuse one tiny sprite, cap work and release scene references',()=>{
    let made=0,draws=0;const p=createEarthEnvironmentPainter({makeCanvas:()=>{made++;return {getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})};}}),w=world(),c=context();
    c.drawImage=()=>draws++;w.buildings=Array.from({length:100},(_,i)=>({x:150+i,y:250}));
    p.update(w,earthPoint(114,22,w.earthRules),0,{at,light:'night'});
    p.nightLights(c,w,camera,800,600);assert.equal(made,1);assert.equal(draws,12);
    p.nightLights(c,w,camera,800,600);assert.equal(made,1);assert.equal(draws,24);
    p.nightLights(c,w,camera,800,600,{enabled:false});assert.equal(draws,24);
    const next=world();p.update(next,earthPoint(114,22,w.earthRules),16,{at,light:'night'});p.nightLights(c,next,camera,800,600);assert.equal(p.stats.lights,0);
});
