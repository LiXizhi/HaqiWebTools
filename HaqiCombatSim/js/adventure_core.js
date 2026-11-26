import {dungeonTacticsProfile,dungeonTacticsVersion,towerFloorTactic,towerFloorNumber} from './dungeon_tactics_core.js';
import {grantMonsterDrops} from './monster_loot_core.js';
import {HUNT_ID,huntSnapshot,grantHuntReward} from './adventure_hunt_core.js';
import {fieldTacticsProfile} from './adventure_field_tactics_core.js';
import {recordTowerBlessingOffer,towerBlessingsSnapshot} from './tower_blessings_core.js';
import {hanziSealSnapshot} from './hanzi_seal_core.js';
import {campfireBuffSnapshot,consumeCampfireBuffOnVictory} from './campfire_cooking_core.js';
import {petSynergiesSnapshot} from './pet_synergy_core.js';
import {recordDailyBountyProgress} from './daily_bounties_core.js';
import {settleTacticsRecord} from './battle_tactics_journal_core.js';
import {settleDungeonChallenge} from './dungeon_challenge_core.js';
import {grantDungeonFirstReward} from './dungeon_first_rewards_core.js';
import {dungeonLanguageBuff,dungeonLanguageBaseHp} from './adventure_dungeon_language_core.js';
import {encounterPetTraitSeed,petTraitParams,monsterPetTraits} from './adventure_pet_traits_core.js';
import {monsterCaptureSpecies} from './adventure_monster_pets_core.js';
import {earthChapterEvent} from './adventure_earth_core.js';
import {cityBattleReady,recordCityBattleWin} from './adventure_city_dungeons_core.js';
import {dailyBuffs} from './language_daily_buff_core.js';
import {encounterCoolingDown,markEncounterDefeated} from './adventure_encounter_cooldown_core.js';
import {ownedPetRecords,ownedPetSpecies} from './adventure_pet_files_core.js';
import {journeyParty,journeyEnemyFormation,recordTowerWin,journeyRewardPets} from './adventure_dungeon_journeys_core.js';
import {dungeonProgress,coopParty,settleCoopHealth} from './adventure_coop_core.js';
import {dungeonFor} from './adventure_dungeons_core.js';
import {magicStarCombatLevel} from './adventure_magic_star_core.js';
import {openingJourneyWon} from './opening_journey_core.js';
import {OPENING_TRAINING_IDS} from './opening_training_core.js';
// AdventureContent / AdventureSave v1. 任务与存档校验/创建分别拆至 ./adventure_quests_core.js 与 ./adventure_save_core.js 并于此重导出。
import { dispatchAdventureAction, retreatLanding } from './adventure_actions_core.js';
import * as Pets from './adventure_pets_core.js';
import { createRng, hashSeed } from './rng_core.js';
import { applyCombatStamina, encounterStaminaCost } from './adventure_stamina_core.js';
import { syncEquipmentInstances } from './adventure_equipment_instances_core.js';
import {
    deckLimits,
    deckCardCopies,
    syncProgression,
    availableCardLessons,
    learnDeckCards,
    recommendedDeck,
    validDeck,
    syncDeckLayouts,
    deckLayoutCapacity,
    validateDeckLayouts,
    canEquip,
    equipmentBlockReason,
    migrateDefaultPocket,
    migrateBagRules,
} from './adventure_deck_core.js';
import {
    SCHOOL_NAMES,
    currentQuest,
    beginnerTeaching,
    teachingMode,
    questState,
    questProgress,
    pendingQuestTalk,
    questReady,
    signal,
    syncGoals,
    petLevel,
    rewardsFor,
} from './adventure_quests_core.js';
import {
    SAVE_VERSION,
    createAdventure,
    playerSpec,
    catalogStatSnapshot,
    grantEggCompanion,
    specialEncounter,
    parseSave,
} from './adventure_save_core.js';
export {
    deckLimits,
    deckCardCopies,
    syncProgression,
    availableCardLessons,
    learnDeckCards,
    recommendedDeck,
    validDeck,
    syncDeckLayouts,
    deckLayoutCapacity,
    validateDeckLayouts,
    canEquip,
    equipmentBlockReason,
    SCHOOL_NAMES,
    currentQuest,
    beginnerTeaching,
    teachingMode,
    questState,
    questProgress,
    pendingQuestTalk,
    questReady,
    petLevel,
    rewardsFor,
    SAVE_VERSION,
    createAdventure,
    playerSpec,
    catalogStatSnapshot,
    specialEncounter,
    parseSave,
};
import {noteCatalogKills} from './adventure_catalog_quests_core.js';
export { rewardLabel } from './adventure_rewards_core.js';
export { readStamina, ensureDailyStamina, dungeonStaminaHint, parseArenaStaminaCost } from './adventure_stamina_core.js';

const clone = value => JSON.parse(JSON.stringify(value));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
export function applyAction(save, content, action, access={}) {
    const before={...save.inventory};
    const result=dispatchAdventureAction(save,content,action,access,{applyAction,settleRunes});
    if(result.changed){
        grantEggCompanion(save,content);
        if(action.type!=='pet-food-take')Pets.autoStockPetFood(save,content,before);
        syncGoals(save,content);
    }
    return result;
}
export function beginEncounter(save,content,encounterId,access={}) {
    assert(!save.pendingEncounter, '已有进行中的战斗');
    const encounter = content.encounters.find(e => e.id === encounterId) || specialEncounter(save,content,encounterId);
    assert(encounter && encounter.zone === save.zone, '这里没有这个敌人');
    assert(!encounter.blocked?.length,encounter.blocked?.join('；'));
    assert(!dungeonProgress(save)?.[save.zone]?.cleared.includes(encounterId),'这组怪物已经击败，请重新开启副本后挑战');
    assert(!encounterCoolingDown(save,encounterId,access.now??0),'怪物尚未刷新，请稍后再挑战');
    const dungeon=dungeonFor(content,save.zone);
    if(dungeon?.kind==='city')assert(cityBattleReady(save,dungeon,encounterId),'请先完成这个地点的生活互动');
    if(dungeon&&dungeon.kind!=='city')assert(dungeon.arenas.find(a=>!dungeonProgress(save)[save.zone].cleared.includes(a.id))?.id===encounterId,'请先击败挡路的怪物');
    const monster = encounter.monster || content.monsters[encounter.monsterId];
    assert(encounterId !== 'death-scout' || (save.quests[63012]?.claimed), '请先完成考核前的准备');
    validDeck(save,content,save.deck);
    const magicStarLevel=magicStarCombatLevel(content,access),player=save.coopRun?.hero||playerSpec(save,content,magicStarLevel);
    const initialParty=journeyParty(save,dungeon,coopParty(save,player)||(content.pets?Pets.partySpecs(save,content,player):null));
    if(initialParty)assert(initialParty.some(u=>u.hp>0),'伙伴们需要休息恢复生命');
    const serial = ++save.encounterSerial;
    save.pendingEncounter = { id: `${save.seed}:${serial}`, encounterId,
        seed: hashSeed(`${save.seed}:encounter:${serial}`), player, decisions: [], equipmentStatsVersion: 2, magicStarLevel, magicStarExperiencePercent:magicStarLevel?content.magicStar.levels[magicStarLevel].exp:100, progressionRulesVersion:3, threatRulesVersion:5, reflectionRulesVersion:1, stealthRulesVersion:1, dispelRulesVersion:1, specialCardRulesVersion:1, captureRulesVersion:1, monsterLootVersion:1, wordCardScalingVersion:1 };
    const fieldTactics=fieldTacticsProfile(encounter,content);
    if(fieldTactics)Object.assign(save.pendingEncounter,{fieldTacticsVersion:1,tacticalEncounter:fieldTactics});
    if(encounterId===HUNT_ID){
        const snapshot=huntSnapshot(save,content);
        save.pendingEncounter.huntReward={version:snapshot.version,selected:snapshot.selected};
        save.pendingEncounter.tacticalEncounter=snapshot.tactics;
    }
    if(save.openingJourney?.version===1&&save.zone==='camp'&&OPENING_TRAINING_IDS.includes(encounterId))save.pendingEncounter.openingTrainingVersion=3;
    if(dungeonTacticsProfile(dungeon))Object.assign(save.pendingEncounter,{dungeonTacticsVersion:dungeonTacticsVersion(dungeon),dungeonTacticsId:dungeon.id});
    else if(towerFloorTactic(dungeon,encounterId))Object.assign(save.pendingEncounter,{dungeonTacticsVersion:3,dungeonTacticsId:dungeon.id});
    if(dungeonTacticsProfile(dungeon)?.companionSlots)save.pendingEncounter.journeyPartyVersion=1;
    if(encounter.monsterIds){const formation=journeyEnemyFormation(encounter,dungeon,initialParty);save.pendingEncounter.dungeonMonsterIds=[...formation.ids];save.pendingEncounter.dungeonMonsterSlots=[...formation.slots];}
    if(content.pets){
        const checkpoint=save.pendingEncounter,params=petTraitParams(content);
        const templates=checkpoint.dungeonMonsterIds?checkpoint.dungeonMonsterIds.map(id=>content.monsters[id]):[monster];
        const stamped=templates.map(m=>({...m,speciesId:m.speciesId||monsterCaptureSpecies(m,content.monsterArt)?.id}));
        const seed=encounterPetTraitSeed(save,encounterId,params),owned=Object.values(ownedPetRecords(save));
        checkpoint.petTraitRulesVersion=1;checkpoint.petTraitParams=clone(params);
        const byMonster=save.petTraitEncounters[encounterId]?.byMonster||{};
        // Scripted training has fixed opponents: rare wild traits must not randomly double its HP.
        // The version belongs to this new checkpoint; existing v1 battle replays keep their traits.
        checkpoint.monsterTraits=stamped.map((mob,index)=>checkpoint.openingTrainingVersion>=2||encounterId===HUNT_ID
            ?(byMonster[`${mob.id}:${index}`]={})
            :(byMonster[`${mob.id}:${index}`]??=monsterPetTraits(seed,mob,index,params,owned.find(p=>p.speciesId===mob.speciesId)?.passiveTraits)));
        save.petTraitEncounters[encounterId]={seed,byMonster:clone(byMonster)};
    }
    const languageBuff=save.dailyLanguageBuff?dailyBuffs(save):dungeonLanguageBuff(save,content);
    if(save.dailyLanguageBuff)save.pendingEncounter.dailyLanguageVersion=1;
    if(languageBuff)save.pendingEncounter.languageBuff=languageBuff;
    const towerBlessings=towerBlessingsSnapshot(save,dungeon);
    if(towerBlessings)save.pendingEncounter.towerBlessings=towerBlessings;
    if(!save.pendingEncounter.openingTrainingVersion){
        const hanziSeal=hanziSealSnapshot(save);
        if(hanziSeal)save.pendingEncounter.hanziSeal=hanziSeal;
        const campfireBuff=campfireBuffSnapshot(save);
        if(campfireBuff)save.pendingEncounter.campfireBuff=campfireBuff;
        const petSynergies=initialParty?.length>=2?petSynergiesSnapshot(initialParty):null;
        if(petSynergies)save.pendingEncounter.petSynergies=petSynergies;
    }
    save.pendingEncounter.runes = runeInventory(save,content);
    save.pendingEncounter.deferredRuneSettlement = true;
    save.pendingEncounter.runeUsed = {};
    if(content.pets){
        const party=initialParty;
        assert(party.some(u=>u.hp>0),'伙伴们需要休息恢复生命');
        Object.assign(save.pendingEncounter,{party,monster,petIds:journeyRewardPets(save,dungeon,party),captureStock:save.inventory[Pets.CAPTURE_ID]||0,heroLevel:save.level,ownedPets:ownedPetSpecies(save),adventureParams:clone(Pets.petParams(content))});
    }
    save.revision++; return { encounter, monster, checkpoint: save.pendingEncounter };
}
export function runeInventory(save,content) {
    return Object.entries(save.inventory).flatMap(([id,count])=>{
        const key=content.cardItems[id]||content.cardItems[Number(id)-1000];
        const item=content.items[id];
        return count>0&&item?.kind===18&&item.subtype===2&&key?[{itemId:Number(id),key,count}]:[];
    });
}
export function recordDecision(save, decision, battle) {
    assert(save.pendingEncounter,'没有进行中的战斗');
    assert(decision?.runeId===undefined||battle,'符文决定缺少战斗结果');
    if(battle){
        assert(battle.seed===save.pendingEncounter.seed,'战斗记录不属于当前遭遇');
        assert(battle.completedDecisions===save.pendingEncounter.decisions.length+1,'战斗决定未执行或已经记录');
        for(const rune of save.pendingEncounter.runes||[]){
            const used=battle.runeUsed?.[rune.itemId]||0;
            assert(Number.isInteger(used)&&used>=0&&used<=rune.count,'符文消耗记录无效');
            const previous=save.pendingEncounter.runeUsed?.[rune.itemId]??(rune.count-(save.inventory[rune.itemId]||0));
            assert(used>=previous,'符文消耗记录不能倒退');
        }
        // Keep consumption in the local checkpoint until finish/retreat, including legacy battles.
        save.pendingEncounter.runeUsed=clone(battle.runeUsed||{});
    }
    save.pendingEncounter.decisions.push(clone(decision)); save.revision++;
}
function settleRunes(save,battle) {
    const pending=save.pendingEncounter;
    if(!pending||pending.runesSettled)return;
    for(const rune of pending.runes||[]){
        const used=battle?.runeUsed?.[rune.itemId]??pending.runeUsed?.[rune.itemId]??(rune.count-(save.inventory[rune.itemId]||0));
        assert(Number.isInteger(used)&&used>=0&&used<=rune.count,'符文消耗记录无效');
    }
    for(const rune of pending.runes||[]){
        const used=battle?.runeUsed?.[rune.itemId]??pending.runeUsed?.[rune.itemId]??(rune.count-(save.inventory[rune.itemId]||0));
        save.inventory[rune.itemId]=rune.count-used;
    }
    pending.runesSettled=true;
}
export function settleEncounter(save,content,battle,{now=0}={}) {
    const pending = save.pendingEncounter;
    assert(pending && battle.finished && battle.seed === pending.seed,'战斗尚未结束');
    if (save.rewardedEncounters.includes(pending.id)) { save.pendingEncounter = null; return false; }
    const encounter = content.encounters.find(e => e.id === pending.encounterId)||specialEncounter(save,content,pending.encounterId), monster = pending.monster || content.monsters[encounter.monsterId];
    settleRunes(save,battle);
    if(content.pets)settleParty(save,content,battle);
    let insufficientStamina=false,staminaSpent=0,droppedItems=[],huntReward=null;
    if (battle.winner === 'near') {
        openingJourneyWon(save,pending);
        if(save.petTraitEncounters)delete save.petTraitEncounters[pending.encounterId];
        const cityDungeon=dungeonFor(content,save.zone);
        if(cityDungeon?.kind==='city')recordCityBattleWin(save,cityDungeon,encounter.id);
        if(save.zone==='earth'){
            const event=content.earthWorld?.encounters.find(e=>e.id===pending.encounterId)?.chapterEvent;
            const chapter=content.earthWorld?.city?.quests;
            if(event&&chapter)earthChapterEvent(save,chapter,event);
        }
        if(!dungeonFor(content,save.zone)&&pending.encounterId!==HUNT_ID)markEncounterDefeated(save,content,pending.encounterId,now);
        const cost=encounterStaminaCost(content,pending.encounterId);
        const gate=applyCombatStamina(save,content,cost);
        insufficientStamina=gate.insufficient;
        staminaSpent=gate.cost;
        if(gate.rewarded){
            const defeated=pending.dungeonMonsterIds?pending.dungeonMonsterIds.map(id=>content.monsters[id]):[monster];
            const campfireResult=consumeCampfireBuffOnVictory(save,content,pending,pending.player);
            const xpMult=((pending.magicStarExperiencePercent??100)+campfireResult.xpBonusPct)/100;
            save.xp += defeated.reduce((n,m)=>n+Math.ceil(m.xp*xpMult),0);
            if(campfireResult.xpBonusPct>0&&content.pets){
                const bonusPetXp=Math.ceil((pending.dungeonMonsterIds?battle.monsterTemplates.reduce((sum,m)=>sum+m.xp,0):battle.monsterTemplates[0].xp)*campfireResult.xpBonusPct/100);
                for(const id of pending.petIds||[]){const pet=save.pets[id];if(pet){pet.xp+=bonusPetXp;pet.level=Pets.petXpLevel(pet.xp,content);}}
            }
            save.inventory[100] = (save.inventory[100] || 0) + defeated.reduce((n,m)=>n+m.coins,0);
            // Original water-bubble loot1 = {[17114,1]=20}; draw remains on the encounter's seeded RNG.
            if (monster.id === 'water-bubble' && battle.rng.int(1,100) <= 20) save.inventory[17114] = (save.inventory[17114] || 0) + 1;
            droppedItems = grantMonsterDrops(save, content, pending, defeated);
            huntReward=grantHuntReward(save,content,pending);
            if(huntReward)droppedItems.push(...huntReward.items);
        }else if(pending.campfireBuff){
            consumeCampfireBuffOnVictory(save,content,pending,pending.player);
        }
        const activeDungeon=dungeonFor(content,save.zone);
        if(pending.dungeonMonsterIds && activeDungeon)dungeonProgress(save)[save.zone].cleared.push(encounter.id);
        recordTowerWin(save,activeDungeon,encounter?.id);
        const towerFloor=activeDungeon?.kind==='tower'?towerFloorNumber(encounter?.id):0;
        if(towerFloor>0)recordTowerBlessingOffer(save,activeDungeon,towerFloor);
        if(now>0&&!pending.openingTrainingVersion&&save.zone!=='camp'){
            recordDailyBountyProgress(save,'battle-win',1,now);
            if(activeDungeon)recordDailyBountyProgress(save,'dungeon-step',1,now);
            if((pending.petIds||[]).length>0)recordDailyBountyProgress(save,'pet-care',1,now);
        }
        // Hunt templates reuse native art, but must not grant that creature's story or catalog credit.
        if(pending.encounterId!==HUNT_ID){
            if (monster.goalId) signal(save,content,'defeat',monster.goalId);
            noteCatalogKills(save,content,pending.dungeonMonsterIds?pending.dungeonMonsterIds.map(id=>content.monsters[id]):[monster],createRng(hashSeed(`${save.seed}:quest:${pending.id}`)));
        }
        syncProgression(save,content);
    }
    // Both outcomes leave the hero beside this encounter, outside contact range.
    save.position=retreatLanding(save,content).position;
    const relationshipEvents=[];
    if(save.coopRun&&battle.winner==='near'&&dungeonProgress(save)[save.zone]?.cleared.length===dungeonFor(content,save.zone)?.arenas.length){
        for(const member of save.coopRun.members)relationshipEvents.push({id:`dungeon:${save.coopRun.relationshipRunId||pending.id}:${member.profile.id}`,peer:member.profile,kind:'dungeon',at:now,reason:'共同通关副本'});
    }
    if(save.coopRun){save.coopRun.battles??=[];save.coopRun.battles.push({checkpoint:clone(pending),winner:battle.winner,turns:battle.turn});}
    const challenge=settleDungeonChallenge(save,dungeonFor(content,save.zone),dungeonProgress(save)[save.zone],pending,battle);
    const firstReward=grantDungeonFirstReward(save,content,save.zone,{complete:!!challenge,rewarded:battle.winner==='near'&&!insufficientStamina});
    const tacticsMilestones=settleTacticsRecord(save,pending,battle);
    save.rewardedEncounters.push(pending.id); save.pendingEncounter = null; if(content.pets)Pets.migratePetDeckRules(save,content); migrateBagRules(save,content); migrateDefaultPocket(save,content); syncEquipmentInstances(save,content); save.revision++;
    return {settled:true,insufficientStamina,staminaSpent,droppedItems,huntReward,relationshipEvents,tacticsMilestones,challenge,firstReward};
}
function settleCapturedPets(save,content,battle){
    const pending=save.pendingEncounter;if(!pending||pending.petCapturesSettled)return;
    const records=Object.values(ownedPetRecords(save));
    for(const id of battle.captured||[]){
        assert(content.pets[id],'未知宠物');
        const existing=records.find(p=>p.speciesId===id);
        assert(!existing||save.pets[save.petInstanceVersion===1?existing.id:existing.speciesId],'请先加载已拥有宠物的详情');
    }
    for(const [index,id] of (battle.captured||[]).entries())Pets.addPet(save,content,id,0,{traits:battle.capturedTraits?.[index]||{},captured:true});
    pending.petCapturesSettled=true;
}
export function settleParty(save,content,battle,{retreat=false}={}){
    settleRunes(save,battle);
    const pending=save.pendingEncounter,p=Pets.petParams(content);
    if(save.petTraitEncounters&&battle.sides.far.some(u=>u.hp<=0))delete save.petTraitEncounters[pending.encounterId];
    if(save.coopRun){settleCoopHealth(save,battle);if(!retreat)settleCapturedPets(save,content,battle);return;}
    save.heroHp=dungeonLanguageBaseHp(battle.unitsById.hero);
    if(battle.winner!=='near'||retreat)save.heroHp=Math.max(save.heroHp,Math.ceil((battle.unitsById.hero.languageBaseMaxHp||battle.unitsById.hero.maxHp)*p.defeatHp));
    for(const u of battle.sides.near)if(u.speciesId){const pet=save.pets[save.petInstanceVersion===1?u.id:u.speciesId];if(pet)pet.hp=dungeonLanguageBaseHp(u);}
    save.inventory[Pets.CAPTURE_ID]=Math.max(0,(save.inventory[Pets.CAPTURE_ID]||0)-(battle.captureUsed||0));
    Pets.retireCaptureCrystals(save,content,{keepActiveBattle:false});
    if(!retreat){
        settleCapturedPets(save,content,battle);
        if(battle.winner==='near')for(const id of pending.petIds||[]){const pet=save.pets[id];pet.xp+=pending.dungeonMonsterIds?battle.monsterTemplates.reduce((sum,m)=>sum+m.xp,0):battle.monsterTemplates[0].xp;pet.level=Pets.petXpLevel(pet.xp,content);}
    }
}
