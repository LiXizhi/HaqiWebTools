// home/view_home_scene_input.js — 家园画布与侧栏拖放输入绑定、快捷键处理与场景预加载。
import { loadEnvironmentArt as defaultLoadEnvironmentArt } from '../adventure_environment_art.js';
import { buildingItem } from '../home_building_core.js';
import { homeFurnitureDragPosition } from '../home_edit_core.js';
import { fetchJson as defaultFetchJson } from '../runtime_data.js';
import { el } from './view_home_modals.js';

export function homePointerPosition(canvas, model, e) {
    const r = canvas.getBoundingClientRect();
    return {
        sx: e.clientX - r.left,
        sy: e.clientY - r.top,
        x: model.camera.x + (e.clientX - r.left - r.width / 2) / model.scale,
        y: model.camera.y + (e.clientY - r.top - r.height / 2) / model.scale,
    };
}

export function createHomeEditKeyHandler({ modal, getModel, cancelScenePointer, run, cb, onToggleGrid }) {
    return function editKey(e) {
        const model = getModel();
        if (
            !model?.home ||
            e.target?.closest?.('input,textarea,select,[contenteditable=true],dialog') ||
            modal?.querySelector('dialog[open]') ||
            e.altKey
        ) {
            return;
        }
        const key = e.key.toLowerCase();
        const command = e.ctrlKey || e.metaKey;
        if (model.build && command && (key === 'z' || key === 'y')) {
            e.preventDefault();
            e.stopPropagation();
            if (!e.repeat) {
                cancelScenePointer();
                run(key === 'y' || e.shiftKey ? cb.redo : cb.undo);
            }
            return;
        }
        if (model.build && !command && key === 'g') {
            e.preventDefault();
            if (!e.repeat) onToggleGrid();
        }
    };
}

export function bindHomeTrayDrag({ side, body, canvas, getModel, setCatalogDrag, run, cb, position, onRender }) {
    let trayGesture = null;
    let suppressTrayClick = false;
    let petGhost = null;
    const overScene = e => document.elementFromPoint(e.clientX, e.clientY) === canvas;

    const finishTray = (e, cancelled = false) => {
        if (!trayGesture || trayGesture.id !== e.pointerId) return;
        const g = trayGesture;
        trayGesture = null;
        setCatalogDrag(null);
        petGhost?.remove();
        petGhost = null;
        body.classList.remove('is-dragging-item');
        if (side.hasPointerCapture(e.pointerId)) side.releasePointerCapture(e.pointerId);
        if (g.active) {
            suppressTrayClick = true;
            if (!cancelled && overScene(e)) {
                const model = getModel();
                const point = position(e);
                if (g.petId) {
                    const rect = canvas.getBoundingClientRect();
                    point.x = model.camera.x + (point.sx - rect.width / 2) / model.scale;
                    point.y = model.camera.y + (point.sy - rect.height / 2) / model.scale;
                }
                run(() => (g.petId ? cb.drop({ kind: 'pet', id: g.petId }, point) : cb.take(g.row, point)));
            } else {
                cb.cancel();
            }
            onRender();
        }
    };

    side.onpointerdown = e => {
        suppressTrayClick = false;
        const card = e.target.closest('.home-item,.home-pet-card');
        if (!card || card.classList.contains('home-template') || e.button !== 0 || trayGesture) return;
        suppressTrayClick = false;
        trayGesture = { id: e.pointerId, x: e.clientX, y: e.clientY, row: { ...card.homeItem }, petId: card.homePetId, card, active: false };
    };
    side.onpointermove = e => {
        const g = trayGesture;
        if (!g || g.id !== e.pointerId) return;
        const dx = e.clientX - g.x;
        const dy = e.clientY - g.y;
        if (!g.active) {
            if (Math.hypot(dx, dy) < 8) return;
            if (Math.abs(dx) > Math.abs(dy)) return;
            side.setPointerCapture(e.pointerId);
            g.active = true;
            setCatalogDrag(g.row);
            if (g.petId) {
                cb.stopWalk();
                petGhost = el('div', 'home-pet-drag-preview');
                const portrait = g.card.querySelector('canvas');
                const copy = el('canvas');
                copy.width = portrait.width;
                copy.height = portrait.height;
                copy.getContext('2d').drawImage(portrait, 0, 0);
                petGhost.append(copy, el('span', '', g.card.textContent));
                petGhost.setAttribute('aria-hidden', 'true');
                body.append(petGhost);
            } else {
                cb.select(g.row.itemId, g.row.color, g.row.fromInventory);
            }
            body.classList.add('is-dragging-item');
        }
        e.preventDefault();
        if (petGhost) {
            petGhost.style.left = `${e.clientX}px`;
            petGhost.style.top = `${e.clientY}px`;
        } else {
            cb.hover(overScene(e) ? position(e) : null);
        }
    };
    side.onpointerup = e => finishTray(e);
    side.onpointercancel = e => finishTray(e, true);
    side.onlostpointercapture = e => finishTray(e, true);
    side.addEventListener(
        'click',
        e => {
            if (suppressTrayClick) {
                e.preventDefault();
                e.stopPropagation();
                suppressTrayClick = false;
            }
        },
        true,
    );
    side.addEventListener('keydown', e => {
        if (e.key === 'Escape' && trayGesture) {
            e.stopPropagation();
            finishTray({ pointerId: trayGesture.id }, true);
        }
    });
}

export function bindHomeSceneCanvasInput({
    canvas,
    body,
    side,
    dock,
    getState,
    setState,
    position,
    hitAt,
    eraseAt,
    paintAt,
    petDragPoint,
    run,
    cb,
    doc = typeof document !== 'undefined' ? document : null,
}) {
    const cancelPointer = () => {
        const { gesture, paintStroke, eraseStroke, buildTip } = getState();
        const id = gesture?.id ?? paintStroke?.id ?? eraseStroke?.id;
        setState({ paintStroke: null, eraseStroke: null, hoverPoint: null, gesture: null });
        if (gesture?.steering) cb.stopWalk();
        cb.hover(null);
        if (buildTip) buildTip.hidden = true;
        if (id !== undefined && canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
    };

    canvas.onpointerdown = e => {
        const { model, gesture, paintStroke, eraseStroke } = getState();
        if (gesture || paintStroke || eraseStroke) return;
        const target = hitAt(position(e));
        if (e.button === 1 && model.build) {
            e.preventDefault();
            if (target?.kind === 'object') cb.pick(target.id);
            return;
        }
        if (e.button === 2 && model.build) {
            e.preventDefault();
            canvas.focus();
            canvas.setPointerCapture(e.pointerId);
            setState({ eraseStroke: { id: e.pointerId, group: crypto.randomUUID(), seen: new Set() } });
            eraseAt(position(e));
            return;
        }
        if (e.button !== 0) return;
        canvas.focus();
        canvas.setPointerCapture(e.pointerId);
        const p = position(e);
        const hit = hitAt(p);
        setState({ hoverPoint: p });
        if (model.build && model.selection && !model.selection.id && buildingItem(model.selection, model.catalog.items)?.building && hit?.kind !== 'object' && hit?.kind !== 'pet') {
            setState({ paintStroke: { seen: new Set(), row: { ...model.selection }, id: e.pointerId, group: crypto.randomUUID() } });
            paintAt(p);
            return;
        }
        setState({
            gesture: {
                pendingPaint:
                    model.build && hit?.kind === 'object' && model.selection && !model.selection.id && buildingItem(model.selection, model.catalog.items)?.building
                        ? { ...model.selection }
                        : null,
                start: p,
                last: p,
                hit,
                origin: hit?.kind === 'object' ? model.objects.find(o => o.id === hit.id) : null,
                id: e.pointerId,
                since: performance.now(),
                steering: false,
                moved: false,
            },
        });
    };

    canvas.oncontextmenu = e => {
        if (getState().model?.build) e.preventDefault();
    };

    canvas.onpointerleave = () => {
        const { gesture, paintStroke, eraseStroke, buildTip } = getState();
        if (!gesture && !paintStroke && !eraseStroke) {
            setState({ hoverPoint: null });
            cb.hover(null);
            if (buildTip) buildTip.hidden = true;
        }
    };

    canvas.onpointermove = e => {
        const { model, gesture, paintStroke, eraseStroke, edit } = getState();
        const nextHover = model.build ? position(e) : null;
        setState({ hoverPoint: nextHover });
        if ((paintStroke || eraseStroke) && doc?.elementFromPoint(e.clientX, e.clientY) !== canvas) {
            if (paintStroke) paintStroke.last = null;
            if (eraseStroke) eraseStroke.last = null;
            setState({ hoverPoint: null });
            cb.hover(null);
            return;
        }
        if (eraseStroke) {
            if (eraseStroke.id === e.pointerId) eraseAt(nextHover);
            return;
        }
        if (paintStroke) {
            if (paintStroke.id === e.pointerId) paintAt(position(e));
            return;
        }
        if (!gesture && model.build && model.selection && !model.selection.id && buildingItem(model.selection, model.catalog.items)?.building) {
            cb.hover(position(e));
        }
        if (gesture && gesture.id !== e.pointerId) return;
        const p = position(e);
        if (!gesture) return;
        if (Math.hypot(p.sx - gesture.start.sx, p.sy - gesture.start.sy) > 6) gesture.moved = true;
        if (gesture.moved && edit) edit.style.visibility = 'hidden';
        if (gesture.moved && gesture.pendingPaint) {
            const start = gesture.start;
            setState({
                paintStroke: { seen: new Set(), row: gesture.pendingPaint, id: e.pointerId, group: crypto.randomUUID() },
                gesture: null,
            });
            paintAt(start);
            paintAt(p);
            return;
        }
        if (gesture.moved && gesture.hit && (gesture.hit.kind === 'pet' || gesture.hit.kind === 'object')) {
            cb.hover(
                gesture.origin && !(gesture.origin.properties?.snap ?? buildingItem(gesture.origin, model.catalog.items)?.building?.snap ?? false)
                    ? homeFurnitureDragPosition(gesture.origin, gesture.start, p, model.scale)
                    : gesture.origin
                      ? { x: p.x + Math.floor(gesture.origin.x) - Math.floor(gesture.start.x), y: p.y + Math.floor(gesture.origin.y) - Math.floor(gesture.start.y) }
                      : p,
                gesture.hit,
            );
        }
        gesture.last = p;
    };

    canvas.onpointerup = e => {
        const { model, gesture, paintStroke, eraseStroke } = getState();
        if (eraseStroke?.id === e.pointerId) {
            setState({ eraseStroke: null });
            if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
            return;
        }
        if (paintStroke?.id === e.pointerId) {
            setState({ paintStroke: null });
            if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
            return;
        }
        if (!gesture || gesture.id !== e.pointerId) return;
        const g = gesture;
        const p = position(e);
        // A final coalesced pointer position can arrive without a pointermove event.
        // Such a drag must never fall through into the pet's click/wish action.
        g.moved ||= Math.hypot(p.sx - g.start.sx, p.sy - g.start.sy) > 6;
        setState({ gesture: null });
        if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        if (g.steering) {
            cb.stopWalk();
            return;
        }
        if (doc?.elementFromPoint(e.clientX, e.clientY) !== canvas && g.hit?.kind !== 'pet') {
            cb.hover(null);
            return;
        }
        if (g.pendingPaint && !g.moved) {
            run(() => cb.take(g.pendingPaint, p));
            return;
        }
        if (g.moved && g.hit && (g.hit.kind === 'pet' || g.hit.kind === 'object')) {
            run(() => {
                if (g.hit.kind === 'pet') {
                    const dropTarget = doc?.elementFromPoint(e.clientX, e.clientY);
                    if ((body.dataset.drawer === 'pets' && side.contains(dropTarget)) || dock.children[2].contains(dropTarget)) {
                        return cb.recallPet(g.hit.id);
                    }
                    const point = petDragPoint(g);
                    const r = canvas.getBoundingClientRect();
                    return cb.drop(g.hit, {
                        x: model.camera.x + (point.x - r.width / 2) / model.scale,
                        y: model.camera.y + (point.y - r.height / 2) / model.scale,
                    });
                }
                return cb.drop(
                    g.hit,
                    g.origin && !(g.origin.properties?.snap ?? buildingItem(g.origin, model.catalog.items)?.building?.snap ?? false)
                        ? homeFurnitureDragPosition(g.origin, g.start, p, model.scale)
                        : g.origin
                          ? { x: p.x + Math.floor(g.origin.x) - Math.floor(g.start.x), y: p.y + Math.floor(g.origin.y) - Math.floor(g.start.y) }
                          : p,
                );
            });
        } else if (!g.moved) {
            if (g.hit?.kind === 'portal') cb.close();
            else run(() => cb.tap(g.hit, p));
        }
    };

    canvas.onpointercancel = cancelPointer;
    canvas.onlostpointercapture = cancelPointer;
    canvas.onwheel = e => {
        e.preventDefault();
        cb.zoom(e.deltaY > 0 ? 0.9 : 1.1);
    };
    canvas.onkeydown = e => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const { model } = getState();
        const moves = {
            ArrowLeft: [-3, 0],
            a: [-3, 0],
            A: [-3, 0],
            ArrowRight: [3, 0],
            d: [3, 0],
            D: [3, 0],
            ArrowUp: [0, -3],
            w: [0, -3],
            W: [0, -3],
            ArrowDown: [0, 3],
            s: [0, 3],
            S: [0, 3],
        };
        if (moves[e.key]) {
            e.preventDefault();
            cb.walk({ x: model.hero.x + moves[e.key][0], y: model.hero.y + moves[e.key][1] });
        }
        if (e.key === 'Escape') {
            e.stopPropagation();
            cancelPointer();
            cb.cancel();
        }
        if (e.key.toLowerCase() === 'r' && !e.repeat) cb.rotate();
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            if (!e.repeat) run(cb.recall);
        }
    };

    return cancelPointer;
}

export async function prepareHomeScene({
    ensureWorldAtlases,
    getModel,
    imageFor,
    images,
    isDead,
    resetTerrainMissing,
    getTerrainMissing,
    isCurrent = () => !isDead(),
    onProgress = () => {},
    wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
    now = () => performance.now(),
}) {
    await ensureWorldAtlases();
    const model = getModel();
    const art = [...(model.objects || []).map(o => model.catalog.items.find(i => i.id === o.itemId)?.art), ...(model.pets || []).map(p => p.art)].filter(
        Boolean,
    );
    await Promise.all(
        [...new Set(art.map(imageFor))].filter(Boolean).map(async image => {
            try {
                await image.decode();
            } catch {
                images.delete(image.src);
                throw Error('家园图片加载失败，请重试。');
            }
        }),
    );
    resetTerrainMissing();
    const started = now();
    while (!isDead() && isCurrent()) {
        await wait(32);
        if (isDead() || !isCurrent()) break;
        if (getTerrainMissing() === 0) return;
        if (now() - started > 30000) throw Error('家园地块准备时间较长，请重试。');
        onProgress({ phase: 'assets', message: '正在准备家园地块和环境细节…' });
    }
    throw Error('家园加载已取消');
}

export function createHomeAtlasLoader({
    getAssetMode,
    fetchJson = defaultFetchJson,
    loadEnvironmentArt = defaultLoadEnvironmentArt,
    isDead = () => false,
    onLoaded = () => {},
}) {
    let promise = null;
    return function ensureWorldAtlases() {
        if (promise) return promise;
        const modeKey = getAssetMode() === 'local' ? 'local' : 'cdn';
        promise = Promise.all([
            loadEnvironmentArt(modeKey, fetchJson, 'data/adventure/environment-art.json'),
            loadEnvironmentArt(modeKey, fetchJson, 'data/adventure/terrain-decoration-art.json'),
        ])
            .then(async ([env, decor]) => {
                await Promise.all(
                    [
                        [env, ['camp', 'campTrees', 'islandTrees', 'trees']],
                        [decor, ['meadow', 'stones', 'shore']],
                    ].flatMap(([art, keys]) => keys.filter(key => art.manifest.atlases[key]).map(key => art.ensure(key))),
                );
                if (isDead()) return;
                onLoaded(env, decor);
            })
            .catch(error => {
                promise = null;
                throw error;
            });
        return promise;
    };
}
