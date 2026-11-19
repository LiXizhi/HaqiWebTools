import { createCameraZoom } from '../../adventure_camera_core.js';
import { catalogStatSnapshot } from '../../adventure_core.js';
import { createEarthEnvironmentPainter } from '../../earth/adventure_earth_environment.js';
import { resolveMountDrawPose } from '../../adventure_mounts_core.js';
import { createQuestMarkerCache } from '../../adventure_quest_marker_cache_core.js';
import { paintSoftShadow } from '../../adventure_shadows.js';
import { OCEAN_COLOR } from '../../adventure_terrain.js';
import { createCampToys } from '../../camp_toys.js';
import { createFrameMeter } from '../../frame_meter_core.js';
import { createIdleWorldGuide } from '../../idle_world_guide.js';
import { createInteractionFeedback } from '../../interaction_feedback.js';
import { performanceDiagnostics as perf } from '../../performance_diagnostics.js';
import { sceneResolution } from '../../scene_resolution_core.js';
import { createSpellEffects } from '../../spell_effects.js';
import { createActorPass } from './actor_pass.js';
import { createBattleCanvasRenderer } from './battle_canvas_renderer.js';
import { createFrameContextBuilder } from './frame_context.js';
import { createMinimapRenderer } from './minimap.js';
import { createOverlayPass } from './overlay_pass.js';
import { questMarker } from './primitives.js';
import { createTerrainPass } from './terrain_pass.js';

export function createRenderer(canvas, assets) {
    const interactionFeedback = createInteractionFeedback();
    const idleGuide = createIdleWorldGuide();
    const campToys = createCampToys(assets.campToyArt);
    const markerCache = createQuestMarkerCache(questMarker, catalogStatSnapshot);
    const effects = createSpellEffects(assets);
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const coarsePointer = matchMedia('(pointer: coarse)');
    const resolution = (low = false) => sceneResolution(globalThis.devicePixelRatio || 1, { coarse: coarsePointer.matches, low });
    const ctx = canvas.getContext('2d', { alpha: false });
    const cam = { x: 0, y: 0, scale: 1, w: 0, h: 0 };
    const cameraZoom = createCameraZoom();
    const earthEnvironment = createEarthEnvironmentPainter();
    const frameMeter = createFrameMeter();

    const streetCredit = typeof document === 'undefined' ? { style: {} } : document.createElement('a');
    streetCredit.textContent = '© OpenStreetMap contributors';
    streetCredit.href = 'https://www.openstreetmap.org/copyright';
    streetCredit.target = '_blank';
    streetCredit.rel = 'noopener noreferrer';
    streetCredit.style.cssText = 'position:absolute;left:10px;bottom:5px;font:11px sans-serif;color:#e8ecdd;background:#203a39bb;padding:2px 5px;z-index:2;display:none';
    if (typeof document !== 'undefined') canvas.parentElement?.append(streetCredit);

    let zoomUntil = -Infinity;
    let lastViewRect = null;
    let bubbleTarget = null;
    let greetingTarget = null;

    function shadow(c, x, y, w = 24) {
        paintSoftShadow(c, x, y, w * 1.18, w * 0.4, 0.3);
    }

    function avatar(c, save, x, y, time, moving, scale = 1, nameBounds = true, headPose = null, bounds = null) {
        shadow(c, x, y, (save.mountId ? 28 : 23) * scale);
        const result = assets.hero.drawSave(c, save, x, y, time, moving, scale, {
            head: save.visualHead ?? headPose?.head,
            breath: save.visualBreath ?? headPose?.breath,
            reducedMotion: reducedMotion.matches,
            nameBounds,
            ...(headPose ? { moving: moving && headPose.moving, walkTime: headPose.walkTime, facing: headPose.facing } : {}),
        });
        if (bounds && result.ready) {
            if (result.headRect) bounds.speechHead = { x: result.headRect.x + result.headRect.w / 2, y: result.headRect.y };
            const rects = [result.headRect, result.bodyRect, result.pose?.mount].filter(Boolean);
            bounds.left = Math.min(...rects.map(r => r.x));
            bounds.right = Math.max(...rects.map(r => r.x + r.w));
            bounds.hitTop = Math.min(...rects.map(r => r.y));
            bounds.bottom = Math.max(...rects.map(r => r.y + r.h));
            if (result.pose?.mount) bounds.top = bounds.hitTop - 8;
        }
        return result.nameY;
    }

    function starAnchor(save, time, moving) {
        const row = save.mountId && assets.content.mountByItem?.[save.mountId];
        const mount = row && assets.content.mountCatalog?.mounts.find(item => item.id === row.mountId);
        if (mount?.art?.cdn) {
            const pose = resolveMountDrawPose(mount, save.facing || 0, {
                size: 78,
                time,
                moving,
                gender: save.appearance === 'girl' ? 'female' : 'male',
            });
            return { x: save.position.x + pose.rider.x + pose.rider.w / 2, y: save.position.y + pose.rider.y + pose.rider.h * 0.18 };
        }
        return { x: save.position.x, y: save.position.y - 66 };
    }

    function creature(c, id, x, y, t, scale = 1, groundShadow = true) {
        const index = { 'fire-scout': 0, 'ice-scout': 1, 'storm-scout': 2, 'life-scout': 3, 'death-scout': 4, 'water-bubble': 5, 'death-bubble': 4, pet: 6 }[id] ?? 5;
        const bob = Math.sin(t * 2.8 + x) * 3;
        if (groundShadow) shadow(c, x, y, 27 * scale);
        assets.tile(c, 'creatures', index, x - 45 * scale, y - 84 * scale + bob, 90 * scale, 88 * scale);
    }

    function monster(c, m, x, y, t, scale = 1, pose = null) {
        const bob = reducedMotion.matches ? 0 : pose?.moving ? -Math.abs(Math.sin(t * 10)) * 3 : Math.sin(t * 2.8 + x) * 2;
        shadow(c, x, y, 27 * scale);
        c.save();
        c.translate(x, y);
        c.scale(pose?.facing || 1, 1);
        if (!assets.drawMonster?.(c, m, -52 * scale, -104 * scale + bob, 104 * scale, 104 * scale)) {
            creature(c, m?.id || 'water-bubble', 0, bob, t, scale, false);
        }
        c.restore();
    }

    const frameBuilder = createFrameContextBuilder({ canvas, ctx, cam, cameraZoom, resolution, reducedMotion, perf, markerCache, assets });
    const terrainPass = createTerrainPass({ canvas, ctx, cam, cameraZoom, resolution, reducedMotion, perf, assets });
    const actorPass = createActorPass({ assets, ctx, cam, reducedMotion, shadow, avatar, monster, creature, starAnchor, campToys, interactionFeedback, terrain: terrainPass });
    const overlayPass = createOverlayPass({ assets, ctx, cam, reducedMotion, interactionFeedback, earthEnvironment, frameMeter });
    const minimap = createMinimapRenderer({ assets, markerCache, ground: terrainPass.ground });
    const renderBattle = createBattleCanvasRenderer({ assets, effects, reducedMotion, resolution, avatar, monster, creature });

    function render(world, save, time, options = {}) {
        const {
            localSecond = null,
            graphics = { particles: true, trails: true },
            moving = false,
            path = [],
            title = false,
            motionHidden = false,
            monstersPaused = false,
        } = options;
        interactionFeedback.update(world, save, time, { moving, disabled: title || motionHidden || monstersPaused, reducedMotion: reducedMotion.matches, particlesEnabled: graphics.particles && !graphics.low });
        campToys.prepare(world);
        idleGuide.update(world, save, assets.content, time, { moving, disabled: title || motionHidden || monstersPaused || !!localSecond, reduced: reducedMotion.matches });
        streetCredit.style.display = world.dungeon?.scene.streetscape?.provenance?.kind === 'osm-derived' ? 'block' : 'none';
        bubbleTarget = null;
        greetingTarget = null;

        const frame = frameBuilder.build(world, save, time, options);
        lastViewRect = frame.viewRect;
        ctx.fillStyle = world.layout?.rules.terrain.ocean || OCEAN_COLOR;
        ctx.fillRect(0, 0, frame.w, frame.h);
        earthEnvironment.update(world, save.position, time, { light: graphics.earthLight, weather: graphics.earthWeather, at: frame.gestureAt, reducedMotion: reducedMotion.matches });

        ctx.save();
        try {
            const shake = interactionFeedback.shake.offset(time, reducedMotion.matches);
            ctx.translate(shake.x, shake.y);
            ctx.scale(cam.scale, cam.scale);
            ctx.translate(-cam.x, -cam.y);
            frame.mark('earth-render-setup');
            const coldTiles = terrainPass.draw({ world, save, time, frame, path, title, interactionFeedback, idleGuide, earthEnvironment, graphics });
            const actorResult = actorPass.draw({ world, save, time, frame, options, coldTiles });
            const targets = overlayPass.drawWorldOverlays({ world, save, time, frame, options, actorResult, starAnchor });
            bubbleTarget = targets.bubbleTarget;
            greetingTarget = targets.greetingTarget;
        } finally {
            ctx.restore();
        }
        overlayPass.drawScreenOverlays({ world, save, time, frame, options });
    }

    function releaseScene() {
        campToys.clear();
        idleGuide.clear();
        interactionFeedback.clear();
        terrainPass.release();
        canvas.width = canvas.height = 1;
    }

    return {
        campToys,
        idleGuide,
        interactionFeedback,
        releaseScene,
        prepareScene: terrainPass.prepareScene,
        isAnimating: () => campToys.active(performance.now()) || idleGuide.active || interactionFeedback.active() || cameraZoom.active || performance.now() < zoomUntil || terrainPass.terrainStats().pending > 0 || overlayPass.isWeatherFading(),
        frameStats: () => frameMeter.value,
        pauseFrameMeter: () => frameMeter.sample(0, false),
        environmentStats: () => earthEnvironment.stats,
        streetStats: terrainPass.streetStats,
        streetPeople: terrainPass.streetPeople,
        terrainStats: terrainPass.terrainStats,
        resetZoom: () => {
            zoomUntil = performance.now() + 300;
            return cameraZoom.reset();
        },
        render,
        minimap,
        worldToScreen: point => ({ x: (point.x - cam.x) * cam.scale, y: (point.y - cam.y) * cam.scale }),
        screenToWorld: (x, y) => ({ x: x / cam.scale + cam.x, y: y / cam.scale + cam.y }),
        renderBattle,
        zoomBy: factor => {
            zoomUntil = performance.now() + 300;
            return cameraZoom.zoomBy(factor);
        },
        setFishingCamera: active => cameraZoom.setFishing(active),
        viewRect: () => (lastViewRect ? { ...lastViewRect } : null),
        bubbleTarget: () => bubbleTarget,
        greetingTarget: () => greetingTarget,
        companionTarget: actorPass.companionTarget,
    };
}
