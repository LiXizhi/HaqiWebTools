import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import * as A from '../js/adventure_core.js';
import {restorePveBattle} from '../js/combat_pve_core.js';
import {prepareDebugEdit} from '../js/adventure_debug_core.js';
import {partySpecs} from '../js/adventure_pets_core.js';
import {syncEquipmentInstances} from '../js/adventure_equipment_instances_core.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../data/'+name+'.json',import.meta.url)));
const {content:c,dataset:d}=installExpansion(...['adventure/chapter','adventure/combat','adventure/pets','adventure/shop-candidates','kids/cards','kids/charms'].map(read));
const level=(s,n)=>{s.xp=c.progression.xpThresholds[n-1];A.syncProgression(s,c);};

test('duplicate owned bags produce one layout and duplicate layout identities are rejected',()=>{
 const s=A.createAdventure(c);s.inventory[100]=100000;
 const layouts=n=>Array.from({length:n},(_,i)=>({name:`卡包${i+1}`,deck:s.deck.map(row=>({...row}))}));
 const add=n=>A.applyAction(s,c,{type:'deck-layouts',layouts:layouts(n),active:0});
 const before=JSON.stringify(s);
 assert.equal(A.deckLayoutCapacity(s,c),1);
 assert.throws(()=>add(2),/购买/);assert.equal(JSON.stringify(s),before);
 s.inventory[24014]=2;assert.equal(A.deckLayoutCapacity(s,c),1,'underlevel items grant no usable tabs');
 A.applyAction(s,c,{type:'buy',productId:'gear:24001'});
 assert.throws(()=>add(2),/购买/);
 A.applyAction(s,c,{type:'buy',productId:'gear:24001'});
 assert.equal(A.deckLayoutCapacity(s,c),1);
 assert.throws(()=>add(2),/购买/);
 assert.equal(A.parseSave(s,c).deckLayouts.filter(row=>row.bagItemId===24001).length,1);
 const duplicate={...A.parseSave(s,c).deckLayouts.find(row=>row.bagItemId===24001)};
 assert.throws(()=>A.applyAction(s,c,{type:'deck-layouts',layouts:[duplicate,duplicate],active:0}),/一个实例/);
 assert.throws(()=>add(3),/购买/);
 delete s.inventory[24001];syncEquipmentInstances(s,c);
 s.deckLayouts=layouts(2);s.activeDeckLayout=1;
 const legacy=A.parseSave(s,c);A.applyAction(legacy,c,{type:'deck-layouts',layouts:legacy.deckLayouts,active:0});
 assert.equal(legacy.deckLayouts.length,1);
 assert.throws(()=>A.applyAction(legacy,c,{type:'deck-layouts',layouts:layouts(3),active:0}),/购买/);
});

test('original bags use their own level and school attributes at purchase and equip',()=>{
 const s=A.createAdventure(c);s.inventory[100]=100000;
 assert.equal(c.shop.filter(row=>row.slot===24).length,21);
 assert.equal(c.shop.find(row=>row.itemId===24010).level,20);
 assert.equal(c.shop.find(row=>row.itemId===24005).school,'ice');
 const before=JSON.stringify(s);
 assert.throws(()=>A.applyAction(s,c,{type:'buy',productId:'gear:24010'}),/等级/);
 assert.equal(JSON.stringify(s),before);
 s.inventory[24010]=1;assert.throws(()=>A.applyAction(s,c,{type:'equip',itemId:24010}),/等级/);
 level(s,20);s.inventory[24005]=1;
 assert.throws(()=>A.applyAction(s,c,{type:'equip',itemId:24005}),/学系/);
 A.applyAction(s,c,{type:'equip',itemId:24010});
 assert.deepEqual(A.deckLimits(s,c),{capacity:30,eachCapacity:4,handSize:8});
 level(s,50);assert.equal(A.deckLimits(s,c).capacity,30,'level alone does not upgrade the item');
});

test('five copies are learned qualifications and survive save, debug, battle and smaller bags',()=>{
 const s=A.createAdventure(c);level(s,30);s.inventory[100]=100000;
 A.applyAction(s,c,{type:'buy',productId:'gear:24014'});
 const keys=Object.keys(s.cards).slice(0,9),deck=keys.map(key=>({key,count:5}));
 A.applyAction(s,c,{type:'deck-layouts',bagItemId:24014,layouts:[{name:'满卡包',deck}],active:0});
 assert.equal(s.deck.reduce((n,row)=>n+row.count,0),45);
 assert.equal(s.cards[keys[0]],3,'legacy qualification values need no rewrite');
 assert.deepEqual(A.parseSave(s,c).deck,deck);
 const edited=prepareDebugEdit(s,c,{'inventory:100':99999}).save;assert.deepEqual(edited.deck,deck);
 const {checkpoint}=A.beginEncounter(s,c,'trial:1'),battle=restorePveBattle(d,c,checkpoint);
 assert.equal(battle.unitsById.hero.deckSpec.reduce((n,row)=>n+row.count,0),45);
 assert.deepEqual(A.parseSave(s,c).pendingEncounter,checkpoint);
 A.applyAction(s,c,{type:'retreat'});s.inventory[24001]=1;
 A.applyAction(s,c,{type:'equip',itemId:24001});
 assert.equal(s.deck.reduce((n,row)=>n+row.count,0),12);assert.ok(s.deck.every(row=>row.count<=2));
 assert.ok(keys.every(key=>s.cards[key]));assert.equal(s.inventory[24014],1);
 A.applyAction(s,c,{type:'equip',itemId:24014});assert.deepEqual(s.deck,deck);
});

test('bag selection and deck save reject invalid ownership and excess copies atomically',()=>{
 const s=A.createAdventure(c);level(s,30);s.inventory[24014]=1;
 for(const [bagItemId,count] of [[24017,5],[24014,6]]){
  const before=JSON.stringify(s);
  assert.throws(()=>A.applyAction(s,c,{type:'deck-layouts',bagItemId,layouts:[{name:'方案',deck:[{key:s.deck[0].key,count}]}],active:0}));
  assert.equal(JSON.stringify(s),before);
 }
});

test('legacy underlevel bags return to inventory, while pending battles migrate after retreat',()=>{
 const s=A.createAdventure(c);delete s.bagRulesVersion;s.inventory[24014]=1;s.equipment[24]=24014;
 const migrated=A.parseSave(s,c);assert.equal(migrated.equipment[24],undefined);assert.equal(migrated.inventory[24014],1);
 assert.equal(migrated.tips.bagRulesAdjusted,true);
 // A legacy checkpoint carried the old unrestricted bag in its player specification.
 s.pendingEncounter={};const player=A.playerSpec(s,c);s.pendingEncounter=null;
 const {checkpoint}=A.beginEncounter(s,c,'trial:1');checkpoint.player=player;
 checkpoint.party=partySpecs(s,c,player);
 const restored=A.parseSave(s,c);assert.equal(restored.equipment[24],24014);
 assert.doesNotThrow(()=>restorePveBattle(d,c,restored.pendingEncounter));
 A.applyAction(restored,c,{type:'retreat'});assert.equal(restored.equipment[24],undefined);
 assert.equal(restored.inventory[24014],1);assert.equal(restored.bagRulesVersion,1);
});
