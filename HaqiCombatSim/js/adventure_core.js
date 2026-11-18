import {dungeonTacticsProfile,dungeonTacticsVersion} from './dungeon_tactics_core.js';
import {settleTacticsRecord} from './battle_tactics_journal_core.js';
import {settleDungeonChallenge} from './dungeon_challenge_core.js';
import {grantDungeonFirstReward} from './dungeon_first_rewards_core.js';
import {mapCoordinateVersion} from './adventure_coordinates_core.js';
import {dungeonLanguageBuff,dungeonLanguageBaseHp} from './adventure_dungeon_language_core.js';
import {encounterPetTraitSeed,petTraitParams,monsterPetTraits} from './adventure_pet_traits_core.js';
import {monsterCaptureSpecies} from './adventure_monster_pets_core.js';
import {earthNearest,earthChapterEvent} from './adventure_earth_core.js';
import {cityBattleReady,recordCityBattleWin} from './adventure_city_dungeons_core.js';
import {dailyBuffs} from './language_daily_buff_core.js';
import {claimSpeechReward} from './language_speech_rewards_core.js';
import {encounterCoolingDown,markEncounterDefeated} from './adventure_encounter_cooldown_core.js';
import {ownedPetRecords,ownedPetSpecies} from './adventure_pet_files_core.js';
import {journeyParty,journeyEnemyFormation,recordTowerWin,journeyRewardPets} from './adventure_dungeon_journeys_core.js';
import {dungeonProgress,coopParty,settleCoopHealth} from './adventure_coop_core.js';
import {dungeonFor} from './adventure_dungeons_core.js';
import {purchaseNpcOffer} from './adventure_npc_core.js';
import {claimMagicStar,magicStarCombatLevel} from './adventure_magic_star_core.js';
import {chooseDragonTotem,useDragonTotemItem} from './adventure_progression_bonuses_core.js';
import {customizeHero} from './adventure_hero_customize_core.js';
import {applyOpeningJourney,openingJourneyActive,openingJourneyWon} from './opening_journey_core.js';
import {applyCampDetour} from './camp_detour_core.js';
import {applyForestCommission} from './forest_commission_core.js';
import {applyCompanionWordplay} from './companion_wordplay_core.js';
import {OPENING_TRAINING_IDS} from './opening_training_core.js';
// AdventureContent / AdventureSave v1. 任务与存档校验/创建分别拆至 ./adventure_quests_core.js 与 ./adventure_save_core.js 并于此重导出。
import { islandSpawn, travelStatus } from './adventure_world_map_core.js';
import { mapInfo } from './adventure_island_layout_core.js';
import { createWorld, retreatBeside } from './adventure_world_core.js';
import {recordLearningCompletion} from './language_adventure_core.js';
import { clampDeck } from './combat_unit_core.js';
import * as Pets from './adventure_pets_core.js';
import { createRng, hashSeed } from './rng_core.js';
import { castFishing, useStaminaPotion } from './adventure_fishing_core.js';
import { applyCombatStamina, encounterStaminaCost } from './adventure_stamina_core.js';
import {mountGem,removeGems} from './adventure_gems_core.js';
import { upgradeAt, upgradeLevels } from './adventure_upgrade_core.js';
import { findEquipmentInstance, syncEquipmentInstances } from './adventure_equipment_instances_core.js';
import { claimCheckin } from './adventure_checkin_core.js';
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
    grantQuestRewards,
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
import {acceptCatalogQuest,claimCatalogQuest,noteCatalogKills,pinTrackedQuest,unpinTrackedQuest,showCurrentChapter,trackedQuestIds,supplementIslandTrack,noteQuestAccepted} from './adventure_catalog_quests_core.js';
export { rewardLabel } from './adventure_rewards_core.js';
export { readStamina, ensureDailyStamina, dungeonStaminaHint, parseArenaStaminaCost } from './adventure_stamina_core.js';

const clone = value => JSON.parse(JSON.stringify(value));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const owns = (s, id) => (s.inventory[id] || 0) > 0;
function retreatLanding(save,content){
    const pending=save.pendingEncounter;
    if(save.zone==='earth'){const w=content.earthWorld;const position=w?earthNearest(w,save.position.x,save.position.y,{safe:true}):save.position;return {position:position||save.position,message:'你回到了附近的安全地点。'};}
    const safe={position:{...mapInfo(save.zone,content).initialSpawn},message:'你回到了安全地点。已保留物品与任务进度。'};
    if(!pending)return safe;
    const encounter=content.encounters.find(e=>e.id===pending.encounterId);
    const laid=content.worldMaps?.[save.zone]?.encounterPositions?.[encounter?.id];
    const target=laid?{x:laid[0],y:laid[1]}:(Number.isFinite(encounter?.x)&&Number.isFinite(encounter?.y)?{x:encounter.x,y:encounter.y}:null);
    if(!target)return {position:{...save.position},message:'你离开了战斗。已保留物品与任务进度。'};
    const info=mapInfo(save.zone,content);
    const spot=content.worldMaps?.[save.zone]
        ?retreatBeside(createWorld(save.zone,content,{...save,position:{...save.position}}),save.position,target)
        :offsetBeside(save.position,target,info.spawn);
    return {position:{x:Math.min(info.w,Math.max(0,spot.x)),y:Math.min(info.h,Math.max(0,spot.y))},message:'你撤到了怪物附近。已保留物品与任务进度。'};
}
function offsetBeside(player,target,spawn){
    let dx=player.x-target.x,dy=player.y-target.y,len=Math.hypot(dx,dy);
    if(len<8){dx=spawn.x-target.x;dy=spawn.y-target.y;len=Math.hypot(dx,dy)||1;}
    return {x:target.x+dx/len*120,y:target.y+dy/len*120};
}
export function applyAction(save, content, action, access={}) {
    const before={...save.inventory};
    const result=applyAdventureAction(save,content,action,access);
    if(result.changed){
        grantEggCompanion(save,content);
        if(action.type!=='pet-food-take')Pets.autoStockPetFood(save,content,before);
        syncGoals(save,content);
    }
    return result;
}
function applyAdventureAction(save, content, action, access={}) {
    assert(!action.paidByTest, '语言课程仅发放限额奖励，请使用货币购买');
    assert(!save.pendingEncounter || ['settle-encounter','retreat','language-complete'].includes(action.type), '请先完成当前战斗');
    if(content.pets&&Pets.petAction(save,content,action,access)){syncEquipmentInstances(save,content);save.revision++;return {changed:true};}
    const q = currentQuest(save,content);
    let notice, trackFull = false;
    switch (action.type) {
    case 'companion-wordplay': {const result=applyCompanionWordplay(save,content,action);if(result.accepted)save.revision++;return result;}
    case 'camp-detour': {const result=applyCampDetour(save,content,action,access);if(result.changed===false)return result;notice=result.message;break;}
    case 'forest-commission': {const result=applyForestCommission(save,content,action,access);if(result.changed===false)return result;notice=result.message;break;}
    case 'language-complete': {const result=recordLearningCompletion(save,content,action.completion,access);save.revision++;return result;}
    case 'npc-purchase': purchaseNpcOffer(save,content,action,access);break;
    case 'fish': {const result=castFishing(save,content,action,createRng(hashSeed(`${save.revision}:fish:${action.netId}`)));save.revision++;return {...result,changed:true};}
    case 'stamina-potion': {const result=useStaminaPotion(save,content,action.itemId);save.revision++;return {...result,changed:true};}
    case 'magic-star-claim': claimMagicStar(save,content,action,access);syncEquipmentInstances(save,content);break;
    case 'choose-totem': chooseDragonTotem(save,content,action.professionId);break;
    case 'customize-hero': {
        const quote=customizeHero(save,action);
        notice=quote.nameChanged&&quote.lookChanged?'名字和形象已更新。':quote.nameChanged?'名字已更新。':'形象已更新。';
        break;
    }
    case 'use-totem-item': useDragonTotemItem(save,content,action.itemId);break;
    case 'checkin': claimCheckin(save, content, action.now, action.index, access, action.bonus===true); break;
    case 'speech-reward': claimSpeechReward(save,content,action.index,action.now);notice='领取成功，奖励已放入背包！';break;
    case 'opening-journey': {
        const result=applyOpeningJourney(save,content,action);
        if(action.step==='accept'&&q?.id===63000&&!questState(save,63000).accepted)applyAction(save,content,{type:'accept',questId:63000,npcId:36211});
        if(action.step==='rescue'&&q?.id===63000&&questReady(save,q))applyAction(save,content,{type:'claim',questId:63000,npcId:36211});
        notice=result.message;
        break;
    }
    case 'accept': {
        assert(q && q.id === Number(action.questId) && q.startNpc === Number(action.npcId), '当前没有可接取的任务');
        if (!save.quests[q.id]) {
            save.quests[q.id] = { accepted: true, claimed: false, progress: {} };
            noteQuestAccepted(save, q.id);
        }
        save.trackedQuestIds = trackedQuestIds(save, content);
        delete save.trackedQuestId;
        syncGoals(save,content); break;
    }
    case 'talk':
        assert(content.npcs[action.npcId], '找不到这位居民');
        signal(save,content,'talk',action.npcId); break;
    case 'accept-catalog': trackFull = acceptCatalogQuest(save,content,action.questId,action.npcId,catalogStatSnapshot(save,content))?.full === true; break;
    case 'claim-catalog': {
        const target = claimCatalogQuest(save,content,action.questId,action.npcId,catalogStatSnapshot(save,content));
        if (!target) return { changed: false };
        grantQuestRewards(save,content,target);
        // Legacy card rewards retired; old quest claims remain readable.
        save.quests[target.id].claimed = true;
        unpinTrackedQuest(save, target.id);
        if(target.region==='hanzi')supplementIslandTrack(save,content,save.zone);
        syncProgression(save,content);
        break;
    }
    case 'abandon-quest': {
        const id = Number(action.questId);
        const chapter = content.quests.find(quest => quest.id === id);
        const catalog = content.catalogQuests?.byId[id];
        const state = save.quests[id];
        assert(chapter || catalog, '找不到这个任务');
        assert(state?.accepted === true && !state.claimed, '只能放弃进行中的任务');
        if (chapter) assert(q?.id === id, '只能放弃当前教学任务');
        delete save.quests[id];
        unpinTrackedQuest(save, id);
        if (chapter) showCurrentChapter(save, content);
        notice = `已放弃：${(chapter || catalog).title}`;
        break;
    }
    case 'track-catalog': {
        if (action.remove) { unpinTrackedQuest(save, action.questId); notice = '已取消追踪'; break; }
        if (action.questId == null) { unpinTrackedQuest(save, null); break; }
        const pinned = pinTrackedQuest(save, content, action.questId);
        if (pinned.already || pinned.full) return { changed: false, ...pinned };
        break;
    }
    case 'claim': {
        const target = content.quests.find(x => x.id === Number(action.questId));
        if (save.quests[target?.id]?.claimed) return { changed: false };
        assert(target?.id!==63000||!openingJourneyActive(save)||save.openingJourney.phase==='showcase','先和莫尼一起帮咕噜噜解围');
        assert(target === q && questReady(save,q) && q.endNpc === Number(action.npcId), '任务尚未完成');
        grantQuestRewards(save,content,q);
        save.quests[q.id].claimed = true;
        unpinTrackedQuest(save, q.id);
        showCurrentChapter(save, content);
        syncProgression(save,content);
        if (q.id === 63013) save.graduated = true;
        break;
    }
    case 'equip': {
        const item = content.items[action.itemId];
        assert(canEquip(save,item,content), equipmentBlockReason(save,item,content));
        const instance=findEquipmentInstance(save,content,item.id,action.guid);
        assert(instance,'找不到这件装备');
        syncEquipmentInstances(save,content);
        save.equipment[item.slot] = item.id;
        save.equipmentGuids[item.slot]=instance.guid;
        save.deck = clampDeck(save.deck, { ...deckLimits(save,content), version:'kids' }).deck;
        syncGoals(save,content); break;
    }
    case 'unequip': {
        const slot = Number(action.slot);
        assert(Number.isInteger(slot) && save.equipment[slot], '这个部位没有装备');
        delete save.equipment[slot];
        if(save.equipmentGuids)delete save.equipmentGuids[slot];
        save.deck = clampDeck(save.deck, { ...deckLimits(save,content), version:'kids' }).deck;
        break;
    }
    case 'ride': {
        const itemId = Number(action.itemId);
        const mount = content.mountByItem?.[itemId];
        assert(mount?.art?.cdn && owns(save, itemId), '尚未获得这只坐骑');
        save.mountId = itemId;
        break;
    }
    case 'dismount': {
        assert(save.mountId, '当前没有骑乘坐骑');
        save.mountId = null;
        break;
    }
    case 'mount-gem': {
        const result=mountGem(save,content,action);
        if(result.success){signal(save,content,'action',79017);signal(save,content,'action',79026);}
        syncGoals(save,content);syncEquipmentInstances(save,content);save.revision++;return {...result,changed:true};
    }
    case 'remove-gems': {const result=removeGems(save,content,action);save.revision++;return {...result,changed:true};}
    case 'upgrade': {
        const instance=findEquipmentInstance(save,content,action.itemId,action.guid);
        const iid = instance?.gsid, level = instance?.serverdata.addlel || 0;
        assert(content.items[iid] && owns(save,iid) && upgradeLevels(content,iid).length, '请选择已拥有且支持强化的装备');
        const upgrade = upgradeAt(content,iid,level+1);
        assert(upgrade, '装备已达到强化上限');
        const [currency,cost] = upgrade.cost;
        assert((save.inventory[currency] || 0) >= cost, `${content.items[currency]?.name||'强化材料'}不足`);
        syncEquipmentInstances(save,content);
        save.inventory[currency] -= cost;
        save.equipmentInstances.find(row=>row.guid===instance.guid).serverdata.addlel=level+1;
        // PowerAPI_client.lua L191–199: goal 79016 only follows a successful upgrade.
        signal(save,content,'action',79016); signal(save,content,'action',79025); syncGoals(save,content); break;
    }
    case 'hatch':
        assert(owns(save,17307) && !save.pet, '需要一枚出奇蛋');
        save.inventory[17307]--; save.inventory[content.pet.itemId] = 1;
        save.pet = { itemId: content.pet.itemId, name: content.pet.name, xp: 0, level: 0 }; if(content.pets?.legacy_gululu)Pets.addPet(save,content,'legacy_gululu'); syncGoals(save,content); break;
    case 'feed': {
        assert(save.pet && owns(save,content.pet.foodId), '需要宠物和战宠口粮');
        assert(save.pet.xp < content.pet.levels.max_exp, '宠物已经长大了！');
        save.inventory[content.pet.foodId]--; save.pet.xp = Math.min(content.pet.levels.max_exp, save.pet.xp + content.pet.foodXp);
        save.pet.level = petLevel(save.pet.xp,content); {const legacy=Object.values(save.pets||{}).find(p=>p.speciesId==='legacy_gululu');if(legacy){legacy.xp+=content.pet.foodXp;legacy.level=Pets.petXpLevel(legacy.xp,content);}} syncGoals(save,content); break;
    }
    case 'deck-layouts': {
        const next={...save,cards:{...save.cards},equipment:{...save.equipment}};
        if(action.bagItemId!==undefined){
            const bag=content.items[action.bagItemId];
            assert(bag?.slot===24&&canEquip(save,bag,content),'卡包尚未拥有或不符合使用条件');
            next.equipment[24]=bag.id;
        }
        if(action.learnedKeys?.length)learnDeckCards(next,content,action.learnedKeys);
        validateDeckLayouts(next,content,action.layouts,action.active);
        const selected=action.layouts[action.active].bagItemId;
        if(selected!==undefined){
            assert(action.bagItemId===undefined||action.bagItemId===selected,'请选择一致的卡包');
            if(selected)next.equipment[24]=selected;else delete next.equipment[24];
        }else{
            assert(action.layouts.length<=deckLayoutCapacity(next,content), '没有多余的可用卡包，请先到商店购买');
        }
        save.cards=next.cards;
        save.trainingPointsSpent=next.trainingPointsSpent;
        save.equipment=next.equipment;
        save.deckLayouts=clone(action.layouts);save.activeDeckLayout=action.active;
        save.deck=clone(save.deckLayouts[action.active].deck);
        save.tips.deckEdited=true;save.tips.deckEditedWithBag=save.equipment[24]===24003;syncGoals(save,content);break;
    }
    case 'deck':
        validDeck(save,content,action.deck); save.deck = clone(action.deck); save.tips.deckEdited = true; save.tips.deckEditedWithBag = save.equipment[24] === 24003; syncGoals(save,content); break;
    case 'travel': {
        const previous = save.zone;
        assert(travelStatus(save,content,action.zone).allowed, travelStatus(save,content,action.zone).reason);
        save.zone = action.zone; save.position = islandSpawn(action.zone,content); save.positionCoordinateVersion=mapCoordinateVersion(action.zone,content); save.worldLayoutVersion = content.worldMapIndex.layoutVersion;
        if (action.zone === 'town') save.visitedTown = true;
        if (previous !== action.zone) supplementIslandTrack(save, content, action.zone, catalogStatSnapshot(save, content));
        break;
    }
    case 'retreat': {
        settleRunes(save);
        const landing=retreatLanding(save,content);
        save.pendingEncounter = null; if(content.pets)Pets.migratePetDeckRules(save,content); save.position = landing.position; notice=landing.message; break;
    }
    default: throw new Error('未知操作');
    }
    migrateBagRules(save,content);
    migrateDefaultPocket(save,content);
    syncDeckLayouts(save,content);
    syncEquipmentInstances(save,content);
    save.revision++;
    return { changed: true, quest: currentQuest(save,content), level: save.level, ...(notice ? { message: notice } : {}), ...(trackFull ? { full: true } : {}) };
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
        seed: hashSeed(`${save.seed}:encounter:${serial}`), player, decisions: [], equipmentStatsVersion: 2, magicStarLevel, magicStarExperiencePercent:magicStarLevel?content.magicStar.levels[magicStarLevel].exp:100, progressionRulesVersion:3, threatRulesVersion:5, reflectionRulesVersion:1, stealthRulesVersion:1, dispelRulesVersion:1, specialCardRulesVersion:1, captureRulesVersion:1 };
    if(save.openingJourney?.version===1&&save.zone==='camp'&&OPENING_TRAINING_IDS.includes(encounterId))save.pendingEncounter.openingTrainingVersion=3;
    if(dungeonTacticsProfile(dungeon))Object.assign(save.pendingEncounter,{dungeonTacticsVersion:dungeonTacticsVersion(dungeon),dungeonTacticsId:dungeon.id});
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
        checkpoint.monsterTraits=stamped.map((mob,index)=>checkpoint.openingTrainingVersion>=2
            ?(byMonster[`${mob.id}:${index}`]={})
            :(byMonster[`${mob.id}:${index}`]??=monsterPetTraits(seed,mob,index,params,owned.find(p=>p.speciesId===mob.speciesId)?.passiveTraits)));
        save.petTraitEncounters[encounterId]={seed,byMonster:clone(byMonster)};
    }
    const languageBuff=save.dailyLanguageBuff?dailyBuffs(save):dungeonLanguageBuff(save,content);
    if(save.dailyLanguageBuff)save.pendingEncounter.dailyLanguageVersion=1;
    if(languageBuff)save.pendingEncounter.languageBuff=languageBuff;
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
    let insufficientStamina=false,staminaSpent=0;
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
        if(!dungeonFor(content,save.zone))markEncounterDefeated(save,content,pending.encounterId,now);
        const cost=encounterStaminaCost(content,pending.encounterId);
        const gate=applyCombatStamina(save,content,cost);
        insufficientStamina=gate.insufficient;
        staminaSpent=gate.cost;
        if(gate.rewarded){
            const defeated=pending.dungeonMonsterIds?pending.dungeonMonsterIds.map(id=>content.monsters[id]):[monster];
            save.xp += defeated.reduce((n,m)=>n+Math.ceil(m.xp*(pending.magicStarExperiencePercent??100)/100),0);
            save.inventory[100] = (save.inventory[100] || 0) + defeated.reduce((n,m)=>n+m.coins,0);
            // Original water-bubble loot1 = {[17114,1]=20}; draw remains on the encounter's seeded RNG.
            if (monster.id === 'water-bubble' && battle.rng.int(1,100) <= 20) save.inventory[17114] = (save.inventory[17114] || 0) + 1;
        }
        if(pending.dungeonMonsterIds && dungeonFor(content,save.zone))dungeonProgress(save)[save.zone].cleared.push(encounter.id);
        recordTowerWin(save,dungeonFor(content,save.zone),encounter?.id);
        if (monster.goalId) signal(save,content,'defeat',monster.goalId);
        noteCatalogKills(save,content,pending.dungeonMonsterIds?pending.dungeonMonsterIds.map(id=>content.monsters[id]):[monster],createRng(hashSeed(`${save.seed}:quest:${pending.id}`)));
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
    return {settled:true,insufficientStamina,staminaSpent,relationshipEvents,tacticsMilestones,challenge,firstReward};
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
    for(const u of battle.sides.near)if(u.speciesId){const pet=save.pets[save.petInstanceVersion===1?u.id:u.speciesId];if(pet)pet.hp=u.hp;}
    save.inventory[Pets.CAPTURE_ID]=Math.max(0,(save.inventory[Pets.CAPTURE_ID]||0)-(battle.captureUsed||0));
    Pets.retireCaptureCrystals(save,content,{keepActiveBattle:false});
    if(!retreat){
        settleCapturedPets(save,content,battle);
        if(battle.winner==='near')for(const id of pending.petIds||[]){const pet=save.pets[id];pet.xp+=pending.dungeonMonsterIds?battle.monsterTemplates.reduce((sum,m)=>sum+m.xp,0):battle.monsterTemplates[0].xp;pet.level=Pets.petXpLevel(pet.xp,content);}
    }
}
