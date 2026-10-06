import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PET_TRAITS,rollPetTraits,petTraitParams,mergePetTraits,applyPetTraitStats,petHungerMultiplier,validatePetTraits} from '../js/adventure_pet_traits_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createAdventure,beginEncounter,recordDecision,parseSave,applyAction,settleParty,playerSpec} from '../js/adventure_core.js';
import {addPet,petMaxHp,partySpecs,tickCare,mergeOwnedPetSpecies} from '../js/adventure_pets_core.js';
import {initializePetWorld,petWorldAction} from '../js/adventure_pet_world_core.js';
import {createPetInstance} from '../js/adventure_pet_interactions_core.js';
import {ownedPetRecords,petSummary} from '../js/adventure_pet_files_core.js';
import {packPetFilesSync,openPetFiles} from '../js/adventure_pet_files.js';
import {durableSave,runtimeValues,restoreRuntime,coreCatalogKey} from '../js/adventure_storage_core.js';
import {restorePveBattle,playPveRound,runeCardsInHand} from '../js/combat_pve_core.js';
import {installRuneCatalog} from '../js/adventure_runes_core.js';
import {drawPetTraitHalo} from '../js/view_pet_traits.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url)));
function setup(){const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));content.monsterArt=read('adventure/monster-art.json');installRuneCatalog(content,read('adventure/runes.json'));return {content,dataset};}
const {content,dataset}=setup();
function fresh(){const save=createAdventure(content,{seed:73,starter:'dragon_green'});initializePetWorld(save,content);return save;}
test('partial BalanceParams trait overrides preserve all other attribute curves',()=>{
 const attack=Array(9).fill(2),params=petTraitParams({balanceParams:{version:'kids',petTraits:{rareChance:0,values:{attack}}}});
 assert.deepEqual(params.values.attack,attack);assert.equal(params.values.frugal[8],45);assert.equal(params.rareChance,0);
});
test('deterministic first-entry rolls prefer progress, remain bounded, and about 5% have legendary halos',()=>{
 const params=petTraitParams(content),owned={attack:4,defense:6,frugal:7};let legendary=0,jackpot=0;
 for(let seed=0;seed<20000;seed++){
  const traits=rollPetTraits(seed,params,owned);assert.deepEqual(traits,rollPetTraits(seed,params,owned));
  assert.ok(Object.keys(traits).length>=1&&Object.keys(traits).length<=3);assert.ok(Object.entries(traits).some(([key,rank])=>rank>(owned[key]||0)));
  const rank=Math.max(...Object.values(traits));legendary+=rank>6;jackpot+=rank===9;
 }
 assert.ok(legendary>900&&legendary<1100,legendary);assert.ok(jackpot>0);
 const full=Object.fromEntries(Object.keys(PET_TRAITS).map(k=>[k,9]));
 for(let i=0;i<100;i++)assert.notDeepEqual(rollPetTraits(i,params,full),full);
});
test('same-species acquisitions count every capture but merge only the best rank',()=>{
 const save=fresh(),id=save.formation[0],pet=save.pets[id];pet.passiveTraits={attack:3,frugal:5};pet.captureCount=0;pet.obtainedCount=1;
 addPet(save,content,pet.speciesId,0,{captured:true,traits:{attack:9,defense:2}});
 addPet(save,content,pet.speciesId,0,{captured:true,traits:{attack:1,frugal:2}});
 assert.equal(Object.values(ownedPetRecords(save)).length,1);assert.deepEqual(pet.passiveTraits,{attack:9,defense:2,frugal:5});assert.equal(pet.captureCount,2);assert.equal(pet.obtainedCount,3);
 assert.equal(petSummary(pet).passiveTraits.attack,9);assert.throws(()=>validatePetTraits({attack:10}),/标签/);
});
test('all eight tags drive real party stats, max HP and online food consumption',()=>{
 const save=fresh(),pet=save.pets[save.formation[0]],plain={...pet,passiveTraits:{}};
 pet.passiveTraits=Object.fromEntries(Object.keys(PET_TRAITS).map(k=>[k,9]));save.formation=[null,pet.id,null,null];
 const specs=partySpecs(save,content,playerSpec(save,content)),stats=specs[1].stats;
 assert.equal(stats.damagePct.all,60);assert.equal(stats.resistPct.all,30);assert.equal(stats.critPct.all,24);assert.equal(stats.accuracyPct.all,15);assert.equal(stats.powerPipPct,18);assert.equal(stats.outputHealPct,45);
 assert.ok(petMaxHp(pet,content)>=petMaxHp(plain,content)*1.6);assert.ok(Math.abs(petHungerMultiplier(pet,content)-.55)<1e-9);
 pet.hunger=100;tickCare(save,content,specs[0],1000,true);tickCare(save,content,specs[0],61000,true);assert.equal(pet.hunger,99.45);
 assert.equal(applyPetTraitStats(stats,{}).damagePct.all,60);
});
test('traits are absent during world loading, then snapshot owned summary at battle entry and survive retreat/replay',()=>{
 const save=fresh();assert.equal(save.petTraitEncounters,undefined);const pet=save.pets[save.formation[0]];pet.passiveTraits={attack:5,frugal:6};pet.hp=petMaxHp(pet,content);
 beginEncounter(save,content,'wild:dragon_green');const checkpoint=structuredClone(save.pendingEncounter),traits=checkpoint.monsterTraits;
 assert.ok(Object.entries(traits[0]).some(([key,rank])=>rank>(pet.passiveTraits[key]||0)));
 const battle=restorePveBattle(dataset,content,checkpoint);playPveRound(battle,{pass:true});recordDecision(save,{pass:true},battle);
 assert.deepEqual(restorePveBattle(dataset,content,parseSave(save,content).pendingEncounter).events,battle.events);
 applyAction(save,content,{type:'retreat'});beginEncounter(save,content,'wild:dragon_green');assert.deepEqual(save.pendingEncounter.monsterTraits,traits);
 assert.equal(durableSave(save).petTraitEncounters,undefined);assert.deepEqual(restoreRuntime(durableSave(save),content,runtimeValues(save)).petTraitEncounters,save.petTraitEncounters);
});
test('captured labels, count and best ranks survive checkpoint restore and settle exactly once',()=>{
 const save=fresh();save.inventory[23439]=2;beginEncounter(save,content,'wild:dragon_green');
 const b=restorePveBattle(dataset,content,save.pendingEncounter);b.resolved.adventure.catchMinChance=1;b.resolved.adventure.catchMaxChance=1;
 const rune=runeCardsInHand(b)[0],before={...save.pets[save.formation[0]].passiveTraits};playPveRound(b,{...rune,targetId:'mob0'});
 assert.deepEqual(b.capturedTraits,[save.pendingEncounter.monsterTraits[0]]);settleParty(save,content,b);settleParty(save,content,b);
 const pet=save.pets[save.formation[0]];assert.equal(pet.captureCount,1);assert.deepEqual(pet.passiveTraits,mergePetTraits(before,b.capturedTraits[0]));assert.equal(save.inventory[23439],1);
});
test('legacy duplicate merge preserves strongest growth and provenance, survives files without resurrection',async()=>{
 const save=fresh(),keeper=save.pets[save.formation[0]];keeper.passiveTraits={attack:2};keeper.captureCount=2;
 const other=createPetInstance(content,{id:'old-twin',speciesId:keeper.speciesId,ownerId:save.petOwnerId,xp:9000,passiveTraits:{attack:8,defense:4},captureCount:3,obtainedCount:4});save.pets[other.id]={...other,hp:1,hunger:2};save.formation[1]=other.id;
 assert.equal(mergeOwnedPetSpecies(save,content),true);assert.equal(Object.keys(save.pets).length,1);assert.equal(keeper.passiveTraits.attack,8);assert.equal(keeper.xp,9000);assert.equal(keeper.captureCount,5);assert.equal(keeper.legacyMergedPets[0].id,other.id);assert.equal(keeper.legacyMergedPets[0].hp,undefined);assert.equal(save.formation[1],null);
 assert.equal(mergeOwnedPetSpecies(save,content),false);
 const files=new Map();let n=0;const io={read:p=>files.get(p),write:(p,v)=>files.set(p,v)};
 const packed=packPetFilesSync(durableSave(save),'test',content,()=>`v${++n}`,io),loaded=await openPetFiles(packed,'test',content,io);
 assert.equal(Object.keys(ownedPetRecords(loaded)).length,1);assert.equal(loaded.pets[keeper.id].captureCount,5);assert.equal(loaded.pets[keeper.id].passiveTraits.attack,8);
});
test('same-species adoption upgrades the existing pet without a second individual or double reward',()=>{
 const save=fresh(),keeper=save.pets[save.formation[0]],baby=createPetInstance(content,{id:'baby:test',speciesId:keeper.speciesId,ownerId:'birth',passiveTraits:{defense:8}});
 baby.ownerId=null;baby.birth={parents:['mom','dad'],at:1,seed:7,zone:save.zone,anchor:{x:1,y:1},adoptedAt:null};save.petWorld[baby.id]=baby;
 const result=petWorldAction(save,content,{type:'adopt',id:baby.id,now:2});assert.equal(Object.keys(result.save.pets).length,1);assert.equal(result.save.pets[keeper.id].passiveTraits.defense,8);assert.equal(result.save.pets[keeper.id].captureCount,0);
 assert.equal(petWorldAction(result.save,content,{type:'adopt',id:baby.id,now:3}).changed,false);
});
test('only legendary labels draw a halo, using distinct colors and no RNG',()=>{
 const colors=[],ctx=new Proxy({globalAlpha:1},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>{o[k]=v;if(k==='strokeStyle')colors.push(v);return true;}});
 drawPetTraitHalo(ctx,{attack:6});assert.equal(colors.length,0);for(const rank of [7,8,9])drawPetTraitHalo(ctx,{attack:rank});assert.equal(new Set(colors).size,3);
});

test('gathering tag does not change the original combat trait roll or legendary probability',()=>{
 const params=petTraitParams(content);
 for(let seed=0;seed<300;seed++){
  const original=rollPetTraits(seed,{...params,gatheringChance:0});
  const added=rollPetTraits(seed,{...params,gatheringChance:1});
  const {gathering,...combat}=added;
  assert.deepEqual(combat,original);
  assert.equal(Math.max(...Object.values(added)),Math.max(...Object.values(original)));
 }
});
