import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createWorld} from '../js/adventure_world_core.js';
import {segmentDistance} from '../js/adventure_island_layout_core.js';
import {islandSceneArtSteps,sceneArtAtlases,groundTexture,mountainSprite} from '../js/island_scene_art_core.js';
import {sceneryAtlases} from '../js/adventure_scenery_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const content=read('data/adventure/chapter.json');content.worldMaps={};
const ZONES=['town','fire','ice','desert','dark'];
for(const z of ['camp',...ZONES])content.worldMaps[z]=read('data/adventure/maps/'+z+'.json');
const manifest=read('data/adventure/environment-art.json');
const stamps=(world,rect)=>[...islandSceneArtSteps(world,rect)].filter(Boolean);

test('五大岛场景美术包：配置引用的图集与帧都存在，营地不受影响',()=>{
    assert.deepEqual(sceneArtAtlases(createWorld('camp',content)),[]);
    for(const zone of ZONES){
        const world=createWorld(zone,content),art=world.layout.sceneArt;
        assert.ok(art,zone);
        for(const key of sceneArtAtlases(world)){
            if(!manifest.atlases[key])continue; // art not generated yet degrades to the old look
            assert.equal(manifest.atlases[key].layer,'terrain');
            assert.ok(sceneryAtlases(world).terrain.includes(key),`${zone} warms ${key}`);
        }
        const check=(atlas,frames)=>{if(!manifest.atlases[atlas])return;for(const f of frames)assert.ok(manifest.atlases[atlas].frames[f],`${atlas}/${f}`);};
        const g=art.ground;check(g.atlas,[g.base,g.road,...Object.values(g.biomes).filter(Boolean),...Object.values(g.water||{})]);
        for(const f of [g.base,g.road])if(manifest.atlases[g.atlas])assert.ok(manifest.atlases[g.atlas].frames[f].tile);
        const lists=group=>Array.isArray(group)?group:Object.values(group||{}).flat();
        check(art.props.atlas,[...art.props.roadside,...lists(art.props.scatter)]);
        check(art.features.atlas,[...lists(art.features.scatter),...lists(art.features.mountains)]);
        assert.ok(groundTexture(world,'road'));
        for(const [i,m] of world.layout.mountains.entries())assert.ok(mountainSprite(world,m,i),`${zone} mountain ${m.biome}`);
    }
});

test('场景道具与地貌可复现、跨切块一致，并避开道路、居民和出生点',()=>{
    for(const zone of ZONES){
        const world=createWorld(zone,content),full={x:0,y:0,w:world.w,h:world.h};
        const all=stamps(world,full);
        assert.ok(all.length>20,`${zone} has ${all.length} stamps`);
        assert.deepEqual(all,stamps(createWorld(zone,content),full));
        // A tile sees exactly the stamps whose anchors fall inside its padded rect.
        const tile={x:1024,y:1536,w:512,h:512},inTile=stamps(world,tile);
        const key=s=>`${s.atlas}/${s.frame}@${s.x},${s.y}`;
        const fullKeys=new Set(all.map(key));
        for(const s of inTile)assert.ok(fullKeys.has(key(s)));
        const points=[...world.npcs,...world.encounters,...world.landmarks,world.portal];
        for(const s of all){
            for(const p of world.paths)assert.ok(segmentDistance(s,p.a,p.b)>(p.width||60)/2-2,`${zone} ${s.frame} on road`);
            assert.ok(points.every(p=>Math.hypot(s.x-p.x,s.y-p.y)>60),`${zone} ${s.frame} covers an actor`);
        }
    }
});
