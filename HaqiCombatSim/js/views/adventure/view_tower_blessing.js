// Storybook 3-card roguelike blessing chooser for Trial Towers.
// Follows docs/gui-style-guide.md: createCloseButton, paper/gold/green palette, no emoji.

import { towerBlessingPendingOffer } from '../../tower_blessings_core.js';
import { createCloseButton } from '../../ui/controls.js';
import { ensureStylesheet } from '../../ui/dom.js';
import { tr, fill } from '../../locale_runtime.js';
import { el, button } from './primitives.js';

export function renderTowerBlessing(root, model, cb) {
    ensureStylesheet('tower-blessing-style', new URL('../../../css/tower-blessing.css', import.meta.url).href);
    const { save, nextFloor = null } = model;
    const offer = towerBlessingPendingOffer(save, save.zone);
    root.replaceChildren();
    if (!offer) {
        cb.close?.();
        return;
    }

    root.className = 'overlay visible tower-blessing-layer';
    const modal = el('section', 'modal tower-blessing-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', tr('挑选试炼塔赐福'));

    const title = fill('第 {floor} 层通关 · 挑选试炼塔赐福', { floor: offer.floor }).text;
    const header = el('header', 'modal-header', el('h2', '', title), createCloseButton(cb.close, tr('关闭赐福选择')));
    const body = el('div', 'modal-body tower-blessing-body');
    modal.append(header, body);
    root.append(modal);

    body.append(
        el(
            'p',
            'tower-blessing-intro',
            tr('从三项塔内赐福中挑选一项，本轮攀登期间对全队持续生效（离开高塔后重置）。'),
        ),
    );

    const grid = el('div', 'tower-blessing-grid');
    for (const item of offer.choices) {
        const nextStack = item.currentStacks + 1;
        const card = el('article', 'tower-blessing-card');
        const top = el(
            'div',
            'tower-blessing-card-top',
            el('span', 'tower-blessing-tag', tr(item.tag)),
            el('span', 'tower-blessing-stack', fill('第 {cur} / {max} 层', { cur: nextStack, max: item.maxStacks }).text),
        );
        const pickLabel = nextFloor
            ? fill('选此赐福并进第 {floor} 层', { floor: nextFloor }).text
            : tr('选择此赐福');
        const pickBtn = button(pickLabel, () => cb.pick?.(item.id, { continueTower: !!nextFloor }), 'primary tower-blessing-pick');
        card.append(
            top,
            el('h3', 'tower-blessing-name', tr(item.name)),
            el('p', 'tower-blessing-summary', tr(item.summary)),
            el('p', 'tower-blessing-detail', tr(item.detail)),
            pickBtn,
        );
        grid.append(card);
    }
    body.append(grid);

    if (offer.active.length) {
        const activeBar = el('div', 'tower-blessing-active');
        activeBar.append(el('span', 'tower-blessing-active-label', tr('本轮已激活赐福：')));
        for (const row of offer.active) {
            activeBar.append(el('span', 'tower-blessing-chip', `${tr(row.name)} ×${row.stacks}`));
        }
        body.append(activeBar);
    }

    const footer = el('div', 'tower-blessing-footer');
    footer.append(button(tr('稍后再选，先回塔内'), cb.close, 'secondary'));
    body.append(footer);
    grid.querySelector('.tower-blessing-pick')?.focus();
}
