// Browser-only skin: one downloaded atlas, CSS sprites and four in-memory
// border-image crops. Gameplay and all text remain ordinary DOM content.
import { fetchJson } from './runtime_data.js';

export async function loadUiArt(mode) {
    const manifest = await fetchJson('data/adventure/ui-art.json');
    const url = mode === 'local' ? manifest.local : manifest.cdn;
    if (!url || (mode !== 'local' && !url.startsWith('https://cdn.keepwork.com/'))) {
        throw new Error('界面图集缺少有效的资源地址');
    }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { image.onload = image.onerror = null; reject(new Error('界面图集加载超时')); }, 8000);
        image.onload = () => { clearTimeout(timer); resolve(); };
        image.onerror = () => { clearTimeout(timer); reject(new Error('界面图集加载失败')); };
        image.src = url;
    });
    if (image.naturalWidth !== manifest.width || image.naturalHeight !== manifest.height) {
        throw new Error('界面图集尺寸不匹配');
    }
    const rules = [];
    for (const [name, frame] of Object.entries(manifest.frames)) {
        if (frame.slice) {
            const [x, y, width, height] = frame.rect;
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(image, x, y, width, height, 0, 0, width, height);
            rules.push(`--ui-${name}:url("${canvas.toDataURL()}");--ui-${name}-slice:${frame.slice.join(' ')};`);
        }
    }
    const style = document.createElement('style');
    style.id = 'storybook-atlas';
    // The atlas URI is manifest data, never user-authored markup.
    style.textContent = `.storybook-ui{--ui-atlas:url(${JSON.stringify(url)});${rules.join('')}}`;
    for (const [name, frame] of Object.entries(manifest.frames)) {
        if (frame.slice) continue;
        const [column, row] = frame.cell;
        style.textContent += `.storybook-ui .icon[data-ui-icon="${name}"]{background-position:${column / 3 * 100}% ${row / 3 * 100}%}`;
    }
    document.getElementById(style.id)?.remove();
    document.head.append(style);
    document.documentElement.classList.add('storybook-ui');
    return manifest;
}
