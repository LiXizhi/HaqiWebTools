import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import { prepareDebugEdit, debugFields } from '../js/adventure_debug_core.js';
import { storeDebugEdit, restoreDebugBackup, DEBUG_BACKUP_KEY } from '../js/adventure_debug.js';
import { SAVE_KEY } from '../js/adventure_assets.js';
const c=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url)));
const hero=()=>A.createAdventure(c);
test('level and XP synchronize and currencies persist without modifying the input save',()=>{
    const s=hero(),old=structuredClone(s);
    const r=prepareDebugEdit(s,c,{level:7,'inventory:100':23456,'inventory:17213':9876});
    assert.deepEqual(s,old);assert.equal(r.save.level,7);assert.equal(r.save.xp,c.progression.xpThresholds[6]);
    assert.equal(r.save.inventory[100],23456);assert.equal(r.save.inventory[17213],9876);
    assert.deepEqual(A.parseSave(JSON.stringify(r.save),c),r.save);assert.ok(r.changes.some(f=>f.id==='xp'));
    assert.equal(prepareDebugEdit(s,c,{xp:c.progression.xpThresholds[4]+1}).save.level,5);
    assert.throws(()=>prepareDebugEdit(s,c,{level:2,xp:0}),/不一致/);
});
test('removing bag and staff repairs equipment, deck and upgrades without deleting owned cards',()=>{
    let s=prepareDebugEdit(hero(),c,{level:10,'inventory:24003':1,'inventory:1912':1,'upgrade:1912':3}).save;
    A.applyAction(s,c,{type:'equip',itemId:24003});A.applyAction(s,c,{type:'equip',itemId:1912});s.deck=A.recommendedDeck(s,c);
    const r=prepareDebugEdit(s,c,{'inventory:24003':0,'inventory:1912':0});
    assert.deepEqual(r.save.equipment,{});assert.deepEqual(r.save.upgrades,{});
    assert.equal(r.save.deck.reduce((n,r)=>n+r.count,0),10);assert.deepEqual(r.save.cards,s.cards);
    assert.ok(r.notes.length>=3);assert.doesNotThrow(()=>A.parseSave(r.save,c));
});
test('lowering level unequips restricted gear but retains learned cards',()=>{
    const s=prepareDebugEdit(hero(),c,{level:8,'inventory:1912':1}).save;A.applyAction(s,c,{type:'equip',itemId:1912});
    const r=prepareDebugEdit(s,c,{level:1});assert.equal(r.save.equipment[11],undefined);assert.deepEqual(r.save.cards,s.cards);
});
test('invalid numbers, unknown fields and combat edits are rejected atomically',()=>{
    const s=hero(),old=structuredClone(s);
    for(const patch of [{level:0},{level:999},{xp:NaN},{xp:Infinity},{xp:1.5},{'inventory:100':-1},{'inventory:100':Number.MAX_SAFE_INTEGER+1},{seed:1},{'inventory:9999999':1},{'upgrade:1912':2}])assert.throws(()=>prepareDebugEdit(s,c,patch));
    assert.deepEqual(s,old);A.beginEncounter(s,c,'fire-scout');assert.throws(()=>prepareDebugEdit(s,c,{xp:1}),/当前战斗/);
});
test('card quantities adjust configured copies, and batch field order does not matter',()=>{
    const s=hero(),key=s.deck[0].key;const r=prepareDebugEdit(s,c,{[`card:${key}`]:1});
    assert.equal(r.save.deck.find(row=>row.key===key).count,1);
    assert.throws(()=>prepareDebugEdit(s,c,{[`card:${key}`]:0}));
    assert.throws(()=>prepareDebugEdit(s,c,{[`card:${key}`]:4}));
    const a=prepareDebugEdit(s,c,{'upgrade:1912':3,'inventory:1912':1});
    assert.equal(a.save.upgrades[1912],3);
});
function storage(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};}
test('debug backup restores serialized values; a failed backup leaves the main save untouched',()=>{
    const s=hero(),next=prepareDebugEdit(s,c,{'inventory:100':200}).save,store=storage();store.setItem(SAVE_KEY,JSON.stringify(s));
    storeDebugEdit(s,next,store);assert.deepEqual(JSON.parse(store.getItem(DEBUG_BACKUP_KEY)),s);
    assert.equal(JSON.parse(store.getItem(SAVE_KEY)).inventory[100],200);
    const restored=restoreDebugBackup(next,c,store);assert.deepEqual(restored.inventory,s.inventory);assert.equal(restored.revision,next.revision+1);
    const before=store.getItem(SAVE_KEY),bad={getItem:store.getItem,setItem:()=>{throw Error('quota');}};
    assert.throws(()=>storeDebugEdit(s,next,bad),/quota/);assert.equal(store.getItem(SAVE_KEY),before);
});
test('legacy pet XP uses its existing level mapping and field catalog excludes XP pseudo-item',()=>{
    const s=hero();s.pet={itemId:c.pet.itemId,name:c.pet.name,xp:0,level:0};s.inventory[c.pet.itemId]=1;
    const r=prepareDebugEdit(s,c,{petXp:300});assert.equal(r.save.pet.level,A.petLevel(300,c));
    assert.ok(!debugFields(s,c).some(f=>f.id==='inventory:113'));
});
