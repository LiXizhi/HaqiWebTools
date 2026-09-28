import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createAdventure,applyAction,parseSave,playerSpec} from '../js/adventure_core.js';
import {foodInfo,tickCare,addPet,petXpLevel} from '../js/adventure_pets_core.js';
import {checkedProgress} from '../js/adventure_cloud_core.js';
import {splitRoleSave,joinRoleSave} from '../js/adventure_storage_core.js';
import {persistReward} from '../js/adventure_reward_persistence.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url)));
const {content:c,dataset}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
const fresh=()=>{const s=createAdventure(c,{starter:'dragon_green'});s.inventory[990001]=10;s.inventory[17172]=5;s.inventory[17185]=3;s.inventory[17211]=2;return s;};
test('food deposit and withdrawal conserve stock; invalid actions never mutate',()=>{
 const s=fresh();applyAction(s,c,{type:'pet-food-put',slot:0,itemId:17172,count:3});assert.equal(s.inventory[17172],2);assert.equal(s.petFoodSlots[0].count,3);
 for(const action of [{slot:-1,itemId:17172,count:1},{slot:1,itemId:100,count:1},{slot:0,itemId:17185,count:1},{slot:1,itemId:17172,count:3},{slot:1,itemId:17172,count:NaN}]){
  const before=JSON.stringify(s);assert.throws(()=>applyAction(s,c,{type:'pet-food-put',...action}));assert.equal(JSON.stringify(s),before);
 }
 applyAction(s,c,{type:'pet-food-take',slot:0});assert.equal(s.inventory[17172],5);assert.equal(s.petFoodSlots[0],null);
});
test('hungry formation eats left then right with original XP and leaves backpack/resting pets alone',()=>{
 const s=fresh(),pet=s.pets[s.formation[0]],resting=addPet(s,c,'dragon_purple');
 applyAction(s,c,{type:'pet-food-put',slot:0,itemId:17172,count:1});applyAction(s,c,{type:'pet-food-put',slot:1,itemId:17185,count:2});
 pet.hunger=0;resting.hunger=0;s.careAt=1000;tickCare(s,c,playerSpec(s,c),61000,true);
 assert.equal(pet.hunger,40);assert.equal(pet.xp,300);assert.equal(pet.level,petXpLevel(300,c));assert.equal(s.petFoodSlots[0],null);assert.equal(s.petFoodSlots[1].count,2);assert.equal(resting.xp,0);assert.equal(s.inventory[990001],10);
 pet.hunger=29;tickCare(s,c,playerSpec(s,c),121000,true);assert.equal(pet.hunger,98);assert.equal(pet.xp,1500);assert.equal(s.petFoodSlots[1].count,1);
});
test('putting food immediately feeds hungry pets; full pets, offline and battles never eat',()=>{
 const s=fresh(),pet=s.pets[s.formation[0]];pet.hunger=0;applyAction(s,c,{type:'pet-food-put',slot:0,itemId:17211,count:2});assert.equal(pet.hunger,100);assert.equal(pet.xp,2400);assert.equal(s.petFoodSlots[0].count,1);
 pet.hunger=0;s.careAt=1000;tickCare(s,c,playerSpec(s,c),61000,false);assert.equal(s.petFoodSlots[0].count,1);
 s.pendingEncounter={};tickCare(s,c,playerSpec(s,c),121000,true);assert.equal(s.petFoodSlots[0].count,1);assert.throws(()=>applyAction(s,c,{type:'pet-food-take',slot:0}),/战斗/);
});
test('legacy saves do not auto-spend backpack; slots survive validated cloud and split storage',()=>{
 const s=fresh(),pet=s.pets[s.formation[0]];pet.hunger=0;s.careAt=1000;tickCare(s,c,playerSpec(s,c),61000,true);assert.equal(s.inventory[990001],10);
 pet.hunger=100;applyAction(s,c,{type:'pet-food-put',slot:1,itemId:17185,count:3});
 assert.deepEqual(checkedProgress(s,c,dataset).save.petFoodSlots,s.petFoodSlots);
 const parts=splitRoleSave(s);assert.equal(parts.state.petFoodSlots,undefined);assert.deepEqual(joinRoleSave(parts.state,parts,c).petFoodSlots,s.petFoodSlots);
 const bad=structuredClone(s);bad.petFoodSlots[1].count=-1;assert.throws(()=>parseSave(bad,c),/食槽/);
});
test('ration bulk buying has exact cost and failed persistence leaves live inventory intact',()=>{
 const s=fresh();s.inventory[100]=1000;const before=structuredClone(s),action={type:'pet-food-put',slot:0,itemId:17172,count:2};
 assert.throws(()=>persistReward(s,c,action,{}, {getItem:()=>null,setItem:()=>{throw Error('quota');}}));assert.deepEqual(s,before);
 applyAction(s,c,{type:'buy',productId:'supply:17172',count:10});assert.equal(s.inventory[100],1000-foodInfo(c,17172).price*10);assert.equal(s.inventory[17172],5);assert.deepEqual(s.petFoodSlots[0],{itemId:17172,count:10});
 assert.equal(s.transactions.at(-1).count,10);assert.doesNotThrow(()=>parseSave(s,c));
});

test('new rations fill only empty trays and returned food stays in backpack',()=>{
 const s=fresh();s.inventory[100]=10000;
 for(const id of [17172,17185,17211])applyAction(s,c,{type:'buy',productId:'supply:'+id,count:2});
 assert.deepEqual(s.petFoodSlots,[{itemId:17172,count:2},{itemId:17185,count:2}]);
 assert.equal(s.inventory[17211],4);
 applyAction(s,c,{type:'pet-food-take',slot:0});assert.equal(s.petFoodSlots[0],null);
 s.mountId=1;applyAction(s,c,{type:'dismount'});
 assert.equal(s.petFoodSlots[0],null);
});
test('real meals complete camp feeding, XP alone does not, and early meals survive reload',()=>{
 const s=fresh();for(let id=63000;id<=63008;id++)s.quests[id]={accepted:true,claimed:true,progress:{}};
 const pet=s.pets[s.formation[0]];pet.xp=300;pet.level=petXpLevel(pet.xp,c);
 applyAction(s,c,{type:'accept',questId:63009,npcId:36202});
 assert.equal(s.quests[63009].progress['action:79019'],undefined);
 pet.hunger=20;applyAction(s,c,{type:'pet-food-put',slot:0,itemId:17172,count:2});
 assert.equal(s.quests[63009].progress['action:79019'],1);
 const reload=structuredClone(s);reload.quests={};assert.equal(parseSave(reload,c).tips.petFed,true);
 const early=fresh();early.pets[early.formation[0]].hunger=20;
 applyAction(early,c,{type:'pet-food-put',slot:0,itemId:17172,count:1});
 for(let id=63000;id<=63008;id++)early.quests[id]={accepted:true,claimed:true,progress:{}};
 applyAction(early,c,{type:'accept',questId:63009,npcId:36202});
 assert.equal(early.quests[63009].progress['action:79019'],1);
});
test('egg reward grants companion directly; old egg migrates once and hatch goal uses possession',()=>{
 const s=fresh();s.inventory[17307]=1;
 const loaded=parseSave(s,c);assert.ok(loaded.pet);assert.equal(loaded.inventory[17307],0);
 assert.equal(Object.values(loaded.pets).filter(p=>p.speciesId==='legacy_gululu').length,1);
 assert.deepEqual(parseSave(loaded,c).pets,loaded.pets);
 for(let id=63000;id<=63007;id++)loaded.quests[id]={accepted:true,claimed:true,progress:{}};
 applyAction(loaded,c,{type:'accept',questId:63008,npcId:36211});
 assert.equal(loaded.quests[63008].progress['action:hatch-pet'],1);
});
test('tray can feed a hungry resting pet without changing formation',()=>{
 const s=fresh(),pet=addPet(s,c,'dragon_purple');pet.hunger=0;
 applyAction(s,c,{type:'pet-food-put',slot:0,itemId:17172,count:2});
 applyAction(s,c,{type:'pet-food-feed',slot:0,petId:'dragon_purple'});
 assert.equal(pet.hunger,40);assert.equal(s.petFoodSlots[0].count,1);assert.equal(s.tips.petFed,true);
});
