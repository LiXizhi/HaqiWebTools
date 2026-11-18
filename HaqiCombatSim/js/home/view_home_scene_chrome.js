// home/view_home_scene_chrome.js — 家园场景外围工具栏、语音召唤抽屉、侧栏分类、操作底座与编辑轮盘 DOM 构建。
import { buildingItem } from '../home_building_core.js';
import { tr } from '../locale_runtime.js';
import { createCloseButton } from '../ui/controls.js';
import { openBuildingProperties } from './view_home_building_properties.js';
import { openHomeDrawing } from './view_home_drawing.js';
import { openHomeLabel } from './view_home_label.js';
import { bindHomeTrayDrag } from './view_home_scene_input.js';
import { el, button } from './view_home_modals.js';

export function buildHomeSceneChrome({
    modal,
    body,
    cb,
    run,
    getModel,
    getActiveDialog,
    setActiveDialog,
    setCatalogDrag,
    setPetMode,
    openNameDialog,
    openRemoveDialog,
    closeSummonDrawer,
    cancelScenePointer,
    position,
    onRequestRender,
}) {
    const main = el('div', 'home-main');

    const tools = el('div', 'home-toolbar');
    tools.append(
        button('同步当前家园', () => run(cb.sync)),
        button('重试加载', () => run(cb.reload)),
        button('情境练习', cb.languageGame),
        button('听宠物愿望', () => run(cb.speakWish)),
        button('帮它实现', cb.helpWish),
        button('重命名', e => openNameDialog({ trigger: e.currentTarget, home: getModel().home })),
        button('删除家园', e => openRemoveDialog(getModel().home, e.currentTarget)),
        button('安静模式', cb.quiet),
    );

    const stage = el('div', 'home-stage');
    const canvas = el('canvas', 'home-canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', '家园土地，点击地面或方向键控制主角移动，按住设施拖动摆放');
    const ctx = canvas.getContext('2d');

    const bubble = el('div', 'home-bubble-wrap');
    bubble.hidden = true;
    const bubbleText = button('', () => (getModel().wish?.expanded ? cb.translate() : cb.openWish()), 'home-bubble');
    const bubbleActions = el('div', 'home-bubble-actions');
    const listenBtn = button('朗读', () => run(cb.speakWish), 'home-bubble-mini');
    const fulfillBtn = button('帮它实现', cb.helpWish, 'home-bubble-mini primary');
    bubbleActions.append(listenBtn, fulfillBtn);
    bubble.append(bubbleText, bubbleActions);

    const portal = button('返回冒险', cb.close, 'home-portal');
    portal.setAttribute('aria-label', tr('返回冒险'));
    const fpsLabel = el('div', 'home-fps', 'FPS —');
    fpsLabel.setAttribute('aria-label', '家园帧率');
    stage.append(canvas, portal, bubble, fpsLabel);
    main.append(tools, stage);

    const form = el('form', 'home-summon');
    const input = el('input');
    input.placeholder = 'I want a chair.';
    input.maxLength = 200;
    input.setAttribute('aria-label', '召唤句子');
    input.autocomplete = 'off';
    const mic = button('按住说话', () => {});
    mic.classList.add('home-mic');
    mic.onpointerdown = e => {
        e.preventDefault();
        mic.setPointerCapture(e.pointerId);
        run(cb.record);
    };
    mic.onpointerup = () => run(cb.finish);
    mic.onpointercancel = () => run(cb.cancelVoice);
    mic.onkeydown = e => {
        if (e.code === 'Space' && !e.repeat) {
            e.preventDefault();
            run(cb.record);
        }
    };
    mic.onkeyup = e => {
        if (e.code === 'Space') {
            e.preventDefault();
            run(cb.finish);
        }
    };
    const readingClose = createCloseButton(() => {
        const returnToRoom = !!getModel().selection?.starterLamp;
        cb.cancel();
        run(cb.cancelVoice);
        closeSummonDrawer(returnToRoom);
    });
    readingClose.setAttribute('aria-label', '关闭阅读');
    form.append(readingClose, input, button('召唤', () => run(() => cb.summon(input.value)), 'primary'), mic);
    form.onsubmit = e => {
        e.preventDefault();
        run(() => cb.summon(input.value));
    };

    const example = el('div', 'home-example');
    const choice = el('div', 'home-choices');
    const composer = el('section', 'home-composer', example, choice, form);
    main.append(composer);

    const side = el('aside', 'home-sidebar');
    const trayHeader = el('div', 'home-sidebar-header');
    const tabs = el('strong', 'home-drawer-title', tr('户外与家园设施'));
    const trayClose = createCloseButton(() => {
        body.dataset.drawer = '';
        cb.mode(false);
        onRequestRender();
    });
    const done = button(
        '完成布置',
        () => {
            body.dataset.drawer = '';
            cb.mode(false);
            canvas.focus();
        },
        'primary home-edit-done',
    );
    trayHeader.append(tabs, done, trayClose);

    const category = el('select', 'home-category-select');
    category.setAttribute('aria-label', '物品分类');
    category.append(new Option(tr('全部分类'), ''));
    for (const c of getModel().catalog.categories) category.append(new Option(tr(c.name), c.id));
    category.value = cb.initialCategory || '';
    category.onchange = () => onRequestRender();

    const catPills = el('div', 'home-category-pills');
    const allPill = button(
        '全部',
        () => {
            category.value = '';
            onRequestRender();
        },
        'home-cat-pill',
    );
    allPill.dataset.cat = '';
    catPills.append(allPill);
    for (const c of getModel().catalog.categories) {
        const p = button(
            c.name,
            () => {
                category.value = c.id;
                onRequestRender();
            },
            'home-cat-pill',
        );
        p.dataset.cat = c.id;
        catPills.append(p);
    }

    const summary = el('p', 'home-summary');
    const items = el('div', 'home-items');
    trayHeader.insertBefore(catPills, done);
    side.append(trayHeader, summary, items);
    bindHomeTrayDrag({
        side,
        body,
        canvas,
        getModel,
        setCatalogDrag,
        run,
        cb,
        position,
        onRender: onRequestRender,
    });

    const dock = el('nav', 'home-dock');
    dock.setAttribute('aria-label', '家园操作栏');
    const showDrawer = kind => {
        const same = body.dataset.drawer === kind;
        body.dataset.drawer = same ? '' : kind;
        setPetMode(kind === 'pets');
        cb.mode(!same && (kind === 'build' || kind === 'stock' || kind === 'summon'));
        onRequestRender();
        if (!same && kind === 'summon') input?.focus();
    };
    dock.append(
        button('建造', () => showDrawer('build'), 'home-dock-button'),
        button('语音召唤', () => showDrawer('summon'), 'home-dock-button'),
        button('宠物背包', () => showDrawer('pets'), 'home-dock-button'),
        button('家园设置', () => showDrawer('settings'), 'home-dock-button'),
    );
    const dockPaths = [
        'M4 20 14 10 M12 4 16 2 22 8 18 12 12 6Z',
        'M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z M19 10v1a7 7 0 0 1-14 0v-1 M12 18v4 M8 22h8',
        'M7 13 Q12 8 17 13 L20 18 Q20 22 15 20 Q12 18 9 20 Q4 22 4 18Z M5 5 5 8 M10 2 10 6 M15 2 15 6 M20 5 20 8',
        'M4 6 20 6 M4 12 20 12 M4 18 20 18 M8 3 8 9 M16 9 16 15 M10 15 10 21',
    ];
    [...dock.children].forEach((b, i) => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const path = document.createElementNS(svg.namespaceURI, 'path');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        path.setAttribute('d', dockPaths[i]);
        svg.append(path);
        b.prepend(svg);
    });

    const edit = el('div', 'home-edit-actions');
    const iconAction = (label, path, fn, cls = '') => {
        const b = button('', () => run(fn), 'home-wheel-btn ' + cls);
        b.title = tr(label);
        b.setAttribute('aria-label', tr(label));
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        const shape = document.createElementNS(svg.namespaceURI, 'path');
        shape.setAttribute('d', path);
        svg.append(shape);
        b.append(svg);
        return b;
    };
    const enlarge = iconAction('放大家具', 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5 M8 12h8 M12 8v8', () => cb.resizeFurniture(0.25));
    const shrink = iconAction('缩小家具', 'M4 9h5V4 M15 4v5h5 M20 15h-5v5 M9 20v-5H4 M10 12h4', () => cb.resizeFurniture(-0.25));
    enlarge.dataset.resize = 'up';
    shrink.dataset.resize = 'down';
    edit.append(
        iconAction('旋转', 'M20 8a8 8 0 1 0 0 8 M20 3v5h-5', cb.rotate),
        iconAction('互动', 'M12 3v9 M6.3 5.6a8 8 0 1 0 11.4 0', () => cb.toggleActive?.(), 'home-interaction-toggle'),
        enlarge,
        shrink,
        iconAction('物品属性', 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6', () => {
            const current = getModel();
            if (!current.selection?.id) return;
            getActiveDialog()?.destroy();
            setActiveDialog(
                openBuildingProperties(modal, {
                    el,
                    button,
                    obj: current.selection,
                    item: buildingItem(current.selection, current.catalog.items),
                    save: cb.properties,
                }),
            );
        }),
        iconAction(
            '画画',
            'M5 19L8 12L16 4L20 8L12 16Z',
            () => {
                const current = getModel();
                if (current.selection?.itemId !== 'paper') return;
                getActiveDialog()?.destroy();
                setActiveDialog(openHomeDrawing(modal, { el, button, obj: current.selection, homeId: current.home.id, save: cb.saveDrawing }));
            },
            'home-drawing-button',
        ),
        iconAction('桌下放置', 'M3 5h18 M5 5v15 M19 5v15 M9 15h6', () => cb.toggleUnder?.(), 'home-under-toggle'),
        iconAction('写标签', 'M4 4h16v16H4Z M7 8h10 M7 12h10 M7 16h6', () => {
            const current = getModel();
            if (!current.selection?.id) return;
            getActiveDialog()?.destroy();
            setActiveDialog(openHomeLabel(modal, { el, button, obj: current.selection, homeId: current.home.id, save: cb.saveLabel }));
        }),
        iconAction('收回', 'M3 9h18v12H3Z M3 9l3-5h3 M21 9l-3-5h-3 M12 2v12 M8 10l4 4 4-4', cb.recall, 'danger'),
        iconAction('取消选择', 'm6 6 12 12 M18 6 6 18', cb.cancel),
    );
    main.append(edit);

    const topbar = el('div', 'home-world-heading');
    const closeBtn = button('返回', cb.close, 'home-return-button');
    topbar.append(
        closeBtn,
        button('家园列表', () => run(cb.back), 'home-nav-pill'),
        el('strong', 'home-world-name', getModel().home.name),
        button('给抱抱龙铺毯子', () => run(cb.starterBlanket), 'home-starter-blanket home-nav-pill'),
        button('添一盏灯', () => run(cb.starterLamp), 'home-starter-lamp home-nav-pill'),
        el('span', 'home-capacity home-nav-pill'),
        button('显示屋顶', cb.roofs, 'home-roof-toggle home-nav-pill'),
    );

    const historyTools = el('div', 'home-build-tools');
    const undo = button(
        '撤销',
        () => {
            cancelScenePointer();
            run(cb.undo);
        },
    );
    undo.dataset.history = 'undo';
    undo.title = '撤销（Ctrl / ⌘ + Z）';
    const redo = button(
        '重做',
        () => {
            cancelScenePointer();
            run(cb.redo);
        },
    );
    redo.dataset.history = 'redo';
    redo.title = '重做（Ctrl + Y / ⌘ + Shift + Z）';
    historyTools.append(undo, redo);
    const buildTip = el('div', 'home-build-tip');
    buildTip.setAttribute('role', 'tooltip');
    buildTip.hidden = true;
    body.append(main, side, topbar, dock, historyTools, buildTip);

    return {
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
    };
}
