import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createWorld,walkable,clearSegment,findPath,nearestInteraction} from '../js/adventure_world_core.js';
import {installNpcCatalog} from '../js/adventure_npc_core.js';
import {onLargeIsland,segmentDistance} from '../js/adventure_island_layout_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const content=read('data/adventure/chapter.json');content.worldMaps={};
for(const z of ['camp','town','fire','ice','desert','dark'])content.worldMaps[z]=read('data/adventure/maps/'+z+'.json');
test('五岛建筑图集大小、来源、哈希与裁剪范围有效',()=>{
    const manifest=read('data/adventure/building-art.json');
    assert.equal(Object.keys(manifest.atlases).length,5);
    for(const row of Object.values(manifest.atlases)){
        const bytes=fs.readFileSync(new URL('../'+row.local,import.meta.url));
        assert.equal(bytes.length,row.size);assert.ok(row.size<=200000);
        assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
        assert.ok(row.cdn.startsWith('https://cdn.keepwork.com/'));
        assert.equal(Object.keys(row.frames).length,4);
        for(const {rect:[x,y,w,h]} of Object.values(row.frames))assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=row.width&&y+h<=row.height);
    }
});
test('各岛摆放可复现，避开道路和居民，船只在海上，营地仅新增码头',()=>{
    for(const zone of ['camp','town','fire','ice','desert','dark']){
        const before=JSON.stringify(content.worldMaps[zone]),world=createWorld(zone,content);
        const buildings=world.buildings.filter(b=>b.atlas);
        assert.deepEqual(world.buildings,createWorld(zone,content).buildings);
        assert.equal(JSON.stringify(content.worldMaps[zone]),before);
        if(zone==='camp'){
            // 营地保留自带建筑，不散布村庄；码头与小船复用小镇图集（2026-09-26）。
            assert.ok(buildings.some(b=>b.frame==='harbor'&&b.atlas==='town'&&b.decorationOnly));
            assert.ok(!buildings.some(b=>b.frame==='village'||b.frame==='tower'));
            for(const b of buildings)assert.equal(onLargeIsland(world,b.x,b.y),false);
            continue;
        }
        assert.equal(buildings.length,13);
        for(const b of buildings){
            if(b.frame==='boat'){assert.equal(onLargeIsland(world,b.x,b.y),false);continue;}
            if(b.decorationOnly)continue;
            assert.equal(walkable(world,b.x,b.y-20),false);
            assert.ok(world.layout.paths.every(p=>segmentDistance(b,p.a,p.b)-(p.width||60)/2>=190));
            assert.ok(world.npcs.filter(n=>!n.worldMapGuide&&!n.harborGuide).every(n=>Math.hypot(n.x-b.x,n.y-b.y)>=300));
        }
    }
});

test('船坞道路连通传送点，船长可交谈且不与船坞重叠（含原版居民）',()=>{
    const catalogContent=structuredClone(content);
    installNpcCatalog(catalogContent,read('data/adventure/npc-catalog.json'));
    for(const c of [content,catalogContent])for(const zone of ['camp','town','fire','ice','desert','dark']){
        const before=JSON.stringify(c),world=createWorld(zone,c);
        const harbor=world.buildings.find(b=>b.frame==='harbor');
        const captains=world.npcs.filter(n=>n.id===36205||n.name==='法斯特船长');
        assert.equal(captains.length,1,zone);
        const captain=captains[0],road=world.paths.find(p=>p.harborAccess);
        assert.ok(road,zone);
        assert.deepEqual(road.a,{x:world.layout.portal.x,y:world.layout.portal.y});
        assert.deepEqual(road.b,{x:captain.x,y:captain.y});
        assert.deepEqual({x:world.portal.x,y:world.portal.y},{x:captain.x,y:captain.y});
        assert.ok(Math.abs(captain.x-harbor.x)>=harbor.w/2+32+20,zone);
        assert.ok(Math.hypot(captain.x-harbor.x,captain.y-harbor.y)<290,zone);
        assert.ok(walkable(world,captain.x,captain.y),zone);
        assert.ok(clearSegment(world,road.a,world.portal),zone);
        assert.ok(findPath(world,road.a,world.portal).length,zone);
        assert.equal(nearestInteraction(world,captain)?.id,captain.id,zone);
        for(let i=0;i<=20;i++){
            const x=road.a.x+(road.b.x-road.a.x)*i/20,y=road.a.y+(road.b.y-road.a.y)*i/20;
            assert.ok(walkable(world,x,y),zone);
        }
        assert.equal(JSON.stringify(c),before,'创建世界不修改源地图或居民目录');
    }
});
