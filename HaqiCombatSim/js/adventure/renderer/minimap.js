import { createDungeonFog } from '../../views/adventure/view_adventure_dungeon_fog.js';
import { drawCityScene } from '../../views/adventure/view_city_dungeon.js';
import { paintStreetGround } from '../../views/adventure/view_city_street.js';
import { ellipse, text } from './primitives.js';

export function createMinimapRenderer({ assets, markerCache, ground }) {
    const mapFog = createDungeonFog();

    return function minimap(target, world, save, { labels = true, bounds = null, simple = false, mapData = null, showPlayer = true, atlasPreview = false } = {}) {
        const markerFor = markerCache.forState(save, assets.content, world);
        const c = target.getContext('2d');
        const w = target.width;
        const h = target.height;
        c.clearRect(0, 0, w, h);
        c.fillStyle = '#6ba7a2';
        if (!atlasPreview) c.fillRect(0, 0, w, h);
        if (world.isEarth) {
            if (simple && bounds) {
                const colors = {
                    ocean: '#438b9b',
                    water: '#72acb7',
                    forest: '#7c9d69',
                    grass: '#b4c68a',
                    urban: '#d6c59d',
                    desert: '#d9c68e',
                    snow: '#e5e8db',
                    mountain: '#a49d85',
                };
                const cells = 64;
                for (let row = 0; row < cells; row++) {
                    for (let col = 0; col < cells; col++) {
                        c.fillStyle = colors[(mapData?.terrainAt || world.terrainAt)(
                            bounds.x + (col + 0.5) / cells * bounds.w,
                            bounds.y + (row + 0.5) / cells * bounds.h,
                        )] || '#a4aaa0';
                        c.fillRect(col * w / cells, row * h / cells, Math.ceil(w / cells), Math.ceil(h / cells));
                    }
                }
                c.save();
                c.beginPath();
                c.rect(0, 0, w, h);
                c.clip();
                c.lineCap = 'round';
                c.lineJoin = 'round';
                for (const [color, width] of [['#9a8d6d', 5], ['#f4e8bf', 3]]) {
                    c.strokeStyle = color;
                    c.lineWidth = width;
                    c.beginPath();
                    for (const road of mapData?.paths || world.paths) {
                        c.moveTo((road.a.x - bounds.x) / bounds.w * w, (road.a.y - bounds.y) / bounds.h * h);
                        c.lineTo((road.b.x - bounds.x) / bounds.w * w, (road.b.y - bounds.y) / bounds.h * h);
                    }
                    c.stroke();
                }
                c.restore();
                const x = (save.position.x - bounds.x) / bounds.w * w;
                const y = (save.position.y - bounds.y) / bounds.h * h;
                ellipse(c, x, y, 5, 5, '#fff');
                ellipse(c, x, y, 3, 3, '#205c99');
                return;
            }
            const size = world.earthRules.chunkSize * 2;
            const scale = w / size;
            const rect = { x: save.position.x - size / 2, y: save.position.y - h / scale / 2, w: size, h: h / scale };
            c.save();
            c.scale(scale, scale);
            c.translate(-rect.x, -rect.y);
            world.terrainPainter(c, world, rect);
            for (const n of world.npcs) ellipse(c, n.x, n.y, 18, 18, '#ffe89c');
            c.restore();
            ellipse(c, w / 2, h / 2, 4, 4, '#fff');
            ellipse(c, w / 2, h / 2, 2, 2, '#205c99');
            return;
        }
        const sx = w / world.w;
        const sy = h / world.h;
        c.save();
        c.scale(sx, sy);
        if (atlasPreview && world.layout?.coast?.length) {
            c.beginPath();
            for (const [i, p] of world.layout.coast.entries()) {
                if (i === 0) c.moveTo(p[0], p[1]);
                else c.lineTo(p[0], p[1]);
            }
            c.closePath();
            c.clip();
        }
        if (world.dungeon?.scene.streetscape) paintStreetGround(c, world.dungeon.scene.streetscape, { x: 0, y: 0, w: world.w, h: world.h });
        else if (world.isCityDungeon) drawCityScene(c, world);
        else c.drawImage(ground(world), 0, 0, world.w, world.h);
        for (const b of world.buildings) {
            c.fillStyle = '#627b83';
            c.fillRect(b.x - 45, b.y - 60, 90, 65);
        }
        for (const n of world.npcs) {
            ellipse(c, n.x, n.y, markerFor(n.id) ? 22 : 13, markerFor(n.id) ? 22 : 13, markerFor(n.id) ? '#ffe89c' : '#f6f3d9');
        }
        for (const e of world.landmarks || []) {
            if (e.dungeonId) ellipse(c, e.x, e.y, 30, 30, e.entranceKind === 'tower' ? '#f8dc80' : '#67dfff');
        }
        if (!atlasPreview) mapFog(c, world, save.position, { x: 0, y: 0, w: world.w, h: world.h }, Math.max(sx, sy), save.dungeonExploration?.[world.zone]);
        if (showPlayer) {
            ellipse(c, save.position.x, save.position.y, 25, 25, '#184f73');
            ellipse(c, save.position.x, save.position.y, 13, 13, '#fff');
        }
        c.restore();
        if (world.layout) {
            if (labels && !world.layout.route) {
                for (const r of world.layout.regions) {
                    ellipse(c, r.x * sx, r.y * sy, 3, 3, '#fff3c3');
                    text(c, r.name, r.x * sx, r.y * sy - 9, 11, '#25483b');
                }
            }
            if (showPlayer) {
                ellipse(c, save.position.x * sx, save.position.y * sy, 5, 5, '#fff');
                ellipse(c, save.position.x * sx, save.position.y * sy, 3, 3, '#205c99');
            }
        }
    };
}
