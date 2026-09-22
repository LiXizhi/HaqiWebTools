import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {monsterArtBinding,validateMonsterArt} from '../js/adventure_monster_art_core.js';
import {createMonsterArtRenderer} from '../js/adventure_monster_art.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
const art=read('monster-art'),boss=read('boss-art'),pets=read('pets').pets;
test('all original monsters and playable templates have valid appearance bindings without mutation',()=>{
 validateMonsterArt(art,pets);
 const monsters=[...read('monster-catalog').monsters,...Object.values(read('dungeons').monsters),...Object.values(read('chapter').monsters)];
 const before=JSON.stringify(monsters);
 for(const m of monsters)assert.ok(monsterArtBinding(m,art),m.source||m.id);
 assert.equal(JSON.stringify(monsters),before);
});
test('all 23 original bosses resolve to their own verified transparent WebP archive',()=>{
 assert.equal(Object.keys(boss.entries).length,23);
 for(const [id,e] of Object.entries(boss.entries)){
  const binding=monsterArtBinding({source:e.source.toUpperCase().replaceAll('/','\\'),model:e.model},art);
  assert.deepEqual(binding,{kind:'portrait',id});
  const bytes=fs.readFileSync(new URL('../'+e.local,import.meta.url));
  assert.equal(bytes.length,e.size);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),e.sha256);
  assert.equal(art.entries[id].cdn,e.cdn);
 }
});
test('renderer uses boss portraits and pet atlases, and rejects missing references',()=>{
 const calls=[],content={...read('pets'),pets};
 const draw=createMonsterArtRenderer(art,content,(...args)=>{calls.push(['boss',args]);return true;},(...args)=>{calls.push(['pet',args]);return true;});
 for(const e of Object.values(boss.entries))assert.equal(draw({},e,0,0,100,100),true);
 assert.equal(calls.length,23);assert.ok(calls.every(c=>c[0]==='boss'));
 const binding=Object.entries(art.bindings).find(([,b])=>b.kind==='pet');const [source,model]=binding[0].split('|');
 assert.equal(draw({},{source,model,level:1},0,0,100,100),true);assert.equal(calls.at(-1)[1][1],binding[1].petId);
 const bad=structuredClone(art);bad.bindings.test={kind:'portrait',id:'missing'};assert.throws(()=>validateMonsterArt(bad,pets));
 assert.equal(monsterArtBinding({id:'unknown'},art),null);
});
