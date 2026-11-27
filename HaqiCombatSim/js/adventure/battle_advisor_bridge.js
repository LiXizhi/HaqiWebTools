// adventure/battle_advisor_bridge.js — 战斗 AI 提示请求、状态缓存与战后复盘建议桥接。
import { companionTacticalHint } from '../companion_battle_advice_core.js';
import { BattleReviewSession } from '../battle_ai/session_core.js';
import { recommendProgression } from '../battle_ai/review_core.js';
import { adventureProgressionRoutes } from '../battle_ai/adventure_adapter_core.js';
import { BattleAIClient } from '../battle_ai/client.js';
import { observeBattle, haqiRulesAdapter } from '../battle_ai/haqi_adapter_core.js';

export function createBattleAdvisorBridge({ getContext, onHintReady, onAnalyzeFallback }) {
    const battleAIClient = new BattleAIClient();
    const battleAdvisors = new WeakMap();

    function advisorFor(value) {
        if (!battleAdvisors.has(value)) {
            battleAdvisors.set(value, {
                session: new BattleReviewSession(),
                muted: !!value.monsterTemplates?.some(row => row.openingLesson),
            });
        }
        return battleAdvisors.get(value);
    }

    function refreshPetHint() {
        const { battle, animation } = getContext();
        if (battle?.redMushroom || battle?.tacticsField) return;
        if (!battle || battle.finished || animation) return;
        const current = battle;
        const advisor = advisorFor(current);
        if (advisor.muted) return;
        const observation = observeBattle(current, current.sides.near[0].id);
        const stateId = haqiRulesAdapter.stateId(observation);
        if (advisor.hintState === stateId || advisor.hintLoading === stateId) return;
        advisor.hintAnalysis = null;
        advisor.hintLoading = stateId;
        battleAIClient
            .analyze(observation, { difficulty: 'expert', memory: advisor.strategyMemory || {} })
            .then(analysis => {
                if (advisor.hintLoading === stateId) advisor.hintLoading = null;
                const nowCtx = getContext();
                if (
                    nowCtx.stage !== 'battle'
                    || nowCtx.battle !== current
                    || current.finished
                    || nowCtx.animation
                    || advisor.muted
                    || haqiRulesAdapter.stateId(observeBattle(current, current.sides.near[0].id)) !== stateId
                ) {
                    return;
                }
                advisor.hintState = stateId;
                advisor.hintAnalysis = analysis;
                advisor.strategyMemory = analysis.memory;
                onHintReady?.();
            })
            .catch(() => {
                if (advisor.hintLoading === stateId) advisor.hintLoading = null;
                advisor.hintState = stateId;
            });
    }

    function resolveRoundAnalysis(battle, decision, onReady) {
        const advisor = advisorFor(battle);
        if (battle.redMushroom) {
            return { candidates: [], evaluated: [], settings: battle.resolved.battleAI };
        }
        if (advisor.hintAnalysis?.stateId === haqiRulesAdapter.stateId(observeBattle(battle, battle.sides.near[0].id))) {
            return advisor.hintAnalysis;
        }
        if (battle.tacticsField || battle.monsterTemplates?.some(row => row.openingLesson)) {
            return { unavailable: true, settings: battle.resolved.battleAI };
        }
        if (advisor.analyzing) return null;
        const observation = observeBattle(battle, battle.sides.near[0].id);
        advisor.analyzing = true;
        battleAIClient
            .analyze(observation, { difficulty: 'expert', memory: advisor.strategyMemory || {} })
            .then(analysis => {
                advisor.analyzing = false;
                const nowCtx = getContext();
                if (
                    nowCtx.battle !== battle
                    || battle.finished
                    || nowCtx.animation
                    || haqiRulesAdapter.stateId(observeBattle(battle, battle.sides.near[0].id)) !== analysis.stateId
                ) {
                    return;
                }
                onReady(decision, analysis);
            })
            .catch(() => {
                advisor.analyzing = false;
                const nowCtx = getContext();
                if (nowCtx.battle === battle && !nowCtx.animation && !battle.finished) {
                    onAnalyzeFallback?.();
                    onReady(decision, { candidates: [], evaluated: [], settings: battle.resolved.battleAI });
                }
            });
        return null;
    }

    function reviewModel(battle, save, content, discarded = []) {
        const advisor = advisorFor(battle);
        const aiReview = battle.finished && !battle.redMushroom && !battle.tacticsField ? advisor.session.review(battle) : null;
        const tacticalHint = companionTacticalHint(battle, discarded);
        const aiGrowth = aiReview ? recommendProgression(aiReview, { routes: adventureProgressionRoutes(save, content) }) : [];
        return {
            advisor,
            aiReview,
            aiGrowth,
            aiHintsMuted: advisor.muted,
            aiHint:
                advisor.hintState && advisor.dismissedHintState === advisor.hintState
                    ? null
                    : tacticalHint || (battle.tacticalEncounter ? null : advisor.hintAnalysis?.candidates.find(row => !discarded.includes(row.action.seq))),
        };
    }

    return {
        advisorFor,
        refreshPetHint,
        resolveRoundAnalysis,
        reviewModel,
    };
}
