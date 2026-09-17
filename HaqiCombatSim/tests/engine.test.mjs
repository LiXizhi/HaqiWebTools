// 引擎冒烟 + 确定性 + 批量聚合测试（使用 data/sample，不依赖本机 config/Aries）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset } from '../js/data_core.js';
import { defaultParams, resolveParams, mergeParams, diffParams, SCHOOLS } from '../js/combat_params_core.js';
import { createArena, runToEnd, startCombat, advanceTurn, castableCards, snapshot, playTurn } from '../js/combat_arena_core.js';
import { cardsInHand } from '../js/combat_unit_core.js';
import { createPolicy } from '../js/combat_policy_core.js';
import { unitSpec, presetDeck, matchupMatrix, SCHOOL_NAMES } from '../js/combat_presets_core.js';
import { buildJobs, runJob, mergeStats, aggregateMatrix, aggregateGlobal, wilson } from '../js/sim_batch_core.js';
import { tuneProportional } from '../js/sim_tuner_core.js';
import { buildPrompt, parseParamPatch, heuristicAdvice } from '../js/llm_advisor.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (p) => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const ds = await loadDataset('data/sample', readJson);
const params = defaultParams(ds.version);
const resolved = resolveParams(ds, params);

function play(a, b, seed, policy = 'deck_attacker', level = 50, teamSize = 1) {
    const near = Array.from({ length: teamSize }, () => unitSpec(ds, a, { level, policy }));
    const far = Array.from({ length: teamSize }, () => unitSpec(ds, b, { level, policy }));
    const arena = createArena({ resolved, near, far, seed, keepEvents: true });
    const pols = {};
    for (const u of [...arena.sides.near, ...arena.sides.far]) pols[u.id] = createPolicy(policy);
    return runToEnd(arena, pols);
}

test('sample 数据集加载：五系均有预设卡组且不含未支持类型', () => {
    assert.ok(ds.cards && Object.keys(ds.cards).length > 10);
    for (const s of SCHOOLS) {
        const deck = presetDeck(ds, s);
        assert.ok(deck.length >= 6, `${s} deck ${deck.length}`);
        for (const { key, count } of deck) { assert.ok(ds.cards[key], `${s} deck card ${key} missing`); assert.ok(count >= 1); }
    }
});

test('1v1 可跑完并产生合法结果', () => {
    const r = play('fire', 'ice', 1);
    assert.ok(['near', 'far', null, undefined].includes(r.winner));
    assert.ok(r.turns > 0 && r.turns <= resolved.global.maxRounds * 2 + 2);
    assert.ok(Object.keys(r.units).length === 2);
    for (const u of Object.values(r.units)) assert.ok(u.casts + u.passes > 0);
});

test('确定性：同种子结果与事件流完全一致', () => {
    const r1 = play('storm', 'death', 777);
    const r2 = play('storm', 'death', 777);
    assert.deepEqual(r1, r2);
    const r3 = play('storm', 'death', 778);
    assert.notDeepEqual(r1.events || r1, r3.events || r3);
});

test('2v2 / 3v3 / 4v4 均可完成', () => {
    for (const n of [2, 3, 4]) {
        const r = play('life', 'fire', 5, 'simple', 50, n);
        assert.equal(Object.keys(r.units).length, n * 2);
        assert.ok(r.turns > 0);
    }
});

test('RandomBot / SimpleBot 策略下不会抛异常，跳过率有限', () => {
    for (const policy of ['random', 'simple']) {
        let casts = 0, passes = 0, noCard = 0;
        for (let i = 0; i < 20; i++) {
            const r = play('ice', 'life', i + 1, policy);
            for (const u of Object.values(r.units)) { casts += u.casts; passes += u.passes; noCard += u.noCardPasses; }
        }
        // 卡包有容量上限，耗尽后只能跳过；只要求“手里有牌时”跳过少于出牌
        assert.ok(casts > passes - noCard, `${policy}: casts ${casts} passes ${passes} (deck empty ${noCard})`);
    }
});

test('回合状态机：开局后当前行动方有手牌与可出牌，snapshot 可序列化', () => {
    const near = [unitSpec(ds, 'fire', { level: 50, policy: 'human' })];
    const far = [unitSpec(ds, 'ice', { level: 50, policy: 'deck_attacker' })];
    const arena = createArena({ resolved, near, far, seed: 9, keepEvents: true });
    startCombat(arena);
    advanceTurn(arena);
    const u = arena.sides.near[0];
    const hand = cardsInHand(u);
    assert.ok(hand.length > 0);
    assert.ok(hand.length <= resolved.global.handSize);
    assert.ok(Array.isArray(castableCards(arena, u)));
    const snap = snapshot(arena);
    assert.ok(JSON.stringify(snap).length > 100);
    assert.ok(snap.near[0].hp > 0);
});

test('BalanceParams：HP 乘子生效且 diff 正确', () => {
    const patched = mergeParams(params, { perSchool: { fire: { hp: 1.5 } } });
    const res2 = resolveParams(ds, patched);
    const base = createArena({ resolved, near: [unitSpec(ds, 'fire', { level: 50 })], far: [unitSpec(ds, 'ice', { level: 50 })], seed: 1 });
    const boosted = createArena({ resolved: res2, near: [unitSpec(ds, 'fire', { level: 50 })], far: [unitSpec(ds, 'ice', { level: 50 })], seed: 1 });
    assert.equal(boosted.sides.near[0].maxHp, Math.ceil(base.sides.near[0].maxHp * 1.5));
    assert.equal(boosted.sides.far[0].maxHp, base.sides.far[0].maxHp);
    const d = diffParams(params, patched);
    assert.deepEqual(d.map(x => x.path), ['perSchool.fire.hp']);
});

test('DOT：X 费卡 "Np" 按实际消耗倍乘；负值段为溅射打持有者及相邻队友', () => {
    const ds2 = JSON.parse(JSON.stringify({ ...ds, cards: ds.cards, charms: ds.charms, aiDecks: {}, manifest: ds.manifest }));
    ds2.version = ds.version;
    ds2.cards.Test_DotX = { key: 'Test_DotX', type: 'DOTAttack', pipcost: -14, accuracy: 100, spellSchool: 'fire', params: { dots: '10p,10p', damage_school: 'fire' } };
    ds2.cards.Test_Splash = { key: 'Test_Splash', type: 'DOTAttack', pipcost: 0, accuracy: 100, spellSchool: 'fire', params: { dots: '-100,0', damage_school: 'fire' } };
    const res2 = resolveParams(ds2, mergeParams(defaultParams(ds.version), { global: { startupPipsNormal: 6, startupPipsPower: 0 } }));
    // 3v3：近端 1 号位施法者持 X 费 DOT；远端三人均不出牌
    const near = [unitSpec(ds2, 'fire', { level: 50, deck: ['Test_DotX', 'Test_Splash'] }), unitSpec(ds2, 'fire', { level: 50, deck: ['Pass'] }), unitSpec(ds2, 'fire', { level: 50, deck: ['Pass'] })];
    const far = [unitSpec(ds2, 'ice', { level: 50, deck: ['Pass'] }), unitSpec(ds2, 'ice', { level: 50, deck: ['Pass'] }), unitSpec(ds2, 'ice', { level: 50, deck: ['Pass'] })];
    const arena = createArena({ resolved: res2, near, far, seed: 5, keepEvents: true, firstSide: 'near' });
    startCombat(arena);
    const me = arena.sides.near[0];
    const hand = cardsInHand(me);
    const dotX = hand.find(c => c.key === 'Test_DotX');
    const pipsBefore = me.pips.normal + me.pips.power * 2;
    assert.ok(dotX && pipsBefore >= 2);
    playTurn(arena, { [me.id]: { seq: dotX.seq, key: 'Test_DotX', targetId: arena.sides.far[1].id } });
    const cast = arena.events.find(e => e.type === 'cast' && e.card === 'Test_DotX');
    assert.ok(cast && cast.realcost >= 2, `realcost ${cast && cast.realcost}`);
    playTurn(arena, {}); // 远端行动：中间目标结算第一跳
    const tick = arena.events.find(e => e.type === 'dot' && e.card === 'Test_DotX');
    assert.ok(tick, 'X 费 DOT 未结算');
    assert.ok(tick.amount >= 10 * cast.realcost * 0.5, `tick ${tick.amount} vs realcost ${cast.realcost}`);
    // 溅射：贴在远端 2 号位（slot 1），首跳应打到 slot 0/1/2 三人
    const seq2 = cardsInHand(me).find(c => c.key === 'Test_Splash');
    playTurn(arena, { [me.id]: { seq: seq2.seq, key: 'Test_Splash', targetId: arena.sides.far[1].id } });
    playTurn(arena, {});
    const splash = arena.events.filter(e => e.type === 'dot' && e.card === 'Test_Splash' && e.label === 'splash');
    assert.equal(new Set(splash.map(e => e.target)).size, 3, JSON.stringify(splash));
    for (const e of splash) assert.ok(e.amount > 0);
});

test('批量：buildJobs 覆盖 25 组，runJob + merge + aggregate 数值自洽', () => {
    const cfg = { mode: '1v1', games: 20, level: 50, policy: 'deck_attacker', seed: 1, chunk: 10 };
    const jobs = buildJobs(ds, cfg);
    assert.equal(new Set(jobs.map(j => j.matchup)).size, 25);
    assert.equal(jobs.length, 50);
    const by = {};
    const all = [];
    for (const j of jobs) { const st = runJob(resolved, j); by[j.matchup] = mergeStats(by[j.matchup], st); all.push(st); }
    const m = aggregateMatrix(by, SCHOOLS);
    for (const a of SCHOOLS) {
        let games = 0;
        for (const b of SCHOOLS) {
            const cell = m.cells[a][b];
            assert.ok(cell.games > 0);
            assert.ok(cell.winRate >= 0 && cell.winRate <= 1);
            games += cell.games;
            if (a !== b) {
                // 双向合并：A 胜率 + B 胜率 + 平局率 = 1
                const back = m.cells[b][a];
                assert.ok(Math.abs(cell.winRate + back.winRate + cell.drawRate - 1) < 1e-9);
            }
        }
        assert.ok(m.summary[a].winRate >= 0 && m.summary[a].winRate <= 1);
        assert.ok(m.summary[a].ci[0] <= m.summary[a].winRate + 1e-9 && m.summary[a].winRate <= m.summary[a].ci[1] + 1e-9);
    }
    assert.ok(m.balance.spread >= 0 && m.balance.spread <= 1);
    const g = aggregateGlobal(all);
    assert.equal(g.total.games, 25 * 20);
    assert.ok(g.avgTurns > 0);
});

test('矩阵生成：镜像与两向', () => {
    const ms = matchupMatrix(1, SCHOOLS);
    assert.equal(ms.length, 25);
    assert.ok(ms.some(m => m.nearSchools[0] === 'fire' && m.farSchools[0] === 'ice'));
    assert.ok(ms.some(m => m.nearSchools[0] === 'ice' && m.farSchools[0] === 'fire'));
});

test('wilson 区间', () => {
    const w = wilson(50, 100);
    assert.ok(w.lo < 0.5 && w.hi > 0.5);
    assert.ok(w.hi - w.lo < 0.22);
    const z = wilson(0, 0);
    assert.ok(Number.isFinite(z.lo) && Number.isFinite(z.hi));
});

test('调参器：目标函数单调、可停止、参数在边界内', async () => {
    let calls = 0;
    const fakeEval = async (p) => {
        calls++;
        // 假模型：胜率 = 0.5 + 0.4*(hp-1)，与 HP 乘子线性相关
        const summary = {}; const cells = {};
        for (const s of SCHOOLS) { const r = Math.min(1, Math.max(0, 0.5 + 0.4 * ((p.perSchool[s].hp || 1) - 1) + (s === 'fire' ? -0.2 : s === 'life' ? 0.2 : 0))); summary[s] = { winRate: r, drawRate: 0 }; }
        const rates = SCHOOLS.map(s => summary[s].winRate);
        return { schools: SCHOOLS, summary, cells, balance: { spread: Math.max(...rates) - Math.min(...rates), std: 0 } };
    };
    const res = await tuneProportional(params, fakeEval, { field: 'hp', iterations: 6, gain: 0.8 });
    assert.ok(res.bestObjective < 0.08, `obj ${res.bestObjective}`);
    assert.ok(res.best.perSchool.fire.hp > 1 && res.best.perSchool.life.hp < 1);
    assert.ok(calls >= 2 && res.history.length >= 2);
});

test('LLM 建议：提示词含矩阵、参数块解析、启发式补丁', () => {
    const cfg = { mode: '1v1', games: 10, level: 50, policy: 'deck_attacker', seed: 3, chunk: 10 };
    const by = {};
    const all = [];
    for (const j of buildJobs(ds, cfg)) { const st = runJob(resolved, j); by[j.matchup] = mergeStats(by[j.matchup], st); all.push(st); }
    const batch = { version: ds.version, dataset: 'sample', cfg, at: Date.now(), matrix: aggregateMatrix(by, SCHOOLS), global: aggregateGlobal(all), params };
    const prompt = buildPrompt(batch, ds, '测试备注');
    assert.ok(prompt.includes('测试备注'));
    for (const s of SCHOOLS) assert.ok(prompt.includes(SCHOOL_NAMES[s]));
    assert.ok(prompt.includes('胜率矩阵'));
    const patch = parseParamPatch('分析……\n```json\n{"perSchool":{"fire":{"hp":1.1}},"global":{"critDamageRatio":1.25}}\n```\n完');
    assert.deepEqual(patch, { perSchool: { fire: { hp: 1.1 } }, global: { critDamageRatio: 1.25 } });
    assert.equal(parseParamPatch('没有参数块'), null);
    const ha = heuristicAdvice(batch);
    assert.ok(ha.text.length > 10);
    for (const s of SCHOOLS) assert.ok(typeof ha.patch.perSchool[s].hp === 'number');
});
