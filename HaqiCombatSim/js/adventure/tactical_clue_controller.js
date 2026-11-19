import { recordWordPractice } from '../learning/language_course.js';
import { grantTacticalClueWard, matchesTacticalClue, tacticalClue } from '../tactical_clue_core.js';

export function createTacticalClueHandler({ getContext, paintBattle, spellSound, record = recordWordPractice }) {
    const attemptsByBattle = new WeakMap();
    return async function answerClue(battle, answer) {
        const { save, roleEpoch } = getContext();
        const turn = battle.turn;
        const clue = tacticalClue(battle, save);
        const available = () => {
            const current = getContext();
            return current.roleEpoch === roleEpoch && current.stage === 'battle' && current.battle === battle &&
                !current.animation && !battle.finished && battle.turn === turn && battle.sides.near[0].hp > 0 &&
                tacticalClue(battle, current.save)?.language === clue?.language;
        };
        if (!clue || !available() || battle.tacticalEncounter.clueWardUsed) return '本次线索已结束。';
        let attempt = attemptsByBattle.get(battle);
        if (!attempt) {
            attempt = { id: 'tactical-clue-' + crypto.randomUUID(), count: 0, pending: false };
            attemptsByBattle.set(battle, attempt);
        }
        if (attempt.pending) return '正在记录练习…';
        attempt.count++;
        if (!matchesTacticalClue(clue, answer)) return '再读一遍口令，从中找出对应的词。';
        attempt.pending = true;
        try {
            const evidence = await record({ language: clue.treeLanguage, words: [clue.word], id: attempt.id,
                input: 'text', source: 'tactical-challenge', attempts: attempt.count, assisted: true }, available);
            if (!available() || !evidence?.persisted || !evidence.state?.practiceReceipts?.[attempt.id]) return '练习尚未生效，可再试一次。';
            if (grantTacticalClueWard(battle)) {
                spellSound.play('shield');
                paintBattle();
            }
            return '口令已记入词树，你获得了一层护盾。';
        } catch {
            return '词树暂时无法保存，护盾次数已保留。';
        } finally {
            attempt.pending = false;
        }
    };
}
