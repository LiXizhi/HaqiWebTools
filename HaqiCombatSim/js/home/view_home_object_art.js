// home/view_home_object_art.js — 家园家具与地面摆件的精灵绘制、交互特效、像素点击命中与桌面抬升几何。
import { paintHomeDrawing } from '../view_home_drawing_art.js';
import { HOME_COLOR_HEX, footprint, homeInteractiveKind } from '../home_core.js';

export const HOME_FURNITURE_SCALE = 1.6;
export const HOME_GROUND_SCALE = 1.15;

const COLOR_HEX = HOME_COLOR_HEX;
const INDOOR_CATEGORIES = new Set(['bedroom', 'kitchen', 'bathroom', 'living']);
const OUTDOOR_EXCEPTIONS = new Set(['picnic-table', 'hot-spring']);
const tintCache = new Map();
const hitMasks = new WeakMap();

// Use the same crop and mirror as the furniture painter. Transparent atlas
// padding must not steal clicks from a visible object behind this sprite.
export function homeObjectPixelHit(item, object, image, bounds, x, y) {
    if (item.id === 'paper' && object.drawing) return x >= bounds.x && x <= bounds.x + bounds.w && y >= bounds.y && y <= bounds.y + bounds.h;
    if (!bounds || item.layer === 'ground' || !image?.complete || !image.naturalWidth) return true;
    let u = (x - bounds.x) / bounds.w;
    const v = (y - bounds.y) / bounds.h;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
    if ([1, 2].includes((object?.rotation || 0) % 4)) u = 1 - u;
    const crop = item.art?.crop || [0, 0, image.naturalWidth, image.naturalHeight];
    const key = crop.join(',');
    let masks = hitMasks.get(image);
    if (!masks) {
        masks = new Map();
        hitMasks.set(image, masks);
    }
    if (!masks.has(key)) {
        try {
            const [sx, sy, sw, sh] = crop;
            const c = document.createElement('canvas');
            c.width = sw;
            c.height = sh;
            const g = c.getContext('2d', { willReadFrequently: true });
            g.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
            const rgba = g.getImageData(0, 0, sw, sh).data;
            const alpha = new Uint8Array(sw * sh);
            for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
            masks.set(key, { alpha, w: sw, h: sh });
        } catch {
            masks.set(key, null);
        }
    }
    // A loading or unreadable image keeps the existing rectangular fallback.
    const mask = masks.get(key);
    if (!mask) return true;
    return mask.alpha[Math.min(mask.h - 1, Math.floor(v * mask.h)) * mask.w + Math.min(mask.w - 1, Math.floor(u * mask.w))] >= 16;
}

function tintedSprite(image, crop, colorHex) {
    if (!colorHex || !image?.complete || !image.naturalWidth) return null;
    const [sx, sy, sw, sh] = crop || [0, 0, image.naturalWidth, image.naturalHeight];
    const key = `${image.src}:${sx},${sy},${sw},${sh}:${colorHex}`;
    if (tintCache.has(key)) return tintCache.get(key);
    if (typeof document === 'undefined') return null;
    if (tintCache.size >= 32) tintCache.delete(tintCache.keys().next().value);
    const c = document.createElement('canvas');
    const scale = Math.min(1, 192 / Math.max(sw, sh, 1));
    c.width = Math.max(1, Math.round(sw * scale));
    c.height = Math.max(1, Math.round(sh * scale));
    const g = c.getContext('2d');
    g.drawImage(image, sx, sy, sw, sh, 0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = colorHex;
    g.globalAlpha = 0.34;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    tintCache.set(key, c);
    return c;
}

function drawInteractiveEffect(ctx, kind, w, h, now = 0) {
    if (!kind) return;
    ctx.save();
    if (kind === 'light') {
        const pulse = 0.78 + Math.sin(now * 3.4) * 0.22;
        const r = Math.max(w, h) * 0.82;
        const g = ctx.createRadialGradient(0, -h * 0.18, 2, 0, -h * 0.18, r);
        g.addColorStop(0, `rgba(255,244,178,${(0.52 * pulse).toFixed(3)})`);
        g.addColorStop(0.55, `rgba(255,210,102,${(0.24 * pulse).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,190,70,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, -h * 0.18, r, 0, Math.PI * 2);
        ctx.fill();
    } else if (kind === 'music') {
        for (let i = 0; i < 3; i++) {
            const phase = (now * 1.15 + i * 0.33) % 1;
            const nx = (i - 1) * w * 0.24 + Math.sin(now * 2.6 + i) * 6;
            const ny = -h * 0.28 - phase * 26;
            ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.9;
            ctx.fillStyle = i % 2 ? '#ffd966' : '#8be8ff';
            ctx.beginPath();
            ctx.ellipse(nx, ny, 4.2, 3.1, -0.35, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(nx + 3.5, ny);
            ctx.lineTo(nx + 3.5, ny - 10);
            ctx.lineTo(nx + 8.5, ny - 8);
            ctx.stroke();
        }
    } else if (kind === 'water') {
        for (let i = 0; i < 3; i++) {
            const p = (now * 1.4 + i * 0.33) % 1;
            ctx.strokeStyle = `rgba(165,238,255,${((1 - p) * 0.72).toFixed(3)})`;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.ellipse(0, -h * 0.05, w * (0.16 + p * 0.32), h * (0.09 + p * 0.18), 0, 0, Math.PI * 2);
            ctx.stroke();
        }
    } else if (kind === 'cook') {
        for (let i = 0; i < 3; i++) {
            const p = (now * 0.95 + i * 0.33) % 1;
            const sx = (i - 1) * w * 0.15 + Math.sin(now * 2 + i * 2) * 4;
            const sy = -h * 0.22 - p * 24;
            ctx.fillStyle = `rgba(255,250,240,${(Math.sin(p * Math.PI) * 0.55).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(sx, sy, 4 + p * 5, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (kind === 'screen') {
        const pulse = 0.65 + Math.sin(now * 5) * 0.2;
        const g = ctx.createRadialGradient(0, -h * 0.15, 2, 0, -h * 0.15, Math.max(w, h) * 0.6);
        g.addColorStop(0, `rgba(130,225,255,${(0.38 * pulse).toFixed(3)})`);
        g.addColorStop(1, 'rgba(130,225,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, -h * 0.15, Math.max(w, h) * 0.6, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// Geometry-only hit bounds, also used when a sprite is already baked into a texture.
// Return world units so cached sprites, live rendering and pointer bounds use
// the same support elevation at every zoom. Old unsupported surfaces stay put.
export function homeObjectSurfaceLift(object, objectsById, catalog) {
    const item = catalog.find(i => i.id === object.itemId);
    const parent = objectsById.get(object.parentId);
    if (object.underTable || item?.layer !== 'top' || !parent) return 0;
    const support = catalog.find(i => i.id === parent.itemId);
    if (!support?.slots || !(support.surfaceLiftRatio > 0)) return 0;
    const b = footprint(parent, catalog);
    const bounds = homeObjectVisualBounds(support, parent, 0, 0, b.w, b.h);
    return bounds.h * support.surfaceLiftRatio;
}

export function homeObjectVisualBounds(item, object, x, y, w, h, isThumb = false) {
    if (item.layer === 'ground' && !isThumb) {
        const grow = 1.04 * HOME_GROUND_SCALE;
        return { x: x + (w * (1 - grow)) / 2, y: y + (h * (1 - grow)) / 2, w: w * grow, h: h * grow };
    }
    const [, , sw, sh] = item.art?.crop || [0, 0, item.art?.width || 1, item.art?.height || 1];
    const indoor = !isThumb && INDOOR_CATEGORIES.has(item.category) && !OUTDOOR_EXCEPTIONS.has(item.id);
    const scale =
        Math.min((w * (isThumb ? 1.08 : indoor ? 0.82 : 1.24)) / sw, (h * (isThumb ? 1.08 : indoor ? 0.86 : 1.34)) / sh) *
        (isThumb ? 1 : HOME_FURNITURE_SCALE * (item.renderScale || 1));
    const dw = sw * scale;
    const dh = sh * scale;
    const dy = isThumb ? -dh / 2 : h * (indoor ? 0.36 : 0.46) - dh;
    return { x: x + w / 2 - dw / 2, y: y + h / 2 + dy, w: dw, h: dh };
}

export function drawHomeObject(ctx, item, object, x, y, w, h, image, now = 0, isThumb = false) {
    if (item.id === 'paper' && object.drawing) {
        const b = homeObjectVisualBounds(item, object, x, y, w, h);
        paintHomeDrawing(ctx, object.drawing, b.x, b.y, b.w, b.h);
        return b;
    }
    const rot = (object?.rotation || 0) % 4;
    const colorHex = COLOR_HEX[object?.color] || null;
    const isGround = item.layer === 'ground';
    const active = object?.active !== false;
    const kind = homeInteractiveKind(item.id);
    const isIndoor = !isThumb && INDOOR_CATEGORIES.has(item.category) && !OUTDOOR_EXCEPTIONS.has(item.id);

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);

    if (!isGround && !isThumb) {
        const shadowScale = isIndoor ? 0.32 : 0.42;
        ctx.fillStyle = 'rgba(24,42,26,0.22)';
        ctx.beginPath();
        ctx.ellipse(0, h * (isIndoor ? 0.22 : 0.28), w * shadowScale, Math.max(5, h * (isIndoor ? 0.14 : 0.18)), 0, 0, Math.PI * 2);
        ctx.fill();
    }

    if (image?.complete && image.naturalWidth) {
        let bounds;
        const [sx, sy, sw, sh] = item.art?.crop || [0, 0, image.naturalWidth, image.naturalHeight];
        const tinted = colorHex ? tintedSprite(image, [sx, sy, sw, sh], colorHex) : null;
        ctx.save();
        if (isGround && !isThumb) {
            if (rot) ctx.rotate((rot * Math.PI) / 2);
            const rw = rot % 2 ? h : w;
            const rh = rot % 2 ? w : h;
            const grow = 1.04 * HOME_GROUND_SCALE;
            if (tinted) ctx.drawImage(tinted, (-rw * grow) / 2, (-rh * grow) / 2, rw * grow, rh * grow);
            else ctx.drawImage(image, sx, sy, sw, sh, (-rw * grow) / 2, (-rh * grow) / 2, rw * grow, rh * grow);
            bounds = { x: x + (w * (1 - grow)) / 2, y: y + (h * (1 - grow)) / 2, w: w * grow, h: h * grow };
        } else {
            if (rot === 1 || rot === 2) ctx.scale(-1, 1);
            const multW = isThumb ? 1.08 : isIndoor ? 0.82 : 1.24;
            const multH = isThumb ? 1.08 : isIndoor ? 0.86 : 1.34;
            const furnitureScale = isThumb ? 1 : HOME_FURNITURE_SCALE * (item.renderScale || 1);
            const scale = Math.min((w * multW) / sw, (h * multH) / sh) * furnitureScale;
            const dw = sw * scale;
            const dh = sh * scale;
            const dy = isThumb ? -dh / 2 : h * (isIndoor ? 0.36 : 0.46) - dh;
            bounds = { x: x + w / 2 - dw / 2, y: y + h / 2 + dy, w: dw, h: dh };
            if (tinted) ctx.drawImage(tinted, -dw / 2, dy, dw, dh);
            else ctx.drawImage(image, sx, sy, sw, sh, -dw / 2, dy, dw, dh);
        }
        ctx.restore();
        if (active && kind && !isThumb) drawInteractiveEffect(ctx, kind, w, h, now);
        ctx.restore();
        return bounds;
    }

    // Subtle loading placeholder while WebP atlas downloads
    ctx.fillStyle = colorHex || '#d9ceb8';
    ctx.strokeStyle = 'rgba(66,53,36,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-w * 0.38, -h * 0.38, w * 0.76, h * 0.76, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}
