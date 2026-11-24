import {
    islandPuzzleStatus,
    resolvePuzzleRewardItems,
} from '../../island_puzzles_core.js';
import { createCloseButton } from '../../ui/controls.js';
import { ensureStylesheet } from '../../ui/dom.js';
import { tr, fill } from '../../locale_runtime.js';
import { el, button } from './primitives.js';
import { rewardChip } from './view_adventure_quests.js';

export function renderIslandPuzzle(root, model, cb) {
    ensureStylesheet('island-puzzle-style', new URL('../../../css/island-puzzle.css', import.meta.url).href);
    const { save, assets, puzzleId } = model;
    const statusInfo = islandPuzzleStatus(save, puzzleId);
    root.replaceChildren();
    if (!statusInfo) {
        cb.close?.();
        return;
    }
    const { puzzle, unlocked, solved, lockReason } = statusInfo;
    root.className = 'overlay visible island-puzzle-layer';

    const modal = el('section', 'modal island-puzzle-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', puzzle.title);

    const header = el('header', 'modal-header', el('h2', '', tr(puzzle.title)), createCloseButton(cb.close, tr('关闭现场互动')));
    const body = el('div', 'modal-body island-puzzle-body');
    modal.append(header, body);
    root.append(modal);

    body.append(
        el('p', 'island-puzzle-eyebrow', tr(puzzle.eyebrow || `${puzzle.landmark} · 现场互动`)),
        el('p', 'island-puzzle-intro', tr(solved ? puzzle.completion : puzzle.intro)),
    );

    if (!unlocked) {
        const lockedMsg = el('p', 'island-puzzle-status is-error', tr(lockReason || '请先向附近居民了解情况后再来操作。'));
        lockedMsg.setAttribute('role', 'status');
        body.append(lockedMsg, el('div', 'island-puzzle-actions', button('返回探索', cb.close, 'primary')));
        return;
    }

    const legend = el('div', 'island-puzzle-legend');
    for (const opt of puzzle.options) {
        const item = el('p', 'island-puzzle-legend-item');
        item.append(el('strong', '', tr(opt.label)), document.createTextNode(tr(opt.detail || '')));
        legend.append(item);
    }
    body.append(legend);

    const answers = puzzle.slots.map(slot => (solved ? slot.answer : ''));
    let wrongSlotIndex = -1;

    const slotsHost = el('div', 'island-puzzle-slots');
    const feedback = el('p', 'island-puzzle-status');
    feedback.setAttribute('role', 'status');
    if (solved) {
        feedback.className = 'island-puzzle-status is-success';
        feedback.textContent = fill('{badge}（已完成现场复原，奖励已发放）', { badge: tr(puzzle.restoredBadge) }).text;
    }

    let submitBtn = null;

    function paintSlots() {
        slotsHost.replaceChildren();
        puzzle.slots.forEach((slot, idx) => {
            const card = el(
                'div',
                `island-puzzle-slot${solved ? ' is-solved' : wrongSlotIndex === idx ? ' is-wrong' : !answers[idx] ? ' is-active' : ''}`,
            );
            const head = el('div', 'island-puzzle-slot-head', el('p', 'island-puzzle-slot-prompt', `${idx + 1}. ${tr(slot.prompt)}`));
            const row = el('div', 'gui-tabs island-puzzle-slot-choices');
            for (const opt of puzzle.options) {
                const picked = answers[idx] === opt.id;
                const choiceBtn = button(tr(opt.label), () => {
                    if (solved) return;
                    answers[idx] = opt.id;
                    if (wrongSlotIndex === idx) wrongSlotIndex = -1;
                    feedback.className = 'island-puzzle-status';
                    feedback.textContent = '';
                    paintSlots();
                }, '');
                choiceBtn.classList.add('island-puzzle-option');
                choiceBtn.setAttribute('aria-pressed', picked ? 'true' : 'false');
                choiceBtn.disabled = solved;
                row.append(choiceBtn);
            }
            card.append(head, row);
            slotsHost.append(card);
        });
        if (submitBtn) {
            submitBtn.disabled = solved || answers.some(a => !a);
        }
    }

    const footer = el('div', 'island-puzzle-footer');
    const rewardsBox = el('div', 'island-puzzle-rewards');
    const rewardItems = resolvePuzzleRewardItems(assets?.content, puzzle);
    if (rewardItems.length) {
        rewardsBox.append(
            el('span', 'island-puzzle-reward-label', solved ? '已获回礼' : '现场回礼'),
            ...rewardItems.map(r => rewardChip(assets.content, { id: r.itemId, count: r.count }, { el })),
        );
    }

    const actions = el('div', 'island-puzzle-actions');
    if (!solved) {
        submitBtn = button('确认安放', () => {
            if (answers.some(a => !a)) {
                feedback.className = 'island-puzzle-status is-error';
                feedback.textContent = tr('请先为每一处位置选好对应的牌签。');
                return;
            }
            const res = cb.submit?.({
                type: 'island-puzzle',
                puzzleId: puzzle.id,
                answers: [...answers],
            });
            if (res && res.ok === false) {
                wrongSlotIndex = Number.isInteger(res.slotIndex) ? res.slotIndex : -1;
                feedback.className = 'island-puzzle-status is-error';
                feedback.textContent = tr(res.message || '有一处位置还不太贴切，再试一次吧。');
                paintSlots();
            }
        }, 'primary');
        actions.append(submitBtn, button('稍后再试', cb.close, 'secondary'));
    } else {
        actions.append(button('返回岛屿', cb.close, 'primary'));
    }

    paintSlots();
    footer.append(rewardsBox, actions);
    body.append(slotsHost, feedback, footer);
}
