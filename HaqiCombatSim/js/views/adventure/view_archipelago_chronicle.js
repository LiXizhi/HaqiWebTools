// Unified Archipelago Chronicle modal ("群岛行纪 · 每日悬赏 / 三岛风物小摊 / 双界时光 / 荣誉称号墙").
// Follows docs/gui-style-guide.md: createCloseButton, shared .gui-tabs, no emoji,
// keyboard + touch accessible, zero direct save mutation.

import { dailyBountySummary } from '../../daily_bounties_core.js';
import { TRILOGY_ISLAND_IDS, TRILOGY_ISLANDS, trilogyIslandSummary } from '../../trilogy_curios_core.js';
import { earthTimeMilestoneSummary } from '../../earth_time_rewards_core.js';
import { adventureHonors, activeAdventureHonor } from '../../adventure_honors_core.js';
import { createCloseButton } from '../../ui/controls.js';
import { el, ensureStylesheet } from '../../ui/dom.js';
import { tr, fill } from '../../locale_runtime.js';

const button = (text, fn, cls = 'secondary') => {
    const b = el('button', cls, text);
    b.type = 'button';
    b.onclick = fn;
    return b;
};

export function renderArchipelagoChronicle(root, model, cb) {
    if (typeof document?.getElementById === 'function') {
        ensureStylesheet('archipelago-chronicle-style', new URL('../../../css/archipelago-chronicle.css', import.meta.url).href);
    }
    const { assets } = model;
    const content = assets.content;

    root.replaceChildren();
    root.className = 'overlay visible chronicle-layer';

    const modal = el('section', 'modal chronicle-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', tr('群岛行纪'));

    const header = el(
        'header',
        'modal-header',
        el('h2', '', tr('群岛行纪 · 悬赏、小摊与荣誉')),
        createCloseButton(cb.close, tr('关闭群岛行纪')),
    );
    const body = el('div', 'modal-body chronicle-body');
    modal.append(header, body);
    root.append(modal);

    const initZone = TRILOGY_ISLAND_IDS.includes(model.initialIslandId)
        ? model.initialIslandId
        : TRILOGY_ISLAND_IDS.includes(model.save?.zone)
            ? model.save.zone
            : 'tide';
    let activeTab = ['daily', 'trilogy', 'earth', 'honors'].includes(model.initialTab)
        ? model.initialTab
        : TRILOGY_ISLAND_IDS.includes(model.save?.zone)
            ? 'trilogy'
            : 'daily';
    let selectedIsland = initZone;

    const tabsBar = el('div', 'gui-tabs chronicle-tabs');
    const host = el('div', 'chronicle-host');
    body.append(tabsBar, host);

    function currentSave() {
        return cb.getSave?.() || model.save;
    }

    function rewardText(rows) {
        return (rows || [])
            .map(r => `${tr(content.items?.[r.id]?.name || (r.id === 100 ? '奇豆' : String(r.id)))}×${r.count}`)
            .join(' + ');
    }

    modal.onkeydown = event => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            cb.close?.();
        }
    };

    function paint() {
        const save = currentSave();
        const now = model.now ?? Date.now();
        const daily = dailyBountySummary(save, content, now);
        const earth = earthTimeMilestoneSummary(save, content);
        const honors = adventureHonors(save);

        tabsBar.replaceChildren();
        const tabDefs = [
            ['daily', daily.claimableCount > 0 ? fill('每日悬赏（可领 {n}）', { n: daily.claimableCount }).text : tr('每日悬赏')],
            ['trilogy', tr('后三岛风物与小摊')],
            ['earth', earth.claimableCount > 0 ? fill('双界时光（可领 {n}）', { n: earth.claimableCount }).text : tr('双界时光')],
            ['honors', fill('荣誉称号（{done}/{total}）', { done: honors.filter(h => h.earned).length, total: honors.length }).text],
        ];
        for (const [id, label] of tabDefs) {
            const tab = button(label, () => {
                activeTab = id;
                paint();
            }, '');
            tab.setAttribute('aria-pressed', activeTab === id ? 'true' : 'false');
            tabsBar.append(tab);
        }

        host.replaceChildren();
        if (activeTab === 'daily') paintDaily(save, daily);
        else if (activeTab === 'trilogy') paintTrilogy(save, now);
        else if (activeTab === 'earth') paintEarth(save, earth);
        else paintHonors(save, honors);
    }

    function paintDaily(save, daily) {
        const banner = el('div', `chronicle-banner${daily.bonusClaimable ? ' is-highlight' : ''}`);
        banner.append(
            el('strong', '', fill('今日群岛悬赏（{day}）· 已达标 {done} / 3', { day: daily.day, done: daily.completedCount }).text),
            el('small', '', fill('完成全部 3 项可领总赏：{rewards}', { rewards: rewardText(daily.bonusRewards) }).text),
        );
        const bonusBtn = button(
            tr(daily.bonusClaimed ? '今日总赏已领' : daily.bonusClaimable ? '领取今日总赏' : '待完成 3 项'),
            () => {
                const res = cb.claimDaily?.('bonus');
                if (res?.changed) paint();
            },
            daily.bonusClaimable ? 'primary small' : 'secondary small',
        );
        bonusBtn.disabled = !daily.bonusClaimable || !!save.pendingEncounter;
        banner.append(bonusBtn);
        host.append(banner);

        const list = el('div', 'chronicle-grid');
        for (const task of daily.tasks) {
            const card = el('article', `chronicle-card${task.claimable ? ' is-ready' : task.claimed ? ' is-done' : ''}`);
            card.append(
                el('div', 'chronicle-card-head', el('strong', '', tr(task.title)), el('span', 'chronicle-pill', `${task.value} / ${task.goal}`)),
                el('p', 'chronicle-desc', tr(task.desc)),
                el('small', 'chronicle-reward', fill('奖励：{rewards}', { rewards: rewardText(task.rewards) }).text),
            );
            const btn = button(
                tr(task.claimed ? '已领取' : task.claimable ? '领取悬赏' : '进行中'),
                () => {
                    const res = cb.claimDaily?.(task.id);
                    if (res?.changed) paint();
                },
                task.claimable ? 'primary small' : 'secondary small',
            );
            btn.disabled = !task.claimable || !!save.pendingEncounter;
            card.append(btn);
            list.append(card);
        }
        host.append(list);
    }

    function paintTrilogy(save, now) {
        const subTabs = el('div', 'chronicle-subtabs');
        for (const id of TRILOGY_ISLAND_IDS) {
            const btn = button(tr(TRILOGY_ISLANDS[id].name), () => {
                selectedIsland = id;
                paint();
            }, selectedIsland === id ? 'primary small' : 'secondary small');
            btn.setAttribute('aria-pressed', selectedIsland === id ? 'true' : 'false');
            subTabs.append(btn);
        }
        host.append(subTabs);

        const info = trilogyIslandSummary(save, content, selectedIsland, now);
        if (!info) return;

        // Daily local exploration activity
        const actBanner = el('div', 'chronicle-banner');
        actBanner.append(
            el('strong', '', fill('{island} · {title}（今日余 {n} 次）', {
                island: tr(info.name),
                title: tr(info.activityTitle),
                n: info.dailyRemaining,
            }).text),
            el('small', '', tr(info.activitySummary)),
        );
        const actBtn = button(
            tr(info.dailyRemaining > 0 ? '立即探索一次' : '今日次数已满'),
            () => {
                const res = cb.trilogyDaily?.(selectedIsland);
                if (res?.changed) paint();
            },
            info.dailyRemaining > 0 ? 'primary small' : 'secondary small',
        );
        actBtn.disabled = info.dailyRemaining <= 0 || !!save.pendingEncounter;
        actBanner.append(actBtn);
        host.append(actBanner);

        // 3 bespoke curios
        host.append(el('h3', 'chronicle-section-title', fill('{island}隐藏风物与彩蛋（{done}/3）', { island: tr(info.name), done: info.discoveredCount }).text));
        const curioGrid = el('div', 'chronicle-grid');
        for (const c of info.curios) {
            const card = el('article', `chronicle-card${c.discovered ? ' is-done' : ' is-ready'}`);
            card.append(
                el('div', 'chronicle-card-head', el('strong', '', tr(c.title)), el('span', 'chronicle-pill', tr(c.landmark))),
                el('p', 'chronicle-desc', tr(c.story)),
                el('small', 'chronicle-reward', fill('首探奖励：{rewards}', { rewards: rewardText(c.rewards) }).text),
            );
            const btn = button(
                tr(c.discovered ? '已收录' : '勘察并收下发现'),
                () => {
                    const res = cb.trilogyCurio?.(c.id);
                    if (res?.changed) paint();
                },
                c.discovered ? 'secondary small' : 'primary small',
            );
            btn.disabled = c.discovered || !!save.pendingEncounter;
            card.append(btn);
            curioGrid.append(card);
        }
        host.append(curioGrid);

        // Local thematic supply stall
        host.append(
            el(
                'h3',
                'chronicle-section-title',
                fill('{stall} · 拥有奇豆 {beans} / 仙豆 {fairy}', {
                    stall: tr(info.stallName),
                    beans: save.inventory?.[100] || 0,
                    fairy: save.inventory?.[17213] || 0,
                }).text,
            ),
        );
        const stallGrid = el('div', 'chronicle-grid');
        for (const offer of info.offers) {
            const costParts = [];
            if (offer.costBeans > 0) costParts.push(`${offer.costBeans} ${tr('奇豆')}`);
            if (offer.costFairy > 0) costParts.push(`${offer.costFairy} ${tr('仙豆')}`);
            const card = el('article', `chronicle-card${offer.canAfford ? ' is-ready' : ''}`);
            card.append(
                el('strong', '', `${tr(offer.itemName)} ×${offer.count}`),
                el('small', 'chronicle-reward', fill('兑换消耗：{cost}', { cost: costParts.join(' + ') }).text),
            );
            const buyBtn = button(
                tr(offer.canAfford ? '立即兑换' : '材料不足'),
                () => {
                    const res = cb.trilogyBuy?.(offer.id);
                    if (res?.changed) paint();
                },
                offer.canAfford ? 'primary small' : 'secondary small',
            );
            buyBtn.disabled = !offer.canAfford || !!save.pendingEncounter;
            card.append(buyBtn);
            stallGrid.append(card);
        }
        host.append(stallGrid);
    }

    function paintEarth(save, earth) {
        const banner = el('div', 'chronicle-banner');
        banner.append(
            el(
                'strong',
                '',
                fill('双界时光探索进度：时光线索 {clues} · 旅人故事 {stories} · 深圳街区挑战 {clears}', {
                    clues: earth.stats.timeScrollClues,
                    stories: earth.stats.timeScrollStories,
                    clears: earth.stats.cityDungeonClears,
                }).text,
            ),
            el('small', '', tr('在现实世界深圳打开「时光长卷」探索历史线索与旅人对话，或完成街区挑战，即可在此领取冒险赏金。')),
        );
        if (cb.openEarthMap) {
            banner.append(button(tr('查看现实世界地图'), () => cb.openEarthMap(), 'secondary small'));
        }
        host.append(banner);

        const grid = el('div', 'chronicle-grid');
        for (const row of earth.rows) {
            const card = el('article', `chronicle-card${row.claimable ? ' is-ready' : row.claimed ? ' is-done' : ''}`);
            card.append(
                el('strong', '', tr(row.title)),
                el('p', 'chronicle-desc', tr(row.hint)),
                el('small', 'chronicle-reward', fill('赏金：{rewards}', { rewards: rewardText(row.rewards) }).text),
            );
            const btn = button(
                tr(row.claimed ? '已领取' : row.claimable ? '领取赏金' : '待达成'),
                () => {
                    const res = cb.claimEarthTime?.(row.id);
                    if (res?.changed) paint();
                },
                row.claimable ? 'primary small' : 'secondary small',
            );
            btn.disabled = !row.claimable || !!save.pendingEncounter;
            card.append(btn);
            grid.append(card);
        }
        host.append(grid);
    }

    function paintHonors(save, honors) {
        const active = activeAdventureHonor(save);
        const banner = el('div', 'chronicle-banner');
        banner.append(
            el('strong', '', active ? fill('当前展示荣誉：{title}', { title: tr(active.title) }).text : tr('尚未解锁荣誉称号')),
            el('small', '', tr('所有已获得的岛屿、副本、钓鱼、烹饪与造字荣誉都可以自由选择佩戴展示。')),
        );
        if (save.equippedHonor || save.tacticsChallenges?.equipped) {
            const resetBtn = button(tr('恢复随进度展示'), () => {
                const res = cb.equipHonor?.(null);
                if (res?.changed) paint();
            }, 'secondary small');
            resetBtn.disabled = !!save.pendingEncounter;
            banner.append(resetBtn);
        }
        host.append(banner);

        const sorted = [...honors].sort((a, b) => Number(b.earned) - Number(a.earned));
        const grid = el('div', 'chronicle-grid');
        for (const row of sorted) {
            const isEquipped = active?.id === row.id && (save.equippedHonor === row.id || (!save.equippedHonor && row.id === `tactical:${save.tacticsChallenges?.equipped}`));
            const card = el('article', `chronicle-card${row.earned ? (isEquipped ? ' is-equipped' : ' is-ready') : ' is-locked'}`);
            card.append(
                el('div', 'chronicle-card-head', el('strong', '', tr(row.title)), el('span', 'chronicle-pill', tr(row.earned ? (isEquipped ? '佩戴中' : '已获得') : '待解锁'))),
                el('p', 'chronicle-desc', tr(row.source)),
            );
            if (row.earned) {
                const wearBtn = button(
                    tr(isEquipped ? '已佩戴' : '佩戴此荣誉'),
                    () => {
                        const res = cb.equipHonor?.(row.id);
                        if (res?.changed) paint();
                    },
                    isEquipped ? 'secondary small' : 'primary small',
                );
                wearBtn.disabled = isEquipped || !!save.pendingEncounter;
                card.append(wearBtn);
            }
            grid.append(card);
        }
        host.append(grid);
    }

    paint();
}
