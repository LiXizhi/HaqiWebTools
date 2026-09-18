import fs from 'node:fs';
import path from 'node:path';

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
    // Read all four verified wrappers before changing any destination files.
    const files = pages.map(page => {
        if (!/^Haqi[A-Za-z]*$/.test(page)) throw new Error(`非法发布入口：${page}`);
        const name = `${page}_v1.html`;
        return { name, bytes: fs.readFileSync(path.join(releaseDir, name)) };
    });
    fs.mkdirSync(destination, { recursive: true });
    for (const { name, bytes } of files) {
        const target = path.join(destination, name);
        fs.writeFileSync(target, bytes);
        if (!fs.readFileSync(target).equals(bytes)) throw new Error(`Maisi发布入口复制校验失败：${name}`);
    }
    return destination;
}
