import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {groundDecorations} from '../js/adventure_ground_decorations_core.js';
import {onLargeIsland,segmentDistance} from '../js/adventure_island_layout_core.js';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root)));
const manifest=read('data/adventure/terrain-decoration-art.json');
function worldFor(zone){const layout=read(`data/adventure/maps/${zone}.json`);return {zone,layout,w:layout.w,h:layout.h,paths:layout.paths,trees:layout.trees,buildings:layout.buildings,center:layout.center||layout.spawn};}

test('48 decoration frames preserve alpha, source crops, hashes and the 200KB budget',()=>{
    assert.equal(Object.keys(manifest.atlases).length,3);
    for(const row of Object.values(manifest.atlases)){
        const bytes=fs.readFileSync(new URL(row.local,root));
        assert.ok(bytes.length<=200000);assert.equal(bytes.length,row.size);
        assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
        assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.ok(bytes[20]&0x10);
        assert.equal(bytes.readUIntLE(24,3)+1,row.width);assert.equal(bytes.readUIntLE(27,3)+1,row.height);
        assert.match(row.cdn,/^https:\/\/cdn\.keepwork\.com\//);assert.match(row.source.sha256,/^[a-f0-9]{64}$/);
        const frames=Object.values(row.frames);assert.equal(frames.length,16);
        for(const [i,f] of frames.entries()){
            const [x,y,w,h]=f.rect,[sx,sy,sw,sh]=f.sourceRect;
            assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=row.width&&y+h<=row.height);
            assert.ok(sx>=0&&sy>=0&&sw>0&&sh>0&&sx+sw<=row.source.width&&sy+sh<=row.source.height);
            for(const g of frames.slice(i+1)){const [gx,gy,gw,gh]=g.rect;assert.ok(x+w<=gx||gx+gw<=x||y+h<=gy||gy+gh<=y);}
        }
    }
});

test('decorations stay deterministic across overlapping tiles without changing map data',()=>{
    for(const zone of ['camp','town','ice','fire','desert','dark']){
        const world=worldFor(zone),before=JSON.stringify(world),full={x:0,y:0,w:world.w,h:world.h};
        const all=groundDecorations(world,full),again=groundDecorations(world,full);
        assert.deepEqual(all,again);assert.equal(JSON.stringify(world),before);assert.ok(all.length>0,zone);
        const subset=groundDecorations(world,{x:1024,y:1024,w:512,h:512});
        const lookup=new Map(all.map(d=>[`${d.x}:${d.y}`,d]));
        for(const d of subset)assert.deepEqual(d,lookup.get(`${d.x}:${d.y}`));
        for(const d of all){
            assert.ok(manifest.atlases[d.atlas].frames[d.frame]);assert.ok(onLargeIsland(world,d.x,d.y,d.size*.65+5));
            assert.ok(world.paths.every(p=>segmentDistance(d,p.a,p.b)>=p.width/2+d.size*.65+10));
        }
    }
});

test('NPC interaction areas and dungeon corridors are kept clear',()=>{
    const world=worldFor('town'),rect={x:0,y:0,w:world.w,h:world.h};
    const existing=groundDecorations(world,rect),spot=existing[0];
    assert.ok(spot);world.npcs=[{x:spot.x,y:spot.y}];
    assert.ok(groundDecorations(world,rect).every(d=>Math.hypot(d.x-spot.x,d.y-spot.y)>=d.size*.65+34));
    world.layout.route=[{x:0,y:0}];assert.deepEqual(groundDecorations(world,rect),[]);
});
