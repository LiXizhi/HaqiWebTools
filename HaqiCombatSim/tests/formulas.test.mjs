// 公式回归测试：与 card_server.lua / player_server.lua 手算结果对照
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, hashSeed } from '../js/rng_core.js';
import {
    aboveMinBoost, damageExpression, healExpression, applyHealPenalty,
    tryCriticalStrike, tryDodge, rollFizzle, baseMaxHp, applyHpStats,
    powerPipChanceByLevel, generatePip, canAffordCard, costPips,
    arenaDamageBoost, absorbDamage, isOwnSchoolCost,
} from '../js/combat_formulas_core.js';

test('rng: 同种子序列一致、不同种子不同、fork 独立', () => {
    const a = createRng(42), b = createRng(42), c = createRng(43);
    const sa = Array.from({ length: 5 }, () => a.int(0, 1000));
    const sb = Array.from({ length: 5 }, () => b.int(0, 1000));
    const sc = Array.from({ length: 5 }, () => c.int(0, 1000));
    assert.deepEqual(sa, sb);
    assert.notDeepEqual(sa, sc);
    for (const v of sa) assert.ok(v >= 0 && v <= 1000);
    assert.equal(hashSeed('abc'), hashSeed('abc'));
    assert.notEqual(hashSeed('abc'), hashSeed('abd'));
});

test('above_min_boost：boost+100，下限 50', () => {
    assert.equal(aboveMinBoost(0), 100);
    assert.equal(aboveMinBoost(25), 125);
    assert.equal(aboveMinBoost(-80), 50);
});

test('damage_expression kids：逐项 ceil', () => {
    // base 100, 无绝对加成, charm +30, +20, damage% 10, resist -20
    const d = damageExpression(100, 0, { list: [30, 20], damagePercent: 10, resistPercent: -20 }, 'kids');
    // 100 → 130 → 156 → 172 (ceil 171.6) → 138 (ceil 137.6)
    assert.equal(d, 138);
});

test('damage_expression teen：正 buff 求和、负 buff 连乘', () => {
    const d = damageExpression(100, 0, { list: [30, 20, -50], damagePercent: 0, resistPercent: 0 }, 'teen');
    // 100 * 0.5 = 50 → ceil(50 * 1.5) = 75
    assert.equal(d, 75);
});

test('damage_expression kids：穿透削弱抗性且不超过上限', () => {
    const noPen = damageExpression(1000, 0, { list: [], resistPercent: -50 }, 'kids');
    const pen = damageExpression(1000, 0, { list: [], resistPercent: -50, spellPenetration: 100 }, 'kids');
    assert.equal(noPen, 500);
    // penetration 上限 70 → resist = ceil(-50 * 30/100) = -15 → 850
    assert.equal(pen, 850);
});

test('heal_expression：kids 逐项 ceil，teen 连乘且下限 1', () => {
    assert.equal(healExpression(100, [10, 10], 'kids'), 121);
    assert.ok(Math.abs(healExpression(100, [10, 10], 'teen') - 121) < 1e-9);
    assert.equal(healExpression(10, [-100], 'teen'), 1);
    assert.equal(applyHealPenalty(200, 30), 140);
    assert.equal(applyHealPenalty(200, 0), 200);
});

test('TryCriticalStrike：clamp 到 [0,100]，0 永不暴击、100 必暴击', () => {
    const rng = createRng(7);
    for (let i = 0; i < 50; i++) assert.equal(tryCriticalStrike(rng, 0, 50), false);
    for (let i = 0; i < 50; i++) assert.equal(tryCriticalStrike(rng, 150, 0), true);
    // 50% 大样本接近 0.5
    let hit = 0; const N = 4000;
    for (let i = 0; i < N; i++) if (tryCriticalStrike(rng, 50, 0)) hit++;
    assert.ok(Math.abs(hit / N - 0.5) < 0.03, `crit rate ${hit / N}`);
});

test('TryDodge：teen 等级差 & 阈值', () => {
    const rng = createRng(3);
    // hit 100 → 101*100 > 10000 永不闪避
    for (let i = 0; i < 100; i++) assert.equal(tryDodge(rng, { hitChance: 0, dodge: 0 }, 'teen'), false);
    // dodge 100 → hit 0 → 必闪避
    for (let i = 0; i < 100; i++) assert.equal(tryDodge(rng, { hitChance: 0, dodge: 100 }, 'kids'), true);
    // teen：等级差补偿 (60-40)*1 = +20 → 100-100+20 = 20% 命中
    let hit = 0; const N = 4000;
    for (let i = 0; i < N; i++) if (!tryDodge(rng, { hitChance: 0, dodge: 100, casterLevel: 60, targetLevel: 40 }, 'teen')) hit++;
    assert.ok(Math.abs(hit / N - 0.2) < 0.03, `hit ${hit / N}`);
});

test('rollFizzle：accuracy 100 不失误，0 几乎全失误', () => {
    const rng = createRng(11);
    for (let i = 0; i < 200; i++) assert.equal(rollFizzle(rng, 100), false);
    let fizz = 0;
    for (let i = 0; i < 1000; i++) if (rollFizzle(rng, 70)) fizz++;
    assert.ok(Math.abs(fizz / 1000 - 0.30) < 0.05, `fizzle ${fizz / 1000}`);
});

test('GetUpdatedMaxHP 基础曲线：kids 1 级/50 级锚点，teen 线性', () => {
    assert.equal(baseMaxHp('fire', 1, 'kids'), 415);
    assert.equal(baseMaxHp('fire', 50, 'kids'), 1500);
    assert.equal(baseMaxHp('ice', 50, 'kids'), 2025);
    assert.equal(baseMaxHp('storm', 1, 'teen'), 425);
    assert.equal(baseMaxHp('ice', 60, 'teen'), 48 * 59 + 600);
    assert.equal(baseMaxHp('life', 60, 'teen'), 42 * 59 + 540);
    // 装备 HP%
    assert.equal(applyHpStats(1000, 10, 50, 'teen'), 1150);
    assert.equal(applyHpStats(1000, 10, 0, 'kids'), 1314);
});

test('GetPowerPipChance 等级项', () => {
    assert.equal(powerPipChanceByLevel(5, 'kids'), 0);
    assert.equal(powerPipChanceByLevel(10, 'kids'), 10);
    assert.equal(powerPipChanceByLevel(50, 'kids'), 40);
    assert.equal(powerPipChanceByLevel(60, 'teen'), 30);
});

test('GeneratePip：kids 强力球独立计数、teen 强力球等于 2 颗普通球，均不超上限', () => {
    const rng = createRng(1);
    const k = { normal: 6, power: 0 };
    generatePip(rng, k, 100, 7, 'kids');
    assert.deepEqual(k, { normal: 6, power: 1 });
    generatePip(rng, k, 100, 7, 'kids');
    assert.deepEqual(k, { normal: 6, power: 1 }); // 已满
    const t = { normal: 13, power: 0 };
    generatePip(rng, t, 100, 14, 'teen');
    assert.deepEqual(t, { normal: 14, power: 0 });
    const n = { normal: 0, power: 0 };
    generatePip(rng, n, 0, 14, 'teen');
    assert.deepEqual(n, { normal: 1, power: 0 });
});

test('canAffordCard / costPips：本系 vs 他系（kids/teen）', () => {
    assert.equal(isOwnSchoolCost('balance', 'fire', 'teen'), true);
    assert.equal(isOwnSchoolCost('balance', 'fire', 'kids'), false);
    // 本系：power 抵 2
    assert.equal(canAffordCard({ normal: 1, power: 2 }, 5, true, 'kids'), true);
    assert.equal(canAffordCard({ normal: 1, power: 2 }, 6, true, 'kids'), false);
    // teen 他系：pipcost*2 <= normal + power
    assert.equal(canAffordCard({ normal: 4, power: 0 }, 2, false, 'teen'), true);
    assert.equal(canAffordCard({ normal: 3, power: 0 }, 2, false, 'teen'), false);
    // kids 他系：普通计费
    assert.equal(canAffordCard({ normal: 1, power: 1 }, 2, false, 'kids'), true);
    // X 费卡
    assert.equal(canAffordCard({ normal: 0, power: 0 }, -1, true, 'kids'), true);

    let p = { normal: 1, power: 2 };
    assert.equal(costPips(p, 5, true, 'kids'), 5);
    assert.deepEqual(p, { normal: 0, power: 0 });
    p = { normal: 3, power: 1 };
    assert.equal(costPips(p, 3, true, 'teen'), 3); // power 抵 2 + normal 1
    assert.deepEqual(p, { normal: 2, power: 0 });
    p = { normal: 5, power: 0 };
    assert.equal(costPips(p, 2, false, 'teen'), 2); // 每费 2 normal
    assert.deepEqual(p, { normal: 1, power: 0 });
    p = { normal: 1, power: 1 };
    assert.equal(costPips(p, 2, false, 'kids'), 2);
    assert.deepEqual(p, { normal: 0, power: 0 });
});

test('arenaDamageBoost 与 absorbDamage', () => {
    assert.equal(arenaDamageBoost(4, 100, 90), 20);
    assert.equal(arenaDamageBoost(0, 100, 50), 0);
    const layers = [{ pts: 100 }, { pts: 50 }];
    assert.equal(absorbDamage(layers, 120), 0);
    assert.deepEqual(layers.map(l => l.pts), [0, 30]);
    assert.equal(absorbDamage(layers, 100), 70);
});
