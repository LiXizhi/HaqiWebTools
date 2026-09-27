import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function maisiCandidates(projectRoot, configuredRoot = process.env.MAISI_ROOT) {
    const candidates = configuredRoot ? [path.resolve(configuredRoot)] : [];
    for (let directory = path.resolve(projectRoot); ; directory = path.dirname(directory)) {
        candidates.push(path.join(directory, 'maisi'));
        if (path.dirname(directory) === directory) break;
    }
    return [...new Set(candidates)];
}

export function syncMaisiRelease({ projectRoot, releaseDir, pages, verified, configuredRoot }) {
    if (!verified) return null;
    const repo = maisiCandidates(projectRoot, configuredRoot).find(candidate =>
        fs.existsSync(path.join(candidate, '.git')) &&
        fs.existsSync(path.join(candidate, 'maisi/maisi/webgames/MagicHaqi/MagicHaqi.html')));
    if (!repo) return null;
    const destination = path.join(repo, 'maisi/maisi/webgames/MagicHaqi/release');
    return copyRelease(releaseDir, destination, pages);
}

function copyRelease(releaseDir, destination, pages) {
    const files = pages.flatMap(page => {
        if (!/^Haqi[A-Za-z]*$/.test(page)) throw new Error(`非法发布入口：${page}`);
        const name = `${page}_v1.html`;
        const bytes = fs.readFileSync(path.join(releaseDir, name));
        return page === 'HaqiOfficialWebsite' ? [{ name, bytes }, { name: `${page}.html`, bytes }] : [{ name, bytes }];
    });
    fs.mkdirSync(destination, { recursive: true });
    for (const { name, bytes } of files) {
        const target = path.join(destination, name);
        fs.writeFileSync(target, bytes);
        if (!fs.readFileSync(target).equals(bytes)) throw new Error(`发布入口复制校验失败：${target}`);
    }
    return destination;
}

export async function syncAppsRelease({ projectRoot, releaseDir, pages, verified, configuredRoot = process.env.APPS_ROOT, publish = false }) {
    if (!verified) return null;
    const candidates = maisiCandidates(projectRoot, '').map(candidate => path.join(path.dirname(candidate), 'apps'));
    if (configuredRoot) candidates.unshift(path.resolve(configuredRoot));
    const repo = candidates.find(candidate => fs.existsSync(path.join(candidate, '.git')) &&
        fs.existsSync(path.join(candidate, 'official/apps/MagicHaqi/MagicHaqi.html')));
    if (!repo) {
        if (publish) throw new Error('找不到本机 apps 仓库，请设置 APPS_ROOT。');
        return null;
    }
    const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
    let publisher;
    if (publish) {
        if (git(['branch', '--show-current']) !== 'master') throw new Error('apps 必须在 master 分支发布。');
        if (git(['status', '--porcelain'])) throw new Error('apps 存在未提交修改，请先处理后再发布。');
        publisher = await import(pathToFileURL(path.join(repo, '.github/skills/publish-repo/scripts/publish-repo.mjs')).href);
        publisher.publishRepo(repo, { publish: false, compatibility: { files: [] } });
    }
    const relative = 'official/apps/MagicHaqi/release';
    const destination = copyRelease(releaseDir, path.join(repo, relative), pages);
    if (publish) {
        const paths = pages.map(page => `${relative}/${page}_v1.html`);
        if (pages.includes('HaqiOfficialWebsite')) paths.push(`${relative}/HaqiOfficialWebsite.html`);
        git(['add', '--', ...paths]);
        if (git(['diff', '--cached', '--name-only'])) git(['commit', '-m', 'release: update Haqi entry wrappers', '--', ...paths]);
        publisher.publishRepo(repo, { compatibility: { files: [] } });
    }
    return destination;
}