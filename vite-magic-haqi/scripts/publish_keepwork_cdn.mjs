#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');

export function normalizePrefix(prefix) {
  if (!prefix || typeof prefix !== 'string') throw new Error('prefix is required');
  return `${prefix.replace(/^\/+/, '').replace(/\/+$/, '')}/`;
}

export function parseCliArgs(argv) {
  const args = {
    mode: 'prepare',
    dist: path.join(rootDir, 'dist'),
    plan: path.join(rootDir, 'cdn-publish-plan.json'),
    staging: path.join(rootDir, '.asset-cache', 'publish'),
    prefix: 'keepwork/magic-haqi/v1/',
    origin: 'https://cdn.keepwork.com',
    corsOrigin: 'http://127.0.0.1:4173',
    skipCors: false
  };

  const tokens = [...argv];
  if (tokens[0] === 'prepare' || tokens[0] === 'verify') {
    args.mode = tokens.shift();
  }

  while (tokens.length) {
    const key = tokens.shift();
    const value = tokens[0];
    if (key === '--dist') args.dist = path.resolve(value), tokens.shift();
    else if (key === '--plan') args.plan = path.resolve(value), tokens.shift();
    else if (key === '--staging') args.staging = path.resolve(value), tokens.shift();
    else if (key === '--prefix') args.prefix = value, tokens.shift();
    else if (key === '--origin') args.origin = value, tokens.shift();
    else if (key === '--cors-origin') args.corsOrigin = value, tokens.shift();
    else if (key === '--skip-cors') args.skipCors = true;
    else throw new Error(`Unknown argument: ${key}`);
  }

  args.prefix = normalizePrefix(args.prefix);
  args.origin = args.origin.replace(/\/+$/, '');
  return args;
}

async function walkFiles(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(abs, base)));
    else if (entry.isFile()) files.push({ abs, rel: path.relative(base, abs).replaceAll(path.sep, '/') });
  }
  return files.sort((a, b) => a.rel.localeCompare(b.rel));
}

async function hashFile(absPath) {
  const bytes = await fs.readFile(absPath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { bytes, sha256, size: bytes.length };
}

export async function buildPublishPlan({ dist, prefix, origin }) {
  const stat = await fs.stat(dist).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`dist directory not found: ${dist}`);

  const files = await walkFiles(dist);
  if (!files.length) throw new Error(`No files found under dist: ${dist}`);

  const rows = [];
  for (const file of files) {
    const { sha256, size } = await hashFile(file.abs);
    const ext = path.extname(file.rel) || '.bin';
    const key = `${prefix}${sha256}${ext}`;
    rows.push({
      path: file.rel,
      size,
      sha256,
      key,
      url: `${origin}/${key}`
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceDist: path.resolve(dist),
    prefix,
    origin,
    files: rows
  };
}

async function prepare(plan, { dist, staging, planPath }) {
  await fs.mkdir(staging, { recursive: true });

  const copied = new Set();
  for (const row of plan.files) {
    const src = path.join(dist, row.path);
    const fileName = path.basename(row.key);
    const dest = path.join(staging, fileName);
    if (copied.has(fileName)) continue;
    copied.add(fileName);
    await fs.copyFile(src, dest);
  }

  await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  const totalBytes = plan.files.reduce((sum, row) => sum + row.size, 0);
  console.log(`${plan.files.length} files prepared (${totalBytes} bytes).`);
  console.log(`Staging directory: ${staging}`);
  console.log(`Plan file: ${planPath}`);
  console.log('Upload staged files to Keepwork CDN with the exact file names listed in the plan.');
}

export async function verifyPublishPlan(plan, { corsOrigin, skipCors }) {
  const failures = [];
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(6, Math.max(1, os.cpus().length)) }, async () => {
      while (cursor < plan.files.length) {
        const row = plan.files[cursor++];
        try {
          const res = await fetch(row.url, {
            headers: corsOrigin ? { Origin: corsOrigin } : undefined,
            signal: AbortSignal.timeout(30000)
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          if (!skipCors && corsOrigin) {
            const acao = res.headers.get('access-control-allow-origin');
            if (!['*', corsOrigin].includes(acao ?? '')) throw new Error(`CORS ${acao ?? '(missing)'}`);
          }
          const bytes = Buffer.from(await res.arrayBuffer());
          const sha = createHash('sha256').update(bytes).digest('hex');
          if (bytes.length !== row.size || sha !== row.sha256) {
            throw new Error(`Checksum mismatch (${bytes.length}/${sha})`);
          }
        } catch (error) {
          failures.push(`${row.path}: ${error.message}`);
        }
      }
    })
  );

  if (failures.length) throw new Error(failures.join('\n'));
  console.log(`${plan.files.length} files verified from Keepwork CDN.`);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);

  if (args.mode === 'prepare') {
    const plan = await buildPublishPlan({ dist: args.dist, prefix: args.prefix, origin: args.origin });
    await prepare(plan, { dist: args.dist, staging: args.staging, planPath: args.plan });
    return;
  }

  if (args.mode === 'verify') {
    const text = await fs.readFile(args.plan, 'utf8');
    const plan = JSON.parse(text);
    await verifyPublishPlan(plan, { corsOrigin: args.corsOrigin, skipCors: args.skipCors });
    return;
  }

  throw new Error(`Unsupported mode: ${args.mode}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
