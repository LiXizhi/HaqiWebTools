// Asset policy is pure: local development and permanent Keepwork CDN releases.
export function assetMode(hostname, search = '') {
    const requested = new URLSearchParams(search).get('assets');
    if (requested && !['local', 'cdn'].includes(requested)) throw new Error('资源模式无效');
    return requested || (/^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(hostname) ? 'local' : 'cdn');
}
export function assetUrl(row, mode) {
    if (!row || !['local', 'cdn'].includes(mode)) throw new Error('缺少资源配置');
    if (mode === 'local') {
        if (!/^assets\/adventure\/[a-zA-Z0-9_./-]+$/.test(row.local) || row.local.includes('..')) throw new Error('本地资源路径无效');
        return row.local;
    }
    let url;
    try { url = new URL(row.cdn); } catch { throw new Error('此资源尚未发布到 Keepwork CDN'); }
    if (url.protocol !== 'https:' || url.hostname !== 'cdn.keepwork.com' || url.username || url.password || url.search || url.hash) throw new Error('线上资源必须来自永久 Keepwork CDN');
    return url.href;
}
export function validateMediaManifest(media, sourceManifest, mode = 'local') {
    if (media?.schemaVersion !== 1 || !media.entries) throw new Error('美术清单版本无效');
    for (const key of [...Object.keys(sourceManifest), 'sprites', 'creatures']) {
        const row = media.entries[key];
        assetUrl(row, mode);
        if (!/^[a-f0-9]{64}$/.test(row.sha256) || !Number.isInteger(row.size) || row.size <= 0) throw new Error(`资源校验信息无效：${key}`);
        if (row.sourceEntry !== (sourceManifest[key]?.entry ?? null)) throw new Error(`资源来源已变化，请重新准备：${key}`);
        if (!row.local.endsWith('.ogg') && (!row.local.endsWith('.webp') || !(row.width > 0 && row.height > 0))) throw new Error(`图片必须是有效 WebP：${key}`);
    }
    return Object.keys(media.entries).length;
}
