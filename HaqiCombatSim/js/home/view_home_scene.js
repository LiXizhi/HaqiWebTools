// home/view_home_scene.js — 家园主视图组装、顶栏与抽屉绑定、渲染调度与生命周期。
import { createMotionTrail } from '../adventure_motion_effects.js';
import { createFrameMeter, createFramePacer } from '../frame_meter_core.js';
import { createHeroActor } from '../hero_pose_core.js';
import { loadHeroLibrary } from '../hero_renderer.js';
import { createHomeBuildingCache } from '../home_building_cache.js';
import { buildingItem } from '../home_building_core.js';
import { homeCapacity } from '../home_capacity_core.js';
import { homeObjectInteractive, summonSentences } from '../home_core.js';
import { homeStrokeCells } from '../home_edit_core.js';
import { homeSceneHit } from '../home_pointer_core.js';
import { STARTER_ROOM_HINT, starterLampExercise } from '../home_starter_room_core.js';
import { createHomeTerrainCache } from '../home_terrain_cache.js';
import { tr } from '../locale_runtime.js';
import { fetchJson } from '../runtime_data.js';
import { createCloseButton } from '../ui/controls.js';
import { renderSpeechWords } from '../view_bilingual_dialogue.js';
import { renderHomeSummonExample, renderHomeCatalogSidebar } from './view_home_hud.js';
import {
    el,
    button,
    DEFAULT_SUMMON_TIP,
    playSummonChime,
    openHomeNameDialog,
    openHomeRemoveDialog,
    renderHomeManagerDirectory,
} from './view_home_modals.js';
import { paintHomeSceneFrame } from './view_home_canvas_renderer.js';
import { buildHomeSceneChrome } from './view_home_scene_chrome.js';
import {
    bindHomeSceneCanvasInput,
    createHomeAtlasLoader,
    createHomeEditKeyHandler,
    homePointerPosition,
    prepareHomeScene,
} from './view_home_scene_input.js';

export function createHomeView(root, cb) {
    root.replaceChildren();
    root.className = 'overlay visible';
    const modal = el('section', 'modal home-modal');
    const header = el('header', 'modal-header');
    const title = el('h2', '', '家园');
    const body = el('div', 'home-body');
    const status = el('p', 'home-status');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', tr('家园'));
    modal.setAttribute('aria-modal', 'true');
    status.setAttribute('role', 'status');
    header.append(title, createCloseButton(cb.close));
    modal.append(header, body, status);
    root.append(modal);

    let model = null;
    let mode = '';
    let signature = '';
    let exampleSignature = '';
    let gesture = null;
    let catalogDrag = null;
    let hits = [];
    let frame = 0;
    let dead = false;
    let lastPaint = 0;
    let activeDialog = null;
    const images = new Map();
    const terrain = createHomeTerrainCache();
    const frameMeter = createFrameMeter();
    const framePacer = createFramePacer();
    let fpsLabel;
    let spellTip = null;
    let summonAudioCtx = null;
    let statusTimer = 0;
    let lastStatus = '';
    const summonEffects = [];
    let canvas, ctx, stage, side, items, category, catPills, tabs, input, example, bubble, bubbleText, tools, choice, summary, portal, edit;
    let petMode = false;
    const motionTrail = createMotionTrail(7319);
    const heroActor = createHeroActor(7419);
    const secondActor = createHeroActor(7420);
    let prevSecondPos = null;
    let showDrawer = () => {};
    let prevHeroPos = null;
    let fallbackHero = null;
    let fallbackHeroLoading = false;
    let envArt = null;
    let decorArt = null;

    const imageFor = art => {
        const url = model?.assetMode === 'local' && art?.local ? art.local : art?.cdn || art?.local;
        if (!url) return null;
        let image = images.get(url);
        if (!image) {
            image = new Image();
            image.crossOrigin = 'anonymous';
            image.src = url;
            images.set(url, image);
            if (images.size > 128) images.delete(images.keys().next().value);
        }
        return image;
    };

    const buildings = createHomeBuildingCache({ imageFor, enabled: !new URLSearchParams(location.search).has('noBuildingCache') });
    let paintStroke = null;
    let eraseStroke = null;
    let hoverPoint = null;
    let buildTip = null;
    let historyTools = null;
    let showGrid = false;
    let cancelScenePointer = () => {};
    let terrainMissing = Infinity;
    const ensureWorldAtlases = createHomeAtlasLoader({
        getAssetMode: () => model?.assetMode,
        isDead: () => dead,
        onLoaded: (env, decor) => {
            envArt = env;
            decorArt = decor;
            terrain.clear();
            terrainMissing = Infinity;
        },
    });

    function ensureFallbackHero() {
        if (cb.drawHero || fallbackHero || fallbackHeroLoading) return;
        fallbackHeroLoading = true;
        loadHeroLibrary(fetchJson, { mounts: [], mountByItem: {} }, { local: model?.assetMode === 'local' })
            .then(h => {
                if (!dead) fallbackHero = h;
            })
            .catch(() => {});
    }

    const run = fn => Promise.resolve().then(fn).catch(cb.error);
    const editKey = createHomeEditKeyHandler({
        modal,
        getModel: () => model,
        cancelScenePointer: () => cancelScenePointer(),
        run,
        cb,
        onToggleGrid: () => {
            showGrid = !showGrid;
            render(model);
        },
    });
    window.addEventListener('keydown', editKey);
    const blurEdit = () => cancelScenePointer();
    window.addEventListener('blur', blurEdit);
    const hideEdit = () => {
        if (document.hidden) cancelScenePointer();
    };
    document.addEventListener('visibilitychange', hideEdit);

    function openNameDialog({ trigger, home: targetHome = null } = {}) {
        openHomeNameDialog({
            modal,
            model,
            cb,
            run,
            getActiveDialog: () => activeDialog,
            setActiveDialog: next => {
                activeDialog = next;
            },
            trigger,
            home: targetHome,
        });
    }

    function openRemoveDialog(targetHome, trigger) {
        openHomeRemoveDialog({
            modal,
            cb,
            run,
            getActiveDialog: () => activeDialog,
            setActiveDialog: next => {
                activeDialog = next;
            },
            targetHome,
            trigger,
        });
    }

    function manager() {
        renderHomeManagerDirectory({ body, model, cb, run, openNameDialog });
    }

    function closeSummonDrawer(returnToRoom = false) {
        if (!body) return;
        body.dataset.drawer = returnToRoom === true ? '' : 'build';
        if (returnToRoom === true) cb.mode(false);
        signature = '';
        render(model);
        canvas?.focus();
    }
    function openSummonDrawer() {
        if (!body) return;
        body.dataset.drawer = 'summon';
        petMode = false;
        cb.mode(true);
        signature = '';
        render(model);
        input?.focus();
    }

    function scene() {
        void ensureWorldAtlases().catch(() => {});
        ensureFallbackHero();
        terrain.clear();
        exampleSignature = '';
        body.dataset.drawer = '';
        body.replaceChildren();
        body.className = 'home-body home-play';
        const chrome = buildHomeSceneChrome({
            modal,
            body,
            cb,
            run,
            getModel: () => model,
            getActiveDialog: () => activeDialog,
            setActiveDialog: next => {
                activeDialog = next;
            },
            setCatalogDrag: next => {
                catalogDrag = next;
            },
            setPetMode: next => {
                petMode = next;
            },
            openNameDialog,
            openRemoveDialog,
            closeSummonDrawer,
            cancelScenePointer: () => cancelScenePointer(),
            position,
            onRequestRender: () => {
                signature = '';
                render(model);
            },
        });
        ({
            canvas,
            ctx,
            stage,
            side,
            items,
            category,
            catPills,
            tabs,
            input,
            example,
            bubble,
            bubbleText,
            tools,
            choice,
            summary,
            portal,
            edit,
            fpsLabel,
            historyTools,
            buildTip,
            showDrawer,
        } = chrome);
        frameMeter.sample(0, false);

        cancelScenePointer = bindHomeSceneCanvasInput({
            canvas,
            body,
            side,
            dock: body.querySelector('.home-dock'),
            getState: () => ({ model, gesture, paintStroke, eraseStroke, edit, buildTip }),
            setState: updates => {
                if (Object.hasOwn(updates, 'gesture')) gesture = updates.gesture;
                if (Object.hasOwn(updates, 'paintStroke')) paintStroke = updates.paintStroke;
                if (Object.hasOwn(updates, 'eraseStroke')) eraseStroke = updates.eraseStroke;
                if (Object.hasOwn(updates, 'hoverPoint')) hoverPoint = updates.hoverPoint;
            },
            position,
            hitAt,
            eraseAt,
            paintAt,
            petDragPoint,
            run,
            cb,
        });
    }

    function hitAt(p) {
        return homeSceneHit(hits, p);
    }
    function eraseAt(p) {
        hoverPoint = p;
        const stroke = eraseStroke;
        if (!stroke) return;
        const from = stroke.last || p;
        const steps = Math.max(1, Math.ceil(Math.hypot(p.sx - from.sx, p.sy - from.sy) / 6));
        for (let i = 0; i <= steps; i++) {
            const hit = hitAt({ sx: from.sx + ((p.sx - from.sx) * i) / steps, sy: from.sy + ((p.sy - from.sy) * i) / steps });
            if (hit?.kind !== 'object' || stroke.seen.has(hit.id)) continue;
            stroke.seen.add(hit.id);
            run(() => cb.erase(hit.id, stroke.group));
        }
        stroke.last = p;
    }
    function paintAt(p) {
        const stroke = paintStroke;
        if (!stroke) return;
        cb.hover(p);
        for (const cell of homeStrokeCells(stroke.last || p, p)) {
            const key = `${cell.x},${cell.y}`;
            if (stroke.seen.has(key)) continue;
            stroke.seen.add(key);
            run(() => cb.take({ ...stroke.row, fromInventory: true, group: stroke.group }, cell));
        }
        stroke.last = p;
    }
    function petDragPoint(g) {
        return { x: g.last.sx + g.hit.sx + g.hit.sw / 2 - g.start.sx, y: g.last.sy + g.hit.sy + g.hit.sh - 20 - g.start.sy };
    }
    function position(e) {
        return homePointerPosition(canvas, model, e);
    }

    function render(next) {
        if (dead) return;
        framePacer.wake();
        model = next;
        if (next.home) {
            const capacity = homeCapacity(next.home);
            const label = body.querySelector('.home-capacity');
            if (label) {
                label.textContent = `容量 ${capacity.used === null ? '待统计' : capacity.used.toLocaleString('en-US')} / ${capacity.limit.toLocaleString('en-US')}`;
                label.title = '每块积木或摆设占用1件容量；地形和宠物不计入';
            }
        }
        status.textContent = tr(next.status || '');
        if (next.unsaved) status.append(button('重试保存', () => run(cb.retry), 'primary'));
        const shouldHideStatus =
            !next.unsaved &&
            (!next.status ||
                next.status === DEFAULT_SUMMON_TIP ||
                body?.dataset.drawer === 'summon' ||
                next.status.startsWith('已保存到本机') ||
                next.status === '宠物已安置，位置已保存到本机' ||
                (!next.home && next.status === '家园自动保存到本机，云端同步由你手动开启。'));
        const isSummonTipTransient = Boolean(
            next.status &&
                next.status !== DEFAULT_SUMMON_TIP &&
                !next.status.startsWith('已保存到本机') &&
                next.status !== '宠物已安置，位置已保存到本机' &&
                next.status !== '点击或拖动摆放，可连续创建；按 R 旋转。',
        );
        const syncSpellTip = (transient = isSummonTipTransient) => {
            if (!spellTip) return;
            spellTip.textContent = tr(transient ? next.status : DEFAULT_SUMMON_TIP);
            spellTip.classList.toggle('is-transient', transient);
        };
        const statusKey = `${next.unsaved}:${next.status || ''}`;
        if (statusKey !== lastStatus) {
            lastStatus = statusKey;
            clearTimeout(statusTimer);
            status.hidden = shouldHideStatus;
            syncSpellTip(isSummonTipTransient);
            if ((!shouldHideStatus || isSummonTipTransient) && !next.unsaved && next.status !== STARTER_ROOM_HINT) {
                statusTimer = setTimeout(() => {
                    if (dead) return;
                    if (!model?.unsaved) status.hidden = true;
                    if (spellTip) {
                        spellTip.textContent = tr(DEFAULT_SUMMON_TIP);
                        spellTip.classList.remove('is-transient');
                    }
                }, 3000);
            }
        } else if (shouldHideStatus || next.unsaved) {
            status.hidden = shouldHideStatus;
        }
        title.textContent = next.home?.name || tr('家园');
        const worldName = body.querySelector('.home-world-name');
        if (worldName) worldName.textContent = next.home?.name || '';
        const nextMode = next.home ? 'scene' : 'manager';
        root.classList.toggle('home-world-active', nextMode === 'scene');
        modal.classList.toggle('home-world', nextMode === 'scene');
        header.hidden = nextMode === 'scene';
        modal.setAttribute('role', nextMode === 'scene' ? 'region' : 'dialog');
        modal.setAttribute('aria-modal', String(nextMode !== 'scene'));
        if (mode !== nextMode) {
            mode = nextMode;
            signature = '';
            paintStroke = null;
            eraseStroke = null;
            gesture = null;
            hoverPoint = null;
            if (mode === 'scene') scene();
        }
        if (mode === 'manager') {
            buildings.clear();
            terrain.clear();
            if (status.parentElement !== modal) modal.append(status);
            const key = JSON.stringify([next.homes, next.guests]);
            if (signature !== key) {
                signature = key;
                manager();
            }
            return;
        }
        body.classList.toggle('is-building', !!next.build);
        const starterBlanket = body.querySelector('.home-starter-blanket');
        if (starterBlanket) {
            starterBlanket.hidden = !next.starterBlanket || Boolean(body.dataset.drawer);
            starterBlanket.disabled = !!next.unsaved;
            starterBlanket.textContent = tr(next.selection?.starterBlanket ? '取消铺毯子' : '给抱抱龙铺毯子');
        }
        const starterLamp = body.querySelector('.home-starter-lamp');
        if (starterLamp) starterLamp.hidden = !next.starterLamp || Boolean(body.dataset.drawer);

        if (historyTools) {
            historyTools.hidden = !next.build;
            historyTools.querySelector('[data-history=undo]').disabled = !next.history?.canUndo || next.unsaved;
            historyTools.querySelector('[data-history=redo]').disabled = !next.history?.canRedo || next.unsaved;
        }
        if (!next.build) {
            paintStroke = null;
            eraseStroke = null;
            hoverPoint = null;
            if (buildTip) buildTip.hidden = true;
        }
        const roofToggle = body.querySelector('.home-roof-toggle');
        if (roofToggle) {
            roofToggle.setAttribute('aria-pressed', String(next.showRoofs));
            roofToggle.textContent = tr(next.showRoofs ? '隐藏屋顶' : '显示屋顶');
        }
        body.classList.toggle('has-selection', !!next.build && !!next.selection?.id);
        if (edit) {
            edit.querySelector('.home-drawing-button').hidden = next.selection?.itemId !== 'paper';
            const under = edit.querySelector('.home-under-toggle');
            under.hidden = !['ball', 'book'].includes(next.selection?.itemId);
            under.setAttribute('aria-pressed', String(!!next.selection?.underTable));
            under.setAttribute('aria-label', next.selection?.underTable ? '退出桌下放置' : '桌下放置');
            under.title = next.selection?.underTable ? '退出桌下放置' : '桌下放置';
            const size = next.selection?.sizeScale ?? 1;
            const toggle = edit.querySelector('.home-interaction-toggle');
            const enabled = homeObjectInteractive(next.selection, next.catalog.items);
            toggle.disabled = !next.selection?.id;
            toggle.setAttribute('aria-pressed', String(enabled));
            const door = buildingItem(next.selection, next.catalog.items)?.building?.type === 'door';
            const label = door
                ? tr(next.selection?.doorOpen ? '关门' : '开门')
                : tr(enabled ? '互动已开启，点击关闭自由拖动' : '互动已关闭，点击开启自由拖动');
            toggle.setAttribute('aria-label', label);
            toggle.title = label;
            toggle
                .querySelector('path')
                .setAttribute('d', enabled ? 'M12 3v9 M6.3 5.6a8 8 0 1 0 11.4 0' : 'M12 3v9 M6.3 5.6a8 8 0 1 0 11.4 0 M3 3l18 18');

            edit.querySelector('[data-resize=up]').disabled = !next.selection?.id || size >= 2;
            edit.querySelector('[data-resize=down]').disabled = !next.selection?.id || size <= 0.5;
        }

        const drawerIdx = { build: 0, summon: 1, pets: 2, settings: 3 }[body.dataset.drawer];
        [...body.querySelectorAll('.home-dock-button')].forEach((b, i) => b.setAttribute('aria-pressed', String(i === drawerIdx)));
        if (next.transcript !== undefined && document.activeElement !== input) input.value = next.transcript;
        const summonItem =
            next.selection?.itemId && !next.selection.id ? [...next.catalog.items, ...(next.practiceItems || [])].find(item => item.id === next.selection.itemId) : null;
        const summonTarget = summonItem && next.selection.starterLamp ? starterLampExercise(summonItem) : summonItem;
        input.placeholder =
            (summonTarget ? summonSentences(summonTarget, next.lang, next.selection?.color)[0] : '') ||
            (next.lang === 'en' ? 'I want a chair.' : '我想要一把椅子。');
        tools.lastChild.setAttribute('aria-pressed', String(next.quiet));

        const nextExample = JSON.stringify([next.selection?.itemId, next.selection?.color, next.selection?.starterLamp, next.lang]);
        if (nextExample !== exampleSignature) {
            exampleSignature = nextExample;
            renderHomeSummonExample({
                next,
                example,
                cb,
                run,
                syncSpellTip,
                setSpellTip: nextTip => {
                    spellTip = nextTip;
                },
                closeSummonDrawer,
            });
        }

        choice.replaceChildren();
        for (const candidate of next.candidates || []) {
            const item = [...next.catalog.items, ...(next.practiceItems || [])].find(i => i.id === candidate.itemId);
            choice.append(button(item.zh, () => run(() => cb.choose(candidate))));
        }

        const key = JSON.stringify([
            category.value,
            petMode,
            (next.petBag || next.pets)?.map(p => [p.id, p.name, p.stage, p.art, p.activity]),
            next.selection?.itemId,
            next.selection?.color,
        ]);
        if (catalogDrag || key === signature) return;
        signature = key;
        renderHomeCatalogSidebar({ next, category, petMode, tabs, side, catPills, items, summary, imageFor, cb, run });
    }

    function paint(now) {
        frame = requestAnimationFrame(paint);
        paintHomeSceneFrame({
            now,
            getState: () => ({
                dead,
                mode,
                canvas,
                ctx,
                model,
                gesture,
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
                lastPaint,
                terrainMissing,
                prevHeroPos,
                prevSecondPos,
            }),
            setState: updates => {
                if (Object.hasOwn(updates, 'lastPaint')) lastPaint = updates.lastPaint;
                if (Object.hasOwn(updates, 'eraseStroke')) eraseStroke = updates.eraseStroke;
                if (Object.hasOwn(updates, 'gesture')) gesture = updates.gesture;
                if (Object.hasOwn(updates, 'terrainMissing')) terrainMissing = updates.terrainMissing;
                if (Object.hasOwn(updates, 'hits')) hits = updates.hits;
                if (Object.hasOwn(updates, 'prevHeroPos')) prevHeroPos = updates.prevHeroPos;
                if (Object.hasOwn(updates, 'prevSecondPos')) prevSecondPos = updates.prevSecondPos;
            },
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
        });
    }

    frame = requestAnimationFrame(paint);
    return {
        render,
        prepare(options = {}) {
            return prepareHomeScene({
                ensureWorldAtlases,
                getModel: () => model,
                imageFor,
                images,
                isDead: () => dead,
                resetTerrainMissing: () => {
                    terrainMissing = Infinity;
                },
                getTerrainMissing: () => terrainMissing,
                ...options,
            });
        },
        openSummon: openSummonDrawer,
        closeSummon: closeSummonDrawer,
        celebrateSummon(pos = {}) {
            playSummonChime(
                () => summonAudioCtx,
                nextCtx => {
                    summonAudioCtx = nextCtx;
                },
                model?.quiet,
            );
            summonEffects.push({ x: pos.x ?? model?.hero?.x ?? 0, y: pos.y ?? model?.hero?.y ?? 0, w: pos.w ?? 2, h: pos.h ?? 2, since: performance.now() });
            framePacer.wake();
        },
        capture() {
            if (mode !== 'scene' || !canvas?.width || !canvas?.height) return null;
            const shot = document.createElement('canvas');
            shot.width = 400;
            shot.height = 300;
            const c = shot.getContext('2d');
            const crop = Math.min(canvas.width / 4, canvas.height / 3);
            c.drawImage(canvas, (canvas.width - crop * 4) / 2, (canvas.height - crop * 3) / 2, crop * 4, crop * 3, 0, 0, 400, 300);
            return shot.toDataURL('image/webp', 0.8);
        },
        setInput: text => {
            if (input) input.value = text;
        },
        setSpeechFeedback: feedback => {
            if (!example) return;
            const spans = [...example.querySelectorAll('.home-spell-text')];
            spans.forEach(span => {
                if (span.dataset.sentence) span.textContent = span.dataset.sentence;
            });
            if (feedback?.parts?.length) {
                const target = spans[feedback.lineIndex ?? 0] || spans[0];
                if (target) renderSpeechWords(target, feedback.parts);
            }
        },
        dispose() {
            clearTimeout(statusTimer);
            void summonAudioCtx?.close?.().catch(() => {});
            summonAudioCtx = null;
            cancelScenePointer();
            dead = true;
            window.removeEventListener('keydown', editKey);
            window.removeEventListener('blur', blurEdit);
            document.removeEventListener('visibilitychange', hideEdit);
            activeDialog?.destroy();
            root.classList.remove('home-world-active');
            cancelAnimationFrame(frame);
            images.clear();
            terrain.dispose();
            buildings.dispose();
        },
        openBuild() {
            if (body?.dataset.drawer !== 'build') showDrawer('build');
        },
        openPetBag() {
            if (body?.dataset.drawer !== 'pets') showDrawer('pets');
        },
        editDrawing(id) {
            const obj = model?.objects.find(o => o.id === id);
            if (obj?.itemId !== 'paper') return;
            activeDialog?.destroy();
            activeDialog = openHomeDrawing(modal, { el, button, obj, homeId: model.home.id, save: cb.saveDrawing });
        },
        editLabel(id, practice) {
            const obj = model?.objects.find(o => o.id === id);
            if (!obj) return;
            activeDialog?.destroy();
            activeDialog = openHomeLabel(modal, { el, button, obj, homeId: model.home.id, save: cb.saveLabel, practice });
        },
        stats: () => ({ terrain: terrain.stats(), buildings: buildings.stats() }),
        get size() {
            const r = canvas?.getBoundingClientRect();
            return { width: r?.width || 800, height: r?.height || 500 };
        },
    };
}
