import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createWorld,walkable} from '../js/adventure_world_core.js';
import {createSocialActors,stepSocialActors,socialActivityHubs} from '../js/adventure_social_motion_core.js';
import {entranceAppearance} from '../js/adventure_entrances_core.js';
import {SOCIAL_DEFAULTS} from '../js/adventure_social_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const content=read('data/adventure/chapter.json');
content.dungeons=read('data/adventure/dungeon-journeys.json').entries;
content.worldMaps=Object.fromEntries(['camp','town','fire','ice','desert','dark'].map(z=>[z,read(`data/adventure/maps/${z}.json`)]));
test('shared entrance atlas is bounded, permanent and has four valid crops',()=>{
 const row=read('data/adventure/entrance-art.json').atlases.shared;
 const bytes=fs.readFileSync(new URL('../'+row.local,import.meta.url));
 assert.ok(bytes.length<=200000);assert.equal(bytes.length,row.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
 assert.ok(row.cdn.startsWith('https://cdn.keepwork.com/'));
 assert.equal(Object.keys(row.frames).length,4);
 for(const {rect:[x,y,w,h]} of Object.values(row.frames)){assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=row.width&&y+h<=row.height);}
 assert.equal(new Set(content.dungeons.filter(d=>d.kind==='tower').map(d=>entranceAppearance({...d,entranceKind:d.kind}).frame)).size,3);
});
for(const zone of Object.keys(content.worldMaps))test(`${zone}: residents spawn and travel clear of dungeon entrances`,()=>{
 const world=createWorld(zone,content),entrances=world.landmarks.filter(p=>p.dungeonId);
 assert.ok(entrances.length);assert.ok(!socialActivityHubs(world).some(h=>entrances.some(e=>e.id===h.id)));
 const actors=createSocialActors(world,Array.from({length:16},(_,i)=>({id:`test-${i}`})),42);
 const check=()=>{for(const a of actors)for(const e of entrances)assert.ok(Math.hypot(a.position.x-e.x,a.position.y-e.y+(e.entranceKind==='tower'?25:0))>=SOCIAL_DEFAULTS.entranceClearance,`${a.profile.id} overlaps ${e.id}`);};
 check();
 // Previously occupied entrance, locked chat and paths crossing an entrance all recover safely.
 actors[0].position={x:entrances[0].x,y:entrances[0].y};
 const e=entrances.find(e=>e.entranceKind==='elite')||entrances[0];
 actors[1].position={x:e.x-150,y:e.y};actors[1].path=[{x:e.x+150,y:e.y}];
 const playerWalkable=walkable(world,e.x,e.y);
 for(let i=0;i<200;i++){if(i%50===0)actors.forEach(a=>{a.wait=0;});stepSocialActors(actors,world,.1,{locked:actors[0].profile.id,leader:e,team:[actors[2].profile.id]});check();}
 assert.equal(walkable(world,e.x,e.y),playerWalkable,'social exclusion must not change player navigation');
});
