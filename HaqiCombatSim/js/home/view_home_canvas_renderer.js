// home/view_home_canvas_renderer.js — 家园 2D 画布帧渲染调度（地形、建筑分组与屋顶遮挡、角色与宠物排序绘制）。
import { drawMotionTrail, motionStyle } from '../adventure_motion_effects.js';
import { buildingItem, buildingBounds, buildingWallFeet } from '../home_building_core.js';
import { footprint } from '../home_core.js';
import { homeHeldPointerTarget } from '../home_walk_core.js';
import { tr } from '../locale_runtime.js';
import { homeObjectSurfaceLift } from './view_home_object_art.js';
import { collectHomeWorldTrees, drawHomeWorldTree } from './view_home_world_terrain.js';
import {
    drawHomeBuildOverlays,
    drawHomeHeroActor,
    drawHomeObjectNode,
    drawHomePetActor,
    drawHomeSpawnPortal,
    drawHomeSummonEffects,
} from './view_home_canvas_layers.js';

export function paintHomeSceneFrame({
    now,
    getState,
    setState,
    cb,
    imageFor,
    buildings,
    terrain,
    frameMeter,
    framePacer,
    summonEffects,
    motionTrail,
    heroActor,
    secondActor,
    eraseAt,
    hitAt,
    petDragPoint,
}) {
    const state = getState();
    let { model, gesture, lastPaint, terrainMissing, prevHeroPos, prevSecondPos } = state;
    const {
        dead,
        mode,
        canvas,
        ctx,
        paintStroke,
        eraseStroke,
        hoverPoint,
        showGrid,
        envArt,
        decorArt,
        fallbackHero,
        edit,
        portal,
        side,
        buildTip,
        bubble,
        bubbleText,
        fpsLabel,
    } = state;

    if (dead || mode !== 'scene' || !canvas?.isConnected || document.hidden) {
        setState({ lastPaint: 0 });
        framePacer.reset();
        frameMeter.sample(0, false);
        return;
    }
    for (let i = summonEffects.length - 1; i >= 0; i--) {
        if (now - summonEffects[i].since >= 1200) summonEffects.splice(i, 1);
    }
    const sceneActive = Boolean(
        model.hero?.moving ||
            model.secondHero?.moving ||
            model.destination ||
            gesture ||
            paintStroke ||
            eraseStroke ||
            hoverPoint ||
            model.preview ||
            terrainMissing > 0 ||
            summonEffects.length > 0,
    );
    if (!framePacer.shouldRender(now, sceneActive)) return;
    const dt = lastPaint ? Math.min(0.065, (now - lastPaint) / 1000) : 0;
    lastPaint = now;
    setState({ lastPaint });

    if (model.build && gesture?.hit?.kind === 'object' && !gesture.moved && now - gesture.since >= 550) {
        const nextErase = { id: gesture.id, group: crypto.randomUUID(), seen: new Set() };
        const p = gesture.last;
        setState({ eraseStroke: nextErase, gesture: null });
        cb.hover(null);
        eraseAt(p);
    }
    const curGesture = getState().gesture;
    if (curGesture && !curGesture.hit && (curGesture.moved || now - curGesture.since >= 180)) {
        curGesture.steering = true;
        const bounds = canvas.getBoundingClientRect();
        cb.walk(homeHeldPointerTarget(model.camera, curGesture.last, bounds, model.scale));
    }
    cb.step?.(dt);
    model = getState().model;
    gesture = getState().gesture;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(r.width * ratio) || canvas.height !== Math.round(r.height * ratio)) {
        canvas.width = Math.round(r.width * ratio);
        canvas.height = Math.round(r.height * ratio);
        cb.resize(r.width, r.height);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const scale = model.scale;
    const project = (x, y) => ({ x: (x - model.camera.x) * scale + r.width / 2, y: (y - model.camera.y) * scale + r.height / 2 });
    const sec = now / 1000;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const objects = model.objects || [];
    const objectsById = new Map(objects.map(o => [o.id, o]));
    const surfaceLift = o => homeObjectSurfaceLift(o, objectsById, model.catalog.items);
  const worldRect={
        x: (model.camera.x - r.width / scale / 2) * 40 - 80,
        y: (model.camera.y - r.height / scale / 2) * 40 - 80,
        w: (r.width / scale) * 40 + 160,
        h: (r.height / scale) * 40 + 160,
    };

    ctx.save();
    ctx.translate(r.width / 2 - model.camera.x * scale, r.height / 2 - model.camera.y * scale);
    ctx.scale(scale / 40, scale / 40);
    terrainMissing = terrain.draw(ctx, model.home.seed, worldRect, envArt, decorArt, ratio, objects);
    ctx.restore();
    if (model.languageCount && !model.languageCount.room) {
        const area = model.languageCount.area;
        const p = project(area.x, area.y);
        ctx.save();
        ctx.strokeStyle = '#207457';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 5]);
        ctx.strokeRect(p.x, p.y, area.w * scale, area.h * scale);
        ctx.setLineDash([]);
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#fff8df';
        ctx.fillRect(p.x + 6, p.y + 5, 126, 23);
        ctx.fillStyle = '#244f3b';
        ctx.fillText(model.languageCount.room ? '放进房间里面' : '本轮数数范围', p.x + 12, p.y + 22);
        ctx.restore();
    }

    const hits = [];
    const groups = buildings.prepare(objects, model.catalog.items, worldRect, ratio, model.selection?.id || gesture?.hit?.id || '');
  const sections=buildings.sections();
    const hiddenRoofs = new Set();
    for (const actor of [model.hero, model.secondHero].filter(Boolean)) {
        for (const o of objects) {
            const item = buildingItem(o, model.catalog.items);
            if (item?.building?.type !== 'roof') continue;
            const b = buildingBounds(o, item);
            if (actor.x >= b.x && actor.x <= b.x + b.w && actor.y >= b.y && actor.y <= b.y + b.h) {
                hiddenRoofs.add(sections.get(o.id)?.[0]?.id);
            }
        }
    }
    const wallFades = ({ o, item, connections }) =>
        item.building &&
        ['wall', 'window'].includes(item.building.type) &&
        buildingWallFeet(o, connections).some(b =>
            [model.hero, model.secondHero].filter(Boolean).some(h => h.x >= b.x - 0.3 && h.x <= b.x + b.w + 0.3 && h.y < b.y + b.h && h.y > b.y - 1.4),
        );
    const curModel = model;
    const activeGesture = gesture;
    const objectEnv = { curModel, activeGesture, r, scale, sec, project, surfaceLift, imageFor, hits };
    function drawGroup(g){if(g.roof&&hiddenRoofs.has(g.section))return;
        if (g.dynamic) {
            g.rows.forEach(row => drawHomeObjectNode(ctx, { ...objectEnv, o: row.o, draw: true, buildingRow: row }));
            return;
        }
        ctx.save();
        ctx.translate(r.width / 2 - curModel.camera.x * scale, r.height / 2 - curModel.camera.y * scale);
        ctx.scale(scale / 40, scale / 40);
        if (g.rows.some(wallFades)) {
            for (const row of g.rows) buildings.draw(ctx, { ...g, rows: [row] }, { alpha: wallFades(row) ? 0.4 : 1, forceLive: true });
        } else {
            buildings.draw(ctx, g);
        }
        ctx.restore();
        for (const row of g.rows) drawHomeObjectNode(ctx, { ...objectEnv, o: row.o, draw: false, buildingRow: row });
    }
    setState({ terrainMissing, hits });

    groups.filter(g => g.ground && !g.roof).forEach(drawGroup);

    if (edit) {
        edit.style.visibility = activeGesture?.moved ? 'hidden' : '';
        if (curModel.selection?.id) {
            const selObj = objects.find(o => o.id === curModel.selection.id);
            if (selObj) {
                const b = footprint(selObj, curModel.catalog.items);
                const sp = project(selObj.x + b.w / 2, selObj.y - surfaceLift(selObj));
                const half = edit.offsetWidth / 2 + 12;
                edit.style.left = `${Math.max(half, Math.min(r.width - half, sp.x))}px`;
                edit.style.top = `${Math.max(edit.offsetHeight + 12, Math.min(r.height - 130, sp.y - 22))}px`;
            }
        } else {
            edit.style.left = '50%';
            edit.style.top = '76px';
        }
    }

    const heroSave = curModel.heroSave || { school: 'life', level: 1 };
    const style = motionStyle({ ...heroSave, mountId: null, facing: curModel.hero.facing });
    motionTrail.step({ x: curModel.hero.x * 40, y: curModel.hero.y * 40 }, now, style, {
        moving: !!curModel.hero.moving,
        reducedMotion,
        scope: curModel.home?.id,
        hidden: document.hidden,
    });
    ctx.save();
    ctx.translate(r.width / 2 - curModel.camera.x * scale, r.height / 2 - curModel.camera.y * scale);
    ctx.scale(scale / 40, scale / 40);
    drawMotionTrail(ctx, motionTrail.state, now);
    ctx.restore();

    if (curModel.destination && curModel.hero.moving && !activeGesture?.steering) {
        const hp = project(curModel.hero.x, curModel.hero.y);
        const dp = project(curModel.destination.x, curModel.destination.y);
        ctx.save();
        ctx.strokeStyle = 'rgba(255,244,184,0.72)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([7, 6]);
        ctx.beginPath();
        ctx.moveTo(hp.x, hp.y);
        ctx.lineTo(dp.x, dp.y);
        ctx.stroke();
        ctx.setLineDash([]);
        const ring = 10 + Math.sin(sec * 5) * 2.5;
        ctx.strokeStyle = 'rgba(168,246,233,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(dp.x, dp.y, ring, ring * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    drawHomeSpawnPortal(ctx, { project, scale, sec, r, reducedMotion, portal, hits });

    const actors = (curModel.pets || []).filter(
        p => Math.abs(p.x - curModel.camera.x) < r.width / scale / 2 + 3 && Math.abs(p.y - curModel.camera.y) < r.height / scale / 2 + 3,
    );
    const worldTrees = collectHomeWorldTrees(curModel.home.seed, worldRect, objects);
    const sorted = [
        ...worldTrees.map(t => ({ kind: 'tree', o: t, y: t.ty })),
        ...groups.filter(g => !g.ground && !g.roof).map(g => ({ kind: 'group', o: g, y: g.depth })),
        ...actors.map(o => ({ kind: 'pet', o, y: o.y + 1 })),
        { kind: 'hero', o: curModel.hero, y: curModel.hero.y, owner: 0 },
        ...(curModel.secondHero ? [{ kind: 'hero', o: curModel.secondHero, y: curModel.secondHero.y, owner: 1 }] : []),
    ].sort((a, b) => a.y - b.y);

    for (const row of sorted) {
        if (row.kind === 'tree') {
            const p = project(row.o.tx, row.o.ty);
            ctx.save();
            if ([curModel.hero, curModel.secondHero].filter(Boolean).some(h => Math.abs(h.x - row.o.tx) < 1.7 && h.y < row.o.ty && h.y > row.o.ty - 4)) {
                ctx.globalAlpha = 0.45;
            }
            if (envArt) drawHomeWorldTree(ctx, row.o, p.x, p.y, scale / 40, envArt);
            else if (cb.drawTree) cb.drawTree(ctx, p.x, p.y, scale * 3.2, Math.abs(Math.round(row.o.tx + row.o.ty)) % 4);
            ctx.restore();
        } else if (row.kind === 'hero') {
            const nextPos = drawHomeHeroActor(ctx, {
                row, project, scale, sec, now, reducedMotion, curModel, heroSave, actors, heroActor, secondActor, prevHeroPos, prevSecondPos, motionTrail, cb, fallbackHero, setState,
            });
            if (row.owner) prevSecondPos = nextPos;
            else prevHeroPos = nextPos;
        } else if (row.kind === 'group') {
            drawGroup(row.o);
        } else {
            drawHomePetActor(ctx, { pet: row.o, project, scale, now, reducedMotion, activeGesture, curModel, imageFor, petDragPoint, hits });
        }
    }

    if (curModel.showRoofs) {
        groups
            .filter(g => g.roof)
            .sort((a, b) => Number(a.decoration) - Number(b.decoration) || a.depth - b.depth)
            .forEach(drawGroup);
    }

    if (curModel.languageCount?.room) {
        const area = curModel.languageCount.area;
        const p = project(area.x, area.y);
        ctx.save();
        ctx.strokeStyle = '#207457';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 5]);
        ctx.strokeRect(p.x, p.y, area.w * scale, area.h * scale);
        ctx.setLineDash([]);
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#fff8df';
        ctx.fillRect(p.x + 6, p.y + 5, 126, 23);
        ctx.fillStyle = '#244f3b';
        ctx.fillText('放进房间里面', p.x + 12, p.y + 22);
        ctx.restore();
    }

    drawHomeBuildOverlays(ctx, {
        r,
        scale,
        now,
        sec,
        project,
        surfaceLift,
        objects,
        curModel,
        activeGesture,
        showGrid,
        curHoverPoint: getState().hoverPoint,
        curEraseStroke: getState().eraseStroke,
        buildTip,
        side,
        hitAt,
        imageFor,
    });
    drawHomeSummonEffects(ctx, { now, scale, project, reducedMotion, summonEffects });

    const wish = curModel.wish;
    const pet = wish && actors.find(p => p.id === wish.petId);
    bubble.hidden = !pet || curModel.quiet;
    if (pet && !curModel.quiet) {
        const p = activeGesture?.moved && activeGesture.hit?.kind === 'pet' && activeGesture.hit.id === pet.id ? petDragPoint(activeGesture) : project(pet.x, pet.y);
        bubble.classList.toggle('is-collapsed', !wish.expanded);
        bubbleText.textContent = wish.expanded ? (curModel.translation ? `${wish.text}\n${wish.translation}` : wish.text) : '…';
        bubbleText.setAttribute('aria-label', wish.expanded ? bubbleText.textContent : tr('听宠物愿望'));
        bubble.style.left = `${p.x + 28}px`;
        bubble.style.top = `${p.y - scale * 1.8}px`;
        bubble.hidden = p.x < 0 || p.x > r.width || p.y < 0 || p.y > r.height;
    }
    const meter = frameMeter.sample(now);
    const fpsText = meter ? `FPS ${meter.fps}` : 'FPS —';
    if (fpsLabel.textContent !== fpsText) fpsLabel.textContent = fpsText;
}
