// Copies WebP/Ogg referenced by the app build's runtime JSON into app-dist/.
// H5 dist/ is never touched. Mount sheets live under demos/mount-lab/ even when
// the manifest local path starts with assets/ (hero_renderer.js mountAsset).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCAL_PATH = /^(assets|demos)\/[a-zA-Z0-9_./-]+\.(webp|ogg)$/;

export function resolveLocalFile(root, local) {
    if (typeof local !== 'string' || !LOCAL_PATH.test(local) || local.includes('..')) throw new Error(`本地资源路径无效：${local}`);
    const direct = path.join(root, ...local.split('/'));
    if (fs.existsSync(direct)) return { source: direct, relative: local };
    if (local.startsWith('assets/')) {
        const relative = `demos/mount-lab/${local}`;
        const rewritten = path.join(root, ...relative.split('/'));
        if (fs.existsSync(rewritten)) return { source: rewritten, relative };
    }
    throw new Error(`缺少本地资源：${local}`);
}

function assertBytes(bytes, row, label) {
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (typeof row.webpSha256 === 'string') {
        if (row.webpSha256 !== hash) throw new Error(`哈希不符：${label}`);
    } else if (typeof row.sha256 === 'string' && row.sha256 !== hash) throw new Error(`哈希不符：${label}`);
    const size = Number.isInteger(row.bytes) ? row.bytes : Number.isInteger(row.size) ? row.size : null;
    if (size != null && size !== bytes.length) throw new Error(`大小不符：${label}`);
}

export function collectLocalRows(value, rows = []) {
    if (!value || typeof value !== 'object') return rows;
    if (typeof value.local === 'string' && LOCAL_PATH.test(value.local) && !value.local.includes('..')) rows.push(value);
    for (const child of Object.values(value)) collectLocalRows(child, rows);
    return rows;
}

function readJsonTree(directory, rows) {
    if (!fs.existsSync(directory)) throw new Error(`缺少运行时数据：${directory}`);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) readJsonTree(absolute, rows);
        else if (entry.name.endsWith('.json')) collectLocalRows(JSON.parse(fs.readFileSync(absolute, 'utf8')), rows);
    }
    return rows;
}

export function packageAppAssets(root, { dataDir = path.join(root, 'app-dist', 'data'), outDir = path.join(root, 'app-dist') } = {}) {
    const rows = readJsonTree(dataDir, []);
    const copied = new Map();
    for (const row of rows) {
        const resolved = resolveLocalFile(root, row.local);
        const bytes = fs.readFileSync(resolved.source);
        assertBytes(bytes, row, row.local);
        const previous = copied.get(resolved.relative);
        if (previous && previous.length !== bytes.length) throw new Error(`同一路径对应不同文件：${resolved.relative}`);
        copied.set(resolved.relative, bytes);
    }
    const base = path.resolve(outDir);
    for (const [relative, bytes] of copied) {
        const destination = path.resolve(base, ...relative.split('/'));
        if (destination !== base && !destination.startsWith(base + path.sep)) throw new Error(`资源输出越界：${relative}`);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, bytes);
    }
    const total = [...copied.values()].reduce((sum, bytes) => sum + bytes.length, 0);
    return { files: copied.size, bytes: total };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invoked) {
    const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
    const summary = packageAppAssets(root);
    console.log(`已打包本地美术 ${summary.files} 个文件，${summary.bytes} 字节`);
}
