// sim_batch_core.js — 批量模拟：任务生成、单任务执行、统计聚合（纯逻辑，Worker 与 Node 共用）。
import { createArena, runToEnd } from './combat_arena_core.js';
import { createPolicy } from './combat_policy_core.js';
import { unitSpec, matchupMatrix, MODES } from './combat_presets_core.js';
import { SCHOOLS } from './combat_params_core.js';
import { hashSeed } from './rng_core.js';

/**
 * 生成任务列表：每个 matchup 一个 job（可再按 chunk 拆分给多个 worker）
 * @param cfg { mode:'1v1'.., schools, games, level, policy, seed, chunk, mixed, decks?: {school: deck}, stats?: {school: stats}, gearScore?, presetCopies? }
 */
export function buildJobs(dataset, cfg) {
    const teamSize = MODES[cfg.mode] || 1;
    const schools = cfg.schools || SCHOOLS;
    const games = cfg.games || 200;
    const chunk = cfg.chunk || Math.max(25, Math.ceil(games / 4));
    const base = typeof cfg.seed === 'string' ? hashSeed(cfg.seed) : (cfg.seed || 12345);
    const jobs = [];
    let jobIndex = 0;
    for (const m of matchupMatrix(teamSize, schools, { mixed: cfg.mixed })) {
        const mk = (school, side, i) => unitSpec(dataset, school, {
            level: cfg.level, policy: cfg.policy || 'deck_attacker',
            deck: cfg.decks && cfg.decks[school] ? cfg.decks[school] : undefined,
            stats: cfg.stats && cfg.stats[school] ? cfg.stats[school] : undefined,
            gearScore: cfg.gearScore,
            presetCopies: cfg.presetCopies,
            name: `${school}#${side}${i + 1}`,
        });
        const near = m.nearSchools.map((s, i) => mk(s, 'N', i));
        const far = m.farSchools.map((s, i) => mk(s, 'F', i));
        for (let start = 0; start < games; start += chunk) {
            const n = Math.min(chunk, games - start);
            jobs.push({
                id: `${m.id}#${start}`,
                matchup: m.id,
                nearSchools: m.nearSchools,
                farSchools: m.farSchools,
                near, far,
                seedStart: (base + jobIndex * 1000003 + start) >>> 0,
                games: n,
                policy: cfg.policy || 'deck_attacker',
            });
        }
        jobIndex++;
    }
    return jobs;
}

export function emptyStats() {
    return {
        games: 0, nearWins: 0, farWins: 0, draws: 0, timeouts: 0, deckDraws: 0,
        firstMoverWins: 0, decisive: 0,
        turnsSum: 0, turnsSq: 0, turnsMin: Infinity, turnsMax: 0,
        casts: 0, fizzles: 0, passes: 0, noCardPasses: 0,
        unitGames: 0, deckExhausted: 0,
        nearHpSum: 0, farHpSum: 0,
        damageBySchool: {}, healBySchool: {},
        cardStats: {}, unsupported: {},
    };
}

/**
 * 同步执行一个 job
 * @param onProgress (done, total) 可选
 */
export function runJob(resolved, job, onProgress) {
    const st = emptyStats();
    st.matchup = job.matchup;
    st.nearSchools = job.nearSchools;
    st.farSchools = job.farSchools;
    for (let g = 0; g < job.games; g++) {
        const arena = createArena({ resolved, near: job.near, far: job.far, seed: (job.seedStart + g) >>> 0, keepEvents: false });
        const policies = {};
        for (const u of [...arena.sides.near, ...arena.sides.far]) {
            const spec = u.side === 'near' ? job.near[u.slot] : job.far[u.slot];
            policies[u.id] = createPolicy(spec.policyName || job.policy);
        }
        const r = runToEnd(arena, policies);
        accumulate(st, r);
        if (onProgress && (g % 10 === 9 || g === job.games - 1)) onProgress(g + 1, job.games);
    }
    return st;
}

export function accumulate(st, r) {
    st.games++;
    if (r.winner === 'near') st.nearWins++;
    else if (r.winner === 'far') st.farWins++;
    else { st.draws++; if (r.timeout) st.timeouts++; if (r.decksExhausted) st.deckDraws++; }
    if (r.winner) { st.decisive++; if (r.firstSide && r.winner === r.firstSide) st.firstMoverWins++; }
    st.turnsSum += r.turns;
    st.turnsSq += r.turns * r.turns;
    st.turnsMin = Math.min(st.turnsMin, r.turns);
    st.turnsMax = Math.max(st.turnsMax, r.turns);
    st.nearHpSum += r.nearHpRatio;
    st.farHpSum += r.farHpRatio;
    for (const u of Object.values(r.units)) {
        st.casts += u.casts; st.fizzles += u.fizzles; st.passes += u.passes; st.noCardPasses += u.noCardPasses || 0;
        st.unitGames += 1;
        if (u.deckRemaining === 0 && u.deckSize > 0) st.deckExhausted += 1;
        st.damageBySchool[u.school] = (st.damageBySchool[u.school] || 0) + u.damageDealt;
        st.healBySchool[u.school] = (st.healBySchool[u.school] || 0) + u.healDone;
    }
    for (const [k, n] of Object.entries(r.cardStats)) st.cardStats[k] = (st.cardStats[k] || 0) + n;
    for (const [t, rec] of Object.entries(r.unsupported)) {
        const dst = st.unsupported[t] || (st.unsupported[t] = { count: 0, cards: {} });
        dst.count += rec.count;
        for (const [ck, n] of Object.entries(rec.cards)) dst.cards[ck] = (dst.cards[ck] || 0) + n;
    }
}

export function mergeStats(a, b) {
    const out = a || emptyStats();
    if (!b) return out;
    out.matchup = out.matchup || b.matchup;
    out.nearSchools = out.nearSchools || b.nearSchools;
    out.farSchools = out.farSchools || b.farSchools;
    for (const k of ['games', 'nearWins', 'farWins', 'draws', 'timeouts', 'deckDraws', 'firstMoverWins', 'decisive', 'turnsSum', 'turnsSq', 'casts', 'fizzles', 'passes', 'noCardPasses', 'unitGames', 'deckExhausted', 'nearHpSum', 'farHpSum']) out[k] += b[k];
    out.turnsMin = Math.min(out.turnsMin, b.turnsMin);
    out.turnsMax = Math.max(out.turnsMax, b.turnsMax);
    for (const m of ['damageBySchool', 'healBySchool', 'cardStats']) for (const [k, v] of Object.entries(b[m])) out[m][k] = (out[m][k] || 0) + v;
    for (const [t, rec] of Object.entries(b.unsupported)) {
        const dst = out.unsupported[t] || (out.unsupported[t] = { count: 0, cards: {} });
        dst.count += rec.count;
        for (const [ck, n] of Object.entries(rec.cards)) dst.cards[ck] = (dst.cards[ck] || 0) + n;
    }
    return out;
}

/** Wilson 置信区间 */
export function wilson(wins, n, z = 1.96) {
    if (!n) return { p: 0, lo: 0, hi: 0 };
    const p = wins / n;
    const z2 = z * z;
    const denom = 1 + z2 / n;
    const center = (p + z2 / (2 * n)) / denom;
    const half = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / denom;
    return { p, lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

/**
 * 把按 matchup 的统计聚合为矩阵与每系汇总。
 * cell[a][b]：a 对 b 的胜率（合并 a_vs_b 的 near 胜 与 b_vs_a 的 far 胜，抵消先手影响）
 * @param statsByMatchup { 'fire_vs_ice': stats }
 */
export function aggregateMatrix(statsByMatchup, schools = SCHOOLS) {
    const cells = {};
    const first = { decisive: 0, wins: 0 };
    for (const a of schools) {
        cells[a] = {};
        for (const b of schools) {
            const ab = statsByMatchup[`${a}_vs_${b}`];
            const ba = statsByMatchup[`${b}_vs_${a}`];
            let wins = 0, losses = 0, draws = 0, games = 0, turns = 0, timeouts = 0;
            if (ab) { wins += ab.nearWins; losses += ab.farWins; draws += ab.draws; games += ab.games; turns += ab.turnsSum; timeouts += ab.timeouts; }
            if (ba && a !== b) { wins += ba.farWins; losses += ba.nearWins; draws += ba.draws; games += ba.games; turns += ba.turnsSum; timeouts += ba.timeouts; }
            if (a === b && ab) { wins = ab.nearWins; losses = ab.farWins; }
            const decisive = wins + losses;
            const w = wilson(wins, games);
            cells[a][b] = {
                games, wins, losses, draws, timeouts,
                winRate: games ? wins / games : 0,
                winRateDecisive: decisive ? wins / decisive : 0.5,
                drawRate: games ? draws / games : 0,
                ci: [w.lo, w.hi],
                avgTurns: games ? turns / games : 0,
            };
            if (ab) { first.decisive += ab.decisive || 0; first.wins += ab.firstMoverWins || 0; }
        }
    }
    const summary = {};
    for (const a of schools) {
        let wins = 0, games = 0, turns = 0, draws = 0, vsOthersWins = 0, vsOthersGames = 0;
        for (const b of schools) {
            const c = cells[a][b];
            wins += c.wins; games += c.games; turns += c.avgTurns * c.games; draws += c.draws;
            if (a !== b) { vsOthersWins += c.wins; vsOthersGames += c.games; }
        }
        const w = wilson(vsOthersWins, vsOthersGames);
        summary[a] = {
            winRate: vsOthersGames ? vsOthersWins / vsOthersGames : 0,
            ci: [w.lo, w.hi],
            games: vsOthersGames,
            drawRate: games ? draws / games : 0,
            avgTurns: games ? turns / games : 0,
            mirrorFirstWinRate: cells[a][a].games ? cells[a][a].wins / cells[a][a].games : null,
        };
    }
    const rates = schools.map(s => summary[s].winRate);
    const mean = rates.reduce((x, y) => x + y, 0) / (rates.length || 1);
    const spread = Math.max(...rates) - Math.min(...rates);
    const std = Math.sqrt(rates.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (rates.length || 1));
    return {
        schools, cells, summary,
        // firstMoveWinRate：先手方在有胜负的对局中的胜率（先手随机，双方均计）
        balance: { mean, spread, std, firstMoveWinRate: first.decisive ? first.wins / first.decisive : null },
    };
}

/** 汇总所有 job 的卡牌 / 未支持统计 */
export function aggregateGlobal(statsList) {
    const total = emptyStats();
    for (const s of statsList) mergeStats(total, s);
    const topCards = Object.entries(total.cardStats).sort((x, y) => y[1] - x[1]).slice(0, 40);
    return { total, topCards, avgTurns: total.games ? total.turnsSum / total.games : 0, fizzleRate: total.casts ? total.fizzles / total.casts : 0, passRate: (total.casts + total.passes) ? total.passes / (total.casts + total.passes) : 0,
        noCardPassRate: (total.casts + total.passes) ? total.noCardPasses / (total.casts + total.passes) : 0,
        deckExhaustedRate: total.unitGames ? total.deckExhausted / total.unitGames : 0 };
}
