import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gearScoreV2} from '../js/combat_formulas_core.js';
import {monsterCombatStats,monsterGearScore} from '../js/combat_power_core.js';
import {createEarthWildEncounter,earthWildTargetPower,restoreEarthWildEncounter} from '../js/adventure_earth_wild_core.js';
import {earthPoint} from '../js/adventure_earth_core.js';
import {createAdventure,playerSpec,beginEncounter,parseSave,syncProgression,applyAction} from '../js/adventure_core.js';
import {equipmentSummary,previewEquipment} from '../js/adventure_equipment_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {restorePveBattle} from '../js/combat_pve_core.js';
import {getDamageBoost,getResist,getDamageBoostAbs} from '../js/combat_unit_core.js';
const read=file=>JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url)));
function setup(){
    const content=read('data/adventure/chapter.json'),dataset=read('data/adventure/combat.json');
    installExpansion(content,dataset,read('data/adventure/pets.json'),read('data/adventure/shop-candidates.json'),read('data/kids/cards.json'),read('data/kids/charms.json'));
    return {content,dataset};
}
test('original V2 gear score uses maximum five-school attack, average defense and level pip chance with one ceil',()=>{
    const stats={powerPipPct:10,damagePct:{all:20,fire:30},damageAbs:{all:5,fire:10},resistPct:{all:10,ice:20},resistAbs:{all:2,storm:10}};
    assert.equal(gearScoreV2({level:20,stats}),321);
    assert.equal(gearScoreV2({level:1,stats:{}}),200);assert.equal(gearScoreV2({level:50,stats:{}}),240);
    assert.equal(gearScoreV2({level:20,stats},'kids',5),299);
    assert.equal(gearScoreV2({level:20,stats:{...stats,hpFlat:99999,critPct:100,damagePct:{...stats.damagePct,balance:99999}}}),321);
});

test('equipment, upgrades, raw absolute stats and UI preview all feed the same player power score',()=>{
    const {content}=setup(),save=createAdventure(content,{school:'fire'});save.xp=4654;syncProgression(save,content);const baseline=gearScoreV2(playerSpec(save,content));
    // Keep a real equippable source and adjust test fixture stats only.
    content.items[1912].stats={...content.items[1912].stats,111:20,151:10,119:10};
    save.inventory[1912]=1;const preview=previewEquipment(save,content,{type:'equip',itemId:1912});
    assert.ok(preview.rows.find(r=>r.key==='gearScore').delta>0);
    save.equipment[11]=1912;
    assert.ok(gearScoreV2(playerSpec(save,content))>baseline);assert.equal(playerSpec(save,content).stats.damageAbs.all,10);
    assert.equal(equipmentSummary(save,content).find(r=>r.key==='gearScore').value,gearScoreV2(playerSpec(save,content)));
    const beforeUpgrade=gearScoreV2(playerSpec(save,content));save.inventory[17213]=500;applyAction(save,content,{type:'upgrade',itemId:1912});
    assert.ok(gearScoreV2(playerSpec(save,content))>beforeUpgrade);
});

test('distance scales equipment power above the naked floor and respects limits and overrides',()=>{
    const city=earthPoint(10,10),far={...city,x:city.x+12000};
    assert.equal(earthWildTargetPower({},1000,city,[city]),850);
    assert.equal(earthWildTargetPower({},1000,far,[city]),1300);
    assert.equal(earthWildTargetPower({},200,city,[city]),200);
    assert.equal(earthWildTargetPower({},Infinity,far,[city]),10000);
    const content={balanceParams:{earth:{wildNearPowerRatio:.5,wildFarPowerRatio:2}}};
    assert.equal(earthWildTargetPower(content,1000,city,[city]),500);assert.equal(earthWildTargetPower(content,1000,far,[city]),2000);
});

test('monster equipment bonuses affect real PvE attack, resistance, pip and HP and survive a cold checkpoint',()=>{
    const {content,dataset}=setup(),save=createAdventure(content,{seed:42});save.zone='earth';save.position=earthPoint(10,10);
    const options={chunkX:4560,chunkY:1920,slot:0,level:1,species:['dragon_green']};
    const weaker=createEarthWildEncounter(content,{...options,targetPower:340}),stronger=createEarthWildEncounter(content,{...options,targetPower:780});
    assert.equal(stronger.monster.level,weaker.monster.level);assert.equal(stronger.monster.appearanceStage,weaker.monster.appearanceStage);
    assert.ok(stronger.monster.hp>weaker.monster.hp);assert.ok(stronger.monster.gearScore>weaker.monster.gearScore);
    assert.equal(stronger.monster.gearScore,monsterGearScore(stronger.monster));
    assert.deepEqual(restoreEarthWildEncounter(content,stronger.id),stronger);
    assert.equal(restoreEarthWildEncounter(content,stronger.id.replace(':780:',':10001:')),null);
    beginEncounter(save,content,stronger.id);
    const loaded=parseSave(JSON.stringify(save),content),battle=restorePveBattle(dataset,content,loaded.pendingEncounter),mob=battle.sides.far[0];
    assert.deepEqual(mob.stats,monsterCombatStats(stronger.monster));assert.equal(mob.maxHp,stronger.monster.hp);
    assert.ok(getDamageBoost(mob,'life',battle,battle.resolved)>0);assert.ok(getResist(mob,'life',battle.resolved)<0);assert.ok(mob.stats.powerPipPct>0);
    // Equipment changes after beginning must not regenerate an active enemy.
    content.items[1912].stats[111]=100;
    assert.equal(restorePveBattle(dataset,content,loaded.pendingEncounter).monsterTemplates[0].gearScore,stronger.monster.gearScore);
});

test('old checkpoints retain pre-absolute-equipment and pre-absolute-monster behavior',()=>{
    const {content,dataset}=setup(),save=createAdventure(content);save.xp=4654;syncProgression(save,content);save.zone='earth';save.position=earthPoint(10,10);save.equipment[11]=1912;save.inventory[1912]=1;
    content.items[1912].stats[151]=10;content.monsters['water-bubble'].attributes.damage_all_absolute=10;
    beginEncounter(save,content,'earth:water-bubble:1:2:0');save.pendingEncounter.equipmentStatsVersion=1;delete save.pendingEncounter.player.stats.damageAbs.all;
    const loaded=parseSave(JSON.stringify(save),content),oldBattle=restorePveBattle(dataset,content,loaded.pendingEncounter);
    assert.equal(getDamageBoostAbs(oldBattle.sides.far[0],'life'),0);
    assert.equal(playerSpec(loaded,content).stats.damageAbs.all,undefined);
});
