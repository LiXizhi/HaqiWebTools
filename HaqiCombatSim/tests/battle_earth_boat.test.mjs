import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {earthRules,earthNearest,earthWalkable} from '../js/adventure_earth_core.js';
import {earthBoatAt,earthRoadDocks,earthBoatDrawPosition,earthBoatRiderPose} from '../js/adventure_earth_boat_core.js';
import {createHeroActor,updateHeroActor,direction16} from '../js/hero_pose_core.js';
import {earthRoadCrossings} from '../js/adventure_earth_bridge_core.js';
import {findPath,followPath} from '../js/adventure_world_core.js';
import {socialNavigationWorld} from '../js/adventure_social_motion_core.js';
import {drawEarthBoatRider} from '../js/view_earth_boat.js';

const rules=earthRules(),road={id:'crossing',a:{x:200,y:600},b:{x:1600,y:600},width:52};
const terrain=x=>x>=600&&x<=1200?'water':'grass';
function world(sample=terrain){return {isEarth:true,earthBoating:true,w:8640000,h:4320000,earthRules:rules,terrainAt:sample,paths:earthRoadCrossings([road],sample,rules),buildings:[],encounters:[],landmarks:[]};}

test('wide rivers get two shore docks and no road or bridge across the water',()=>{
    const w=world(),docks=earthRoadDocks(w.paths);
    assert.equal(docks.length,2);assert.deepEqual(docks.map(d=>d.facing),[2,1]);
    assert.ok(docks.every(d=>terrain(d.x)==='grass'));
    assert.ok(w.paths.every(r=>!r.bridge&&[r.a,r.b].every(p=>terrain(p.x)==='grass')));
    const short=x=>x>=700&&x<=850?'water':'grass';
    assert.equal(earthRoadDocks(world(short).paths).length,0);
    assert.ok(world(short).paths.some(r=>r.bridge));
    assert.equal(earthRoadDocks(world(x=>x>=600&&x<=1200?'ocean':'grass').paths).length,2);
    assert.equal(earthRoadDocks(world(x=>x>=600&&x<=1200?null:'grass').paths).length,0);
});

test('player crosses loaded water, mounts only off bridges and dismounts on land',()=>{
    const w=world();let p={x:400,y:600};const end={x:1400,y:600},path=findPath(w,p,end);
    assert.ok(path.length);let remaining=path,sawBoat=false;
    for(let i=0;i<60&&remaining.length;i++){
        const next=followPath(w,p,remaining,25);assert.equal(next.blocked,false);p=next.position;remaining=next.path;
        assert.equal(earthBoatAt(w,p.x,p.y),terrain(p.x)==='water');sawBoat||=earthBoatAt(w,p.x,p.y);
    }
    assert.ok(sawBoat);assert.deepEqual(p,end);assert.equal(earthBoatAt(w,p.x,p.y),false);
    const short=world(x=>x>=700&&x<=850?'water':'grass');assert.equal(earthBoatAt(short,770,600),false);
    assert.equal(earthWalkable(world(()=>null),800,600),false);
    assert.equal(earthWalkable(world(()=> 'ocean'),800,600),true);
    assert.equal(earthBoatAt({...w,isEarth:false},800,600),false);
});

test('local water restoration is allowed while map arrival and idle residents stay on land',()=>{
    const w=world();assert.deepEqual(earthNearest(w,800,600),{x:800,y:600});
    const arrival=earthNearest(w,800,600,{landOnly:true});assert.equal(terrain(arrival.x),'grass');
    assert.equal(earthWalkable(socialNavigationWorld(w),800,600),false);
    assert.equal(w.earthBoating,true);
});

test('boat art has valid crops, alpha WebP budget and verified provenance',()=>{
    const art=JSON.parse(fs.readFileSync(new URL('../data/adventure/earth/boat-art.json',import.meta.url)));
    const bytes=fs.readFileSync(new URL('../'+art.local,import.meta.url));
    assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.equal(bytes.length,art.size);assert.ok(bytes.length<=200000);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),art.sha256);assert.ok(art.source.sha256);
    assert.equal(new URL(art.cdn).hostname,'cdn.keepwork.com');assert.equal(Object.keys(art.frames).length,8);
    for(const {rect:[x,y,w,h]} of Object.values(art.frames))assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=art.width&&y+h<=art.height);
});

test('boat render clips legs and uses directional WebP without changing rider equipment',()=>{
    const w=world();w.boatArt=JSON.parse(fs.readFileSync(new URL('../data/adventure/earth/boat-art.json',import.meta.url)));
    const calls=[],ctx={save(){},restore(){},beginPath(){},rect(){},clip(){calls.push('clip');}},assets={draw(...args){calls.push(args[1]);return true;}},save={mountId:123};
    assert.equal(drawEarthBoatRider(ctx,assets,w,{x:800,y:600},2,()=>calls.push(save.mountId)),true);
    assert.deepEqual(calls[0].crop,w.boatArt.frames.boatRight.rect);assert.equal(save.mountId,123);assert.ok(calls.includes('clip'));
    assert.equal(drawEarthBoatRider(ctx,assets,w,{x:300,y:600},2,()=>assert.fail()),false);
});

test('boat rider follows the existing sixteen-direction moving gaze without idle bob or walking',()=>{
    const actor=createHeroActor();actor.facing=2;actor.head=12;
    let pose;for(let i=0;i<4;i++)pose=updateHeroActor(actor,{dx:2,dy:-2,time:i*.15,facing:2});
    const rider=earthBoatRiderPose(pose,2);
    assert.equal(rider.head,direction16(2,-2));assert.equal(rider.facing,2);
    assert.equal(rider.moving,false);assert.equal(rider.walkTime,0);
    assert.deepEqual(rider.breath,{x:0,y:0,angle:0});assert.equal(pose.moving,true);
});

test('boat and rider share a stable device-pixel anchor while a snapped camera follows',()=>{
    for(const scale of [.75,1,1.4,2.8])for(let i=0;i<40;i++){
        const position={x:7000000+i*.173,y:1600000+i*.217};
        const transform={a:scale,b:0,c:0,d:scale,e:-Math.round(position.x*scale-400),f:-Math.round(position.y*scale-300)};
        const original={...position},aligned=earthBoatDrawPosition(position,transform);
        assert.ok(Math.abs(aligned.x*scale+transform.e-400)<1e-7);
        assert.ok(Math.abs(aligned.y*scale+transform.f-300)<1e-7);
        assert.deepEqual(position,original,'visual alignment never changes movement or saves');
    }
});
