import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installExpansion } from '../js/adventure_expansion_core.js';
import { applyLearningSpeech } from '../js/combat_pve_core.js';
import { createTacticsChallenge } from '../js/tactics_challenge_core.js';
import { createTacticsFieldBattle, playTacticsFieldRound } from '../js/tactics_field_battle_core.js';
import { grantTacticalClueWard, matchesTacticalClue, tacticalClue } from '../js/tactical_clue_core.js';
import { createTacticalClueHandler } from '../js/adventure/tactical_clue_controller.js';
import { tacticalReview } from '../js/tactical_review_core.js';
import { describeIntent } from '../js/views/adventure/view_tactical_intents.js';

const files = ['adventure/chapter.json', 'adventure/combat.json', 'adventure/pets.json',
    'adventure/shop-candidates.json', 'kids/cards.json', 'kids/charms.json'];
const { content, dataset } = installExpansion(...files.map(file =>
    JSON.parse(readFileSync(new URL('../data/' + file, import.meta.url)))));
const create = (id = 'normal') => createTacticsChallenge(dataset, content, { id, seed: 82 });
const learner = target => ({ languageLearning: { target } });
const receipt = id => ({ persisted: true, state: { practiceReceipts: { [id]: true } } });
function clueSession(record) {
    const battle = create();
    const state = { battle, save: learner('ko'), roleEpoch: 1, stage: 'battle', animation: false };
    const updates = [];
    const answer = createTacticalClueHandler({ getContext: () => state, record,
        paintBattle: () => updates.push('paint'), spellSound: { play: type => updates.push(type) } });
    return { battle, state, answer: word => answer(battle, word), updates };
}

test('all twelve clues use the saved language, expose a word in the prompt, and normalize the answer', () => {
    for (const id of ['normal', 'elite', 'boss']) {
        for (const language of ['ko', 'ja', 'en', 'zh-CN']) {
            const clue = tacticalClue(create(id), learner(language));
            assert.equal(clue.language, language);
            assert.equal(clue.treeLanguage, language === 'zh-CN' ? 'zh' : language);
            assert.ok(clue.sentence.toLowerCase().includes(clue.word));
            assert.ok(matchesTacticalClue(clue, '  ' + clue.word + '！'));
            assert.equal(matchesTacticalClue(clue, '无关文字'), false);
        }
    }
});

test('a double submission, a failed write, and retry award a single native ward and reuse one receipt', async () => {
    const saved = [];
    let release;
    const session = clueSession(async evidence => {
        saved.push(evidence);
        if (saved.length === 1) { await new Promise(done => { release = done; }); throw Error('write failed'); }
        return receipt(evidence.id);
    });
    const wards = session.battle.sides.near[0].wards;
    const before = wards.length;
    await session.answer('错');
    assert.equal(saved.length, 0);
    const first = session.answer('불');
    assert.match(await session.answer('불'), /正在记录/);
    release();
    assert.match(await first, /保存/);
    assert.equal(wards.length, before);
    await session.answer('불');
    await session.answer('불');
    assert.equal(wards.length, before + 1);
    assert.deepEqual(session.updates, ['shield', 'paint']);
    assert.deepEqual(saved.map(e => e.id), [saved[0].id, saved[0].id]);
    assert.deepEqual(saved[1].words, ['불']);
    assert.equal(saved[1].attempts, 3);
});

test('stale turn, save role, language, death, or closed battle cannot receive a delayed reward', async () => {
    const changes = [s => { s.battle.turn++; }, s => { s.roleEpoch++; }, s => { s.save = learner('ja'); },
        s => { s.battle.sides.near[0].hp = 0; }, s => { s.stage = 'world'; }, s => { s.battle.finished = true; }];
    for (const change of changes) {
        let session;
        session = clueSession(async (evidence, available) => {
            change(session.state);
            assert.equal(available(), false);
            return receipt(evidence.id);
        });
        await session.answer('불');
        assert.equal(session.updates.length, 0);
        assert.ok(!session.battle.tacticalEncounter.clueWardUsed);
    }
});

test('a rollback recreates the bonus on its original turn exactly once', () => {
    const battle = create(), decisions = [];
    playTacticsFieldRound({ battle, decisions, create }, { pass: true });
    assert.ok(grantTacticalClueWard(battle));
    const result = playTacticsFieldRound({ battle, decisions, create }, { pass: true }, () => { throw Error('visual failed'); });
    assert.equal(result.battle.turn, 2);
    assert.equal(result.battle.tacticalEncounter.clueWardTurn, 2);
    assert.deepEqual(result.battle.sides.near[0].wards, battle.sides.near[0].wards);
    assert.equal(grantTacticalClueWard(result.battle), false);
});

test('percentage assistance stays available outside the three challenges', () => {
    const normal = create(), story = createTacticsFieldBattle(dataset, content);
    const before = [normal, story].map(b => b.sides.far[0].hp);
    applyLearningSpeech(normal, 50); applyLearningSpeech(story, 50);
    assert.equal(normal.sides.far[0].hp, before[0]);
    assert.ok(story.sides.far[0].hp < before[1]);
    applyLearningSpeech(normal, 100); applyLearningSpeech(story, 100);
    assert.ok(!normal.finished); assert.ok(story.finished);
});

test('a group warning remains valid when its original anchor falls, and review credits only protection for the hero', () => {
    const battle = create('elite'), [hero, ally] = battle.sides.near, foe = battle.sides.far[0];
    const row = { caster: foe.id, targetId: ally.id, targetName: '我方全体', affectedTargetIds: [hero.id, ally.id], scope: 'all', effect: '群攻' };
    ally.hp = 0;
    assert.match(describeIntent(battle, row, true), /群攻 → 我方全体/);
    assert.match(describeIntent(battle, { ...row, scope: 'single' }, false), /本招取消/);
    battle.winner = 'far';
    battle.tacticalEncounter.history.push({ ...row, turn: 3, outcome: 'resolved', damage: [{ target: hero.id, amount: 80 }],
        consumed: [{ target: ally.id, kind: 'ward', boost: -50 }] });
    assert.match(tacticalReview(battle).join(' '), /没有触发护盾/);
    battle.tacticalEncounter.history[0].consumed.push({ target: hero.id, kind: 'ward', boost: -50 });
    assert.match(tacticalReview(battle).join(' '), /已经触发减伤/);
});

test('a warning names its lingering ticks and a lethal tick explains damage during recovery', () => {
    const battle = create('boss');
    const hero = battle.sides.near[0], caster = battle.sides.far[0];
    const row = { caster: caster.id, targetId: hero.id, effect: '重击', effects: { dot: [44, 44, 44] } };
    assert.match(describeIntent(battle, row, true), /重击 → 你（持续3次）/);
    hero.hp = 0;
    battle.winner = 'far';
    battle.events.push({ type: 'dot', target: hero.id, amount: 44, card: 'ember' });
    assert.match(tacticalReview(battle, { ember: { name: '余烬' } }).join(' '), /44 点来自余烬的持续伤害/);
});

test('a playable response at a skipped lethal heavy takes priority over an older shield mistake', () => {
    const battle = create('boss'), hero = battle.sides.near[0], foe = battle.sides.far[0];
    const key = 'Fire_SingleAttackWithDOT_Level2', shielded = 'olderSpell';
    battle.resolved.cards[shielded] = { pipcost: 2 };
    battle.winner = 'far';
    hero.hp = 0;
    const decision = { type: 'tactic_resources', turn: 8, caster: hero.id, pass: true,
        hand: [{ key: 'Death_AreaDamageWeakness', castable: true }] };
    const lethalHit = { type: 'damage', turn: 8, caster: foe.id, card: key, target: hero.id, amount: 83 };
    const resolved = { turn: 8, key, caster: foe.id, effect: '重击', outcome: 'resolved',
        damage: [{ target: hero.id, amount: 83 }], consumed: [] };
    battle.tacticalEncounter.history.push(resolved);
    battle.events.push({ type: 'tactic_shield_break', turn: 5, caster: hero.id, key: shielded }, decision, lethalHit);
    const review = () => tacticalReview(battle, { Death_AreaDamageWeakness: { name: '群之羁绊' } }).join(' ');
    assert.match(review(), /第 8 回合.*跳过.*群之羁绊.*削弱/);
    decision.hand[0].castable = false;
    assert.match(review(), /第 5 回合/);
    decision.hand[0] = { key: 'Ice_GlobalShield', castable: true };
    assert.match(review(), /第 8 回合.*给自己上盾/);
    resolved.consumed.push({ kind: 'ward', target: hero.id, boost: -50 });
    assert.match(review(), /第 5 回合/);
    resolved.consumed.length = 0;
    decision.pass = false;
    assert.match(review(), /第 5 回合/);
    decision.pass = true;
    battle.events.push({ ...lethalHit, type: 'dot' });
    assert.match(review(), /持续伤害/);
});

test('a pure attacker gets credit for their own shield break and their ally gets credit for shielding them', () => {
    const battle = create('elite'), [hero, ally] = battle.sides.near, foe = battle.sides.far[0];
    const key = Object.keys(battle.resolved.cards).find(key => Number(battle.resolved.cards[key].pipcost) === 1);
    battle.winner = 'near';
    battle.events.push({ turn: 2, type: 'ward', caster: ally.id, target: hero.id, ids: ['42'] },
        { turn: 4, type: 'tactic_shield_break', caster: hero.id, key, segment: 'immediate', targetId: foe.id },
        { turn: 7, type: 'damage', caster: hero.id, target: foe.id, amount: 39, card: key });
    battle.tacticalEncounter.history.push({ turn: 4, caster: foe.id, effect: '重击', outcome: 'resolved',
        damage: [{ target: hero.id, amount: 22 }], consumed: [{ target: hero.id, kind: 'ward', id: 42, boost: -50 }] });
    const review = tacticalReview(battle, { [key]: { name: '火焰爆' } });
    assert.match(review[0], /你用火焰爆击破了/);
    assert.ok(review[1].includes(ally.name + '施加的护盾'));
    assert.match(review[2], /第 7 回合，你的火焰爆.*39 点伤害/);
    battle.events.unshift({ turn: 1, type: 'ward', caster: hero.id, target: hero.id, ids: ['42'] });
    assert.doesNotMatch(tacticalReview(battle).join(' '), /施加的护盾/);
});

test('a healthy attack-only victory credits a real hit, including delayed damage', () => {
    const battle = create('boss'), hero = battle.sides.near[0], foe = battle.sides.far[0];
    battle.winner = 'near';
    battle.completedDecisions = 8;
    battle.events.push({ type: 'dot', turn: 8, caster: hero.id, target: foe.id, amount: 53, card: 'spark' });
    const review = tacticalReview(battle, { spark: { name: '星火' } });
    assert.match(review[0], /8 回合拿下挑战/);
    assert.match(review[1], /第 8 回合，你的星火.*53 点持续伤害/);
});

test('shielding the threatened partner appears in the win review only when the player cast the shield', () => {
    const battle = create('elite'), [hero, ally] = battle.sides.near, foe = battle.sides.far[0];
    battle.winner = 'near';
    battle.events.push({ turn: 5, type: 'ward', caster: hero.id, target: ally.id, ids: ['42'] });
    battle.tacticalEncounter.history.push({ turn: 5, caster: foe.id, effect: '重击', outcome: 'resolved',
        damage: [{ target: ally.id, amount: 370 }], consumed: [{ target: ally.id, kind: 'ward', id: 42, boost: -50 }] });
    assert.ok(tacticalReview(battle).join(' ').includes('你给' + ally.name + '的护盾挡下了部分重击伤害'));
    battle.events.at(-1).caster = ally.id;
    assert.doesNotMatch(tacticalReview(battle).join(' '), /你给.*的护盾/);
});

test('a narrow pure attack victory suggests a feasible response to the early heavy, not killing before it', () => {
    const battle = create('boss'), hero = battle.sides.near[0], foe = battle.sides.far[0];
    battle.winner = 'near';
    hero.hp = 46;
    battle.tacticalEncounter.history.push({ turn: 2, caster: foe.id, effect: '重击', outcome: 'resolved',
        effects: { dot: [44, 44, 44] }, damage: [{ target: hero.id, amount: 64 }], consumed: [] });
    const review = tacticalReview(battle).join(' ');
    assert.match(review, /第 2 回合选牌/);
    assert.match(review, /先给施法者上虚弱/);
    assert.match(review, /收势回合结算/);
    assert.match(review, /战前换用守势配卡/);
    assert.doesNotMatch(review, /出手前反击|这一击前结束战斗/);
    delete battle.tacticalEncounter.history[0].effects;
    assert.match(tacticalReview(battle).join(' '), /有可用护盾时给自己上盾/);
});
