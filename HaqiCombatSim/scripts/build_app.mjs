// Store/desktop build. Leaves dist/ and the CDN uploader alone.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageAppAssets } from './package_app_assets.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [viteBin, 'build'], {
        cwd: root,
        env: { ...process.env, HAQI_TARGET: 'app' },
        stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`vite build 退出码 ${code}`))));
});

const summary = packageAppAssets(root);
fs.writeFileSync(path.join(root, 'app-dist', 'index.html'), `<!DOCTYPE html>
<meta charset="utf-8">
<title>魔法哈奇</title>
<script>location.replace('Haqi.html')</script>
`);
console.log(`app-dist 已包含本地美术 ${summary.files} 个文件，${summary.bytes} 字节。dist 仍只用于 CDN 发布。`);
