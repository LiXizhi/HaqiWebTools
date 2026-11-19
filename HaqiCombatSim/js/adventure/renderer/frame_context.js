import { alignCameraOrigin, clampCameraToWorld } from '../../adventure_camera_core.js';
import { fitLocalCamera } from '../../adventure_local_coop_core.js';
import { forestCommissionScene } from '../../forest_commission_core.js';

export function createFrameContextBuilder({
    canvas,
    ctx,
    cam,
    cameraZoom,
    resolution,
    reducedMotion,
    perf,
    markerCache,
    assets,
}) {
    function size(low = false) {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const dpr = resolution(low).display;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cam.w = w;
        cam.h = h;
        return { w, h, dpr };
    }

    function computeCameraOrigin(world, save, { w, h, dpr, t = 0, localSecond = null, localSecondFollowing = false, title = false } = {}) {
        const baseScale = w < 650 ? 0.82 : 1;
        const sceneZoom = title ? 1 : cameraZoom.value;
        const scale = baseScale * sceneZoom;
        const center = title
            ? { x: (world.layout ? world.center.x : 875) + Math.sin(t * 0.04) * 60, y: world.layout ? world.center.y : 770 }
            : { ...save.position };
        const localCamera = !title && localSecond && !localSecondFollowing
            ? fitLocalCamera([save.position, localSecond.position], w, h, scale)
            : null;
        const actualScale = localCamera ? localCamera.scale : scale;
        if (localCamera) Object.assign(center, localCamera.center);
        const aligned = alignCameraOrigin(
            center.x - w / (2 * actualScale),
            center.y - h / (2 * actualScale) + (w < 650 ? 50 : 25) / sceneZoom,
            actualScale,
            dpr,
        );
        const origin = !title && world.dungeon?.scene.streetscape?.theme === 'south-china'
            ? clampCameraToWorld(aligned, world, { w: w / actualScale, h: h / actualScale }, actualScale, dpr)
            : aligned;
        return { scale: actualScale, x: origin.x, y: origin.y };
    }

    function build(world, save, time, { localSecond = null, localSecondFollowing = false, graphics = { particles: true, trails: true }, title = false } = {}) {
        let phaseTime = perf.enabled ? performance.now() : 0;
        const mark = name => {
            if (phaseTime) {
                const now = performance.now();
                perf.record(world.isEarth ? name : name.replace('earth-', 'island-'), now - phaseTime);
                phaseTime = now;
            }
        };
        const markerFor = markerCache.forState(save, assets.content, world);
        const forestScene = !title && !localSecond && world.zone === 'camp' ? forestCommissionScene(save) : null;
        const { w, h, dpr } = size(graphics.low);
        const t = time / 1000;
        const gestureAt = Date.now();
        cameraZoom.tick(time, reducedMotion.matches);
        const camera = computeCameraOrigin(world, save, { w, h, dpr, t, localSecond, localSecondFollowing, title });
        cam.scale = camera.scale;
        cam.x = camera.x;
        cam.y = camera.y;
        const viewport = { x: cam.x, y: cam.y, w: w / cam.scale, h: h / cam.scale };
        const viewRect = { x: cam.x - 200, y: cam.y - 50, w: w / cam.scale + 400, h: h / cam.scale + 280 };
        return { w, h, dpr, t, gestureAt, viewport, viewRect, markerFor, forestScene, mark };
    }

    return { size, computeCameraOrigin, build };
}
