// adventure/presenters/battle_view_model.js — 战斗界面视图模型派生（汇总目标校验、捕捉概率与结算摘要）。
import { castBlockedFeedback } from '../../adventure_cast_feedback_core.js';
import { dungeonProgress } from '../../adventure_coop_core.js';
import { dungeonFor } from '../../adventure_dungeons_core.js';
import { dungeonWatchRetryStory } from '../../dungeon_watch_story_core.js';
import { ownedPetRecords } from '../../adventure_pet_files_core.js';
import { petTraitImprovements, mergePetTraits } from '../../adventure_pet_traits_core.js';
import { catchProbability } from '../../adventure_runes_core.js';
import { previewCombatStamina, encounterStaminaCost } from '../../adventure_stamina_core.js';
import { tacticsReportLines, TACTICS_MILESTONES } from '../../battle_tactics_journal_core.js';
import { validTargets } from '../../combat_arena_core.js';
import { cardTargetKind } from '../../combat_cards_core.js';
import * as U from '../../combat_unit_core.js';
import { dungeonChallengePreview } from '../../dungeon_challenge_core.js';
import { dungeonFirstReward } from '../../dungeon_first_rewards_core.js';
import { dungeonEnemyIntentInfo, towerFloorNumber } from '../../dungeon_tactics_core.js';
import { openingEnemyIntentInfo } from '../../opening_training_core.js';
import { openingResultGuidance } from '../../opening_result_guidance_core.js';
import { examinerEnemyIntentInfo } from '../../examiner_intent_core.js';
import { tacticsFieldCue } from '../../tactics_field_battle_core.js';
import { rollMonsterDrops } from '../../monster_loot_core.js';
import { isTowerBlessingFloor, TOWER_BLESSING_BY_ID } from '../../tower_blessings_core.js';
import { HANZI_SEAL_BY_ID } from '../../hanzi_seal_core.js';
import { campfireBuffDetail } from '../../campfire_cooking_core.js';
import { PET_SYNERGY_DEFS } from '../../pet_synergy_core.js';

export function buildBattleHandViewModel({ battle, hero, selected, discarded, assets }) {
    const cardBlockedFeedback = card => {
        const blocked = castBlockedFeedback(hero, card, battle.resolved);
        if (blocked) return blocked;
        if (!validTargets(battle, hero, card).length) {
            const key = '这张牌没有可选目标。请重新选择一张牌。';
            return { key, vars: {}, message: key };
        }
        return null;
    };
    const blockedFeedback = selected ? cardBlockedFeedback(battle.resolved.cards[selected.key]) : null;
    const blockedMessage = blockedFeedback?.message || '';
    const legalTargets = selected ? validTargets(battle, hero, battle.resolved.cards[selected.key]) : [];
    const kind = selected && cardTargetKind(battle.resolved.cards[selected.key]);
    const canPlay = selected && !discarded.includes(selected.seq) && U.isAlive(hero) && !blockedMessage;
    const catchCard = selected && battle.resolved.cards[selected.key]?.type === 'CatchPet' ? battle.resolved.cards[selected.key] : null;
    const deckRemainingCount = U.deckRemaining(hero) - discarded.length;
    const intent = battle.tacticalEncounter ? null : tacticsFieldCue(battle) || openingEnemyIntentInfo(battle) || dungeonEnemyIntentInfo(battle) || examinerEnemyIntentInfo(battle);
    return {
        blockedMessage,
        blockedFeedback,
        cardBlockedFeedback,
        legalTargets,
        kind,
        canPlay,
        catchCard,
        deckRemainingCount,
        drawPileCount: battle.tacticalEncounter ? U.deckCounts(hero).unused : null,
        intent,
        petHand: U.petCardsInHand(hero),
        playerHand: (U.cardsInHand(hero) || []).filter(h => !discarded.includes(h.seq)),
        isCardAvailable: card => !cardBlockedFeedback(card),
        catchChanceText: unit =>
            catchCard && legalTargets.includes(unit) ? (catchProbability(battle, catchCard, unit) * 100).toFixed(1) : '',
    };
}

export function buildBattleResultViewModel({ save, battle, assets, now = Date.now() }) {
    const won = battle.winner === 'near';
    const activeCampfireBuff = campfireBuffDetail(battle.campfireBuff || save.pendingEncounter?.campfireBuff);
    const xpMult = ((save.pendingEncounter?.magicStarExperiencePercent ?? 100) + (activeCampfireBuff?.xpBonusPct || 0)) / 100;
    const rewardExhausted = won && !battle.redMushroom && !battle.tacticsField &&
        previewCombatStamina(save, assets.content, encounterStaminaCost(assets.content, save.pendingEncounter?.encounterId), now).insufficient;
    const xp = won && !rewardExhausted
        ? battle.monsterTemplates.reduce(
              (sum, m) => sum + Math.ceil(m.xp * xpMult),
              0,
          )
        : 0;
    const coins = won && !rewardExhausted ? battle.monsterTemplates.reduce((sum, m) => sum + m.coins, 0) : 0;
    const droppedItems = won && !battle.redMushroom && !battle.tacticsField && !rewardExhausted
        ? rollMonsterDrops(save, assets.content, save.pendingEncounter, battle.monsterTemplates)
        : [];

    let challenge = null;
    let firstReward = null;
    let firstRewardExhausted = false;
    let tacticsReport = [];
    let firstMilestones = [];
    let towerNext = null;
    if (!battle.redMushroom && !battle.tacticsField) {
        const activeDungeon = dungeonFor(assets.content, save.zone);
        challenge =
            save.dungeonRuns?.[save.zone]?.challenge &&
            dungeonChallengePreview(save, activeDungeon, dungeonProgress(save)?.[save.zone], save.pendingEncounter, battle);
        if (challenge?.complete && !save.dungeonChallengeRecords?.[save.zone]?.firstRewarded) {
            firstReward = dungeonFirstReward(assets.content, save.zone, save.school);
            firstRewardExhausted = rewardExhausted;
        }
        const report = save.pendingEncounter?.tactics;
        tacticsReport = tacticsReportLines(report);
        firstMilestones = won ? TACTICS_MILESTONES.filter(row => report?.[row.id] && !save.tacticsRecord?.[row.id]) : [];
        if (won && activeDungeon?.kind === 'tower' && !save.coopRun && battle.sides.near.some(u => u.hp > 0)) {
            const currentFloor = towerFloorNumber(save.pendingEncounter?.encounterId);
            const nextArena = currentFloor > 0 && currentFloor < activeDungeon.floors ? activeDungeon.arenas[currentFloor] : null;
            if (nextArena) {
                towerNext = {
                    dungeonId: activeDungeon.id,
                    currentFloor,
                    nextFloor: currentFloor + 1,
                    nextEncounterId: nextArena.id,
                    offersBlessing: isTowerBlessingFloor(currentFloor, activeDungeon.floors),
                };
            }
        }
    }

    const activeTowerBlessings = Object.entries(battle.towerBlessings?.picks || {})
        .filter(([, n]) => n > 0)
        .map(([id, stacks]) => (TOWER_BLESSING_BY_ID[id] ? { ...TOWER_BLESSING_BY_ID[id], stacks } : null))
        .filter(Boolean);
    const activeHanziSeal = battle.hanziSeal?.id ? HANZI_SEAL_BY_ID[battle.hanziSeal.id] || null : null;
    const activePetSynergies = (battle.petSynergies?.ids || [])
        .map(id => PET_SYNERGY_DEFS[id] || null)
        .filter(Boolean);

    const captures = [];
    if (battle.captured?.length) {
        const owned = new Map(Object.values(ownedPetRecords(save)).map(p => [p.speciesId, p]));
        for (const [index, id] of battle.captured.entries()) {
            const before = owned.get(id);
            const traits = battle.capturedTraits?.[index] || {};
            const upgrades = petTraitImprovements(before?.passiveTraits, traits);
            captures.push({
                id,
                name: assets.content.pets[id]?.name || id,
                traits,
                upgrades,
                captureCount: (before?.captureCount || 0) + 1,
            });
            owned.set(id, { ...before, passiveTraits: mergePetTraits(before?.passiveTraits, traits), captureCount: (before?.captureCount || 0) + 1 });
        }
    }

    return {
        won,
        xp,
        coins,
        droppedItems,
        towerNext,
        activeTowerBlessings,
        activeHanziSeal,
        activeCampfireBuff,
        activePetSynergies,
        rewardExhausted,
        challenge,
        firstReward,
        firstRewardExhausted,
        tacticsReport,
        firstMilestones,
        captures,
        openingGuidance: openingResultGuidance(save, battle),
        retryStory: dungeonWatchRetryStory(save, dungeonFor(assets.content, save.zone), battle),
    };
}
