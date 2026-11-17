// adventure/presenters/battle_view_model.js — 战斗界面视图模型派生（汇总目标校验、捕捉概率与结算摘要）。
import { castBlockedMessage } from '../../adventure_cast_feedback_core.js';
import { dungeonProgress } from '../../adventure_coop_core.js';
import { dungeonFor } from '../../adventure_dungeons_core.js';
import { ownedPetRecords } from '../../adventure_pet_files_core.js';
import { petTraitImprovements, mergePetTraits } from '../../adventure_pet_traits_core.js';
import { catchProbability } from '../../adventure_runes_core.js';
import { readStamina, encounterStaminaCost } from '../../adventure_stamina_core.js';
import { tacticsReportLines, TACTICS_MILESTONES } from '../../battle_tactics_journal_core.js';
import { validTargets } from '../../combat_arena_core.js';
import { cardTargetKind } from '../../combat_cards_core.js';
import * as U from '../../combat_unit_core.js';
import { dungeonChallengePreview } from '../../dungeon_challenge_core.js';
import { dungeonFirstReward } from '../../dungeon_first_rewards_core.js';
import { dungeonEnemyIntentInfo } from '../../dungeon_tactics_core.js';
import { openingEnemyIntentInfo } from '../../opening_training_core.js';
import { tacticsFieldCue } from '../../tactics_field_battle_core.js';

export function buildBattleHandViewModel({ battle, hero, selected, discarded, assets }) {
    const blockedMessage = selected ? castBlockedMessage(hero, battle.resolved.cards[selected.key], battle.resolved) : '';
    const legalTargets = selected ? validTargets(battle, hero, battle.resolved.cards[selected.key]) : [];
    const kind = selected && cardTargetKind(battle.resolved.cards[selected.key]);
    const canPlay = selected && !discarded.includes(selected.seq) && U.isAlive(hero) && !blockedMessage;
    const catchCard = selected && battle.resolved.cards[selected.key]?.type === 'CatchPet' ? battle.resolved.cards[selected.key] : null;
    const deckRemainingCount = U.deckRemaining(hero) - discarded.length;
    const intent = tacticsFieldCue(battle) || openingEnemyIntentInfo(battle) || dungeonEnemyIntentInfo(battle);
    return {
        blockedMessage,
        legalTargets,
        kind,
        canPlay,
        catchCard,
        deckRemainingCount,
        intent,
        petHand: U.petCardsInHand(hero),
        playerHand: (U.cardsInHand(hero) || []).filter(h => !discarded.includes(h.seq)),
        isCardAvailable: card => U.isAlive(hero) && U.canCast(hero, card, battle.resolved),
        catchChanceText: unit =>
            catchCard && legalTargets.includes(unit) ? (catchProbability(battle, catchCard, unit) * 100).toFixed(1) : '',
    };
}

export function buildBattleResultViewModel({ save, battle, assets }) {
    const won = battle.winner === 'near';
    const xp = won
        ? battle.monsterTemplates.reduce(
              (sum, m) => sum + Math.ceil(m.xp * (save.pendingEncounter?.magicStarExperiencePercent ?? 100) / 100),
              0,
          )
        : 0;
    const coins = won ? battle.monsterTemplates.reduce((sum, m) => sum + m.coins, 0) : 0;

    let challenge = null;
    let firstReward = null;
    let firstRewardExhausted = false;
    let tacticsReport = [];
    let firstMilestones = [];
    if (!battle.redMushroom && !battle.tacticsField) {
        challenge =
            save.dungeonRuns?.[save.zone]?.challenge &&
            dungeonChallengePreview(save, dungeonFor(assets.content, save.zone), dungeonProgress(save)?.[save.zone], save.pendingEncounter, battle);
        if (challenge?.complete && !save.dungeonChallengeRecords?.[save.zone]?.firstRewarded) {
            firstReward = dungeonFirstReward(assets.content, save.zone, save.school);
            firstRewardExhausted =
                encounterStaminaCost(assets.content, save.pendingEncounter?.encounterId) > 0 && readStamina(save, assets.content) <= 0;
        }
        const report = save.pendingEncounter?.tactics;
        tacticsReport = tacticsReportLines(report);
        firstMilestones = won ? TACTICS_MILESTONES.filter(row => report?.[row.id] && !save.tacticsRecord?.[row.id]) : [];
    }

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
        challenge,
        firstReward,
        firstRewardExhausted,
        tacticsReport,
        firstMilestones,
        captures,
    };
}
