// home/view_home_canvas_layers.js — 家园 2D 画布分层绘制辅助（家具/积木节点、传送门、角色与宠物、建造提示与召唤特效）。
import { drawMotionAccessory } from '../adventure_motion_effects.js';
import { updateHeroActor } from '../hero_pose_core.js';
import {
    homeDoorIsOpen,
    isRoofDecoration,
    buildingItem,
    obstruction,
    buildingConnectionMask,
    buildingWallFeet,
    isEdge,
} from '../home_building_core.js';
import { homeObjectInteractive, footprint } from '../home_core.js';
import { STARTER_ROOM_ID, STARTER_BLANKET_ID, STARTER_CHAIR_ID } from '../home_starter_room_core.js';
import { petIdleLift } from '../views/adventure/view_adventure_pet_mood.js';
import {
    drawHomeObject,
    homeObjectVisualBounds,
    homeObjectPixelHit,
} from './view_home_object_art.js';
import { drawBuilding, buildingVisualBounds } from './view_home_building.js';
import { COLOR_HEX } from './view_home_modals.js';

export function drawHomeObjectNode(
    ctx,
    { o, draw = true, buildingRow, curModel, activeGesture, r, scale, sec, project, surfaceLift, imageFor, hits },
) {
    const item = curModel.catalog.items.find(i => i.id === o.itemId);
    if (!item) return;
    const b = footprint(o, curModel.catalog.items);
    const p = project(o.x, o.y - (isRoofDecoration(o) ? 1.4 : surfaceLift(o)));
    if (p.x > r.width + 60 || p.y > r.height + 120 || p.x + b.w * scale < -60 || p.y + b.h * scale < -60) return;

    ctx.save();
    if (activeGesture?.moved && activeGesture.hit?.id === o.id) ctx.globalAlpha = 0.25;
    let bounds;
    if (item.building) {
        const visual = buildingVisualBounds(o, item);
        bounds = {
            x: project(visual.x / 40, visual.y / 40).x,
            y: project(visual.x / 40, visual.y / 40).y,
            w: (visual.w * scale) / 40,
            h: (visual.h * scale) / 40,
        };
        if (draw) {
            ctx.translate(p.x, p.y);
            ctx.scale(scale / 40, scale / 40);
            ctx.translate(-o.x * 40, -o.y * 40);
            drawBuilding(
                ctx,
                item,
                item.building.type === 'door'
                    ? { ...o, doorOpen: homeDoorIsOpen(o, [curModel.hero, curModel.secondHero], buildingRow?.connections) }
                    : o,
                imageFor(item.art),
                buildingRow?.connections,
                buildingRow?.ao,
            );
        }
    } else if (draw) {
        bounds = drawHomeObject(ctx, item, o, p.x, p.y, b.w * scale, b.h * scale, imageFor(item.art), sec);
    } else {
        bounds = homeObjectVisualBounds(item, o, p.x, p.y, b.w * scale, b.h * scale);
    }
    ctx.restore();

    if (curModel.languageAnchors?.includes(o.id)) {
        ctx.save();
        ctx.strokeStyle = '#207457';
        ctx.lineWidth = 3;
        ctx.strokeRect(p.x - 3, p.y - 3, b.w * scale + 6, b.h * scale + 6);
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const cx = p.x + (b.w * scale) / 2;
        ctx.fillStyle = '#fff8df';
        ctx.fillRect(cx - 25, p.y - 25, 50, 20);
        ctx.fillStyle = '#244f3b';
        ctx.fillText('参照物', cx, p.y - 15);
        ctx.restore();
    }
    if (curModel.languageCount?.marked.includes(o.id)) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x + (b.w * scale) / 2, p.y - 8, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#207457';
        ctx.fill();
        ctx.strokeStyle = '#fff8df';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }
    if (COLOR_HEX[o.color]) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x + (b.w * scale) / 2, p.y + b.h * scale + 10, 7, 0, Math.PI * 2);
        ctx.fillStyle = COLOR_HEX[o.color];
        ctx.fill();
        ctx.strokeStyle = '#fff8dd';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }
    if (o.label) {
        ctx.save();
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const width = Math.min(220, ctx.measureText(o.label).width + 16);
        const cx = p.x + (b.w * scale) / 2;
        const cy = p.y + b.h * scale + (COLOR_HEX[o.color] ? 32 : 16);
        ctx.fillStyle = 'rgba(255,248,220,.95)';
        ctx.fillRect(cx - width / 2, cy - 12, width, 24);
        ctx.fillStyle = '#294734';
        ctx.fillText(o.label, cx, cy, width - 16);
        ctx.restore();
    }

    const starterFurniture = curModel.home.id === STARTER_ROOM_ID && (o.id === STARTER_BLANKET_ID || o.id === STARTER_CHAIR_ID);
    if (
        curModel.build ||
        starterFurniture ||
        curModel.languageChoices?.includes(o.id) ||
        item.building?.type === 'door' ||
        homeObjectInteractive(o, curModel.catalog.items)
    ) {
        if (isEdge(item)) {
            const height = (item.building.type === 'fence' ? 0.7 : 1.25) * (o.sizeScale ?? 1);
            for (const foot of buildingWallFeet(o, buildingRow?.connections)) {
                const q = project(foot.x, foot.y - height);
                hits.push({ kind: 'object', id: o.id, sx: q.x - 3, sy: q.y - 2, sw: foot.w * scale + 6, sh: (foot.h + height) * scale + 4 });
            }
        } else {
            hits.push({
                kind: 'object',
                id: o.id,
                sx: bounds?.x ?? p.x,
                sy: bounds?.y ?? p.y - 12,
                sw: bounds?.w ?? b.w * scale,
                sh: bounds?.h ?? b.h * scale + 12,
                pixelHit: item.building ? null : (x, y) => homeObjectPixelHit(item, o, imageFor(item.art), bounds, x, y),
            });
        }
    }

    if (curModel.build && curModel.selection?.id === o.id) {
        ctx.save();
        ctx.strokeStyle = '#ffe885';
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(255,215,90,0.65)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.roundRect(p.x - 2, p.y - 2, (item.building ? o.sizeScale ?? 1 : b.w) * scale + 4, (item.building ? o.sizeScale ?? 1 : b.h) * scale + 4, 3);
        ctx.stroke();
        const block = obstruction(o, item);
        if (block && o.properties) {
            const q = project(block.x, block.y);
            ctx.strokeStyle = '#e96655';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(q.x, q.y, block.w * scale, block.h * scale);
        }
        ctx.restore();
    }
}

export function drawHomeSpawnPortal(ctx, { project, scale, sec, r, reducedMotion, portal, hits }) {
    const spawn = project(0, 0);
    ctx.save();
    ctx.translate(spawn.x, spawn.y);
    ctx.scale(scale / 40, scale / 40);
    ctx.strokeStyle = 'rgba(181,255,242,0.72)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, -2, 48, 20, 0, 0, Math.PI * 2);
    ctx.stroke();
    const gemBob = reducedMotion ? 0 : Math.sin(sec * 2.6) * 3;
    for (const x of [-64, 64]) {
        ctx.fillStyle = '#718e84';
        ctx.fillRect(x - 6, -42, 12, 40);
        ctx.fillStyle = '#a8f6e9';
        ctx.beginPath();
        ctx.moveTo(x, -66 + gemBob);
        ctx.lineTo(x + 10, -48 + gemBob);
        ctx.lineTo(x, -34 + gemBob);
        ctx.lineTo(x - 10, -48 + gemBob);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
    hits.push({ kind: 'portal', sx: spawn.x - (72 * scale) / 40, sy: spawn.y - (65 * scale) / 40, sw: (144 * scale) / 40, sh: (95 * scale) / 40 });
    portal.style.left = `${spawn.x}px`;
    portal.style.top = `${spawn.y - (24 * scale) / 40}px`;
    portal.style.pointerEvents = 'none';
    portal.hidden = spawn.x < -100 || spawn.x > r.width + 100 || spawn.y < -100 || spawn.y > r.height + 100;
}

export function drawHomeHeroActor(
    ctx,
    { row, project, scale, sec, now, reducedMotion, curModel, heroSave, actors, heroActor, secondActor, prevHeroPos, prevSecondPos, motionTrail, cb, fallbackHero, setState },
) {
    const h = row.o;
    const p = project(h.x, h.y);
    const save = row.owner ? curModel.secondSave : heroSave;
    const previous = row.owner ? prevSecondPos : prevHeroPos;
    const dx = previous ? (h.x - previous.x) * 40 : 0;
    const dy = previous ? (h.y - previous.y) * 40 : 0;
    const nextPos = { x: h.x, y: h.y };
    if (row.owner) setState({ prevSecondPos: nextPos });
    else setState({ prevHeroPos: nextPos });
    const pose = updateHeroActor(row.owner ? secondActor : heroActor, {
        dx,
        dy,
        x: h.x * 40,
        y: h.y * 40,
        time: sec,
        facing: h.facing,
        npcs: actors.map(pet => ({ id: pet.id, x: pet.x * 40, y: pet.y * 40 })),
        reducedMotion,
    });
    ctx.fillStyle = 'rgba(28,48,26,0.26)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 2, scale * 0.45, scale * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    p.y -= Math.max(0, h.jumpHeight || 0) * scale * (reducedMotion ? 0.15 : 1);
    if (!row.owner) drawMotionAccessory(ctx, p.x, p.y, now, motionTrail.state);
    const heroDrawOpts = { mounted: false, head: pose.head, breath: pose.breath, walkTime: pose.walkTime, reducedMotion };
    if (cb.drawHero) {
        cb.drawHero(ctx, { ...save, mountId: null, facing: h.facing }, p.x, p.y, sec, !!h.moving, scale / 40, heroDrawOpts);
    } else if (fallbackHero) {
        fallbackHero.drawSave(ctx, { ...save, mountId: null, facing: h.facing }, p.x, p.y, sec, !!h.moving, scale / 40, heroDrawOpts);
    } else {
        ctx.fillStyle = '#e8be72';
        ctx.beginPath();
        ctx.arc(p.x, p.y - scale * 0.9, scale * 0.23, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#537e91';
        ctx.fillRect(p.x - scale * 0.2, p.y - scale * 0.65, scale * 0.4, scale * 0.6);
    }
    ctx.fillStyle = '#fff8dc';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(curModel.secondHero ? `${row.owner + 1}号 · ${save?.name || '玩家'}` : '我', p.x, p.y + 22);
    return nextPos;
}

export function drawHomePetActor(ctx, { pet, project, scale, now, reducedMotion, activeGesture, curModel, imageFor, petDragPoint, hits }) {
    const dragging = activeGesture?.moved && activeGesture.hit?.kind === 'pet' && activeGesture.hit.id === pet.id;
    const p = dragging ? petDragPoint(activeGesture) : project(pet.x, pet.y);
    const image = imageFor(pet.art);
    const activity = pet.activity;
    const phase = reducedMotion ? 0 : now / 450;
    let dx = 0;
    let dy = activity || dragging ? 0 : (-petIdleLift(now, reducedMotion) * scale) / 40;
    let angle = 0;
    if (['dance', 'ball', 'slide'].includes(activity)) {
        dy = -Math.abs(Math.sin(phase)) * 8;
        dx = Math.sin(phase) * 5;
    }
    if (activity === 'swing') {
        dx = Math.sin(phase) * 12;
        angle = Math.sin(phase) * 0.12;
    }
    if (['eat', 'drink', 'read', 'water', 'picnic'].includes(activity)) angle = Math.sin(phase) * 0.04;
    if (activity === 'sleep') angle = 0.12;

    const size = scale * 1.8;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = '#35503325';
    ctx.beginPath();
    ctx.ellipse(0, 3, size * 0.35, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(dx, dy);
    ctx.rotate(angle);
    if (image?.complete && image.naturalWidth) {
        const cols = pet.art.cols || 1;
        const rows = pet.art.rows || 1;
        const stageIdx = Math.min(rows - 1, pet.stage || 0);
        const col = activity === 'sleep' ? Math.min(1, cols - 1) : activity ? Math.min(2, cols - 1) : 0;
        ctx.drawImage(
            image,
            (col * image.naturalWidth) / cols,
            (stageIdx * image.naturalHeight) / rows,
            image.naturalWidth / cols,
            image.naturalHeight / rows,
            -size / 2,
            -size,
            size,
            size,
        );
    } else {
        ctx.fillStyle = '#f2ddb4';
        ctx.beginPath();
        ctx.ellipse(0, -size * 0.4, size * 0.3, size * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    if (activity === 'sleep') {
        ctx.strokeStyle = 'rgba(255,252,230,0.85)';
        ctx.lineWidth = 1.6;
        for (let i = 0; i < 2; i++) {
            ctx.beginPath();
            ctx.arc(size * (0.22 + i * 0.12), -size * (0.72 + i * 0.14), 3 + i * 2, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    if (activity === 'bathe') {
        ctx.strokeStyle = '#e5f6ee';
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(-10 + i * 12, -10 - Math.sin(phase + i) * 6, 4, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    if (curModel.blockedPetId === pet.id) {
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const x = size * 0.28;
        const y = -size * 0.83;
        ctx.fillStyle = '#fff8df';
        ctx.beginPath();
        ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#634a2f';
        ctx.fillText('?', x, y);
    }
    if (activity === 'sunbathe') {
        ctx.fillStyle = '#ffdf83';
        ctx.beginPath();
        ctx.arc(size * 0.27, -size * 0.78, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff0b0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const a = (i * Math.PI) / 4;
            const x = Math.cos(a);
            const y = Math.sin(a);
            ctx.moveTo(size * 0.27 + 8 * x, -size * 0.78 + 8 * y);
            ctx.lineTo(size * 0.27 + 11 * x, -size * 0.78 + 11 * y);
        }
        ctx.stroke();
    }
    if (['eat', 'drink', 'picnic'].includes(activity)) {
        ctx.fillStyle = '#f1d6a1';
        ctx.beginPath();
        ctx.ellipse(10, 0, 10, activity === 'drink' ? 8 : 4, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    if (activity === 'read') {
        ctx.fillStyle = '#fff2cb';
        ctx.fillRect(-15, -5, 30, 13);
        ctx.strokeStyle = '#aa936e';
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.lineTo(0, 8);
        ctx.stroke();
    }
    if (activity === 'water') {
        ctx.fillStyle = '#8acada';
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.arc(22 + i * 3, -8 + ((phase * 8 + i * 5) % 20), 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (activity === 'ball') {
        ctx.fillStyle = '#efbf77';
        ctx.beginPath();
        ctx.arc(25 + Math.sin(phase) * 8, 2, 8, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(24,42,28,0.52)';
    ctx.beginPath();
    ctx.roundRect(p.x - 34, p.y + 6, 68, 17, 8);
    ctx.fill();
    ctx.fillStyle = '#f7f4e4';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pet.name, p.x, p.y + 18);
    hits.push({ kind: 'pet', id: pet.id, sx: p.x - size / 2, sy: p.y - size, sw: size, sh: size + 20 });
}

export function drawHomeBuildOverlays(
    ctx,
    { r, scale, now, sec, project, surfaceLift, objects, curModel, activeGesture, showGrid, curHoverPoint, curEraseStroke, buildTip, side, hitAt, imageFor },
) {
    if (curModel.preview) {
        const o = curModel.preview;
        const item = curModel.catalog.items.find(i => i.id === o.itemId);
        if (item) {
            const b = footprint(o, curModel.catalog.items);
            const p = project(o.x, o.y - (isRoofDecoration(o) ? 1.4 : surfaceLift(o)));
            ctx.save();
            ctx.globalAlpha = 0.68;
            if (item.building) {
                ctx.translate(p.x, p.y);
                ctx.scale(scale / 40, scale / 40);
                ctx.translate(-o.x * 40, -o.y * 40);
                drawBuilding(ctx, item, o, imageFor(item.art), buildingConnectionMask(o, [...objects, o], curModel.catalog.items));
            } else {
                drawHomeObject(ctx, item, o, p.x, p.y, b.w * scale, b.h * scale, imageFor(item.art), sec);
            }
            ctx.restore();
            ctx.fillStyle = o.valid ? 'rgba(154,230,140,0.22)' : 'rgba(220,90,82,0.28)';
            ctx.strokeStyle = o.valid ? '#b8f59e' : '#ff7b72';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.roundRect(p.x, p.y, (item.building ? o.sizeScale ?? 1 : b.w) * scale, (item.building ? o.sizeScale ?? 1 : b.h) * scale, 3);
            ctx.fill();
            ctx.stroke();
        }
    }

    if (curModel.build && showGrid) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,250,224,.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const left = Math.floor(curModel.camera.x - r.width / scale / 2);
        const top = Math.floor(curModel.camera.y - r.height / scale / 2);
        for (let x = left; x <= left + r.width / scale + 1; x++) {
            const q = project(x, 0);
            ctx.moveTo(q.x, 0);
            ctx.lineTo(q.x, r.height);
        }
        for (let y = top; y <= top + r.height / scale + 1; y++) {
            const q = project(0, y);
            ctx.moveTo(0, q.y);
            ctx.lineTo(r.width, q.y);
        }
        ctx.stroke();
        ctx.restore();
    }

    if (curModel.build && curModel.preview) {
        const o = curModel.preview;
        const item = buildingItem(o, curModel.catalog.items);
        if (isEdge(item)) {
            ctx.save();
            ctx.strokeStyle = o.valid ? '#b8f59e' : '#ff7b72';
            ctx.lineWidth = 2;
            for (const foot of buildingWallFeet(o, buildingConnectionMask(o, [...objects, o], curModel.catalog.items))) {
                const q = project(foot.x, foot.y);
                ctx.strokeRect(q.x, q.y, foot.w * scale, foot.h * scale);
            }
            ctx.restore();
        }
    }

    if (buildTip) {
        const p = curHoverPoint;
        const hit = p && hitAt(p);
        const o = curModel.preview || (hit?.kind === 'object' && objects.find(row => row.id === hit.id));
        const item = o && buildingItem(o, curModel.catalog.items);
        buildTip.hidden = !curModel.build || !p || !item;
        if (!buildTip.hidden) {
            const holding = activeGesture?.hit?.kind === 'object' && !activeGesture.moved;
            const detail = curEraseStroke
                ? '拖动连续拆除'
                : holding
                  ? '长按拆除 · 移动可拖拽'
                  : curModel.preview
                    ? curModel.preview.valid
                        ? '可放置'
                        : curModel.preview.reason || '此处不可放置'
                    : '右键或长按拆除 · 中键取样';
            buildTip.textContent = `${item.zh} · ${Math.floor(o.x)}, ${Math.floor(o.y)}\n${detail}`;
            buildTip.classList.toggle('is-invalid', curModel.preview?.valid === false);
            buildTip.style.left = `${Math.max(8, Math.min(r.width - buildTip.offsetWidth - 8, p.sx + 18))}px`;
            const tray = side?.getBoundingClientRect();
            const bottom = tray && tray.height && tray.top < r.bottom ? tray.top - r.top : r.height;
            buildTip.style.top = `${Math.max(8, Math.min(bottom - buildTip.offsetHeight - 8, p.sy - buildTip.offsetHeight - 18))}px`;
            if (holding) {
                ctx.save();
                ctx.strokeStyle = '#ffb26e';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(p.sx, p.sy, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, (now - activeGesture.since) / 550));
                ctx.stroke();
                ctx.restore();
            }
        }
    }
}

export function drawHomeSummonEffects(ctx, { now, scale, project, reducedMotion, summonEffects }) {
    for (const fx of summonEffects) {
        const progress = Math.max(0, Math.min(1, (now - fx.since) / 1200));
        const fade = 1 - progress;
        const p = project(fx.x, fx.y);
        const radius = Math.max(1.4, Math.hypot(fx.w || 2, fx.h || 2) * 0.48) * scale;
        ctx.save();
        ctx.strokeStyle = `rgba(255,233,138,${(fade * 0.85).toFixed(3)})`;
        ctx.lineWidth = 3 * fade + 1;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, radius * (0.45 + progress * 0.75), radius * (0.24 + progress * 0.4), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(168,246,233,${(fade * 0.75).toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - progress * 18, radius * (0.3 + progress * 0.55), radius * (0.16 + progress * 0.28), 0, 0, Math.PI * 2);
        ctx.stroke();
        if (!reducedMotion) {
            for (let i = 0; i < 10; i++) {
                const a = i * Math.PI * 0.2 + progress * 2.2;
                const dist = radius * (0.2 + progress * 0.65) * (0.65 + (i % 3) * 0.18);
                const sx = p.x + Math.cos(a) * dist;
                const sy = p.y + Math.sin(a) * dist * 0.45 - progress * (28 + (i % 4) * 14);
                const sr = (3.5 + (i % 3) * 1.5) * fade;
                ctx.fillStyle = i % 2 ? '#ffe98a' : '#a8f6e9';
                ctx.globalAlpha = fade;
                ctx.beginPath();
                ctx.moveTo(sx, sy - sr * 1.5);
                ctx.lineTo(sx + sr * 0.5, sy - sr * 0.5);
                ctx.lineTo(sx + sr * 1.5, sy);
                ctx.lineTo(sx + sr * 0.5, sy + sr * 0.5);
                ctx.lineTo(sx, sy + sr * 1.5);
                ctx.lineTo(sx - sr * 0.5, sy + sr * 0.5);
                ctx.lineTo(sx - sr * 1.5, sy);
                ctx.lineTo(sx - sr * 0.5, sy - sr * 0.5);
                ctx.closePath();
                ctx.fill();
            }
        }
        ctx.restore();
    }
}
