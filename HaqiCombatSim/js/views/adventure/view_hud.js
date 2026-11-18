import { SCHOOL_NAMES } from '../../adventure_core.js';
import { QUEST_REGIONS } from '../../adventure_quest_journal_core.js';
import { islandName } from '../../adventure_world_map_core.js';
import { drawSchoolIcon } from '../../card_renderer.js';
import { syncLocaleChrome } from '../../locale.js';
import { tr, setText, fill } from '../../locale_runtime.js';
import { translatedGoal } from './view_adventure_quests.js';
import { socialHudButton, teamHudButton, bindDungeonMenu } from './view_adventure_social_hud.js';
import { renderCompanionGuide } from './view_companion_guide.js';
import { objectiveProgress } from './view_objective_progress.js';
import {
    buildCatalogTrackLines,
    buildChapterTrackLines,
    buildCheckinViewModel,
    buildHudTrackerViewModel,
    buildTrackerEntryState,
    computeHeroHealth,
    computeHeroXpRatio,
    isOpeningQuiet,
} from '../../adventure/presenters/hud_view_model.js';
import { el, button, disabledModeMark, paths, mountEmoji, icon, art } from './primitives.js';

function withName(pattern, name) {
    return tr(pattern).replaceAll('{name}', tr(name ?? ''));
}

export function objectiveLabel(g, c) {
    if (g.kind === 'talk') return withName('与{name}交谈', c.npcs[g.id]?.name || String(g.id));
    if (g.kind === 'defeat') return withName('击败{name}', Object.values(c.monsters).find(m => m.goalId === g.id)?.name || '训练敌人');
    return (
        {
            79016: '强化一件装备（点击追踪进入强化）',
            79019: '喂养你的宠物',
            79037: '装备翡翠口袋并保存配卡',
            'hatch-pet': '获得出奇蛋中的伙伴',
            'equip-staff': '装备晶石法杖',
        }[g.id] || '完成导师的指导'
    );
}

// 每帧同步教学指针：自动寻路（点过追踪）期间隐藏手指与按钮脉冲，寻路结束由下一次 HUD 渲染重新判定。
export function syncTeachPointer(root, walking) {
    const hand = root.querySelector('.teach-pointer');
    if (!hand) return;
    hand.hidden = walking;
    root.querySelector('.track-button.teach-target')?.classList.toggle('teach-walk', walking);
}

export function updateHeroHealth(root, save, content) {
    const bar = root.querySelector('.hero-health');
    if (!bar) return;
    const { hp, maxHp, ratio } = computeHeroHealth(save, content);
    bar.style.setProperty('--health', `${ratio}%`);
    bar.querySelector('.hero-health-label').textContent = `${hp} / ${maxHp}`;
    bar.setAttribute('aria-label', fill('生命 {hp} / {max}', { hp, max: maxHp }).text);
}

function minutesLeft(ms) {
    return Math.max(1, Math.ceil((ms - 1) / 60000));
}

export function gourdArt() {
    const node = el('span', 'gourd-art');
    node.innerHTML =
        '<svg viewBox="0 0 80 112" aria-hidden="true"><ellipse cx="40" cy="104" rx="25" ry="5" fill="#685225" opacity=".15"/><path d="M35 8h10l-2 12c17 4 21 23 9 34 26 13 23 47-12 47S2 67 28 54C16 43 20 24 37 20z" fill="currentColor" stroke="#8f621f" stroke-width="2.5"/><path d="M29 33c-6 8-3 14 0 17M23 71c-6 11-1 19 5 22" fill="none" stroke="#fff4b6" stroke-width="5" stroke-linecap="round" opacity=".7"/><path d="M27 54q13 6 26 0l-1 7q-12 5-24 0z" fill="#af4e32"/><path d="m46 60 12 19-9-3-3 8-7-23" fill="#af4e32"/><path d="M33 8h14v7H33z" fill="#826035"/><circle cx="38" cy="79" r="10" fill="#fff0b5" opacity=".85"/><text x="38" y="83" text-anchor="middle" font-size="12" fill="#8f621f">福</text></svg>';
    return node;
}

export function updateCheckin(root, model) {
    const status = buildCheckinViewModel(model);
    const nav = root.querySelector('.checkin-button');
    const navLabel = nav?.querySelector('small');
    if (nav && navLabel) {
        const quiet = isOpeningQuiet(model.save);
        if (quiet) setText(navLabel, '稍后查看');
        else if (status.ready) setText(navLabel, '可领取');
        else if (status.finished) setText(navLabel, '已领完');
        else setText(navLabel, '{minutes} 分钟', { minutes: minutesLeft(status.remainingMs) });
        nav.classList.toggle('reward-ready', status.ready && !quiet);
    }
    const grid = root.querySelector('.checkin-gourds');
    if (!grid) return;
    for (const g of status.gourds) {
        const card = grid.children[g.index];
        const b = card.querySelector('.gourd-base');
        const vip = card.querySelector('.gourd-vip');
        b.disabled = !g.ready;
        card.classList.toggle('ready', g.ready || g.vipReady);
        card.classList.toggle('claimed', g.claimed && (!status.starLevel || g.vipClaimed));
        setText(card.querySelector('.gourd-time'), '{minutes} 分钟', { minutes: g.minute });
        const names = g.rewards.map(r =>
            fill('{name} × {count}', { name: model.assets.content.items[r.id]?.name || r.id, count: r.count }).text,
        );
        card.querySelector('.gourd-coins').textContent = names[0] || '';
        card.querySelector('.gourd-items').textContent = names.slice(1).join(tr('、'));
        if (g.claimed) setText(b, '已领取');
        else if (g.ready) setText(b, '领取奖励');
        else setText(b, '还需 {minutes} 分钟', { minutes: minutesLeft(g.remainingMs) });
        b.setAttribute('aria-label', fill('{minute}分钟葫芦：{label}', { minute: g.minute, label: b.textContent }).text);
        card.title = names.join(tr('、'));
        if (g.vipClaimed) setText(vip, '魔法星已领取');
        else if (!status.starLevel) setText(vip, '魔法星额外奖励');
        else if (g.vipReady) setText(vip, '再领 {count} 仙豆', { count: g.vipCoins });
        else setText(vip, '魔法星奖励待解锁');
        vip.disabled = g.vipClaimed || (status.starLevel > 0 && !g.vipReady);
        vip.setAttribute('aria-label', fill('{minute}分钟葫芦：{label}', { minute: g.minute, label: vip.textContent }).text);
    }
    setText(
        root.querySelector('.checkin-online'),
        '今日累计在线 {minutes} 分钟 · 普通奖励 {base}/5 · 魔法星奖励 {vip}/5',
        { minutes: Math.floor(status.onlineMs / 60000), base: status.baseCount, vip: status.vipCount },
    );
    setText(root.querySelector('.checkin-balance'), '当前拥有 {count} 仙豆', { count: model.save.inventory[17213] || 0 });
    if (status.starLevel) {
        setText(root.querySelector('.checkin-member-summary'), '魔法星 {level} 级：每个葫芦额外 {count} 仙豆', {
            level: status.starLevel,
            count: status.gourds[0].vipCoins,
        });
    } else {
        setText(root.querySelector('.checkin-member-summary'), '普通奖励人人可领，拥有魔法星可再领一份额外仙豆。');
    }
}

export function appendTrackerQuest(tracker, entry, save, c, cb, teach) {
    if (entry.languageQuest?.courseId) {
        const q = entry.languageQuest;
        const open = () => cb.panel('quests', { questId: q.id });
        const go = () => cb.track(q.id, { pin: false });
        const link = button(
            [
                el('span', `quest-state ${q.status === '已完成' ? 'ready' : q.status === '进行中' ? 'active' : 'available'}`, q.status === '已完成' ? '?' : '!'),
                el('span', 'quest-title', '语言 · ' + q.title),
            ],
            open,
            'quest-track-title',
        );
        link.title = fill('{status}，点击查看任务详情', { status: q.status }).text;
        const text =
            q.status === '已完成'
                ? '本岛语言任务已完成，可到家园复习。'
                : q.region !== save.zone
                  ? fill(q.status === '可接取' ? '前往{region}，开始岛屿故事。' : '前往{region}，继续岛屿故事。', {
                        region: QUEST_REGIONS[q.region] || q.region,
                    }).text
                  : q.battleWon
                    ? '回到' + q.course.steps[0].interaction.name + '身边交谈'
                    : q.status === '可接取' && q.interaction?.name
                      ? fill('去找{name}，开始这段故事。', { name: q.interaction.name }).text
                      : q.objective;
        tracker.append(
            el(
                'article',
                'tracker-quest',
                el('h3', '', link),
                el('div', 'tracker-line', button(text, go, 'tracker-follow'), button(q.status === '进行中' && q.region === save.zone ? '继续练习' : '前往', go, 'track-button')),
            ),
        );
        return;
    }

    const { chapter, quest, ready, state, campQuest, teachNow, statusLabel, goals } = buildTrackerEntryState(save, c, entry, teach);
    const marker = el('span', `quest-state ${ready ? 'ready' : state.accepted ? 'active' : 'available'}`, ready ? '?' : '!');
    marker.setAttribute('aria-hidden', 'true');
    const questLink = button([marker, el('span', 'quest-title', quest.title)], () => cb.panel('quests', { questId: quest.id }), 'quest-track-title');
    questLink.title = fill('{status}，点击查看任务详情', { status: statusLabel }).text;
    questLink.setAttribute('aria-label', fill('{title}，{status}，查看任务详情', { title: quest.title, status: statusLabel }).text);
    const track = button('追踪', () => cb.track(quest.id, { pin: false }), 'track-button');
    track.title = '追踪这个任务';
    if (teachNow) {
        track.classList.add('teach-target');
        const hand = el('span', 'teach-pointer', '👇');
        hand.setAttribute('aria-hidden', 'true');
        track.append(hand);
    }
    const card = el('article', 'tracker-quest', el('h3', '', questLink));
    const lines = chapter
        ? buildChapterTrackLines(save, c, quest, withName, objectiveLabel)
        : buildCatalogTrackLines(save, c, quest, withName, translatedGoal);
    const visibleLines = chapter && campQuest ? [lines.find(line => line.done !== true) || lines[0]].filter(Boolean) : lines;
    visibleLines.forEach((line, index) => {
        const text = el('span', 'tracker-follow-text', line.text);
        const follow = button(
            line.done === undefined ? text : [el('span', 'tracker-mark', line.done ? '✓' : '◇'), text],
            () => cb.track(quest.id, { pin: false }),
            `tracker-follow${line.done ? ' complete' : ''}`,
        );
        follow.title = tr('追踪这个任务');
        follow.setAttribute('aria-label', fill('{text}，追踪', { text: line.text }).text);
        card.append(index ? follow : el('div', 'tracker-line', follow, track));
    });
    if (goals?.length) {
        card.append(
            objectiveProgress(
                save,
                'quest:' + quest.id,
                goals.reduce((n, g) => n + Math.min(g.value, g.count), 0),
                goals.reduce((n, g) => n + g.count, 0),
            ),
        );
    }
    tracker.append(card);
}

export function renderHeroTitle(model, cb) {
    const { assets, save } = model;
    const c = assets.content;
    const ratio = computeHeroXpRatio(save, c);
    const xp = el('div', 'xp-bar', el('i'));
    xp.firstChild.style.width = `${(ratio * 100).toFixed(2)}%`;
    const school = el('canvas', 'hero-school-icon');
    school.width = 48;
    school.height = 48;
    school.setAttribute('role', 'img');
    const schoolLabel = fill('{school}系', { school: SCHOOL_NAMES[save.school] }).text;
    school.setAttribute('aria-label', schoolLabel);
    school.title = schoolLabel;
    drawSchoolIcon(school.getContext('2d'), save.school, 24, 24, 36);
    const level = el('span', 'hero-level-badge', String(save.level));
    level.dataset.zh = '等级';
    level.title = `${tr('等级')} ${save.level}`;
    level.setAttribute('aria-label', level.title);
    // Hidden entry: clicking the character name five times in a row (interval <= 600ms) opens the debug panel; a single click still opens the character & equipment panel.
    let heroClicks = 0;
    let heroTimer = 0;
    const openHeroPanel = () => {
        heroClicks++;
        clearTimeout(heroTimer);
        if (heroClicks >= 5) {
            heroClicks = 0;
            cb.panel('debug');
            return;
        }
        heroTimer = setTimeout(() => {
            heroClicks = 0;
            cb.panel('equipment');
        }, 600);
    };
    const name = button([school, level, el('strong', '', save.name)], openHeroPanel, 'hero-name');
    name.title = '角色与装备（R）';
    const isVip = model.membership?.isVip === true;
    const membership = button(isVip ? '会员权益' : '升级会员', cb.membership, 'hero-membership');
    membership.title = isVip ? '会员权益' : '升级会员';
    membership.setAttribute('aria-label', membership.title);
    membership.setAttribute('aria-haspopup', 'dialog');
    const currency = (id, label) => {
        const amount = (save.inventory[id] || 0).toLocaleString('zh-CN');
        const iconCanvas = el('canvas', 'hero-bean-icon');
        iconCanvas.width = 32;
        iconCanvas.height = 32;
        iconCanvas.setAttribute('aria-hidden', 'true');
        const ref = c.currencyIcons?.[id];
        if (ref) assets.draw(iconCanvas.getContext('2d'), ref, 0, 0, 32, 32);
        const node = el('span', 'hero-currency', iconCanvas, el('span', '', amount));
        node.dataset.zh = label;
        const purpose = {
            100: '可用于商城补给和宠物营养餐',
            17213: '可用于已有装备强化，先留着也没关系',
            984: '用于标注魔豆价格的商品',
        }[id];
        node.title = `${tr(label)} ${amount} · ${purpose}`;
        node.setAttribute('aria-label', node.title);
        return node;
    };
    const details = el('div', 'hero-details');
    for (const [id, label] of [
        [100, '奇豆'],
        [17213, '仙豆'],
        [984, '魔豆'],
    ]) {
        details.append(currency(id, label));
    }
    const status = el('section', 'hero-status', el('div', 'hero-text', el('div', 'hero-heading', name, membership), details, xp));
    const warning = el('span', 'save-indicator', model.storageWarning ? '存档未保存' : '');
    warning.hidden = !model.storageWarning;
    status.querySelector('.hero-text').append(el('div', 'hero-health', el('i'), el('span', 'hero-health-label')), warning);
    updateHeroHealth(status, save, c);
    return status;
}

export function renderHud(root, model, cb) {
    // A reward can repaint while the dictionary hides the HUD. display:none
    // reports zero offsets, so measure invisibly and restore before the frame paints.
    const hidden = root.hidden;
    const visibility = root.style.getPropertyValue('visibility');
    const priority = root.style.getPropertyPriority('visibility');
    if (hidden) {
        root.style.setProperty('visibility', 'hidden', 'important');
        root.hidden = false;
    }
    try {
        return renderHudContents(root, model, cb);
    } finally {
        if (hidden) {
            root.hidden = true;
            if (visibility) root.style.setProperty('visibility', visibility, priority);
            else root.style.removeProperty('visibility');
        }
    }
}

function renderHudContents(root, model, cb) {
    const { assets, save } = model;
    const c = assets.content;
    root.replaceChildren();
    const status = renderHeroTitle(model, cb);
    if (model.localSecond) {
        status.dataset.player = '1';
        const second = renderHeroTitle({ ...model, save: model.localSecond }, { ...cb, panel: kind => cb.playerPanel(1, kind) });
        second.classList.add('local-secondary-title');
        second.dataset.player = '2';
        second.setAttribute('aria-label', '玩家2角色信息');
        status.setAttribute('aria-label', '玩家1角色信息');
        root.append(second);
    }
    root.append(
        status,
        el(
            'div',
            'location-label',
            el('span', '', model.locationName || c.worldMaps?.[save.zone]?.name || islandName(save.zone)),
            el('small', '', save.zone === 'camp' ? '在晨光中，发现魔法' : '新的故事，在这里继续'),
        ),
    );
    syncLocaleChrome();
    const utilities = el('nav', 'utility-nav');
    utilities.setAttribute('aria-label', '其他功能');
    const checkin = button([icon('gourd'), el('span', 'utility-label', '在线奖励'), el('small', '', '')], () => cb.panel('checkin'), 'utility-button checkin-button');
    checkin.title = '米酒葫芦 · 在线领奖';
    utilities.append(checkin);
    for (const [label, key, action] of [
        ['世界地图', 'map', () => cb.panel('map')],
        ['副本', 'dungeon', () => cb.panel('dungeons')],
        ['设置', 'settings', () => cb.panel('settings')],
    ]) {
        utilities.append(button([icon(key), el('span', 'utility-label', label)], action, 'utility-button'));
    }
    root.append(utilities);
    const dungeonButton = [...utilities.querySelectorAll('button')].find(b => b.querySelector('[data-ui-icon="dungeon"]') || b.textContent === '副本');
    if (dungeonButton) bindDungeonMenu(dungeonButton, cb.panel);

    updateCheckin(root, model);
    const vm = buildHudTrackerViewModel(model);
    const chapterCount = el('span', 'chapter-count');
    setText(chapterCount, vm.catalogClaimed ? '{done} / 14 · 全岛 {claimed}' : '{done} / 14', {
        done: vm.chapterDone,
        claimed: vm.catalogClaimed,
    });
    const tracker = el('section', 'quest-tracker', el('div', 'tracker-top', el('span', 'eyebrow', '冒险手记'), chapterCount));
    if (vm.mode === 'opening') {
        const { state, goal, milestones } = vm.payload;
        tracker.replaceChildren(
            el('div', 'tracker-top', el('span', 'eyebrow', `第一次搭档 · ${milestones}/3`)),
            el('h3', '', '帮咕噜噜找到朋友'),
            el('p', '', goal.objective),
            el('div', 'opening-tracker-actions', button('前往', () => cb.track('opening-journey'), 'track-button')),
        );
        tracker.append(objectiveProgress(save, 'opening', milestones, 3));
        if (state.phase === 'challenge') {
            tracker.querySelector('.opening-tracker-actions').append(button('换个办法', () => cb.track('opening-journey-plan'), 'track-button'));
        }
    } else if (vm.mode === 'camp-detour') {
        const { goal, step } = vm.payload;
        tracker.replaceChildren(
            el('h3', '', '营地里的歌声'),
            el('p', '', goal.text),
            objectiveProgress(save, 'camp-detour', step, 3),
            button('带我找找', () => cb.track('camp-detour'), 'track-button'),
        );
    } else if (vm.mode === 'earth') {
        const { chapter, step, side } = vm.payload;
        tracker.replaceChildren(
            el('h3', '', side?.name || chapter?.name || '与世界同行'),
            el('p', '', side?.description || step?.name || (chapter ? '本章完成。和伙伴继续探索吧。' : '靠近居民，了解这座城市的故事。')),
        );
    } else if (vm.mode === 'dungeon') {
        const { dungeon, cleared, remaining } = vm.payload;
        tracker.replaceChildren(
            el('div', 'tracker-top', el('span', 'eyebrow', '副本探索'), el('span', 'chapter-count', `清怪 ${cleared} / ${dungeon.arenas.length}`)),
            el('h3', '', dungeon.name),
            el('p', '', cleared === dungeon.arenas.length ? '营地已清理完毕，可以退出副本。' : remaining ? `下一站：第 ${cleared + 1} 处营地。沿道路前进，接近怪物后开始战斗。` : '前路暂未开放，可以退出副本。'),
            el('p', 'muted', '副本中不会自动回血，请用现有生命通关。'),
        );
        if (remaining) tracker.append(button('前往下一处营地', () => cb.track('dungeon-next'), 'track-button'));
        tracker.append(button('退出副本', () => cb.leaveDungeon?.(), 'track-button'));
    } else {
        const { entries, teachAllow } = vm.payload;
        const teach = { allow: teachAllow };
        if (entries.length) {
            for (const entry of entries) appendTrackerQuest(tracker, entry, save, c, cb, teach);
        } else {
            tracker.append(
                el('h3', '', '新的魔法旅程'),
                el(
                    'p',
                    '',
                    save.visitedTown
                        ? '你已完成第一章。和镇上的居民聊聊，或到郊外练习魔法吧。'
                        : '你通过了毕业考核！前往营地南边的传送阵，探索哈奇小镇。',
                ),
                button('前往传送阵', cb.track, 'track-button'),
            );
        }
    }

    if (vm.tacticsGoal && !vm.tacticsGoal.complete) {
        const goal = vm.tacticsGoal;
        const link = button(
            (goal.kind === 'lesson' ? '和茜茜打怪 · ' : '实战委托 · ') + goal.done + '/' + goal.total,
            () => cb.panel('tactics-training'),
            'tracker-tactics',
        );
        link.title = goal.title + '：' + goal.body;
        link.setAttribute('aria-label', tr('战术委托') + '：' + tr(goal.title));
        tracker.append(el('div', 'tracker-tactics-goal', link, el('small', '', goal.title)));
    }
    if (vm.forestGoal) {
        const { phase, goal } = vm.forestGoal;
        tracker.append(
            el(
                'div',
                'tracker-tactics-goal forest-tracker',
                button(phase === 'offer' ? '森林委托 · 营地急件' : '森林委托 · ' + goal.label, () => cb.panel('forest-commission'), 'tracker-tactics'),
            ),
        );
    }
    root.append(tracker);
    const nav = el('nav', 'game-nav');
    nav.setAttribute('aria-label', '游戏菜单');
    for (const [id, label, key] of [
        ['home', '家园', 'home'],
        ['deck', '卡包', 'cards'],
        ['inventory', '背包', 'bag'],
        ['pet', '宠物', 'pet'],
        ['shop', '商店', 'shop'],
    ]) {
        nav.append(button([icon(key), el('span', '', label)], () => cb.panel(id), 'nav-button'));
    }
    root.append(nav);
    renderCompanionGuide(root, model, cb);
    if (save.mountId || model.localSecond) {
        const mountItem = c.items[save.mountId];
        const mountMark = el('span', 'mount-mark');
        mountMark.setAttribute('aria-hidden', 'true');
        mountMark.append(
            !save.mountId
                ? icon('pet')
                : mountItem?.art
                  ? art(assets, mountItem.art, 34, 34)
                  : el('span', 'mount-emoji', mountEmoji(c.mountByItem?.[save.mountId]?.name)),
        );
        if (save.mountHidden) mountMark.append(disabledModeMark());
        const mountToggle = button([mountMark], () => (save.mountId ? cb.mountToggle() : cb.panel('pet')), 'mount-toggle');
        mountToggle.title = tr(!save.mountId ? '选择坐骑' : save.mountHidden ? '在场景中显示坐骑' : '在场景中隐藏坐骑');
        mountToggle.setAttribute('aria-label', mountToggle.title);
        mountToggle.setAttribute('aria-pressed', String(!save.mountHidden));
        root.append(mountToggle);
        const locale = document.querySelector('.locale-launch');
        mountToggle.style.left = `${status.offsetLeft + (locale && !locale.hidden ? 44 : 0)}px`;
        mountToggle.style.top = `${status.offsetTop + status.offsetHeight + 8}px`;
    }
    const learningEnabled = save.languageLearning?.enabled === true;
    const learningMark = el('span', 'mount-mark learning-chat-mark');
    learningMark.setAttribute('aria-hidden', 'true');
    const mouth = el('span', 'learning-mouth');
    mouth.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 11c3-1 5-5 8-3l2 1 2-1c3-2 5 2 8 3-4 9-16 9-20 0Z M2 11q10 4 20 0"/></svg>';
    learningMark.append(mouth);
    if (!learningEnabled) learningMark.append(disabledModeMark());
    const learn = button([learningMark], () => cb.panel('learning-mode'), 'mount-toggle learning-mode-launch');
    learningMark.append(el('span', 'language-buff-count', `+${vm.dailyBuffLayers}`));
    learn.title = tr(learningEnabled ? '双语学习 · 已开启' : '双语学习 · 已关闭') + '\n' + vm.dailyBuffText;
    learn.setAttribute('aria-label', learn.title);
    learn.setAttribute('aria-pressed', String(learningEnabled));
    root.append(learn);
    const localeControl = document.querySelector('.locale-launch');
    learn.style.left = `${status.offsetLeft + (localeControl && !localeControl.hidden ? 44 : 0) + (save.mountId ? 44 : 0)}px`;
    learn.style.top = `${status.offsetTop + status.offsetHeight + 8}px`;
    const socialBar = el('div', 'hero-social-toolbar');
    socialBar.style.left = `${status.offsetLeft + (localeControl && !localeControl.hidden ? 44 : 0)}px`;
    socialBar.style.top = `${status.offsetTop + status.offsetHeight + 8}px`;
    for (const control of [...root.querySelectorAll('.mount-toggle')]) {
        control.style.left = '';
        control.style.top = '';
        socialBar.append(control);
    }
    socialBar.append(socialHudButton('私聊', 'chat', model.social?.chatUnread, cb.panel));
    const teamControl = teamHudButton(model.social?.team, save.coopRun, cb.panel, model.localSecond);
    if (teamControl) socialBar.append(teamControl);
    const dictionaryMark = el('span', 'social-symbol');
    dictionaryMark.setAttribute('aria-hidden', 'true');
    dictionaryMark.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${paths.book}"/></svg>`;
    socialBar.append(button([dictionaryMark], () => cb.panel('dictionary'), 'mount-toggle dictionary-launch'));
    socialBar.lastChild.title = tr('字典');
    socialBar.lastChild.setAttribute('aria-label', tr('字典'));
    root.append(socialBar);
    if (model.timeCity) {
        const time = button('时光长卷', () => cb.panel('time-scroll'), 'secondary time-scroll-launch');
        time.style.cssText = 'position:absolute;right:14px;bottom:100px;pointer-events:auto';
        root.append(time);
    }
    if (model.localSecond) {
        socialBar.dataset.player = '1';
        const second = root.querySelector('.local-secondary-title');
        const peer = model.localSecond;
        const peerBar = el('div', 'hero-social-toolbar local-secondary-toolbar');
        peerBar.dataset.player = '2';
        peerBar.style.left = `${second.offsetLeft}px`;
        peerBar.style.top = `${second.offsetTop + second.offsetHeight + 8}px`;
        {
            const mark = el('span', 'mount-mark');
            const item = c.items[peer.mountId];
            mark.setAttribute('aria-hidden', 'true');
            mark.append(
                !peer.mountId
                    ? icon('pet')
                    : item?.art
                      ? art(assets, item.art, 34, 34)
                      : el('span', 'mount-emoji', mountEmoji(c.mountByItem?.[peer.mountId]?.name)),
            );
            if (peer.mountHidden) mark.append(disabledModeMark());
            const toggle = button([mark], () => (peer.mountId ? cb.playerMountToggle(1) : cb.playerPanel(1, 'pet')), 'mount-toggle');
            toggle.title = tr(!peer.mountId ? '选择坐骑' : peer.mountHidden ? '在场景中显示坐骑' : '在场景中隐藏坐骑');
            toggle.setAttribute('aria-label', toggle.title);
            toggle.setAttribute('aria-pressed', String(!peer.mountHidden));
            peerBar.append(toggle);
        }
        root.append(peerBar);
    }
    const interaction = button('交谈', cb.interact, 'interact-button');
    interaction.id = 'interact';
    interaction.hidden = true;
    root.append(interaction);
}

export function updateLocationLabel(hud, world, save, regionName = '') {
    if (!hud) return;
    if (world?.isEarth) {
        const location = hud.querySelector('.location-label span');
        if (location && location.dataset.zh !== world.layout.name) setText(location, world.layout.name);
    }
    if (world?.layout) {
        const label = hud.querySelector('.location-label small');
        const name = regionName || '新的故事，在这里继续';
        if (label && label.dataset.zh !== name) setText(label, name);
    }
}

export function syncInteractPrompt(hud, near, content) {
    const btn = hud?.querySelector?.('#interact') || (typeof document !== 'undefined' ? document.getElementById('interact') : null);
    if (!btn) return;
    btn.hidden = !near;
    if (!near) return;
    const monster = (near.monster || content.monsters[near.monsterId])?.name || '待迁移怪物';
    const next =
        near.kind === 'camp-toy'
            ? ['碰一碰{name}', { name: near.name }]
            : near.kind === 'npc'
              ? ['与{name}交谈', { name: near.name }]
              : near.kind === 'landmark'
                ? ['查看{name}', { name: near.name }]
                : near.kind === 'portal'
                  ? [near.name, null]
                  : ['挑战{name}', { name: monster }];
    const zh = next[1] ? fill(next[0], next[1]).zh : next[0];
    if (btn.dataset.zh !== zh) {
        if (next[1]) setText(btn, next[0], next[1]);
        else setText(btn, next[0]);
    }
}

export function syncRewardGlow(hud, rewardRoot) {
    const bagButton = hud?.querySelector?.('[data-ui-icon=bag]')?.closest('button');
    if (!bagButton || !rewardRoot) return;
    bagButton.classList.toggle('reward-glow', !rewardRoot.hidden && !!rewardRoot.querySelector('.reward-popup:not([hidden]) strong'));
}

export function syncCareHud(hud, overlay, panel, save, secondSave, content, model, updatePetStatus) {
    if (typeof document !== 'undefined') updatePetStatus?.(document, save, content);
    updateHeroHealth(hud?.querySelector?.('[data-player="1"]') || hud, save, content);
    if (secondSave) {
        const title = hud?.querySelector?.('[data-player="2"]');
        if (title) updateHeroHealth(title, secondSave, content);
    }
    updateCheckin(hud, model);
    if (panel === 'checkin') updateCheckin(overlay, model);
}

export function showCompanionPlayReply(hud, line) {
    const dock = hud?.querySelector?.('.companion-guide');
    if (!dock) return;
    dock.querySelector('.companion-play-reply')?.remove();
    const reply = el('p', 'companion-play-reply', line);
    reply.setAttribute('role', 'status');
    dock.append(reply);
    setTimeout(() => reply.remove(), 3600);
}
