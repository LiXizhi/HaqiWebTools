import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createAdventure,beginEncounter} from '../js/adventure_core.js';
import * as P from '../js/adventure_pet_interactions_core.js';
const read=path=>JSON.parse(fs.readFileSync(new URL('../data/'+path,import.meta.url)));
const {content}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
const DAY=86400000,T=Date.UTC(2026,8,27,2);
const pet=(id='a',gender='female',level=25,speciesId='dragon_green')=>P.createPetInstance(content,{id,ownerId:`owner:${id}`,gender,speciesId,xp:30*level*(level-1)/2});
const scene={zone:'camp',distance:20,anchor:{x:100,y:100},walkable:true};
const touch=(a,b,now=T,extra={})=>P.interactPets(a,b,{kind:'owner-dialogue',now,scene,completed:true,...extra},content);
const ready=()=>{let pair=[pet(),pet('b','male')];for(const day of [0,2,4])pair=touch(...pair,T+day*DAY).pets;return pair;};

test('ordinary proximity, incomplete talk, automatic feeding, battle and same owner do not grant marks',()=>{
    const a=pet(),b=pet('b','male'),before=JSON.stringify([a,b]);
    for(const extra of [{kind:'proximity'},{completed:false},{kind:'auto-feed'},{scene:{...scene,inBattle:true}},{scene:{...scene,distance:101}}])assert.equal(touch(a,b,T,extra).markAdded,false);
    assert.equal(touch(a,{...b,ownerId:a.ownerId}).markAdded,false);
    assert.equal(JSON.stringify([a,b]),before);
});
test('one mark per Beijing day across dialogue and feeding, no consecutive-day requirement',()=>{
    const first=touch(pet(),pet('b','male'));
    assert.equal(first.markAdded,true);
    const same=touch(...first.pets,T+1000,{kind:'manual-feed'});assert.equal(same.markAdded,false);
    assert.equal(same.pets[0].memories[0].lastAt,T+1000);
    assert.equal(ready()[0].memories[0].available,3);
    let pair=touch(pet(),pet('b','male'),Date.UTC(2026,8,27,15,59,59)).pets;
    assert.equal(touch(...pair,Date.UTC(2026,8,27,16)).markAdded,true);
    pair=touch(...pair,Date.UTC(2026,8,27,16)).pets;
    assert.equal(touch(...pair,Date.UTC(2026,8,27,15)).markAdded,false);
});
test('all 51 recent memories survive; older ranking fills only remaining capacity',()=>{
    let a=pet();
    for(let i=0;i<51;i++)a=touch(a,pet(`peer${String(i).padStart(2,'0')}`,'male',1+i%50),T+i).pets[0];
    assert.equal(a.memories.length,51);assert.equal(a.memories.at(-1).available,1);
    assert.equal(P.prunePetMemories(a,T+7*DAY,content).memories.length,51);
    const older=P.prunePetMemories(a,T+8*DAY,content);
    assert.equal(older.memories.length,50);assert(!older.memories.some(r=>r.otherId==='peer00'));
    const mixed=structuredClone(a);mixed.memories.forEach((r,i)=>{r.lastAt=i<20?T+8*DAY:T;});mixed.memoryClock=T+8*DAY;
    assert.equal(P.prunePetMemories(mixed,T+8*DAY,content).memories.length,50);
    assert(mixed.memories.slice(0,20).every(r=>P.prunePetMemories(mixed,T+8*DAY,content).memories.some(x=>x.otherId===r.otherId)));
});
test('loading unchanged memory does not dirty time; clock rollback does not evade protection',()=>{
    const a=touch(pet(),pet('b','male')).pets[0];
    assert.deepEqual(P.prunePetMemories(a,T+DAY,content),a);
    assert.deepEqual(P.prunePetMemories(a,T-DAY,content),a);
});
test('one-sided forgetting starts a new epoch and cannot restore progress or grant same-day marks',()=>{
    const [a,b]=ready(),epoch=b.memories[0].epoch;a.memories=[];
    const result=touch(a,b,T+4*DAY);
    assert.equal(result.markAdded,false);assert.equal(result.pets[0].memories[0].available,0);
    assert.notEqual(result.pets[0].memories[0].epoch,epoch);
    const next=touch(...result.pets,T+5*DAY);assert.equal(next.pets[0].memories[0].available,1);
});
test('corrupt matching pair versions reject instead of duplicating progress',()=>{
    const [a,b]=ready();b.memories[0].available--;
    assert.throws(()=>touch(a,b,T+5*DAY),/冲突/);
});
test('adult opposite gender produces one deterministic baby within parental schools',()=>{
    let a=pet(),b=pet('b','male',25,'dragon_orange');
    for(let day=0;day<3;day++)[a,b]=touch(a,b,T+day*DAY).pets;
    const before=JSON.stringify([a,b]),args={now:T+2*DAY,scene,babyId:'baby-1'};
    const born=P.breedPets(a,b,args,content),again=P.breedPets(a,b,args,content);
    assert.deepEqual(born,again);assert.equal(JSON.stringify([a,b]),before);
    assert(['life','fire'].includes(content.pets[born.baby.speciesId].school));
    assert(['male','female'].includes(born.baby.gender));assert.equal(born.baby.level,1);assert.equal(born.baby.ownerId,null);
    assert.equal(born.pets[0].memories[0].total,3);assert.equal(born.pets[0].memories[0].available,0);
    assert.equal(born.pets[0].cooldownUntil,T+5*DAY);
    assert.deepEqual(P.breedPets(b,a,args,content).baby,born.baby);
});
test('both parents cool down against all partners; impressions continue accumulating',()=>{
    let pair=ready();const born=P.breedPets(...pair,{now:T+4*DAY,scene,babyId:'baby-1'},content);
    pair=born.pets;for(const day of [5,6,7])pair=touch(...pair,T+day*DAY).pets;
    assert.equal(P.petPairStatus(...pair,{now:T+7*DAY,scene},content).canBreed,true);
    const other=pet('other','male');let a=born.pets[0],b=other;
    for(const day of [4,5,6])[a,b]=touch(a,b,T+day*DAY).pets;
    assert.equal(P.petPairStatus(a,b,{now:T+7*DAY-1,scene},content).reason,'冷却中');
});
test('young and same gender remain friends, appearance does not override adulthood',()=>{
    const [a,b]=ready();
    assert.equal(P.petPairStatus(a,{...b,level:24},{now:T+4*DAY,scene},content).reason,'玩伴');
    assert.equal(P.petPairStatus(a,{...b,gender:a.gender},{now:T+4*DAY,scene},content).reason,'玩伴');
    assert.equal(P.petPairStatus({...a,appearanceStage:0},b,{now:T+4*DAY,scene},content).canBreed,true);
    assert.equal(P.petPairStatus(a,b,{now:T+4*DAY,scene:{...scene,inBattle:true}},content).canBreed,false);
});
test('invalid birth position or missing school candidate consumes nothing',()=>{
    const pair=ready(),before=JSON.stringify(pair);
    assert.throws(()=>P.breedPets(...pair,{now:T+4*DAY,scene:{...scene,walkable:false},babyId:'baby'},content),/位置/);
    const emptyPool={...content,pets:Object.fromEntries(Object.entries(content.pets).map(([id,pet])=>[id,{...pet,legacy:true}]))};
    assert.throws(()=>P.breedPets(...pair,{now:T+4*DAY,scene,babyId:'baby'},emptyPool),/没有可用宝宝/);
    assert.equal(JSON.stringify(pair),before);
});
test('adoption is idempotent, keeps unique identity and half size until youth',()=>{
    const born=P.breedPets(...ready(),{now:T+4*DAY,scene,babyId:'baby'},content).baby;
    assert.equal(P.petDisplayScale(born,content),.5);
    const result=P.adoptPet(born,{ownerId:'hero',now:T+4*DAY,zone:'camp'},content);
    assert.equal(result.adopted,true);assert.equal(result.pet.id,born.id);assert.equal(born.ownerId,null);
    assert.equal(P.adoptPet(result.pet,{ownerId:'hero',now:T+5*DAY,zone:'camp'},content).adopted,false);
    assert.throws(()=>P.adoptPet(result.pet,{ownerId:'other',now:T+5*DAY,zone:'camp'},content),/已被领养/);
    assert.throws(()=>P.adoptPet(born,{ownerId:'hero',now:T+5*DAY,zone:'town'},content),/场景/);
    assert.equal(P.petDisplayScale({...result.pet,level:10},content),1);
});
test('legacy migration preserves identity, deck and formation; unfinished combat is deferred',()=>{
    const save=createAdventure(content,{seed:812,starter:'dragon_green'});
    save.pets.dragon_green.appearanceStage=0;
    const result=P.migratePetInstances(save,content,{ownerId:'hero'});
    assert.equal(result.pets[0].id,save.pets.dragon_green.id);assert.deepEqual(result.pets[0].deck,save.pets.dragon_green.deck);
    assert.equal(result.formation[0],result.pets[0].id);assert.deepEqual(P.migratePetInstances(save,content,{ownerId:'hero'}),result);
    beginEncounter(save,content,'trial:1');assert.throws(()=>P.migratePetInstances(save,content,{ownerId:'hero'}),/旧战斗/);
});
test('validation rejects duplicate memories, mismatched levels and unknown parent records',()=>{
    const a=touch(pet(),pet('b','male')).pets[0];
    assert.throws(()=>P.validatePetInstance({...a,memories:[...a.memories,...a.memories]},content),/记忆对象/);
    assert.throws(()=>P.validatePetInstance({...a,level:49},content),/等级/);
    assert.throws(()=>P.validatePetInstance({...a,ownerId:null},content),/出生记录/);
});
