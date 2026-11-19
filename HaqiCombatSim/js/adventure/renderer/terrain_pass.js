import { alignCameraOrigin } from '../../adventure_camera_core.js';
import { regionAt } from '../../adventure_island_layout_core.js';
import { paintLargeTerrain, paintLargeTerrainSteps } from '../../adventure_large_terrain.js';
import { fitLocalCamera } from '../../adventure_local_coop_core.js';
import { paintStaticShadows } from '../../adventure_shadows.js';
import { paintTerrain } from '../../adventure_terrain.js';
import { onIsland } from '../../adventure_world_core.js';
import { createIslandSceneryCache } from '../../island_scenery_cache.js';
import { createIslandTerrainRasterizer } from '../../island_terrain_rasterizer.js';
import { createScheduledTerrainCache } from '../../terrain_tile_scheduler.js';
import { drawCityScene } from '../../views/adventure/view_city_dungeon.js';
import { createStreetPainter } from '../../views/adventure/view_city_street.js';
import { drawDungeonEntrance } from '../../views/adventure/view_dungeon_entrance.js';
import { drawEarthDocks } from '../../views/adventure/view_earth_boat.js';
import { circleRune, ellipse } from './primitives.js';

export function createTerrainPass({ canvas, ctx, cam, cameraZoom, resolution, reducedMotion, perf, assets }) {
    let backing = null;
    let backingZone = null;
    let overviewWorld = null;
    let overview = null;
    let terrainRasterizer = createIslandTerrainRasterizer(assets.terrainDecorationArt);
    const streetPainter = createStreetPainter(assets);

    const terrainTiles = createScheduledTerrainCache({
        rasterize: terrainRasterizer
            ? (...args) => {
                terrainRasterizer ??= createIslandTerrainRasterizer(assets.terrainDecorationArt);
                return terrainRasterizer(...args);
            }
            : null,
        onMetric: (name, value) => (typeof value === 'number' ? perf.record(name, value) : perf.event(name, value)),
        paint: (c, world, rect, atlases) =>
            paintLargeTerrainSteps(
                c,
                world,
                rect,
                false,
                assets.terrainDecorationArt
                    ? {
                        draw(...args) {
                            atlases.add(args[1]);
                            return assets.terrainDecorationArt.draw(...args);
                        },
                        pattern(...args) {
                            atlases.add(args[1]);
                            return assets.terrainDecorationArt.pattern?.(...args) || null;
                        },
                    }
                    : null,
            ),
        createCanvas: () => document.createElement('canvas'),
    });
    if (assets.terrainDecorationArt) {
        assets.terrainDecorationArt.onAtlas = atlas => terrainTiles.invalidateAtlas(atlas);
    }

    function campTreeFrame(o) {
        return ['tallPine', 'layeredPine', 'cypressPine', 'tallPine', 'blossomTree'][Math.abs(Math.round(o.x * 3 + o.y * 5)) % 5];
    }

    function drawCustomTree(c, o, world) {
        if (o.snow || world?.zone === 'ice') {
            return assets.environmentArt?.draw(
                c,
                'trees',
                ['spruce', 'pine', 'fir', 'oldPine'][(Math.round(o.x) + Math.round(o.y)) % 4],
                o.x - o.size / 2,
                o.y - o.size + 10,
                o.size,
                o.size,
            );
        }
        const zone = world?.zone;
        const bx = o.x - o.size * 0.56;
        const by = o.y - o.size * 1.06 + 10;
        const bw = o.size * 1.12;
        const bh = o.size * 1.08;
        if (zone === 'camp') return assets.environmentArt?.draw(c, 'campTrees', campTreeFrame(o), bx, by, bw, bh);
        if (zone === 'fire') return assets.environmentArt?.draw(c, 'islandTrees', 'charredEmberTree', bx, by, bw, bh);
        if (zone === 'dark') {
            const frame = Math.abs(Math.round(o.x * 3 + o.y * 7)) % 2 === 0 ? 'darkShadowTree' : 'darkWeepingTree';
            return assets.environmentArt?.draw(c, 'islandTrees', frame, bx, by, bw, bh);
        }
        if (zone === 'desert') {
            const biome = o.biome || regionAt(world, o)?.biome;
            const frame = biome === 'oasis' || Math.abs(Math.round(o.x * 5 + o.y * 7)) % 4 === 0 ? 'tropicalPalm' : 'desertCactus';
            return assets.environmentArt?.draw(c, 'islandTrees', frame, bx, by, bw, bh);
        }
        if (zone === 'town') {
            const biome = o.biome || regionAt(world, o)?.biome;
            if (biome === 'gold') return assets.environmentArt?.draw(c, 'islandTrees', 'autumnGoldTree', bx, by, bw, bh);
            if (biome === 'beach' || o.y > 4820) return assets.environmentArt?.draw(c, 'islandTrees', 'tropicalPalm', bx, by, bw, bh);
            return assets.environmentArt?.draw(c, 'campTrees', campTreeFrame(o), bx, by, bw, bh);
        }
        return false;
    }

    function paintTree(c, o, world) {
        const custom = drawCustomTree(c, o, world);
        if (!custom) assets.tile(c, 'sprites', o.tile, o.x - o.size / 2, o.y - o.size + 10, o.size, o.size);
        if (!o.snow && world?.zone !== 'ice' && assets.sceneryTile) {
            const variant = Math.abs(Math.round(o.x * 7 + o.y * 13)) % 8;
            const size = o.size * 0.36;
            assets.sceneryTile(c, 8 + variant, o.x + o.size * 0.18, o.y - size + 14, size, size);
        }
    }

    const islandScenery = createIslandSceneryCache({ paint: paintTree });

    function ground(world) {
        if (world.layout) {
            if (overviewWorld === (world.layout || world)) return overview;
            overviewWorld = world.layout || world;
            overview = document.createElement('canvas');
            overview.width = 560;
            overview.height = Math.round(560 * world.h / world.w);
            const started = perf.enabled ? performance.now() : 0;
            const c = overview.getContext('2d');
            c.scale(overview.width / world.w, overview.height / world.h);
            paintLargeTerrain(c, world, undefined, true);
            if (perf.enabled) perf.record('island-overview-prepare', performance.now() - started);
            return overview;
        }
        if (backingZone === world) return backing;
        backingZone = world;
        backing = document.createElement('canvas');
        backing.width = world.w;
        backing.height = world.h;
        const c = backing.getContext('2d');
        paintTerrain(c, world);
        ellipse(c, world.center.x, world.center.y - 30, 133, 86, '#aaac85');
        ellipse(c, world.center.x, world.center.y - 34, 125, 81, '#d9d5b1');
        c.strokeStyle = '#b7b58f';
        c.lineWidth = 1.4;
        for (let y = -65; y < 65; y += 22) {
            c.beginPath();
            c.moveTo(world.center.x - 90, world.center.y - 30 + y);
            c.lineTo(world.center.x + 90, world.center.y - 30 + y);
            c.stroke();
        }
        circleRune(c, world.center.x, world.center.y - 32, 94, 0, '#8fa68a');
        for (const d of world.decorations) {
            if (d.kind === 3 && onIsland(d.x, d.y, 80) && !world.paths.some(p => Math.hypot(d.x - p.a.x, d.y - p.a.y) < 135)) {
                ellipse(c, d.x, d.y, 2, 2, '#f4edbb');
                ellipse(c, d.x + 3, d.y - 3, 2, 2, '#e9bca4');
            }
        }
        paintStaticShadows(c, world);
        return backing;
    }

    function prepareScene(world, save, { visibleOnly = false, localSecond = null, localSecondFollowing = false, low = false } = {}) {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (world.isCityDungeon || !world.layout) return { total: 0, ready: 0 };
        if (!w || !h) return { total: 1, ready: 0 };
        const zoom = cameraZoom.value;
        const scale = (w < 650 ? 0.82 : 1) * zoom;
        const rasterPixelRatio = resolution().terrain;
        const local = localSecond && !localSecondFollowing ? fitLocalCamera([save.position, localSecond.position], w, h, scale) : null;
        const actualScale = local?.scale || scale;
        const center = local?.center || save.position;
        const origin = alignCameraOrigin(
            center.x - w / (2 * actualScale),
            center.y - h / (2 * actualScale) + (w < 650 ? 50 : 25) / zoom,
            actualScale,
            resolution(low).display,
        );
        const rect = { x: origin.x, y: origin.y, w: w / actualScale, h: h / actualScale };
        if (world.isEarth) return world.prepareSurface(rect, { visibleOnly });
        ground(world);
        return terrainTiles.prepare(world, rect, rasterPixelRatio, [], { visibleOnly });
    }

    function draw({ world, save, time, frame, path, title, interactionFeedback, idleGuide, earthEnvironment, graphics }) {
        const { w, h, t, viewport, mark } = frame;
        if (world.isEarth) world.terrainPainter(ctx, world, viewport);
        if (world.isEarth) drawEarthDocks(ctx, assets, world, viewport);
        mark('earth-render-terrain');
        if (world.dungeon?.scene.streetscape) streetPainter.ground(ctx, world, viewport);
        else {
            streetPainter.reset();
            if (world.isCityDungeon) drawCityScene(ctx, world);
        }
        for (const markItem of world.landmarks || []) {
            if (
                markItem.cityDungeon
                && !markItem.hidden
                && Math.abs(markItem.x - (cam.x + w / cam.scale / 2)) < w / cam.scale / 2 + 70
                && Math.abs(markItem.y - (cam.y + h / cam.scale / 2)) < h / cam.scale / 2 + 70
            ) {
                drawDungeonEntrance(ctx, markItem, 0, true, assets.entranceArt);
            }
        }
        const coldTiles = world.layout && !world.isEarth && !world.isCityDungeon
            ? terrainTiles.draw(
                ctx,
                world,
                viewport,
                (c, x, y, size) => {
                    const map = ground(world);
                    const dw = Math.min(size, world.w - x);
                    const dh = Math.min(size, world.h - y);
                    c.drawImage(map, x * map.width / world.w, y * map.height / world.h, dw * map.width / world.w, dh * map.height / world.h, x, y, dw, dh);
                },
                resolution().terrain,
                path,
            )
            : 0;
        if (!world.layout) ctx.drawImage(ground(world), 0, 0);
        earthEnvironment.ground(ctx, world, cam, w, h, time, { enabled: graphics.particles && !graphics.low, reducedMotion: reducedMotion.matches });
        ctx.strokeStyle = '#e3f3da33';
        ctx.lineWidth = 2;
        if (!world.layout && !reducedMotion.matches) {
            for (let i = 0; i < 38; i++) {
                const x = (i * 151 + t * 8) % 1750;
                const y = 80 + (i * 269) % 1450;
                if (onIsland(x, y, -12)) continue;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.quadraticCurveTo(x + 13, y + 4, x + 26, y);
                ctx.stroke();
            }
        }
        if (path.length && !title) {
            ctx.strokeStyle = '#fff6bc88';
            ctx.setLineDash([3, 10]);
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(save.position.x, save.position.y);
            for (const p of path) ctx.lineTo(p.x, p.y);
            ctx.stroke();
            ctx.setLineDash([]);
            const end = path[path.length - 1];
            circleRune(ctx, end.x, end.y, 15, t, '#fff3ae');
        }
        interactionFeedback.drawGround(ctx, time);
        idleGuide.draw(ctx, time);
        if (!world.portal.hidden) circleRune(ctx, world.portal.x, world.portal.y, 45, t, save.graduated ? '#e9e29a' : '#a6bab0');
        if (world.entrancePortal) circleRune(ctx, world.entrancePortal.x, world.entrancePortal.y, 45, t, '#a6bab0');
        return coldTiles;
    }

    function release() {
        terrainTiles.clear();
        terrainRasterizer?.dispose();
        terrainRasterizer = null;
        islandScenery.clear();
        streetPainter.reset();
        if (backing) backing.width = backing.height = 0;
        backing = null;
        backingZone = null;
        if (overview) overview.width = overview.height = 0;
        overview = null;
        overviewWorld = null;
    }

    return {
        draw,
        ground,
        prepareScene,
        drawCustomTree,
        islandScenery,
        streetPainter,
        release,
        streetStats: streetPainter.stats,
        streetPeople: streetPainter.people,
        terrainStats: () => ({
            tiles: terrainTiles.size,
            pending: terrainTiles.pending,
            ...terrainTiles.stats(),
            scenery: islandScenery.stats(),
        }),
    };
}
