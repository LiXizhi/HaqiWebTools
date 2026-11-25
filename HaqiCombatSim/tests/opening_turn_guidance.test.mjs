import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import * as P from '../js/combat_pve_core.js';
import * as U from '../js/combat_unit_core.js';
import { validTargets } from '../js/combat_arena_core.js';
import { installExpansion } from '../js/adventure_expansion_core.js';
import { openingTurnGuidance } from '../js/opening_turn_guidance_core.js';

const read = file => JSON.parse(fs.readFileSync(new URL('../data/' + file, import.meta.url)));
const { content, dataset } = installExpansion(...['adventure/chapter.json', 'adventure/combat.json', 'adventure/pets.json', 'adventure/shop-candidates.json', 'kids/cards.json', 'kids/charms.json'].map(read));
function fixture(school = 'ice') {
    const save = A.createAdventure(content, { starter: 'dragon_green', school, seed: 1 });
    save.openingJourney = { version: 1, phase: 'challenge' };
    A.beginEncounter(save, content, 'fire-scout');
    const battle = P.restorePveBattle(dataset, content, save.pendingEncounter);
    const hero = battle.sides.near[0];
    return { battle, hero, visibleHand: U.cardsInHand(hero) };
}

test('all five schools receive a usable first step without changing the live battle', () => {
    for (const school of ['fire', 'ice', 'storm', 'life', 'death']) {
        const state = fixture(school), before = JSON.stringify(state.battle);
        const guidance = openingTurnGuidance(state);
        assert.equal(guidance.step, 'card', school);
        assert.ok(state.visibleHand.some(entry => U.canCast(state.hero, state.battle.resolved.cards[entry.key], state.battle.resolved) && validTargets(state.battle, state.hero, state.battle.resolved.cards[entry.key]).length));
        assert.equal(JSON.stringify(state.battle), before);
    }
});

test('selected attacks and self spells name the actual target action', () => {
    const state = fixture();
    for (const key of ['Ice_SingleAttack_Level0_45', 'Ice_IceDamageBlade']) {
        state.hero.deckSeq = [key]; state.hero.deckMap = [1]; state.hero.pips = { normal: 7, power: 0 };
        const guidance = openingTurnGuidance({ ...state, selected: { seq: 0, key } });
        assert.equal(guidance.step, 'target');
        assert.match(guidance.text, key.includes('Blade') ? /自己/ : /对手/);
    }
});

test('unaffordable, cooling down, discarded and targetless cards give a recovery step', () => {
    const state = fixture(), key = 'Ice_SingleAttack_Level1', selected = { seq: 0, key };
    state.hero.deckSeq = [key]; state.hero.deckMap = [1]; state.hero.pips = { normal: 0, power: 0 };
    assert.match(openingTurnGuidance({ ...state, selected }).text, /魔力点不足.*重新选择/);
    state.hero.pips.normal = 7;
    state.hero.cooldowns[state.battle.resolved.cards[key].spellName] = 2;
    assert.match(openingTurnGuidance({ ...state, selected }).text, /冷却中.*2/);
    state.hero.cooldowns = {};
    assert.match(openingTurnGuidance({ ...state, selected, discarded: [0] }).text, /准备弃掉.*重新选择/);
    for (const foe of state.battle.sides.far) foe.hp = 0;
    assert.match(openingTurnGuidance({ ...state, selected }).text, /没有可选目标.*重新选择/);
});

test('an empty current page points to another usable page before recommending pass', () => {
    const state = fixture();
    assert.equal(openingTurnGuidance({ ...state, visibleHand: [] }).step, 'switch');
    state.hero.deckSeq = []; state.hero.deckMap = []; state.hero.petDeckSeq = []; state.hero.petDeckMap = [];
    const empty = openingTurnGuidance({ ...state, visibleHand: [] });
    assert.equal(empty.step, 'pass'); assert.match(empty.text, /跳过本回合/);
});

test('incapacitated heroes, animations and non-opening encounters never get a false card instruction', () => {
    const state = fixture();
    state.hero.stunned = true;
    assert.equal(openingTurnGuidance(state).step, 'pass');
    state.hero.stunned = false; state.hero.freezeRounds = 1;
    assert.equal(openingTurnGuidance(state).step, 'pass');
    state.hero.hp = 0;
    assert.equal(openingTurnGuidance(state).step, 'watch');
    assert.equal(openingTurnGuidance({ ...state, animating: true }), null);
    state.battle.finished = true;
    assert.equal(openingTurnGuidance(state), null);
    state.battle.finished = false; state.battle.monsterTemplates = [{ id: 'ordinary' }];
    assert.equal(openingTurnGuidance(state), null);
});
