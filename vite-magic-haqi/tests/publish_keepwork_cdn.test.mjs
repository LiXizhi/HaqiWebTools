import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildPublishPlan, normalizePrefix, parseCliArgs } from '../scripts/publish_keepwork_cdn.mjs';

test('normalizePrefix trims both sides and keeps trailing slash', () => {
  assert.equal(normalizePrefix('/keepwork/magic-haqi/v1'), 'keepwork/magic-haqi/v1/');
  assert.equal(normalizePrefix('keepwork/magic-haqi/v1/'), 'keepwork/magic-haqi/v1/');
});

test('parseCliArgs parses mode and options', () => {
  const args = parseCliArgs(['verify', '--prefix', '/keepwork/demo', '--origin', 'https://cdn.keepwork.com/']);
  assert.equal(args.mode, 'verify');
  assert.equal(args.prefix, 'keepwork/demo/');
  assert.equal(args.origin, 'https://cdn.keepwork.com');
});

test('buildPublishPlan computes stable hashes and urls', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-magic-haqi-test-'));
  const dist = path.join(tmp, 'dist');
  await fs.mkdir(path.join(dist, 'sub'), { recursive: true });
  await fs.writeFile(path.join(dist, 'index.html'), '<h1>ok</h1>');
  await fs.writeFile(path.join(dist, 'sub', 'a.txt'), 'abc');

  const plan = await buildPublishPlan({
    dist,
    prefix: 'keepwork/magic-haqi/v1/',
    origin: 'https://cdn.keepwork.com'
  });

  assert.equal(plan.files.length, 2);
  const index = plan.files.find((x) => x.path === 'index.html');
  const text = plan.files.find((x) => x.path === 'sub/a.txt');
  assert.ok(index);
  assert.ok(text);

  const expectedSha = createHash('sha256').update('abc').digest('hex');
  assert.equal(text.sha256, expectedSha);
  assert.equal(text.key, `keepwork/magic-haqi/v1/${expectedSha}.txt`);
  assert.equal(text.url, `https://cdn.keepwork.com/keepwork/magic-haqi/v1/${expectedSha}.txt`);
});
