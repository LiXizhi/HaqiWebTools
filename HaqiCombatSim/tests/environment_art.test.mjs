import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {drawIslandWeather,stepWeatherFade} from '../js/adventure_weather.js';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('data/adventure/environment-art.json',root)));

test('environment atlases retain alpha, provenance and bounded nonoverlapping crops below 200KB',()=>{
    for(const [id,row] of Object.entries(manifest.atlases)){
        const bytes=fs.readFileSync(new URL(row.local,root));
        assert.ok(bytes.length<=200000);assert.equal(bytes.length,row.size);
        assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
        assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.equal(bytes.toString('ascii',12,16),'VP8X');
        assert.ok(bytes[20]&0x10);assert.equal(bytes.readUIntLE(24,3)+1,row.width);assert.equal(bytes.readUIntLE(27,3)+1,row.height);
        assert.ok(row.cdn.startsWith('https://cdn.keepwork.com/'));assert.match(row.source.sha256,/^[a-f0-9]{64}$/);
        const frames=Object.values(row.frames);
        assert.equal(frames.length,id==='trees'?4:6);
        for(const [i,f] of frames.entries()){
            const [x,y,w,h]=f.rect;assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=row.width&&y+h<=row.height);
            for(const next of frames.slice(i+1)){const [nx,ny,nw,nh]=next.rect;assert.ok(x+w<=nx||nx+nw<=x||y+h<=ny||ny+nh<=y);}
        }
    }
});

test('weather atlas replaces vector particles, keeps its budget and can be suppressed',()=>{
    const calls=[],c={save(){},restore(){},beginPath(){throw Error('Unexpected fallback');}},art={draw(...args){calls.push(args);return true;}};
    for(const kind of ['embers','mist','ash','motes']){
        calls.length=0;const weather={kind,count:100,speed:20,wind:4,color:'#fff'};
        drawIslandWeather(c,{},null,10,1280,720,false,art,weather);
        assert.equal(calls.length,64);assert.ok(calls.every(a=>a[1]==='weather'&&a[2]===kind));
        calls.length=0;drawIslandWeather(c,{},null,10,1280,720,true,art,weather);assert.equal(calls.length,0);
    }
    const flakes=[];
    const snowContext=new Proxy({},{get:(_,key)=>(...args)=>flakes.push([key,...args])});
    drawIslandWeather(snowContext,{},null,10,1280,720,false,art,{kind:'snow',count:100,speed:20,wind:4,color:'#fff'});
    assert.equal(calls.length,0);
    assert.ok(flakes.filter(call=>call[0]==='ellipse').length<=128);
    assert.ok(flakes.some(call=>call[0]==='lineTo'));
    const drawn=flakes.length;
    drawIslandWeather(snowContext,{},null,10,1280,720,true,art,{kind:'snow',count:40,speed:20,wind:4,color:'#fff'});
    assert.equal(flakes.length,drawn);
    flakes.length=0;
    const sand={kind:'sand',count:100,speed:4,wind:35,color:'#f7dcad'};
    drawIslandWeather(snowContext,{},null,10,1280,720,false,art,sand);
    assert.equal(calls.length,0);
    assert.equal(flakes.filter(call=>call[0]==='bezierCurveTo').length,64);
    assert.equal(flakes.filter(call=>call[0]==='ellipse').length,192);
    const sandDrawn=flakes.length;
    drawIslandWeather(snowContext,{},null,10,1280,720,true,art,sand);
    drawIslandWeather(snowContext,{},null,10,1280,720,false,art,sand,null,0);
    assert.equal(flakes.length,sandDrawn);
    const alphas=[];
    drawIslandWeather({save(){},restore(){},beginPath(){},ellipse(){},fill(){},stroke(){},moveTo(){},lineTo(){},rotate(){},translate(){},set globalAlpha(v){alphas.push(v);},get globalAlpha(){return alphas.at(-1)??1;}},{},null,10,1280,720,false,null,{kind:'snow',count:8,speed:20,wind:4,color:'#fff'},null,.4);
    assert.ok(alphas.length>0&&alphas.every(v=>v<=.4+1e-6));
});

test('snow fades in when a region starts snowing and fades out when it stops',()=>{
    const snow={kind:'snow',count:40,speed:20,wind:8,color:'#fff'};
    let state=stepWeatherFade(null,null,0);
    state=stepWeatherFade(state,snow,450);
    assert.equal(state.weather.kind,'snow');
    assert.ok(Math.abs(state.weight-.5)<.02);
    state=stepWeatherFade(state,snow,1350);
    assert.ok(state.weight>.99);
    state=stepWeatherFade(state,null,1800);
    assert.equal(state.weather,null);
    assert.equal(state.previous.kind,'snow');
    assert.ok(Math.abs(state.previousWeight-.5)<.02);
    state=stepWeatherFade(state,null,2800);
    assert.equal(state.previous,null);
});
