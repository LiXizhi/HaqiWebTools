// run_batch_args.mjs — run_batch.mjs 的参数解析与校验（纯函数，不读写文件）。
// 相对路径（--data / --params / --json）统一按项目根目录解析；绝对路径原样使用。
import path from 'node:path';
import { MODES } from '../../js/combat_presets_core.js';

export const RUN_BATCH_USAGE = 'usage: node scripts/run_batch.mjs [--data data/sample] [--mode 1v1|2v2|3v3|4v4] [--games 200] [--level <dataset default>] [--policy deck_attacker] [--seed 1] [--params params.json] [--json out.json]';

const VALUE_FLAGS = ['data', 'mode', 'games', 'level', 'policy', 'seed', 'params', 'json'];

export function resolveFromRoot(root, p) {
    return path.isAbsolute(p) ? p : path.join(root, p);
}

function parseInteger(name, raw, { min } = {}) {
    if (!/^-?\d+$/.test(raw)) throw new Error(`--${name} must be an integer, got "${raw}"`);
    const n = Number(raw);
    if (min !== undefined && n < min) throw new Error(`--${name} must be >= ${min}, got ${n}`);
    return n;
}

/**
 * @param argv process.argv.slice(2)
 * @param root 项目根目录（HaqiCombatSim/）
 * @return { data, mode, games, level?, policy, seed, paramsPath?, jsonPath? }
 *   data 保持相对写法（由调用方的 readJson 按根目录解析），level 未指定时为 undefined（按数据集默认）。
 * @throws Error 参数缺值、未知参数或数值非法时
 */
export function parseRunBatchArgs(argv, root) {
    const raw = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith('--')) throw new Error(`unexpected argument "${a}"`);
        const name = a.slice(2);
        if (!VALUE_FLAGS.includes(name)) throw new Error(`unknown option --${name}`);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) throw new Error(`--${name} requires a value`);
        raw[name] = next;
        i++;
    }
    const mode = raw.mode ?? '1v1';
    if (!Object.hasOwn(MODES, mode)) throw new Error(`--mode must be one of ${Object.keys(MODES).join(', ')}, got "${mode}"`);
    return {
        data: raw.data ?? 'data/sample',
        mode,
        games: raw.games === undefined ? 200 : parseInteger('games', raw.games, { min: 1 }),
        level: raw.level === undefined ? undefined : parseInteger('level', raw.level, { min: 1 }),
        policy: raw.policy ?? 'deck_attacker',
        seed: raw.seed === undefined ? 1 : parseInteger('seed', raw.seed),
        paramsPath: raw.params === undefined ? undefined : resolveFromRoot(root, raw.params),
        jsonPath: raw.json === undefined ? undefined : resolveFromRoot(root, raw.json),
    };
}
