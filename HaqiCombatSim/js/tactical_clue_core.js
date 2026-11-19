import { learningLanguage, learningPracticeLanguage, normalizeLearningAnswer } from './learning_language_core.js';
import { appendWard, isAlive } from './combat_unit_core.js';

// The highlighted concept is recoverable from the sentence in each role language.
// Inflected forms below are also entries in the existing language-tree lexicons.
const clues = {
    normal: { meaning: '火', en: ['Watch the fire!', 'fire'], ja: ['火に気をつけて！', '火'], ko: ['불 조심!', '불'], 'zh-CN': ['当心火！', '火'] },
    elite: { meaning: '朋友', en: ['Protect your friend.', 'friend'], ja: ['友達を守って。', '友達'], ko: ['친구를 지켜요.', '친구'], 'zh-CN': ['保护你的朋友。', '朋友'] },
    boss: { meaning: '等待', en: ['Wait for the signal.', 'wait'], ja: ['合図を待って。', '待って'], ko: ['신호를 기다려요.', '기다려요'], 'zh-CN': ['等待信号。', '等待'] },
};

export function tacticalClue(battle, save) {
    const clue = clues[battle?.tacticalEncounter?.id];
    if (!clue) return null;
    const language = learningLanguage(save);
    const [sentence, word] = clue[language];
    return { language, treeLanguage: learningPracticeLanguage(language), sentence, word, meaning: clue.meaning };
}

export function matchesTacticalClue(clue, answer) {
    return !!clue && normalizeLearningAnswer(answer, clue.language) === normalizeLearningAnswer(clue.word, clue.language);
}

export function grantTacticalClueWard(battle) {
    const state = battle?.tacticalEncounter;
    if (!state || state.clueWardUsed || battle.finished) return false;
    const hero = battle.sides.near[0];
    if (!isAlive(hero)) return false;
    const params = battle.resolved.cards.Ice_GlobalShield?.params;
    const id = Number(params?.wards ?? params?.ward);
    if (!battle.resolved.wards[id]) return false;
    appendWard(hero, id);
    state.clueWardUsed = true;
    state.clueWardTurn = battle.turn;
    const event = { turn: battle.turn, type: 'tactic_clue_ward', target: hero.id, id, card: 'Ice_GlobalShield' };
    battle.events.push(event);
    battle.onEvent?.(event);
    return true;
}
