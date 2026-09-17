#!/usr/bin/env node
// run_batch.mjs — 命令行批量模拟（与页面共用 sim_batch_core）。
// 用法：node scripts/run_batch.mjs [--data data/teen] [--mode 1v1] [--games 500] [--level 60] [--policy deck_attacker] [--seed 1] [--params params.json] [--json out.json]
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset } from '../js/data_core.js';
import { defaultParams, resolveParams, parseParams, SCHOOLS } from '../js/combat_params_core.js';
import { buildJobs, runJob, aggregateMatrix, aggregateGlobal, mergeStats } from '../js/sim_batch_core.js';
import { defaultLevel } from '../js/combat_presets_core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = {};
for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
}
const readJson = async (p) => JSON.parse(await readFile(path.isAbsolute(p) ? p : path.join(root, p), 'utf8'));
const dataset = await loadDataset(args.data || 'data/sample', readJson);
let params = defaultParams(dataset.version);
if (args.params) params = parseParams(await readFile(args.params, 'utf8'), dataset.version);
const resolved = resolveParams(dataset, params);
const cfg = {
    mode: args.mode || '1v1',
    games: Number(args.games || 200),
    level: Number(args.level || defaultLevel(dataset.version)),
    policy: args.policy || 'deck_attacker',
    seed: args.seed ? Number(args.seed) : 1,
    chunk: 100000,
    presetCopies: resolved.global.deckPresetCopies,
};
const jobs = buildJobs(dataset, cfg);
const t0 = Date.now();
const byMatchup = {};
const all = [];
for (const job of jobs) {
    const st = runJob(resolved, job);
    byMatchup[job.matchup] = mergeStats(byMatchup[job.matchup], st);
    all.push(st);
    process.stdout.write('.');
}
process.stdout.write('\n');
const matrix = aggregateMatrix(byMatchup, SCHOOLS);
const glob = aggregateGlobal(all);
const pad = (s, n) => String(s).padEnd(n);
console.log(`dataset=${dataset.name} version=${dataset.version} mode=${cfg.mode} games/matchup=${cfg.games} level=${cfg.level} policy=${cfg.policy} time=${Date.now() - t0}ms`);
console.log(pad('', 8) + SCHOOLS.map(s => pad(s, 9)).join(''));
for (const a of SCHOOLS) console.log(pad(a, 8) + SCHOOLS.map(b => pad((matrix.cells[a][b].winRate * 100).toFixed(1) + '%', 9)).join(''));
console.log('summary:', SCHOOLS.map(s => `${s} ${(matrix.summary[s].winRate * 100).toFixed(1)}% [${(matrix.summary[s].ci[0] * 100).toFixed(0)}-${(matrix.summary[s].ci[1] * 100).toFixed(0)}] t${matrix.summary[s].avgTurns.toFixed(1)} d${(matrix.summary[s].drawRate * 100).toFixed(0)}%`).join(' | '));
console.log(`balance: mean ${(matrix.balance.mean * 100).toFixed(1)}% spread ${(matrix.balance.spread * 100).toFixed(1)} std ${(matrix.balance.std * 100).toFixed(2)} firstMove ${(matrix.balance.firstMoveWinRate * 100).toFixed(1)}%`);
console.log(`avgTurns ${glob.avgTurns.toFixed(1)} fizzle ${(glob.fizzleRate * 100).toFixed(1)}% pass ${(glob.passRate * 100).toFixed(1)}% unsupported: ${Object.entries(glob.total.unsupported).map(([t, r]) => `${t}×${r.count}`).join(', ') || 'none'}`);
if (args.json) {
    await writeFile(args.json, JSON.stringify({ cfg, matrix, global: glob, params }, null, 1));
    console.log('written', args.json);
}
