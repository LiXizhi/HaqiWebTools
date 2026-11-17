import { SCHOOL_NAMES } from '../../adventure_core.js';
import { COLORS } from '../../adventure/renderer/primitives.js';
import { describeCard } from '../../card_description_core.js';
import { tr, setText, fill } from '../../locale_runtime.js';
import { createBattleRoster, updateBattleRoster } from '../../view_adventure_battle_status.js';
import { guidanceCard } from '../../view_adventure_guidance.js';
import { bindHandGesture } from '../../view_adventure_hand.js';
import { attachStatusTooltips } from '../../view_adventure_status_tooltip.js';
import { createBattleChat } from '../../view_battle_chat.js';
import { createBattlePetHint, updateBattlePetHint, updateBattleSpeech, battleSpeechController } from '../../view_battle_pet_hint.js';
import { defeatReviewNotes } from '../../view_battle_review.js';
import { bindBattleTargeting } from '../../view_battle_targeting.js';
import { renderCompanionGuide } from '../../view_companion_guide.js';
import { createPetTraitBadges, traitUpgradeText } from '../../view_pet_traits.js';
import { buildBattleHandViewModel, buildBattleResultViewModel } from '../../adventure/presenters/battle_view_model.js';
import { el, button, icon, badge, spellFace } from './primitives.js';

export { updateBattleRoster, updateBattlePetHint, updateBattleSpeech, battleSpeechController };

// 每次选牌先给短效果，详细规则由玩家主动展开。
export function renderBattle(root, model, cb) {
    try {
        renderBattleContent(root, model, cb);
    } catch (error) {
        console.error('战斗界面显示失败：', error);
        root.disposeHandGesture?.();
        root.disposeStatusTooltips?.();
        root.battleLayoutObserver?.disconnect();
        root.className = 'battle-layer visible';
        root.battleStatusEntries = [];
        root.replaceChildren(
            el(
                'div',
                'result-card',
                el('h2', '', '战斗界面暂时无法显示'),
                el('p', '', '进度已保留。可以重试显示，或撤退后重新挑战。'),
                button('重试显示', () => renderBattle(root, model, cb), 'primary'),
                button('撤退并保留进度', cb.retreat, 'secondary'),
            ),
        );
    }
}

function renderBattleContent(root, model, cb) {
    const retainedCanvas = root.handBattle === model.battle ? root.querySelector('#battle-canvas') : null;
    root.disposeStatusTooltips?.();
    root.disposeHandGesture?.();
    root.battleLayoutObserver?.disconnect();
    const oldSelected = root.querySelector('.hand-card.selected')?.dataset.seq;
    const switching = root.handBattle === model.battle && !model.animating && model.selected && oldSelected !== String(model.selected.seq);
    // Capture the current visual positions, including any unfinished shuffle, before rebuilding.
    const oldHand = switching ? new Map([...root.querySelectorAll('.hand-card')].map(node => [node.dataset.seq, node.getBoundingClientRect()])) : null;
    const previous = root.handBattle === model.battle ? root.handSeqs || new Set() : new Set();
    const { assets, save, battle, selected, discarded = [], animating } = model;
    const hero = battle.unitsById[model.controlledUnitId] || battle.sides.near[0];
    root.replaceChildren();
    root.className = `battle-layer visible${animating ? ' battle-playing' : ''}`;
    const soundIcon = icon('sound');
    // The storybook atlas has no sound frame; keep the small speaker SVG.
    delete soundIcon.dataset.uiIcon;
    const sound = button(soundIcon, cb.sound, 'battle-sound');
    sound.title = model.soundEnabled ? '关闭音效' : '开启音效';
    sound.setAttribute('aria-label', sound.title);
    sound.setAttribute('aria-pressed', String(!!model.soundEnabled));
    const top = el(
        'div',
        'battle-heading',
        el(
            'div',
            '',
            el('p', 'eyebrow', battle.tacticsField ? '借用烈火卡组 · ' + battle.tacticsField.size + ' 对 ' + battle.tacticsField.size : '魔法对决'),
            el(
                'h2',
                '',
                battle.redMushroom
                    ? fill('红蘑菇赛场 · {near} 对 {far}', { near: battle.sides.near.length, far: battle.sides.far.length }).text
                    : battle.monsterTemplates[0].name,
            ),
        ),
        el(
            'div',
            'battle-heading-actions',
            sound,
            (() => {
                const turn = el('span', 'badge');
                setText(turn, '第 {turn} 回合', { turn: battle.turn });
                return turn;
            })(),
            button('撤退', cb.retreat, 'secondary small'),
        ),
    );
    if (battle.redMushroom && !model.localDuo && !battle.finished) {
        const timer = el(
            'span',
            'badge arena-countdown',
            animating ? '施法中…' : fill('选牌剩余 {seconds} 秒', { seconds: model.arenaCountdown ?? 30 }).text,
        );
        timer.dataset.arenaCountdown = '';
        root.append(timer);
    }
    const canvas = retainedCanvas || el('canvas', 'battle-canvas');
    canvas.id = 'battle-canvas';
    canvas.setAttribute('aria-label', '战斗法阵，点击敌人或自己选择目标');
    bindBattleTargeting(canvas, cb.target);

    const handVm = buildBattleHandViewModel({ battle, hero, selected, discarded, assets });
    const blockedMessage = handVm.blockedMessage;
    const status = el('div', 'cast-announcement');
    status.id = 'cast-announcement';
    status.setAttribute('aria-live', 'polite');
    setText(status, battle.finished ? '对决结束' : animating ? '魔法正在生效…' : model.localDuo ? blockedMessage : '');
    status.classList.toggle('cast-blocked', !!model.localDuo && !!blockedMessage && !animating && !battle.finished);
    const hand = el('div', 'battle-hand');
    const bottom = el('div', 'battle-controls');
    hand.classList.toggle('hand-focused', !!selected);
    hand.hidden = animating || battle.finished;
    const petHand = handVm.petHand;
    const petCardsOpen = !!model.petCardsOpen;
    const runeCardsOpen = !!model.runeCardsOpen;
    const runeHand = model.runeHand || [];
    const runePageSize = matchMedia('(max-width:650px)').matches ? 4 : 8;
    const runePages = Math.max(1, Math.ceil(runeHand.length / runePageSize));
    if (root.handBattle !== battle) root.runePage = 0;
    root.runePage = Math.min(Math.max(0, root.runePage || 0), runePages - 1);
    const playerHand = model.hand ? model.hand.filter(h => !discarded.includes(h.seq)) : handVm.playerHand;
    const visibleHand = runeCardsOpen ? runeHand.slice(root.runePage * runePageSize, root.runePage * runePageSize + runePageSize) : petCardsOpen ? petHand : playerHand;
    hand.setAttribute('aria-label', petCardsOpen ? '宠物卡牌' : '玩家手牌');
    const togglePets = button(
        petCardsOpen
            ? fill('返回玩家卡（{count}张）', { count: playerHand.length }).text
            : fill('使用宠物卡（{count}张）', { count: petHand.length }).text,
        cb.togglePetCards,
        'secondary',
    );
    togglePets.setAttribute('aria-pressed', String(petCardsOpen));
    togglePets.disabled = !petCardsOpen && !petHand.length;
    togglePets.hidden = animating || battle.finished || !hero.petDeckSeq?.length;
    const toggleRunes = button(
        runeCardsOpen ? '返回玩家卡' : fill('符文卡（{count}）', { count: (model.runeHand || []).reduce((total, row) => total + row.count, 0) }).text,
        cb.toggleRunes,
        'secondary',
    );
    toggleRunes.setAttribute('aria-pressed', String(runeCardsOpen));
    toggleRunes.hidden = animating || battle.finished || battle.redMushroom || !!battle.tacticsField;
    toggleRunes.disabled = !runeCardsOpen && !model.runeHand?.length;
    const runePager = el('div', 'battle-hand-actions');
    runePager.hidden = !runeCardsOpen || runePages === 1 || animating || battle.finished;
    const changeRunePage = delta => {
        root.runePage += delta;
        cb.reselect();
    };
    const previousRunes = button('上一页', () => changeRunePage(-1), 'secondary small');
    const nextRunes = button('下一页', () => changeRunePage(1), 'secondary small');
    previousRunes.disabled = root.runePage === 0;
    nextRunes.disabled = root.runePage === runePages - 1;
    runePager.append(previousRunes, el('span', '', `${root.runePage + 1} / ${runePages}`), nextRunes);
    if (runeCardsOpen) hand.setAttribute('aria-label', '符文卡牌');
    root.handBattle = battle;
    root.handSeqs = new Set(visibleHand.map(h => h.seq));
    hand.style.gridTemplateColumns = visibleHand
        .map((h, i) => (h.seq === selected?.seq || i === visibleHand.length - 1 ? 'var(--hand-width)' : 'minmax(0,calc(var(--hand-width) + 12px))'))
        .join(' ');
    hand.style.justifyContent = 'center';
    if (runeCardsOpen) {
        hand.style.gridTemplateColumns = visibleHand.map((_, index) => (index === visibleHand.length - 1 ? 'var(--hand-width)' : 'minmax(0,1fr)')).join(' ');
    }
    for (const h of hand.hidden ? [] : visibleHand) {
        const card = battle.resolved.cards[h.key];
        const artCard = hero.wordCards?.[h.seq]
            ? { ...assets.dataset.cards[h.key], name: hero.wordCards[h.seq].title, wordDescription: hero.wordCards[h.seq].description }
            : assets.dataset.cards[h.key];
        const available = handVm.isCardAvailable(card);
        const isSelected = selected?.seq === h.seq;
        const node = el('div', `hand-card ${isSelected ? 'selected' : ''} ${available ? '' : 'unavailable'}`);
        node.dataset.seq = h.seq;
        node.style.zIndex = isSelected ? 30 : hand.children.length + 1;
        node.hidden = !!selected && !isSelected;
        if (!animating && !previous.has(h.seq)) {
            node.classList.add('card-arriving');
            node.style.setProperty('--deal-delay', `${hand.children.length * 65}ms`);
        }
        const select = button(spellFace(assets, card, artCard), () => cb.select(h), 'card-select');
        select.disabled = animating || battle.finished;
        select.setAttribute('aria-label', fill(available ? '选择{name}' : '选择{name}（魔力不足或冷却中）', { name: artCard.name }).text);
        select.setAttribute('aria-pressed', String(isSelected));
        const drop = button('弃牌', () => cb.discard(h.seq), 'discard-button');
        drop.disabled = animating || battle.finished;
        const description = describeCard(card, { dataset: battle.resolved, translate: tr });
        node.title = fill('{name} · {target} · {description}', { name: artCard.name, target: description.target, description: description.summary }).text;
        node.title += ' · ' + (runeCardsOpen ? fill('符文剩余 {count}', { count: h.count }).text : tr(petCardsOpen ? '宠物卡' : '向下拖动或右键弃牌'));
        if (h.runeId) node.append(badge(fill('剩余 {count}', { count: h.count }).text));
        if (isSelected) {
            const brief = el(
                'div',
                'battle-card-brief',
                el('strong', '', artCard.name),
                el('p', '', description.summary),
                el(
                    'small',
                    '',
                    fill('{target} · 魔力 {cost}', {
                        target: description.target,
                        cost: card.pipcost === 'X' || Number(card.pipcost) < 0 || Number(card.pipcost) === 114 ? 'X' : (card.pipcost ?? 0),
                    }).text,
                ),
            );
            const detailBody = el(
                'div',
                'battle-card-detail-body',
                el('h3', '', artCard.name),
                el('p', 'card-detail-meta', description.meta),
                ...description.lines.map(line => el('p', '', line)),
                el('small', '', description.note),
            );
            detailBody.id = model.localDuo ? `selected-card-detail-${hero.id}` : 'selected-card-detail';
            detailBody.tabIndex = 0;
            detailBody.setAttribute('aria-label', tr('卡牌效果说明'));
            detailBody.setAttribute('aria-live', 'polite');
            select.setAttribute('aria-describedby', detailBody.id);
            const toggleLabel = el('span', 'card-detail-toggle-label');
            const summary = el('summary', 'card-detail-toggle', toggleLabel);
            const detail = el('details', 'battle-card-detail', summary, detailBody);
            const syncToggle = () => {
                setText(toggleLabel, detail.open ? '收起' : '查看详情');
                summary.setAttribute('aria-expanded', String(detail.open));
            };
            detail.open = false;
            detail.addEventListener('toggle', syncToggle);
            syncToggle();
            node.append(brief, detail, select, el('div', 'hand-focus-actions', petCardsOpen || runeCardsOpen ? null : drop, button('重新选择', cb.reselect, 'secondary small')));
        } else {
            node.append(select);
        }
        hand.append(node);
    }
    const pass = button('跳过本回合', cb.pass, 'secondary');
    pass.disabled = animating || battle.finished;
    if (cb.aiHintsToggle && !battle.redMushroom && !battle.tacticsField) {
        const hintIcon = icon('pet');
        delete hintIcon.dataset.uiIcon;
        const toggle = button(hintIcon, cb.aiHintsToggle, 'battle-sound battle-pet-hint-toggle');
        toggle.title = model.aiHintsMuted ? '开启本场宠物提示' : '关闭本场宠物提示';
        toggle.setAttribute('aria-label', toggle.title);
        toggle.setAttribute('aria-pressed', String(!model.aiHintsMuted));
        toggle.disabled = battle.finished;
        sound.parentNode.insertBefore(toggle, sound);
    }
    root.battlePetHint = battle.tacticsField ? null : createBattlePetHint(model, { el, onDismiss: cb.aiHintDismiss });
    if (root.battlePetHint) root.append(root.battlePetHint);
    const { legalTargets, kind, canPlay, catchCard, intent } = handVm;
    const targetEnemy = button('对敌方施法', () => cb.target(legalTargets[0]?.id), 'primary');
    const targetSelf = button(legalTargets[0]?.id === hero.id ? '对自己施法' : '对友方施法', () => cb.target(legalTargets[0]?.id), 'primary');
    targetEnemy.hidden = legalTargets.length !== 1 || kind === 'friendly' || kind === 'self';
    targetSelf.hidden = legalTargets.length !== 1 || kind === 'hostile' || kind === 'all';
    targetEnemy.disabled = targetSelf.disabled = animating || battle.finished || !canPlay;
    if (selected && !animating && !battle.finished && !model.localDuo) {
        const instruction = el(
            'p',
            'battle-target-instruction',
            blockedMessage
                ? blockedMessage.split('。')[0] + '。'
                : !legalTargets.length
                  ? '暂时没有可选目标。'
                  : kind === 'friendly' || kind === 'self'
                    ? '点自己或伙伴施法'
                    : '点亮着的对手出招',
        );
        instruction.setAttribute('role', 'status');
        const chosen = hand.querySelector('.hand-card.selected');
        if (chosen) chosen.insertBefore(instruction, chosen.querySelector('.card-select'));
        root.classList.add('has-selected-card');
    }
    const deckLeft = el('small', '');
    setText(deckLeft, '卡包剩余 {count} 张', { count: handVm.deckRemainingCount });
    const chat = cb.battleChat
        ? createBattleChat({ el, button, onSend: cb.battleChat, disabled: animating || battle.finished || hero.hp <= 0, tactical: !battle.redMushroom })
        : null;
    bottom.append(el('div', 'pip-legend', deckLeft), el('div', 'battle-actions', targetEnemy, targetSelf, el('div', 'battle-hand-actions', chat, togglePets, toggleRunes, pass)));
    const focusActions = hand.querySelector('.hand-focus-actions');
    if (focusActions && !model.localDuo) bottom.querySelector('.battle-actions').prepend(focusActions);
    const targetHint = unit => {
        const chance = handVm.catchChanceText(unit);
        return chance ? fill('捕捉成功率 {chance}%', { chance }).text : '';
    };
    if (catchCard) {
        setText(targetEnemy, '捕捉怪物');
        hand.querySelector('.battle-card-detail-body')?.append(el('p', '', '降低目标血量或使用更高级符文，可以提高捕捉成功率。'));
    }
    const rosterOptions = {
        targetHint,
        heroId: hero.id,
        canTarget: unit => !animating && !battle.finished && canPlay && legalTargets.includes(unit),
        target: cb.target,
        el,
        button,
        schoolNames: SCHOOL_NAMES,
        colors: COLORS,
    };
    const foes = createBattleRoster(battle, 'far', rosterOptions);
    const allies = createBattleRoster(battle, 'near', rosterOptions);
    root.battleStatusEntries = [...foes.entries, ...allies.entries];
    updateBattleRoster(root.battleStatusEntries, model.presentation);
    top.firstChild.replaceChildren(foes.roster);
    top.classList.add('battle-roster-heading');
    bottom.classList.add('battle-roster-controls');
    const targets = el('div', 'battle-party-controls', allies.roster);
    if (!battle.redMushroom && !battle.tacticsField && battle.monsterTemplates.some(row => row.speciesId)) {
        const catchStock = (model.runeHand || []).filter(row => battle.resolved.cards[row.key]?.type === 'CatchPet').reduce((sum, row) => sum + row.count, 0);
        const capture = button(catchStock ? fill('抓宠符文（{count}）', { count: catchStock }).text : '没有抓宠符文', () => cb.openRunes?.(), 'secondary');
        capture.disabled = animating || battle.finished || hero.hp <= 0 || !catchStock;
        if (!catchStock) capture.title = '向哈奇岛的安卓婆婆购买普通或高级抓宠符文';
        targets.append(capture);
    }
    bottom.append(targets, runePager);
    if (model.localBattlePane) {
        root.battleStatusEntries = [];
        const owner = el('strong', 'local-battle-owner', `玩家${model.localBattleOwner + 1} · ${hero.name}`);
        if (model.localBattleWaiting) {
            bottom.replaceChildren(owner, button('已准备 · 取消', cb.cancelReady, 'primary'));
            root.append(bottom);
        } else {
            bottom.replaceChildren(owner, bottom.querySelector('.battle-actions'), runePager);
            root.append(hand, bottom);
        }
        const layout = () => {
            const shared = model.localBattleFooter?.querySelector('.battle-controls');
            const footer = shared ? shared.offsetHeight + (parseFloat(getComputedStyle(shared).bottom) || 0) + 12 : 24;
            bottom.style.bottom = `${footer}px`;
            if (!selected) hand.style.bottom = `${footer + bottom.offsetHeight + 12}px`;
        };
        root.battleLayoutObserver = new ResizeObserver(layout);
        for (const node of [root, bottom, model.localBattleFooter].filter(Boolean)) root.battleLayoutObserver.observe(node);
        layout();
        root.disposeHandGesture =
            selected || model.localBattleShared || model.localBattleWaiting
                ? null
                : bindHandGesture(hand, {
                      select: seq => cb.select(visibleHand.find(h => h.seq === seq)),
                      play: seq => cb.swipePlay(visibleHand.find(h => h.seq === seq)),
                      discard: petCardsOpen || runeCardsOpen || animating || battle.finished ? null : cb.discard,
                  });
        root.oncontextmenu = e => {
            const node = e.target.closest('.hand-card');
            if (!node || petCardsOpen || runeCardsOpen || animating || battle.finished) return;
            e.preventDefault();
            cb.discard(Number(node.dataset.seq));
        };
        if (oldHand) animateHandSelection(hand, oldHand, oldSelected, String(selected.seq));
        return;
    }
    if (model.localBattleShared) {
        bottom.querySelector('.battle-actions')?.remove();
        runePager.remove();
        hand.hidden = true;
    }
    root.append(top, canvas, status, ...(model.localBattleShared ? [] : [hand]), bottom);
    if (intent && !animating && !battle.finished && !model.localBattlePane) {
        const base = model.assets?.effects?.cards?.[intent.cardKey]?.base;
        let icon = null;
        if (base && model.assets?.skillArt) {
            icon = el('canvas', 'intent-art');
            icon.width = icon.height = 96;
            icon.setAttribute('aria-hidden', 'true');
            const context = icon.getContext('2d');
            const paint = () => {
                context.clearRect(0, 0, 96, 96);
                model.assets.skillArt.drawSubject(context, base, 0, 0, 96, 96);
            };
            paint();
            model.assets.skillArt.ensure(base).then(paint).catch(() => {});
        }
        const caption = el('span', '', el('small', '', battle.tacticsField ? '茜茜 · 边打边试' : '对手这一回合'), el('strong', '', intent.label));
        if (intent.nextLabel) caption.append(el('small', '', '下回合：' + intent.nextLabel));
        const notice = el('aside', 'opening-enemy-intent intent-' + intent.kind, ...(icon ? [icon] : []), caption);
        if (!battle.tacticsField) {
            const details = el('details', 'intent-detail', el('summary', '', '查看行动分工'), el('p', '', intent.detail));
            notice.append(details);
            notice.title = intent.detail;
        }
        notice.setAttribute('role', 'status');
        notice.setAttribute('aria-label', intent.label);
        top.append(notice);
    }
    if (!battle.tacticsField && !model.aiHintsMuted) renderCompanionGuide(root, model, cb, { battle: true });
    attachStatusTooltips(root, canvas);
    root.oncontextmenu = e => {
        if (petCardsOpen || runeCardsOpen || animating || battle.finished || e.pointerType === 'touch' || !matchMedia('(pointer:fine)').matches) return;
        const node = e.target.closest('.hand-card') || (selected ? hand.querySelector('.hand-card.selected') : null);
        const face = node?.querySelector('.card-select');
        if (!face || node.hidden) return;
        const rect = face.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
        e.preventDefault();
        e.stopPropagation();
        cb.discard(Number(node.dataset.seq));
    };
    root.disposeHandGesture =
        selected || model.localBattleShared || model.localBattleWaiting
            ? null
            : bindHandGesture(hand, {
                  select: seq => cb.select(visibleHand.find(h => h.seq === seq)),
                  play: seq => cb.swipePlay(visibleHand.find(h => h.seq === seq)),
                  discard: petCardsOpen || runeCardsOpen || animating || battle.finished ? null : cb.discard,
              });
    const layout = () => {
        const footer = bottom.offsetHeight + (parseFloat(getComputedStyle(bottom).bottom) || 0) + 12;
        if (!selected) hand.style.bottom = `${footer}px`;
        status.style.top = `${top.offsetTop + top.offsetHeight + 8}px`;
    };
    root.battleLayoutObserver = new ResizeObserver(layout);
    for (const node of [root, top, hand, bottom, status]) root.battleLayoutObserver.observe(node);
    layout();
    if (oldHand) animateHandSelection(hand, oldHand, oldSelected, String(selected.seq));
    const log = el(
        'details',
        'battle-log',
        el('summary', '', '战斗记录'),
        el(
            'div',
            '',
            ...battle.events
                .filter(e => ['cast', 'damage', 'heal', 'dot', 'hot', 'speak', 'fizzle', 'capture'].includes(e.type))
                .slice(-24)
                .map(e => el('p', '', eventLabel(e, battle, assets))),
        ),
    );
    root.append(log);
    if (battle.finished && !animating) {
        const resultVm = buildBattleResultViewModel({ save, battle, assets });
        const { won } = resultVm;
        if (battle.tacticsField) {
            root.append(
                el(
                    'div',
                    'result-card',
                    el('p', 'eyebrow', battle.tacticsField.size + ' 对 ' + battle.tacticsField.size + ' · 实战'),
                    el('h2', '', won ? '拦路怪被打退了！' : '再准备一下，重新来！'),
                    el('p', '', won ? '这次胜利会记入实战记录。' : '本场不会扣角色生命和物品。'),
                    button(won ? '继续打下一组' : '再打一次', cb.practiceNext, 'primary'),
                    button('返回森林', cb.finish, 'secondary'),
                ),
            );
            return;
        }
        const rewardLine = el('p', '');
        if (battle.redMushroom) {
            setText(rewardLine, battle.winner == null ? '本场平局，战绩已更新。' : '比赛结束，战绩已更新。');
        } else if (won) {
            setText(rewardLine, '获得 {xp} 经验 · {coins} 奇豆', { xp: resultVm.xp, coins: resultVm.coins });
        } else {
            setText(rewardLine, '已保留你的物品与任务进度。');
        }
        const result = el(
            'div',
            'result-card',
            el('p', 'eyebrow', won ? '对决胜利' : '继续加油'),
            el('h2', '', won ? '我们赢了！' : '休息一下，再来挑战'),
            rewardLine,
            button(battle.redMushroom ? '返回红蘑菇赛场' : won ? '收下奖励' : '回到安全地点', cb.finish, 'primary'),
        );
        root.append(result);
        if (!battle.redMushroom) {
            const { challenge, firstReward, firstRewardExhausted, tacticsReport, firstMilestones } = resultVm;
            if (challenge?.complete) {
                result.insertBefore(
                    guidanceCard({
                        eyebrow: '整轮挑战完成',
                        title: challenge.first ? '首次通关实绩' : challenge.newBest ? '刷新个人最快记录' : '又一次完成挑战',
                        steps: ['累计 ' + challenge.turns + ' 回合 · 期间失利 ' + challenge.defeats + ' 次'],
                        footnote: '收下奖励后保存本轮实绩。可从副本入口回看，并从头挑战更少回合。',
                        className: 'battle-tactics-result',
                    }),
                    result.lastChild,
                );
            }
            if (firstReward) {
                result.insertBefore(
                    guidanceCard({
                        eyebrow: firstRewardExhausted ? '首通奖励待领取' : '首通装备',
                        title: firstReward.item.name,
                        steps: [firstReward.purpose, firstReward.level + ' 级可装备'],
                        footnote: firstRewardExhausted
                            ? '当前体力不足。本次会保存通关实绩；恢复体力后，再完整挑战一轮即可领取这件装备。'
                            : '点击收下奖励，将装备放入背包。打开背包可比较属性并穿戴。',
                        className: 'battle-tactics-result',
                    }),
                    result.lastChild,
                );
            }
            if (tacticsReport.length) {
                result.insertBefore(
                    guidanceCard({
                        eyebrow: '本场战术',
                        title: firstMilestones.length ? '首次实绩 · ' + firstMilestones.map(row => row.title).join('、') : '你的铺垫生效了',
                        steps: tacticsReport,
                        footnote: won
                            ? '收下奖励后，这场胜利的战术实绩会记入茜茜的战术手册。'
                            : '这次先看看哪些配合生效，再调整下一场的出牌。',
                        className: 'battle-tactics-result',
                    }),
                    result.lastChild,
                );
            }
        }
        if (model.aiReview) {
            const review = model.aiReview;
            result.querySelector('h2').textContent = review.presentation.headline;
            const notes = defeatReviewNotes(review, battle.winner);
            if (notes.length) {
                const details = el('details', '', el('summary', '', '查看复盘'), ...notes.map(note => el('p', '', note)));
                result.insertBefore(details, result.lastChild);
                for (const route of model.aiGrowth || []) {
                    result.insertBefore(button(route.title, () => cb.aiNavigate(route.entry), 'secondary'), result.lastChild);
                }
            }
        }
        for (const row of resultVm.captures) {
            const card = el('section', 'capture-growth-result', el('strong', '', row.name), createPetTraitBadges(row.traits, assets.content, el));
            card.append(
                el('p', '', fill('累计成功捕获 {count} 次', { count: row.captureCount }).text),
                el('p', '', row.upgrades.length ? traitUpgradeText(row.upgrades) : tr('标签已保留最优等级，本次增加获得次数和经验。')),
            );
            result.insertBefore(card, result.lastChild);
        }
    }
}

export function animateHandSelection(hand, previous, oldSelected, selected) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const node of hand.children) {
        if (node.hidden) continue;
        const before = previous.get(node.dataset.seq);
        if (!before) continue;
        const after = node.getBoundingClientRect();
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        const entering = node.dataset.seq === selected;
        const returning = node.dataset.seq === oldSelected;
        if (!dx && !dy && !entering && !returning) continue;
        const restingZ = node.style.zIndex;
        if (returning) node.style.zIndex = '30';
        if (entering) node.style.zIndex = '31';
        const motion = node.animate(
            [{ translate: `${dx}px ${dy}px` }, { translate: `${dx * 0.45}px ${dy * 0.45 + (entering ? -22 : returning ? 8 : 0)}px`, offset: 0.5 }, { translate: '0px 0px' }],
            { duration: entering || returning ? 340 : 300, easing: 'cubic-bezier(.22,.7,.25,1)' },
        );
        motion.finished.then(
            () => {
                node.style.zIndex = restingZ;
            },
            () => {},
        );
    }
}

// Copy the painted face before a round redraw removes the old hand.
export function capturePlayedCard(root, seq) {
    const source = root.querySelector(`.hand-card[data-seq="${seq}"] .card-select`);
    if (!source) return null;
    const node = source.cloneNode(true);
    const rect = source.getBoundingClientRect();
    const base = root.getBoundingClientRect();
    const originals = source.querySelectorAll('canvas');
    node.querySelectorAll('canvas').forEach((canvas, i) => canvas.getContext('2d').drawImage(originals[i], 0, 0));
    return { node, seq, x: rect.left - base.left, y: rect.top - base.top, width: rect.width, height: rect.height };
}

export function animatePlayedCard(root, card, duration) {
    if (!duration) return;
    const { node, x, y, width, height } = card;
    node.classList.add('played-card');
    node.disabled = true;
    node.setAttribute('aria-hidden', 'true');
    Object.assign(node.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
    root.append(node);
    const arena = root.querySelector('.battle-canvas').getBoundingClientRect();
    const base = root.getBoundingClientRect();
    const dx = arena.left - base.left + arena.width / 2 - x - width / 2;
    const dy = arena.top - base.top + arena.height * 0.53 - y - height / 2;
    node.animate(
        [
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            { transform: `translate(${dx}px,${dy}px) scale(.85)`, opacity: 1, offset: 0.72 },
            { transform: `translate(${dx}px,${dy - 20}px) scale(.45)`, opacity: 0 },
        ],
        { duration, easing: 'ease-in-out', fill: 'forwards' },
    ).finished.then(
        () => node.remove(),
        () => node.remove(),
    );
}

export function eventLabel(e, battle, assets) {
    const caster = battle.unitsById[e.caster]?.name || '';
    const target = battle.unitsById[e.target]?.name || '';
    const card = e.wordCardText || assets.dataset.cards[e.card]?.name || '';
    if (e.type === 'freeze') return fill(e.success ? '{target} 被冰封了' : '{target} 抵抗了冰封', { target }).text;
    if (e.type === 'guardian') return fill('{target} 获得一次替身守护', { target }).text;
    if (e.type === 'enrage') return fill('{target} 被激怒了', { target }).text;
    if (e.revived) return fill('{target} 受到守护，复活并恢复 {amount} 点生命', { target, amount: e.amount }).text;
    if (e.type === 'pass' && e.reason === 'frozen') return fill('{caster} 被冰封，无法行动', { caster }).text;
    if (e.label === 'reflection' && ['cast', 'damage'].includes(e.type)) {
        return fill(e.type === 'cast' ? '{caster} 的魔镜反弹 {card} → {target}' : '{target} 受到魔镜反弹的 {amount} 点伤害', {
            caster,
            target,
            card,
            amount: e.amount,
        }).text;
    }
    if (e.type === 'cast') return fill('{caster} → {target} · {card}', { caster, target, card }).text;
    if (e.type === 'damage' || e.type === 'dot') return fill('{target} 受到 {amount} 点伤害', { target, amount: e.amount }).text;
    if (e.type === 'heal' || e.type === 'hot') return fill('{target} 恢复 {amount} 点生命', { target, amount: e.amount }).text;
    if (e.type === 'speak') return fill('{caster}：{text}', { caster, text: e.text }).text;
    if (e.type === 'capture') return fill(e.success ? '{target}捕获成功！' : e.runeId ? '{target}挣脱了抓宠符文' : '{target}挣脱了晶球', { target }).text;
    if (e.type === 'pass') return fill('{caster} 跳过本回合', { caster }).text;
    if (e.type === 'hanzi_buff') return `${caster} · ${e.description}`;
    if (e.type === 'fizzle') return fill('{caster} 的魔法失误了', { caster }).text;
    return '';
}
