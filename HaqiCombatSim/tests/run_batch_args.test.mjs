import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseRunBatchArgs } from '../scripts/lib/run_batch_args.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('run_batch 参数：默认值', () => {
    assert.deepEqual(parseRunBatchArgs([], root), {
        data: 'data/sample', mode: '1v1', games: 200, level: undefined,
        policy: 'deck_attacker', seed: 1, paramsPath: undefined, jsonPath: undefined,
    });
});

test('run_batch 参数：显式值与路径统一按项目根解析', () => {
    const abs = path.resolve(path.sep, 'tmp', 'out.json');
    const a = parseRunBatchArgs(['--data', 'data/kids', '--mode', '2v2', '--games', '1000', '--level', '50',
        '--policy', 'reasoning', '--seed', '7', '--params', 'p/params.json', '--json', abs], root);
    assert.equal(a.data, 'data/kids');
    assert.equal(a.mode, '2v2');
    assert.equal(a.games, 1000);
    assert.equal(a.level, 50);
    assert.equal(a.policy, 'reasoning');
    assert.equal(a.seed, 7);
    assert.equal(a.paramsPath, path.join(root, 'p/params.json'));
    assert.equal(a.jsonPath, abs);
    assert.equal(parseRunBatchArgs(['--json', 'out.json'], root).jsonPath, path.join(root, 'out.json'));
});

test('run_batch 参数：缺值、未知参数与非法数值均报错', () => {
    for (const argv of [
        ['--level'],
        ['--level', '--games', '10'],
        ['--games', '0'],
        ['--games', 'abc'],
        ['--games', '1.5'],
        ['--level', '-3'],
        ['--seed', 'x'],
        ['--mode', '5v5'],
        ['--game', '10'],
        ['data/kids'],
    ]) {
        assert.throws(() => parseRunBatchArgs(argv, root), Error, argv.join(' '));
    }
});

test('run_batch CLI：非法参数时非零退出且不跑对局', () => {
    const r = spawnSync(process.execPath, [path.join(root, 'scripts/run_batch.mjs'), '--games', 'abc'], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--games must be an integer/);
    assert.match(r.stderr, /usage:/);
    assert.equal(r.stdout, '');
});
