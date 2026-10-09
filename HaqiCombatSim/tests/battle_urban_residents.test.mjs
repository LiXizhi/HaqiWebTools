import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createAdventure,parseSave} from '../js/adventure_core.js';
import {durableSave,splitRoleSave,joinRoleSave} from '../js/adventure_storage_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {validHeroBodyId,createHeroDraft} from '../js/hero_body_core.js';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const art=read('art-references/urban-residents/assets.json');
const runtime=read('data/adventure/hero-art.json');
const {content,dataset}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(p=>read('data/'+p)));

test('all 20 urban pairs preserve independently selected parts across durable storage',()=>{
 assert.equal(Object.keys(art.heads).length,20);assert.equal(Object.keys(art.bodyVariants).length,20);
 for(const head of Object.values(art.heads)){
  const appearance=head.gender==='female'?'girl':'boy';
  const bodies=Object.values(art.bodyVariants).filter(b=>b.gender===head.gender);
  for(const body of bodies){
   assert.ok(validHeroBodyId(body.id,appearance));
   assert.equal(validHeroBodyId(body.id,appearance==='girl'?'boy':'girl'),false);
   const save=createAdventure(content,{appearance,headId:head.id,bodyId:body.id});
   const parsed=parseSave(JSON.stringify(save),content,dataset);
   assert.equal(parsed.headId,head.id);assert.equal(parsed.bodyId,body.id);
   assert.equal(durableSave(save).bodyId,body.id);
   const {state,...parts}=splitRoleSave(save),joined=joinRoleSave(state,parts,content);
   assert.equal(joined.headId,head.id);assert.equal(joined.bodyId,body.id);
  }
 }
});

test('urban parts are registered with verified bytes, bounded anchors and shared walking geometry',()=>{
 for(const [group,rows] of Object.entries({heads:art.heads,bodyVariants:art.bodyVariants}))for(const row of Object.values(rows)){
  assert.deepEqual(runtime[group][row.id],row);
  assert.equal(row.review,'visual-reviewed');assert.match(row.cdn,/^https:\/\/cdn\.keepwork\.com\//);
  const bytes=readFileSync(new URL('../'+row.local,import.meta.url));
  assert.equal(bytes.length,row.bytes);assert.ok(bytes.length<=200000);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
  if(group==='heads'){
   assert.equal(row.frames.length,16);
   for(const f of row.frames){assert.ok(f.neck[0]>0&&f.neck[0]<144);assert.ok(f.neck[1]>0&&f.neck[1]<144);assert.ok(f.height>0&&f.height<=144);}
  }else{
   const base=runtime.bodies[row.baseBody];
   assert.equal(row.width,base.width);assert.equal(row.height,base.height);
   assert.equal(row.registration.length,28);
  }
 }
});

test('new drafts pair urban exposed skin with the matching head without changing independent IDs',()=>{
 const seen=new Set();
 for(let seed=0;seed<500;seed++){
  const draft=createHeroDraft(runtime,seed);
  for(const appearance of ['boy','girl']){
   const head=runtime.heads[draft.headChoices[appearance]];
   if(head.recommendedBodyId){assert.equal(draft.bodyChoices[appearance],head.recommendedBodyId);seen.add(head.id);}
  }
 }
 assert.equal(seen.size,20);
});
