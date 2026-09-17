import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import { equipmentSummary, previewEquipment, equipmentAttributes, equipmentCards } from '../js/adventure_equipment_core.js';
import { createPveBattle, restorePveBattle } from '../js/combat_pve_core.js';
const content=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url)));
const dataset=JSON.parse(fs.readFileSync(new URL('../data/adventure/combat.json',import.meta.url)));
function hero(){const s=A.createAdventure(content);s.xp=4654;A.syncProgression(s,content);s.inventory={1240:1,1250:1,1260:1,1912:1,24003:1,17213:500};return s;}
const act=(s,type,props)=>A.applyAction(s,content,{type,...props});

test('all chapter slots equip, remove, persist and reproduce actual battle HP and spells',()=>{
    const s=hero();
    for(const itemId of [1240,1250,1260,1912,24003])act(s,'equip',{itemId});
    const battle=createPveBattle({dataset,player:A.playerSpec(s,content),monsters:[content.monsters['fire-scout']]});
    assert.equal(equipmentSummary(s,content).find(r=>r.key==='hp').value,battle.sides.near[0].maxHp);
    assert.equal(A.playerSpec(s,content).fixedCards.length,4);
    assert.deepEqual(A.parseSave(s,content),s);
    const inventory=structuredClone(s.inventory);
    for(const slot of [2,5,7,11,24])act(s,'unequip',{slot});
    assert.deepEqual(s.inventory,inventory);assert.equal(A.playerSpec(s,content).fixedCards.length,0);
    assert.equal(A.playerSpec(s,content).stats.hpFlat,0);assert.deepEqual(A.parseSave(s,content),s);
});
test('preview is side-effect free and bag removal trims only configured cards in order',()=>{
    const s=hero();act(s,'equip',{itemId:24003});s.deck=A.recommendedDeck(s,content);
    assert.equal(s.deck.reduce((n,r)=>n+r.count,0),20);
    const old=structuredClone(s),preview=previewEquipment(s,content,{type:'unequip',slot:24});
    assert.deepEqual(s,old);assert.equal(preview.trimmed,6);
    act(s,'unequip',{slot:24});assert.equal(s.deck.reduce((n,r)=>n+r.count,0),14);
    assert.deepEqual(s.cards,old.cards);assert.equal(s.inventory[24003],1);
    assert.deepEqual(s.deck.slice(0,4),old.deck.slice(0,4));assert.doesNotThrow(()=>A.parseSave(s,content));
});
test('invalid ownership, school, level, slot and non-equipment actions are atomic',()=>{
    const s=A.createAdventure(content);s.inventory[1912]=1;s.inventory[1236]=1;s.inventory[17213]=10;
    for(const action of [{type:'equip',itemId:1912},{type:'equip',itemId:1236},{type:'equip',itemId:1240},{type:'equip',itemId:17213},{type:'unequip',slot:99}]){
        const old=structuredClone(s);assert.throws(()=>A.applyAction(s,content,action));assert.deepEqual(s,old);
    }
});
test('upgrade costs and cumulative stats survive unequip and re-equip without duplication',()=>{
    const s=hero();act(s,'equip',{itemId:1912});
    for(const cost of [70,140,280]){const before=s.inventory[17213];act(s,'upgrade',{itemId:1912});assert.equal(s.inventory[17213],before-cost);}
    assert.equal(A.playerSpec(s,content).stats.damagePct.all,5);
    assert.equal(equipmentAttributes(content.items[1912],s,content).find(r=>r.label.startsWith('强化')).value,3);
    const old=structuredClone(s);assert.throws(()=>act(s,'upgrade',{itemId:1912}));assert.deepEqual(s,old);
    act(s,'unequip',{slot:11});assert.equal(A.playerSpec(s,content).stats.damagePct.all||0,0);
    act(s,'equip',{itemId:1912});assert.equal(A.playerSpec(s,content).stats.damagePct.all,5);
    assert.deepEqual(A.parseSave(s,content),s);
});
test('equipment changes are blocked during combat and checkpoints remain replayable',()=>{
    const s=hero();act(s,'equip',{itemId:1912});A.beginEncounter(s,content,'fire-scout');
    const old=structuredClone(s);
    for(const action of [{type:'unequip',slot:11},{type:'equip',itemId:1240},{type:'upgrade',itemId:1912}])assert.throws(()=>A.applyAction(s,content,action),/当前战斗/);
    assert.deepEqual(s,old);const restored=restorePveBattle(dataset,content,A.parseSave(s,content).pendingEncounter);
    assert.equal(restored.sides.near[0].maxHp,equipmentSummary(s,content).find(r=>r.key==='hp').value);
});
test('same-slot replacement preserves the previous item and removes its stats and fixed cards',()=>{
    const c=structuredClone(content),s=hero();
    c.items[99999]={...c.items[1240],id:99999,stats:{101:12,137:6,138:1}};s.inventory[99999]=1;
    A.applyAction(s,c,{type:'equip',itemId:1240});
    const p=previewEquipment(s,c,{type:'equip',itemId:99999});assert.equal(p.rows.find(r=>r.key==='hp').delta,-18);
    A.applyAction(s,c,{type:'equip',itemId:99999});assert.equal(s.inventory[1240],1);assert.equal(s.equipment[2],99999);
    assert.equal(A.playerSpec(s,c).stats.hpFlat,12);assert.deepEqual(A.playerSpec(s,c).fixedCards,[]);
    assert.deepEqual(equipmentCards(c.items[1240],c),[c.cardItems[22391]]);
});
