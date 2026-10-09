import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createPetInstance,interactPets,breedPets,adoptPet} from '../js/adventure_pet_interactions_core.js';
import {createPetRepository} from '../js/adventure_pet_repository.js';
import {createPetInteractionService} from '../js/adventure_pet_interaction_service.js';
const read=path=>JSON.parse(fs.readFileSync(new URL('../data/'+path,import.meta.url)));
const {content}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
const make=(id,ownerId='hero',gender='female')=>createPetInstance(content,{id,ownerId,gender,speciesId:'dragon_green',xp:9000});
function setup(){
    const data=new Map(),reads=[],writes=[];let root=null,serial=0,fail=null;
    const io={head:async()=>structuredClone(root),read:async path=>{reads.push(path);return structuredClone(data.get(path)??null);},
        write:async(path,value)=>{writes.push(path);if(fail?.(path))throw Error('disk full');if(data.has(path)&&JSON.stringify(data.get(path))!==JSON.stringify(value))throw Error('immutable collision');data.set(path,structuredClone(value));},
        publish:async(expected,next)=>{if(fail?.('head'))throw Error('head failed');if((root?.revision??null)!==expected)return false;root=structuredClone(next);return true;}};
    const repo=()=>createPetRepository({io,scope:'guest:role-a',content,revision:()=>`rev-${++serial}`});
    return {io,data,reads,writes,repo,fail:fn=>{fail=fn;}};
}
test('1000 same-species instances use independent files; one scene loads exactly one pet body',async()=>{
    const s=setup(),r=s.repo(),pets=Array.from({length:1000},(_,i)=>make(`pet-${String(i).padStart(4,'0')}`));
    await r.commit(pets.map(pet=>({pet,expectedPath:null})));
    assert.equal((await r.head()).pages.length,10);assert.equal(s.writes.filter(p=>p.startsWith('pets/')).length,1000);
    r.evict();s.reads.length=0;
    const [result]=await r.scene(['pet-0510']);assert.equal(result.pet.id,'pet-0510');
    assert.equal(s.reads.filter(p=>p.startsWith('pets/')).length,1);
    assert.equal(s.reads.filter(p=>p.startsWith('pages/')).length,1);
    s.reads.length=0;await r.listPage(8);assert.equal(s.reads.filter(p=>p.startsWith('pets/')).length,0);
});
test('one changed pet reuses all untouched index pages and pet files',async()=>{
    const s=setup(),r=s.repo();await r.commit(Array.from({length:210},(_,i)=>({pet:make(`p${String(i).padStart(3,'0')}`),expectedPath:null})));
    const before=await r.head(),row=await r.get('p105');row.pet.cooldownUntil=12345;s.writes.length=0;
    await r.commit([{pet:row.pet,expectedPath:row.path}]);const after=await r.head();
    assert.equal(s.writes.filter(p=>p.startsWith('pets/')).length,1);assert.equal(s.writes.filter(p=>p.startsWith('pages/')).length,1);
    assert.equal(after.pages[0].path,before.pages[0].path);assert.equal(after.pages[2].path,before.pages[2].path);
});
test('unchanged save is a no-op; loaded copies cannot mutate cached data',async()=>{
    const s=setup(),r=s.repo();await r.commit([{pet:make('a'),expectedPath:null}]);
    const row=await r.get('a'),before=s.writes.length;
    assert.equal((await r.commit([{pet:row.pet,expectedPath:row.path}])).changed,false);assert.equal(s.writes.length,before);
    row.pet.gender='male';assert.equal((await r.get('a')).pet.gender,'female');
});
test('write failure cannot publish half of a parent/baby transaction, retry succeeds once',async()=>{
    const s=setup(),r=s.repo();let a=make('a'),b=make('b','npc','male');const now=Date.UTC(2026,8,27),scene={zone:'camp',distance:10,anchor:{x:1,y:1},walkable:true};
    for(let day=0;day<3;day++)[a,b]=interactPets(a,b,{kind:'owner-dialogue',completed:true,now:now+day*86400000,scene},content).pets;
    await r.commit([a,b].map(pet=>({pet,expectedPath:null})));
    const old=await r.getMany(['a','b']),born=breedPets(a,b,{now:now+2*86400000,scene,babyId:'baby'},content);
    const changes=[...born.pets.map((pet,i)=>({pet,expectedPath:old[i].path})),{pet:born.baby,expectedPath:null}],head=await r.head();
    s.fail(path=>path.includes('pets/')&&path.includes('62-61-62-79'));
    await assert.rejects(r.commit(changes),/disk full/);assert.deepEqual(await r.head(),head);assert.equal(await r.get('baby'),null);assert.equal((await r.get('a')).pet.cooldownUntil,0);
    s.fail(null);await r.commit(changes);assert.equal((await r.get('baby')).pet.ownerId,null);
    await assert.rejects(r.commit(changes),/已变化/);
});
test('concurrent tabs cannot both adopt the same baby',async()=>{
    const s=setup(),r=s.repo();
    const baby=createPetInstance(content,{id:'baby',ownerId:'temp',speciesId:'dragon_green'});
    baby.ownerId=null;baby.birth={parents:['a','b'],at:1,seed:1,zone:'camp',anchor:{x:0,y:0},adoptedAt:null};
    await r.commit([{pet:baby,expectedPath:null}]);
    const other=s.repo(),x=await r.get('baby'),y=await other.get('baby');
    const first=adoptPet(x.pet,{ownerId:'hero',now:2,zone:'camp'},content),second=adoptPet(y.pet,{ownerId:'hero',now:2,zone:'camp'},content);
    const results=await Promise.allSettled([r.commit([{pet:first.pet,expectedPath:x.path}]),other.commit([{pet:second.pet,expectedPath:y.path}])]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await r.get('baby')).pet.ownerId,'hero');
});
test('feeding group grants only host-to-arrival marks and repeated pairs do not double count',async()=>{
    const s=setup(),r=s.repo(),service=createPetInteractionService({repository:r,content,newId:()=> 'unused-baby'});
    await r.commit([make('hero'),make('npc-a','npc-a','male'),make('npc-b','npc-b','female')].map(pet=>({pet,expectedPath:null})));
    const scene={zone:'camp',distance:20,anchor:{x:0,y:0},walkable:true};
    const result=await service.interact({pairs:[{ids:['hero','npc-a'],scene},{ids:['hero','npc-b'],scene},{ids:['npc-a','hero'],scene}],event:{friendPetIds:['npc-a','npc-b'],kind:'manual-feed',completed:true,confirmedOwners:['npc-a','npc-b'],now:Date.UTC(2026,8,27)}});
    assert.equal(result.effects.length,2);assert.equal((await r.get('hero')).pet.memories.length,2);
    assert.deepEqual((await r.get('npc-a')).pet.memories.map(row=>row.otherId),['hero']);
    assert.deepEqual((await r.get('npc-b')).pet.memories.map(row=>row.otherId),['hero']);
});
test('two eligible partners in one transaction produce only one baby; map references move on adoption',async()=>{
    const s=setup(),r=s.repo();let hero=make('hero'),a=make('npc-a','npc-a','male'),b=make('npc-b','npc-b','male');
    const scene={zone:'camp',distance:20,anchor:{x:0,y:0},walkable:true},now=Date.UTC(2026,8,27);
    for(let day=0;day<3;day++){
        [hero,a]=interactPets(hero,a,{kind:'owner-dialogue',completed:true,now:now+day*86400000,scene},content).pets;
        [hero,b]=interactPets(hero,b,{kind:'owner-dialogue',completed:true,now:now+day*86400000,scene},content).pets;
    }
    await r.commit([hero,a,b].map(pet=>({pet,expectedPath:null})));
    let serial=0;const service=createPetInteractionService({repository:r,content,newId:()=>`baby-${++serial}`});
    const result=await service.interact({pairs:[{ids:['hero','npc-b'],scene},{ids:['hero','npc-a'],scene}],event:{friendPetIds:['npc-a','npc-b','b'],kind:'owner-dialogue',completed:true,now:now+2*86400000}});
    assert.equal(result.babies.length,1);assert(result.babies[0].birth.parents.includes('npc-b'));
    assert.equal((await r.babies('camp')).rows.length,1);assert.equal((await r.babies('town')).rows.length,0);
    const baby=result.babies[0];await service.adopt(baby.id,{ownerId:'hero',now:now+2*86400000,zone:'camp'});
    assert.equal((await r.babies('camp')).rows.length,0);assert.equal((await r.get(baby.id)).pet.ownerId,'hero');
    assert.equal((await service.adopt(baby.id,{ownerId:'hero',now:now+2*86400000,zone:'camp'})).adopted,false);
});
test('failed service batch emits no successful result and cannot advance one parent alone',async()=>{
    const s=setup(),r=s.repo();await r.commit([make('a'),make('b','npc','male')].map(pet=>({pet,expectedPath:null})));
    const service=createPetInteractionService({repository:r,content}),scene={zone:'camp',distance:10};
    s.fail(path=>path==='head');await assert.rejects(service.interact({pairs:[{ids:['a','b'],scene}],event:{friendPetIds:['npc-a','npc-b','b'],kind:'owner-dialogue',completed:true,now:Date.UTC(2026,8,27)}}),/head failed/);
    assert.equal(service.busy,false);assert.equal((await r.get('a')).pet.memories.length,0);assert.equal((await r.get('b')).pet.memories.length,0);
});
test('missing or corrupted pet file is not treated as an empty collection',async()=>{
    const s=setup(),r=s.repo();await r.commit([{pet:make('a'),expectedPath:null}]);const row=await r.get('a');s.data.delete(row.path);r.evict();
    await assert.rejects(r.get('a'),/缺失/);await assert.rejects(r.commit([{pet:make('a'),expectedPath:null}]),/缺失/);
});
test('cross-role files and unsafe index references are rejected',async()=>{
    const s=setup(),r=s.repo();await r.commit([{pet:make('a'),expectedPath:null}]);const row=await r.get('a');s.data.get(row.path).scope='other';r.evict();
    await assert.rejects(r.get('a'),/身份/);
    const foreign=createPetRepository({io:s.io,scope:'other',content});await assert.rejects(foreign.head(),/身份/);
});
test('reference checks prevent stale writes; storage errors propagate and leave manifest untouched',async()=>{
    const s=setup(),r=s.repo();await r.commit([{pet:make('a'),expectedPath:null}]);const before=await r.head(),row=await r.get('a');
    await assert.rejects(r.commit([{pet:row.pet,expectedPath:null}]),/已变化/);
    await assert.rejects(r.commit([{pet:row.pet,expectedPath:row.path}],{expectedRevision:'stale'}),/已变化/);
    row.pet.cooldownUntil=5;s.fail(path=>path==='head');await assert.rejects(r.commit([{pet:row.pet,expectedPath:row.path}]),/head failed/);
    assert.deepEqual(await r.head(),before);
});
test('closed repository rejects in-flight responses after role switch',async()=>{
    const s=setup(),r=s.repo();await r.commit([{pet:make('a'),expectedPath:null}]);
    let release;const io={...s.io,read:path=>new Promise(resolve=>{release=async()=>resolve(await s.io.read(path));})};
    const pendingRepo=createPetRepository({io,scope:'guest:role-a',content}),pending=pendingRepo.get('a');
    while(!release)await new Promise(resolve=>setImmediate(resolve));pendingRepo.close();await release();
    await assert.rejects(pending,/已切换/);
});
