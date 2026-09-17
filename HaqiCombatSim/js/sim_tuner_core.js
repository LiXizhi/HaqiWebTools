// sim_tuner_core.js — 启发式自动调参：以各系对外胜率趋近 50% 为目标，迭代调整 perSchool 系数。
// 纯逻辑：评估函数由调用方注入（页面用 Worker 池，Node 用同步 runJob）。
import { SCHOOLS, cloneParams } from './combat_params_core.js';

/** 目标函数：Σ(winRate-0.5)^2 + drawPenalty * Σ drawRate^2 */
export function objective(matrix, opts = {}) {
    const drawPenalty = opts.drawPenalty ?? 0.5;
    let v = 0;
    for (const s of matrix.schools) {
        const sm = matrix.summary[s];
        v += (sm.winRate - 0.5) ** 2;
        v += drawPenalty * (sm.drawRate ** 2);
    }
    return v;
}

/**
 * 比例控制 + 回溯：每轮按 (0.5 - winRate) 调整该系 field；若目标变差则减半步长重试。
 * @param params 起点 BalanceParams
 * @param evaluate async (params) → matrix（aggregateMatrix 输出）
 * @param opts { field:'hp'|'damage', iterations, gain, minStep, maxFactor, minFactor, onStep(stepInfo) }
 * @return { best: params, bestMatrix, history: [{iter, objective, factors, rates}] }
 */
export async function tuneProportional(params, evaluate, opts = {}) {
    const field = opts.field || 'hp';
    const iterations = opts.iterations ?? 6;
    let gain = opts.gain ?? 0.8;
    const minStep = opts.minStep ?? 0.005;
    const maxFactor = opts.maxFactor ?? 1.6;
    const minFactor = opts.minFactor ?? 0.6;
    const schools = opts.schools || SCHOOLS;

    let cur = cloneParams(params);
    let curMatrix = await evaluate(cur);
    let curObj = objective(curMatrix, opts);
    const history = [snapshotStep(0, cur, curMatrix, curObj, field, schools, 'init')];
    if (opts.onStep) opts.onStep(history[0]);
    let best = { params: cloneParams(cur), matrix: curMatrix, objective: curObj };

    for (let iter = 1; iter <= iterations; iter++) {
        if (opts.shouldStop && opts.shouldStop()) break;
        let accepted = false;
        let localGain = gain;
        for (let attempt = 0; attempt < 3 && !accepted; attempt++) {
            const cand = cloneParams(cur);
            let moved = 0;
            for (const s of schools) {
                const rate = curMatrix.summary[s].winRate;
                const err = 0.5 - rate; // 胜率低 → 增强
                const factor = cand.perSchool[s][field] ?? 1;
                let next = factor * (1 + localGain * err);
                next = Math.min(maxFactor, Math.max(minFactor, next));
                next = Math.round(next * 1000) / 1000;
                moved += Math.abs(next - factor);
                cand.perSchool[s][field] = next;
            }
            if (moved < minStep) { iter = iterations + 1; break; }
            const m = await evaluate(cand);
            const obj = objective(m, opts);
            const step = snapshotStep(iter, cand, m, obj, field, schools, obj < curObj ? 'accept' : `reject(gain ${localGain.toFixed(2)})`);
            history.push(step);
            if (opts.onStep) opts.onStep(step);
            if (obj < curObj) {
                cur = cand; curMatrix = m; curObj = obj; accepted = true;
                if (obj < best.objective) best = { params: cloneParams(cand), matrix: m, objective: obj };
            } else {
                localGain /= 2;
            }
        }
        // 三次都被拒绝：候选评估是确定性的（同种子），下一轮从更小的增益继续，避免重复评估同一候选
        if (!accepted) gain = localGain;
        if (gain < 0.05) break;
    }
    return { best: best.params, bestMatrix: best.matrix, bestObjective: best.objective, history };
}

/**
 * 坐标下降：逐系尝试 ±step，接受改进；一轮无改进则步长减半。
 */
export async function tuneCoordinate(params, evaluate, opts = {}) {
    const field = opts.field || 'hp';
    let step = opts.step ?? 0.1;
    const minStep = opts.minStep ?? 0.02;
    const rounds = opts.rounds ?? 3;
    const schools = opts.schools || SCHOOLS;
    let cur = cloneParams(params);
    let curMatrix = await evaluate(cur);
    let curObj = objective(curMatrix, opts);
    const history = [snapshotStep(0, cur, curMatrix, curObj, field, schools, 'init')];
    if (opts.onStep) opts.onStep(history[0]);
    let iter = 0;
    for (let r = 0; r < rounds && step >= minStep; r++) {
        let improved = false;
        for (const s of schools) {
            if (opts.shouldStop && opts.shouldStop()) return { best: cur, bestMatrix: curMatrix, bestObjective: curObj, history };
            const dir = curMatrix.summary[s].winRate > 0.5 ? -1 : 1; // 先试“正确”方向
            for (const sign of [dir, -dir]) {
                const cand = cloneParams(cur);
                cand.perSchool[s][field] = Math.round((cand.perSchool[s][field] + sign * step) * 1000) / 1000;
                if (cand.perSchool[s][field] <= 0.3) continue;
                const m = await evaluate(cand);
                const obj = objective(m, opts);
                iter++;
                const st = snapshotStep(iter, cand, m, obj, field, schools, obj < curObj ? `accept ${s}${sign > 0 ? '+' : '-'}${step}` : `reject ${s}${sign > 0 ? '+' : '-'}${step}`);
                history.push(st);
                if (opts.onStep) opts.onStep(st);
                if (obj < curObj) { cur = cand; curMatrix = m; curObj = obj; improved = true; break; }
            }
        }
        if (!improved) step /= 2;
    }
    return { best: cur, bestMatrix: curMatrix, bestObjective: curObj, history };
}

function snapshotStep(iter, params, matrix, obj, field, schools, note) {
    const factors = {};
    const rates = {};
    for (const s of schools) { factors[s] = params.perSchool[s][field]; rates[s] = matrix.summary[s].winRate; }
    return { iter, objective: obj, factors, rates, spread: matrix.balance.spread, note };
}
