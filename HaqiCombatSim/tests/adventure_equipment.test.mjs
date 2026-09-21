import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {useCard} from '../js/combat_cards_core.js';
import {signedAttribute,unsupportedEquipmentStats,visibleEquipmentSummary} from '../js/adventure_equipment_core.js';
import * as A from '../js/adventure_core.js';
import { equipmentSummary, previewEquipment, equipmentAttributes, equipmentCards } from '../js/adventure_equipment_core.js';
import { createPveBattle, restorePveBattle } from '../js/combat_pve_core.js';
const content=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url)));
const dataset=JSON.parse(fs.readFileSync(new URL('../data/adventure/combat.json',import.meta.url)));
function hero(){const s=A.createAdventure(content);s.xp=4654;A.syncProgression(s,content);s.inventory={1240:1,1250:1,1260:1,1912:1,24003:1,17213:500};return s;}
const act=(s,type,props)=>A.applyAction(s,content,{type,...props});
test('equipped healing boosts increase actual card healing and socket stats use the same mapping',()=>{
    const copy=structuredClone(content),save=hero();
    const measure=()=>{
        const arena=createPveBattle({dataset,player:A.playerSpec(save,copy),monsters:[copy.monsters['fire-scout']],seed:812});
        const unit=arena.sides.near[0];unit.hp=1;unit.pips={normal:7,power:0};
        const card=arena.resolved.cards.Life_SingleHeal_Level0;
        assert.ok(card);useCard(arena,unit,{...card,accuracy:1000},unit);
        return unit.hp;
    };
    const base=measure();copy.items[1240].stats[182]=20;copy.items[1240].stats[183]=10;
    A.applyAction(save,copy,{type:'equip',itemId:1240});assert.ok(measure()>base);
    copy.items[99991]={id:99991,stats:{182:3,183:4}};
    save.equipmentInstances.find(row=>row.gsid===1240).serverdata.gem={holecnt:0,ins:[99991]};
    assert.equal(A.playerSpec(save,copy).stats.outputHealPct,23);
    assert.equal(A.playerSpec(save,copy).stats.inputHealPct,14);
});
test('compact equipment summary preserves primary stats and nonzero secondary stats',()=>{
    const save=hero(),rows=visibleEquipmentSummary(save,content);
    assert.ok(rows.some(row=>row.key==='damagePct'));
    assert.ok(!rows.some(row=>row.key==='ice.damagePct'));
    const copy=structuredClone(content);copy.items[1240].stats={113:9};A.applyAction(save,copy,{type:'equip',itemId:1240});
    assert.equal(visibleEquipmentSummary(save,copy).find(row=>row.key==='ice.damagePct').value,9);
});
test('off-school equipment bonuses appear in replacement comparison',()=>{
    const copy=structuredClone(content),save=hero();copy.items[1240].stats={113:9,121:4};
    const rows=previewEquipment(save,copy,{type:'equip',itemId:1240}).rows;
    assert.equal(rows.find(row=>row.key==='ice.damagePct').delta,9);
    assert.equal(rows.find(row=>row.key==='ice.resistPct').delta,4);
    assert.equal(rows.find(row=>row.key==='damagePct').delta,0);
});
test('unsupported attribute reports exclude metadata, healing and zero values',()=>{
    assert.deepEqual(unsupportedEquipmentStats({stats:{182:12,183:7,137:6,138:10,139:22104,999:4,998:0}}),['999']);
});
test('attribute signs never display plus-minus or positive zero',()=>{
    assert.equal(signedAttribute(12),'+12');assert.equal(signedAttribute(-7),'-7');assert.equal(signedAttribute(0),'0');
});
test('replacement previews combine all-school and own-school stats without mutating inventory',()=>{
    const copy=structuredClone(content),save=hero();copy.items[1240].stats={111:3,112:7,204:2,205:4,212:5,213:6};
    const before=JSON.stringify(save),preview=previewEquipment(save,copy,{type:'equip',itemId:1240});
    for(const [key,value] of [['damagePct',10],['resiliencePct',6],['penetration',11]])assert.equal(preview.rows.find(row=>row.key===key).delta,value);
    assert.equal(JSON.stringify(save),before);
    assert.equal(new Set(preview.rows.map(row=>row.key)).size,preview.rows.length);
});
test('equipment summary includes defensive and absolute school stats from player spec',()=>{
    const save=hero();act(save,'equip',{itemId:1240});
    const stats=A.playerSpec(save,content).stats,rows=equipmentSummary(save,content);
    for(const key of ['resiliencePct','penetration','damageAbs','resistAbs'])assert.equal(rows.find(row=>row.key===key).value,(stats[key].all||0)+(stats[key][save.school]||0));
});
test('equipment summary includes healing and global combat modifiers',()=>{
    const save=hero(),stats=A.playerSpec(save,content).stats,rows=equipmentSummary(save,content);
    for(const key of ['outputHealPct','inputHealPct','hitPct','dodgePct','penetrationReceive','critRatioBonus'])assert.equal(rows.find(row=>row.key===key).value,stats[key]||0);
});
test('source healing stats 182 and 183 enter equipment and replacement previews',()=>{
    const copy=structuredClone(content),save=hero();
    copy.items[1240].stats[182]=12;copy.items[1240].stats[183]=7;
    const preview=previewEquipment(save,copy,{type:'equip',itemId:1240});
    assert.equal(preview.rows.find(row=>row.key==='outputHealPct').delta,12);
    assert.equal(preview.rows.find(row=>row.key==='inputHealPct').delta,7);
    A.applyAction(save,copy,{type:'equip',itemId:1240});
    assert.equal(A.playerSpec(save,copy).stats.outputHealPct,12);
    assert.equal(A.playerSpec(save,copy).stats.inputHealPct,7);
});
test('legacy active battles retain pre-healing equipment rules until the next encounter',()=>{
    const copy=structuredClone(content),save=hero();copy.items[1240].stats[182]=12;
    A.applyAction(save,copy,{type:'equip',itemId:1240});A.beginEncounter(save,copy,'fire-scout');
    delete save.pendingEncounter.equipmentStatsVersion;save.pendingEncounter.player.stats.outputHealPct=0;
    assert.doesNotThrow(()=>A.parseSave(save,copy));
    assert.equal(A.playerSpec(save,copy).stats.outputHealPct,0);
    A.applyAction(save,copy,{type:'retreat'});A.beginEncounter(save,copy,'fire-scout');
    assert.equal(save.pendingEncounter.player.stats.outputHealPct,12);
    assert.doesNotThrow(()=>A.parseSave(save,copy));
});

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
    assert.deepEqual(s,old);assert.equal(preview.trimmed,10);
    act(s,'unequip',{slot:24});assert.equal(s.deck.reduce((n,r)=>n+r.count,0),10);
    assert.deepEqual(s.cards,old.cards);assert.equal(s.inventory[24003],1);
    assert.deepEqual(s.deck,old.deck.slice(0,5).map(row=>({...row,count:2})));assert.doesNotThrow(()=>A.parseSave(s,content));
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
