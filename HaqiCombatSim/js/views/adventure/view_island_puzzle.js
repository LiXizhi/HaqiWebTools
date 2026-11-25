import {
    islandPuzzleStatus,
    resolvePuzzleRewardItems,
} from '../../island_puzzles_core.js';
import { createCloseButton } from '../../ui/controls.js';
import { ensureStylesheet } from '../../ui/dom.js';
import { tr, fill } from '../../locale_runtime.js';
import { el, button } from './primitives.js';
import { rewardChip } from './view_adventure_quests.js';
import { PUZZLE_STAGE_LAYOUTS, renderIslandPuzzleStage } from './view_island_puzzle_stage.js';

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
    modal.setAttribute('aria-label', tr(puzzle.title));

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

    const answers = puzzle.slots.map(slot => (solved ? slot.answer : ''));
    let activeIndex = 0;
    let wrongSlotIndex = -1;

    const stageHost = el('div', 'island-puzzle-stage-host');
    const promptHost = el('div', 'island-puzzle-prompt-card');
    const trayHost = el('div', 'island-puzzle-tray-wrap');
    const feedback = el('p', 'island-puzzle-status');
    feedback.setAttribute('role', 'status');
    if (solved) {
        feedback.className = 'island-puzzle-status is-success';
        feedback.textContent = fill('{badge}（已完成现场复原，奖励已发放）', { badge: tr(puzzle.restoredBadge) }).text;
    }

    let submitBtn = null;
    const isGlyphPuzzle = puzzle.zone === 'hanzi';
    const layout = PUZZLE_STAGE_LAYOUTS[puzzle.id];
    const optionMap = new Map(puzzle.options.map(o => [o.id, o]));

    function paintInteractive() {
        // 1. Live storybook SVG diorama with clickable hotspots
        stageHost.replaceChildren(
            renderIslandPuzzleStage({
                puzzle,
                answers,
                activeIndex,
                wrongSlotIndex,
                solved,
                onSelectSlot: idx => {
                    activeIndex = idx;
                    paintInteractive();
                },
            }),
        );

        // 2. Active hotspot step selector & situational prompt
        promptHost.replaceChildren();
        const stepBar = el('div', 'gui-tabs island-puzzle-step-tabs');
        puzzle.slots.forEach((slot, idx) => {
            const spotTag = layout?.hotspots?.[idx]?.tag || `位置 ${idx + 1}`;
            const picked = answers[idx] ? optionMap.get(answers[idx]) : null;
            const stepLabel = picked
                ? `${idx + 1}. ${tr(spotTag)} · ${tr(picked.label)}`
                : `${idx + 1}. ${tr(spotTag)}`;
            const tab = button(stepLabel, () => {
                activeIndex = idx;
                paintInteractive();
            }, 'island-puzzle-step-tab');
            tab.setAttribute('aria-pressed', activeIndex === idx ? 'true' : 'false');
            if (wrongSlotIndex === idx) tab.classList.add('is-wrong');
            if (solved || picked) tab.classList.add('is-filled');
            stepBar.append(tab);
        });

        const currentSlot = puzzle.slots[activeIndex] || puzzle.slots[0];
        const promptRow = el('div', 'island-puzzle-active-prompt');
        const promptText = el('p', 'island-puzzle-slot-prompt', `${activeIndex + 1}. ${tr(currentSlot.prompt)}`);
        promptRow.append(promptText);
        if (!solved && answers[activeIndex]) {
            const clearBtn = button('撤下此牌', () => {
                answers[activeIndex] = '';
                if (wrongSlotIndex === activeIndex) wrongSlotIndex = -1;
                feedback.className = 'island-puzzle-status';
                feedback.textContent = '';
                paintInteractive();
            }, 'text-button island-puzzle-clear');
            promptRow.append(clearBtn);
        }
        promptHost.append(stepBar, promptRow);

        // 3. Tactile carved plaque / token tray
        trayHost.replaceChildren();
        if (!solved) {
            trayHost.append(el('p', 'island-puzzle-tray-hint', tr('点选下方牌签，直接安放到实景中闪烁的当前位置：')));
        }
        const tray = el('div', `island-puzzle-tray${isGlyphPuzzle ? ' is-glyphs' : ''}`);
        const usedCounts = new Map();
        answers.forEach(a => {
            if (a) usedCounts.set(a, (usedCounts.get(a) || 0) + 1);
        });
        for (const opt of puzzle.options) {
            const pickedHere = answers[activeIndex] === opt.id;
            const usedElsewhere = !pickedHere && (usedCounts.get(opt.id) || 0) > 0;
            const tile = document.createElement('button');
            tile.type = 'button';
            tile.className = [
                'island-puzzle-token',
                isGlyphPuzzle ? 'is-glyph' : '',
                pickedHere ? 'is-selected' : '',
                usedElsewhere ? 'is-used' : '',
            ].filter(Boolean).join(' ');
            tile.disabled = solved;
            tile.setAttribute('aria-pressed', pickedHere ? 'true' : 'false');
            tile.append(
                el('strong', 'island-puzzle-token-label', tr(opt.label)),
                el('small', 'island-puzzle-token-detail', tr(opt.detail || '')),
            );
            tile.onclick = () => {
                if (solved) return;
                answers[activeIndex] = opt.id;
                if (wrongSlotIndex === activeIndex) wrongSlotIndex = -1;
                feedback.className = 'island-puzzle-status';
                feedback.textContent = '';
                cb.onPick?.();
                const nextEmpty = answers.findIndex(a => !a);
                if (nextEmpty >= 0) activeIndex = nextEmpty;
                paintInteractive();
            };
            tray.append(tile);
        }
        trayHost.append(tray);

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
                const firstEmpty = answers.findIndex(a => !a);
                if (firstEmpty >= 0) activeIndex = firstEmpty;
                feedback.className = 'island-puzzle-status is-error';
                feedback.textContent = tr('请先为每一处位置选好对应的牌签。');
                paintInteractive();
                return;
            }
            const res = cb.submit?.({
                type: 'island-puzzle',
                puzzleId: puzzle.id,
                answers: [...answers],
            });
            if (res && res.ok === false) {
                wrongSlotIndex = Number.isInteger(res.slotIndex) ? res.slotIndex : -1;
                if (wrongSlotIndex >= 0) activeIndex = wrongSlotIndex;
                feedback.className = 'island-puzzle-status is-error';
                feedback.textContent = tr(res.message || '有一处位置还不太贴切，再试一次吧。');
                paintInteractive();
            }
        }, 'primary');
        actions.append(submitBtn, button('稍后再试', cb.close, 'secondary'));
    } else {
        actions.append(button('返回岛屿', cb.close, 'primary'));
    }

    paintInteractive();
    footer.append(rewardsBox, actions);
    body.append(stageHost, promptHost, trayHost, feedback, footer);
}
