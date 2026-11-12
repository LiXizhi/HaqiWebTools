import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installNpcCatalog} from '../js/adventure_npc_core.js';
import {createCampToys} from '../js/camp_toys.js';
import {createWorld,walkable} from '../js/adventure_world_core.js';
import {createAdventure} from '../js/adventure_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {companionWorldTarget} from '../js/companion_guide_core.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../data/'+name,import.meta.url)));
const {content}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
installNpcCatalog(content,read('adventure/npc-catalog.json'));
content.worldMaps={camp:read('adventure/maps/camp.json')};
const save=createAdventure(content,{starter:'dragon_green',seed:812}),world=createWorld('camp',content,save);
const art={images:{toys:{}},warm:async()=>{},draw:()=>true};
test('five camp toys stand on valid ground apart from NPCs and enemies',()=>{
 const toys=createCampToys(art);toys.prepare(world);assert.equal(toys.rows.length,5);
 for(const p of toys.rows){assert.ok(walkable(world,p.x,p.y));assert.ok(world.npcs.every(n=>Math.hypot(n.x-p.x,n.y-p.y)>=65));assert.ok(world.encounters.every(n=>Math.hypot(n.x-p.x,n.y-p.y)>=180));}
});
test('optional exploration never awards currency or modifies quests; crystal has three real hits and cooldown',()=>{
 const before=JSON.stringify(save),toys=createCampToys(art);toys.prepare(world);const crystal=toys.rows.find(t=>t.id==='crystal');
 assert.match(toys.interact(crystal,1000).line,/两下/);assert.equal(toys.interact(crystal,1010),null);
 assert.match(toys.interact(crystal,1300).line,/再一下/);assert.match(toys.interact(crystal,1600).line,/跑出来/);
 assert.equal(toys.interact(crystal,2000),null);assert.ok(toys.interact(crystal,7601));assert.equal(JSON.stringify(save),before);
 toys.prepare({...world,zone:'town'});assert.equal(toys.rows.length,0);
});
test('missing toy art never creates an invisible clickable object',()=>{
 const toys=createCampToys({...art,images:{}});toys.prepare(world);assert.equal(toys.pick(toys.rows[0]),null);assert.equal(toys.nearest(toys.rows[0]),null);
});
test('idle guide uses the opening destination without changing the save',()=>{
 const current={...save,openingJourney:{version:1,phase:'guide'}},before=JSON.stringify(current),target=companionWorldTarget(current,content,world);
 assert.equal(target.id,36201);assert.equal(target.kind,'npc');assert.equal(JSON.stringify(current),before);
 assert.equal(companionWorldTarget({...current,zone:'town'},content,world),null);
});

test('missing toy texture does not retry its image on every render frame',()=>{
 let draws=0,warms=0;const toys=createCampToys({images:{},warm:async()=>{warms++;},draw:()=>{draws++;}});toys.prepare(world);
 for(let i=0;i<120;i++)for(const toy of toys.rows)toys.draw({},toy,i*16);
 assert.equal(warms,1);assert.equal(draws,0);
});

test('persisted crystal progress replaces free-play hits and cooldown without restarting bounce',()=>{
 const toys=createCampToys(art);toys.prepare(world);const c=toys.rows.find(r=>r.id==='crystal');
 toys.interact(c,1000);toys.interact(c,1300);toys.interact(c,1600);
 assert.equal(c.restUntil,7600);toys.syncCrystalProgress(0);assert.equal(c.restUntil,0);assert.equal(c.hits,0);
 assert.equal(toys.nearest(c).id,'crystal');
 assert.equal(toys.interact(c,1900).sound,'click');const age=c.activated;
 for(let i=0;i<100;i++)toys.syncCrystalProgress(1);
 assert.equal(c.activated,age);assert.equal(c.hits,1);
 assert.match(toys.interact(c,2200).line,/再一下/);assert.equal(toys.interact(c,2500).sound,'shield');
});

test('reload restores remaining crystal taps and aborted save has no visual side effects',()=>{
 for(const savedHits of [0,1,2]){
  const toys=createCampToys(art);toys.prepare(world);const c=toys.rows.find(r=>r.id==='crystal');toys.syncCrystalProgress(savedHits);
  const before={...c};const aborted=toys.planInteraction(c,1000);assert.ok(aborted);assert.deepEqual(c,before);
  const retry=toys.planInteraction(c,1100);assert.equal(retry.commit(),true);assert.equal(retry.commit(),false);assert.equal(aborted.commit(),false);
  assert.equal(c.hits,savedHits+1);assert.equal(c.restUntil,savedHits===2?7100:0);
 }
});

test('sound feedback separates crystal taps from breaking and softens repeated ambient toys',()=>{
 const toys=createCampToys(art);toys.prepare(world);const bell=toys.rows.find(r=>r.id==='bells'),flies=toys.rows.find(r=>r.id==='fireflies');
 assert.equal(toys.interact(bell,1000).gain,.45);assert.equal(toys.interact(bell,1300),null);assert.ok(toys.interact(bell,1400));
 const response=toys.interact(flies,1000);assert.equal(response.sound,'select');assert.equal(response.gain,.5);
});
