import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createWorld,clearTeleportSpot,walkable,nearestWalkable} from '../js/adventure_world_core.js';
import {SOCIAL_DEFAULTS} from '../js/adventure_social_core.js';

const content=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url)));
content.worldMaps=Object.fromEntries(Object.entries(content.worldMapIndex.islands).map(([id,row])=>[id,JSON.parse(fs.readFileSync(new URL('../'+row.file,import.meta.url)))]));

test('clearTeleportSpot leaves already-clear ground alone',()=>{
    const world=createWorld('camp',content),spawn=world.layout.spawn,clearance=SOCIAL_DEFAULTS.separation;
    let open=null;
    for(let dy=-200;dy<=200&&!open;dy+=20)for(let dx=-200;dx<=200;dx+=20){
        const x=spawn.x+dx,y=spawn.y+dy;
        if(!walkable(world,x,y))continue;
        if(world.npcs.every(n=>Math.hypot(n.x-x,n.y-y)>=clearance)){open={x,y};break;}
    }
    assert.ok(open,'camp should have a clear walkable cell near spawn');
    assert.deepEqual(clearTeleportSpot(world,open.x,open.y,[],clearance),open);
});

test('clearTeleportSpot sidesteps an NPC with horizontal preference',()=>{
    const world=createWorld('camp',content),npc=world.npcs.find(n=>walkable(world,n.x,n.y))||world.npcs[0];
    const clearance=SOCIAL_DEFAULTS.separation;
    const spot=clearTeleportSpot(world,npc.x,npc.y,[],clearance);
    assert.ok(spot);
    assert.ok(walkable(world,spot.x,spot.y));
    assert.ok(Math.hypot(spot.x-npc.x,spot.y-npc.y)>=clearance-1e-6);
    assert.ok(Math.abs(spot.x-npc.x)+1e-6>=Math.abs(spot.y-npc.y),'prefer a mostly horizontal offset');
});

test('clearTeleportSpot also clears social actors passed as extras',()=>{
    const world=createWorld('town',content),base=nearestWalkable(world,world.center.x,world.center.y);
    const actor={position:{x:base.x,y:base.y}},clearance=SOCIAL_DEFAULTS.separation;
    const spot=clearTeleportSpot(world,base.x,base.y,[actor],clearance);
    assert.ok(spot);
    assert.ok(Math.hypot(spot.x-actor.position.x,spot.y-actor.position.y)>=clearance-1e-6);
    for(const n of world.npcs)assert.ok(Math.hypot(n.x-spot.x,n.y-spot.y)>=clearance-1e-6,`npc ${n.id}`);
});
