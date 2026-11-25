import {
    HANZI_STELE_SCROLLS,
    steleRubbingCount,
    steleRubbingDone,
} from '../hanzi_stele_scroll_core.js';
import { islandStoryAnimations } from './hanzi_story_animations.js';
import { showHanziAnimation } from './view_hanzi_animation.js';
import { connectHanziAnimation } from './hanzi_animation_bridge.js';
import { createCloseButton } from '../ui/controls.js';
import { el, ensureStylesheet } from '../ui/dom.js';
import { displayLocale, learningPair, textFor } from '../locale.js';
import { tr, fill } from '../locale_runtime.js';

const button = (text, fn, cls = 'secondary') => {
    const b = el('button', cls, text);
    b.type = 'button';
    b.onclick = fn;
    return b;
};

export function renderHanziSteleScroll(root, model, cb) {
    ensureStylesheet('island-puzzle-style', new URL('../../css/island-puzzle.css', import.meta.url).href);
    const { save } = model;
    let stopBridge = null;
    let dismissAnim = null;
    const stopPlayer = () => {
        stopBridge?.();
        stopBridge = null;
        dismissAnim?.();
        dismissAnim = null;
    };

    root.replaceChildren();
    root.className = 'overlay visible hanzi-stele-layer';

    const modal = el('section', 'modal island-puzzle-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', '字源碑林传拓册');

    const closeAll = () => {
        stopPlayer();
        cb.close?.();
    };
    const header = el('header', 'modal-header', el('h2', '', tr('字源碑林传拓册')), createCloseButton(closeAll, tr('关闭碑林传拓册')));
    const body = el('div', 'modal-body island-puzzle-body');
    modal.append(header, body);
    root.append(modal);

    const doneCount = steleRubbingCount(save);
    body.append(
        el('p', 'island-puzzle-eyebrow', fill('石伯珍藏 · 已传拓 {done} / {total} 篇', { done: doneCount, total: HANZI_STELE_SCROLLS.length }).text),
        el(
            'p',
            'island-puzzle-intro',
            tr('除了岛上散落的三十枚生活字迹，字源亭古碑还刻着九段完整的象形与会意故事。点选任意碑帖观看互动动画并亲手描红，每篇首次完成可获 40 奇豆，每满 3 篇再赠战宠口粮。'),
        ),
    );

    const grid = el('div', 'island-puzzle-slots');
    for (const item of HANZI_STELE_SCROLLS) {
        const done = steleRubbingDone(save, item);
        const card = el('div', `island-puzzle-slot${done ? ' is-solved' : ''}`);
        const top = el('div', 'island-puzzle-slot-head');
        const titleLine = el('p', 'island-puzzle-slot-prompt', `「${item.glyph}」 ${item.pinyin} · ${tr(item.title)}`);
        const badge = el('span', 'island-puzzle-eyebrow', tr(done ? '已传拓' : '待描红'));
        top.append(titleLine, badge);

        const desc = el('p', 'island-puzzle-legend-item', tr(item.summary));
        const openBtn = button(
            done
                ? fill('重温「{glyph}」字故事动画', { glyph: item.glyph }).text
                : fill('展开「{glyph}」字故事并描红', { glyph: item.glyph }).text,
            () => {
            stopPlayer();
            const src = islandStoryAnimations[item.animation] || item.animation;
            const frame = el('iframe');
            frame.title = `${item.glyph}的汉字故事动画`;
            frame.allow = 'autoplay';
            frame.sandbox = 'allow-scripts allow-same-origin';
            frame.referrerPolicy = 'no-referrer';
            frame.src = src;

            const uiLocale = displayLocale() || document.documentElement.lang || save?.locale || 'zh-CN';
            const pair = learningPair();
            const subtitleLocale = pair?.enabled && pair.target && pair.target !== 'zh-CN' ? pair.target : uiLocale;
            const translate = (value, loc) => (
                loc && loc !== 'zh-CN'
                    ? (textFor(value, loc) !== value ? textFor(value, loc) : loc === uiLocale ? tr(value) : value)
                    : value
            );
            let rewardedThisRun = false;
            const grantOnce = () => {
                if (rewardedThisRun) return;
                rewardedThisRun = true;
                cb.complete?.({ type: 'stele-rubbing', steleId: item.id });
            };
            stopBridge = connectHanziAnimation(frame, {
                entryId: item.id,
                sessionId: crypto.randomUUID(),
                locale: uiLocale,
                subtitleLocale,
                translate,
                onWritten: () => {
                    grantOnce();
                },
                onComplete: () => {
                    grantOnce();
                },
            });
            dismissAnim = showHanziAnimation(frame, {
                close: stopPlayer,
                skip: stopPlayer,
            });
        }, done ? 'secondary' : 'primary');

        card.append(top, desc, el('div', 'island-puzzle-actions', openBtn));
        grid.append(card);
    }

    body.append(grid);
}
