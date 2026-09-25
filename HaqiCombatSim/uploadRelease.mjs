// MagicHaqi-style immutable release, using Maisi's existing credential flow.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { maisiCandidates, syncMaisiRelease } from './scripts/sync_maisi_release.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const release = path.join(root, 'release');
const pages = ['Haqi', 'HaqiCombatSim', 'HaqiCards', 'HaqiEffects', 'HaqiOfficialWebsite'];
const args = new Set(process.argv.slice(2));
for (const arg of args) if (!['--dry-run', '--verify-only'].includes(arg)) throw new Error(`未知参数：${arg}`);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function collect(directory, prefix = '') {
    return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap(entry => {
        const relative = `${prefix}${entry.name}`;
        const absolute = path.join(directory, entry.name);
        if (entry.isSymbolicLink() || entry.name.startsWith('.')) throw new Error(`不允许发布隐藏文件或链接：${relative}`);
        if (entry.isDirectory()) return collect(absolute, `${relative}/`);
        // Static artwork/audio already has permanent URLs in the media manifests.
        // Defensively skip any manually added media; Vite never emits it either.
        if (/\.(webp|ogg)$/i.test(entry.name)) return [];
        const localeText = /^data\/adventure\/locale\/[A-Za-z0-9._-]+\.txt$/.test(relative);
        if (!localeText && !/\.(html|js|css|json)$/.test(entry.name)) throw new Error(`不允许发布此类型：${relative}`);
        const bytes = fs.readFileSync(absolute);
        return [{ path: relative, bytes: bytes.length, sha256: sha256(bytes) }];
    });
}

const files = collect(dist);
for (const page of pages) if (!files.some(file => file.path === `${page}.html`)) throw new Error(`缺少 ${page}.html，请先构建`);
// Every runtime file contributes: data-only and media-only edits get new URLs too.
const hash = sha256(JSON.stringify(files)).slice(0, 16);
const payload = path.join(root, '.asset-cache', 'release-payload', hash);
const base = `https://cdn.keepwork.com/haqi/haqicombatsim/release/${hash}/`;
const manifest = { version: 1, hash, base, verified: false, files };
fs.mkdirSync(release, { recursive: true });
fs.writeFileSync(path.join(release, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`发布计划：${files.length} 个文件，${files.reduce((sum, file) => sum + file.bytes, 0)} 字节\n${base}`);

if (!args.has('--dry-run')) {
    if (!args.has('--verify-only')) {
        const skill = '.github/skills/upload-deploy-cdn-files/qiniu_upload_local_files.py';
        const candidates = [process.env.HAQI_CDN_UPLOADER];
        candidates.push(...maisiCandidates(root).map(candidate => path.join(candidate, skill)));
        const uploader = candidates.find(candidate => candidate && fs.existsSync(candidate));
        if (!uploader) throw new Error('找不到Maisi上传器，请设置 MAISI_ROOT 或 HAQI_CDN_UPLOADER。');
        // Build an exact allowlisted payload; passing dist/assets to the uploader
        // would recursively upload every local image despite the filtered plan.
        if (fs.existsSync(payload)) {
            const expectedRoot = path.resolve(root, '.asset-cache', 'release-payload') + path.sep;
            if (!path.resolve(payload).startsWith(expectedRoot)) throw new Error('非法发布暂存路径');
            fs.rmSync(payload, { recursive: true, force: true });
        }
        for (const file of files) {
            const target = path.join(payload, file.path);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.copyFileSync(path.join(dist, file.path), target);
        }
        const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
        const result = spawnSync(python, [uploader, '--prefix', new URL(base).pathname.slice(1),
            ...fs.readdirSync(payload).sort().map(name => path.join(payload, name))], {
            stdio: 'inherit', env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        });
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(`CDN上传失败：${result.status}`);
    }
    let cursor = 0;
    await Promise.all(Array.from({ length: 8 }, async () => {
        while (cursor < files.length) {
            const file = files[cursor++];
            const response = await fetch(new URL(file.path, base), { signal: AbortSignal.timeout(60000) });
            if (!response.ok) throw new Error(`CDN读取失败：${file.path} (${response.status})`);
            if (response.headers.get('access-control-allow-origin') !== '*') throw new Error(`CDN缺少跨域许可：${file.path}`);
            const bytes = Buffer.from(await response.arrayBuffer());
            if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) throw new Error(`CDN哈希不匹配：${file.path}`);
        }
    }));
    manifest.verified = true;
    fs.writeFileSync(path.join(release, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

// Only advertise deployable wrappers after every uploaded file has been checked.
if (manifest.verified || args.has('--dry-run')) {
    for (const page of pages) {
        const html = fs.readFileSync(path.join(dist, `${page}.html`), 'utf8');
        // A CDN base also changes fragment-only anchors. Resolve them against the
        // actual host document so simulator tabs stay on their release HTML.
        const fragmentRouting = `<script>for(const type of ['click','auxclick'])document.addEventListener(type,event=>{const anchor=event.target.closest?.('a[href^="#"]');if(anchor)anchor.href=new URL(anchor.getAttribute('href'),location.href).href;});</script>`;
        const output = html.replace(/<head>/i, `<head>\n  <base href="${base}">\n  ${fragmentRouting}`);
        const suffix = manifest.verified ? '_v1' : '_preview';
        fs.writeFileSync(path.join(release, `${page}${suffix}.html`), output);
        console.log(`${manifest.verified ? '已验证' : '仅预览，尚未上传'}：${base}${page}.html`);
    }
}

if (manifest.verified) {
    const destination = syncMaisiRelease({ projectRoot: root, releaseDir: release, pages, verified: true });
    console.log(destination ? `已同步发布入口到：${destination}` : '未找到本机Maisi仓库，跳过发布入口复制。');
}
