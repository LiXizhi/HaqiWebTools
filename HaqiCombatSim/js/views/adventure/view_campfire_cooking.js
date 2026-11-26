// Campfire Cooking & Fishing Trophy Album modal ("营火烹饪锅 · 钓鱼巨物图鉴").
// Follows docs/gui-style-guide.md: createCloseButton, shared .gui-tabs, no emoji,
// keyboard + touch accessible, zero direct save mutation.

import {
    CAMPFIRE_RECIPES,
    PANTRY_KEYS,
    PANTRY_NAMES,
    campfireBuffDetail,
    canCookRecipe,
} from '../../campfire_cooking_core.js';
import { fishingAlbumSummary } from '../../fishing_bounties_core.js';
import { fishWeight, fishingSpecies } from '../../adventure_fishing_records_core.js';
import { createCloseButton } from '../../ui/controls.js';
import { el, ensureStylesheet } from '../../ui/dom.js';
import { tr, fill } from '../../locale_runtime.js';

const button = (text, fn, cls = 'secondary') => {
    const b = el('button', cls, text);
    b.type = 'button';
    b.onclick = fn;
    return b;
};

const CATEGORY_LABEL = {
    meal: '战前料理',
    pet: '战宠美食',
    alchemy: '魔药炼成',
};

const SIZE_LABEL = {
    huge: '巨物',
    large: '大鱼',
    normal: '普通',
    none: '未上岸',
};

export function renderCampfireCooking(root, model, cb) {
    ensureStylesheet('campfire-cooking-style', new URL('../../../css/campfire-cooking.css', import.meta.url).href);
    const { assets } = model;
    const content = assets.content;

    root.replaceChildren();
    root.className = 'overlay visible campfire-layer';

    const modal = el('section', 'modal campfire-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', tr('营火烹饪与渔获图鉴'));

    const header = el(
        'header',
        'modal-header',
        el('h2', '', tr('营火烹饪锅 · 渔获赏金')),
        createCloseButton(cb.close, tr('关闭营火烹饪锅')),
    );
    const body = el('div', 'modal-body campfire-body');
    modal.append(header, body);
    root.append(modal);

    let activeTab = model.initialTab === 'album' ? 'album' : 'cook';
    const tabsBar = el('div', 'gui-tabs campfire-tabs');
    const host = el('div', 'campfire-host');
    body.append(tabsBar, host);

    function currentSave() {
        return cb.getSave?.() || model.save;
    }

    modal.onkeydown = event => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            cb.close?.();
        }
    };

    function paint() {
        const save = currentSave();
        const album = fishingAlbumSummary(save, content);

        tabsBar.replaceChildren();
        const cookTab = button(tr('营火烹饪锅'), () => {
            activeTab = 'cook';
            paint();
        }, '');
        cookTab.setAttribute('aria-pressed', activeTab === 'cook' ? 'true' : 'false');

        const albumLabel = album.claimableCount > 0
            ? fill('钓鱼巨物图鉴（可领 {n}）', { n: album.claimableCount }).text
            : fill('钓鱼巨物图鉴（{caught}/{total}）', { caught: album.caughtSpecies, total: album.totalSpecies }).text;
        const albumTab = button(albumLabel, () => {
            activeTab = 'album';
            paint();
        }, '');
        albumTab.setAttribute('aria-pressed', activeTab === 'album' ? 'true' : 'false');
        tabsBar.append(cookTab, albumTab);

        host.replaceChildren();
        if (activeTab === 'cook') {
            paintCook(save);
        } else {
            paintAlbum(album);
        }
    }

    function paintCook(save) {
        const activeBuff = campfireBuffDetail(save.campfireBuff);
        const statusBanner = el('div', `campfire-status-banner${activeBuff ? ' is-active' : ''}`);
        if (activeBuff) {
            statusBanner.append(
                el('strong', '', fill('当前营火料理生效中：{name}（剩余 {n} 场）', {
                    name: tr(activeBuff.name),
                    n: activeBuff.remainingBattles,
                }).text),
                el('small', '', tr(activeBuff.subtitle)),
            );
        } else {
            statusBanner.append(
                el('strong', '', tr('营火正旺，随时可以下锅')),
                el('small', '', tr('海边渔获与野外采集草药/矿石都能直接烹饪成战前增益、战宠大餐或实用符文。')),
            );
        }
        host.append(statusBanner);

        // Stock summary strip (fish + gather pantry)
        const stockBar = el('div', 'campfire-stock-strip');
        for (const id of fishingSpecies) {
            const count = save.inventory?.[id] || 0;
            const chip = el('span', `campfire-stock-chip${count > 0 ? ' has-stock' : ''}`);
            chip.textContent = `${tr(content.items?.[id]?.name || String(id))} ×${count}`;
            stockBar.append(chip);
        }
        for (const key of PANTRY_KEYS) {
            const count = save.gatherPantry?.[key] || 0;
            const chip = el('span', `campfire-stock-chip is-pantry${count > 0 ? ' has-stock' : ''}`);
            chip.textContent = `${tr(PANTRY_NAMES[key])} ×${count}`;
            stockBar.append(chip);
        }
        host.append(stockBar);

        const grid = el('div', 'campfire-recipe-grid');
        for (const recipe of CAMPFIRE_RECIPES) {
            const check = canCookRecipe(save, recipe);
            const card = el('article', `campfire-recipe-card${check.ok ? ' is-ready' : ''}`);
            const tag = el('span', `campfire-cat-tag is-${recipe.category}`, tr(CATEGORY_LABEL[recipe.category] || '料理'));
            const head = el('div', 'campfire-recipe-head', el('strong', '', tr(recipe.name)), tag);
            const sub = el('p', 'campfire-recipe-effect', tr(recipe.subtitle));
            const cost = el('p', 'campfire-recipe-cost', tr(recipe.ingredientLabel));
            const cookBtn = button(
                tr(recipe.category === 'alchemy' ? '投入炼成' : '生火烹饪'),
                () => {
                    const res = cb.cook?.(recipe.id);
                    if (res?.changed) paint();
                },
                check.ok ? 'primary small' : 'secondary small',
            );
            cookBtn.disabled = !check.ok;
            const foot = el('div', 'campfire-recipe-foot');
            if (!check.ok) {
                foot.append(el('small', 'campfire-reason', tr(check.reason)));
            } else if (check.usePantry) {
                foot.append(el('small', 'campfire-pantry-note', tr('将优先消耗采集食材')));
            } else if (check.fallbackCoins) {
                foot.append(el('small', 'campfire-pantry-note', fill('自动使用 {n} 奇豆补齐配料', { n: check.fallbackCoins }).text));
            } else if (check.fallbackFairyBeans) {
                foot.append(el('small', 'campfire-pantry-note', fill('自动使用 {n} 仙豆补齐配料', { n: check.fallbackFairyBeans }).text));
            }
            foot.append(cookBtn);
            card.append(head, sub, cost);
            if (recipe.category === 'meal' && activeBuff) {
                card.append(el('p', 'campfire-pantry-note', tr(recipe.id === save.campfireBuff.id
                    ? '重新制作会重置剩余场数，材料照常消耗。'
                    : '制作这道料理会替换当前料理，剩余场数不会保留。')));
            }
            card.append(foot);
            grid.append(card);
        }
        host.append(grid);
    }

    function paintAlbum(album) {
        host.append(
            el(
                'p',
                'campfire-album-summary',
                fill('已收录 {caught}/{total} 种海产 · 大鱼 {large} 种 · 巨物 {huge} 种（点击可领赏金立即入包）', {
                    caught: album.caughtSpecies,
                    total: album.totalSpecies,
                    large: album.largeSpecies,
                    huge: album.hugeSpecies,
                }).text,
            ),
        );

        const milestoneWrap = el('div', 'campfire-milestone-row');
        for (const m of album.milestones) {
            const card = el('article', `campfire-milestone-card${m.claimable ? ' is-claimable' : m.claimed ? ' is-claimed' : ''}`);
            const rewardText = m.rewards
                .map(r => `${tr(content.items?.[r.id]?.name || (r.id === 100 ? '奇豆' : String(r.id)))}×${r.count}`)
                .join(' · ');
            card.append(el('strong', '', tr(m.title)), el('small', '', rewardText));
            const btn = button(
                tr(m.claimed ? '已领取' : m.claimable ? '领取里程碑' : '未达成'),
                () => {
                    const res = cb.claimBounty?.(m.id);
                    if (res?.changed) paint();
                },
                m.claimable ? 'primary small' : 'secondary small',
            );
            btn.disabled = !m.claimable;
            card.append(btn);
            milestoneWrap.append(card);
        }
        host.append(milestoneWrap);

        const grid = el('div', 'campfire-species-grid');
        for (const sp of album.speciesRows) {
            const card = el('article', `campfire-species-card${sp.bestGrams > 0 ? ' is-caught' : ''}`);
            const head = el(
                'div',
                'campfire-species-head',
                el('strong', '', tr(sp.name)),
                el('span', `campfire-size-badge is-${sp.size}`, tr(SIZE_LABEL[sp.size])),
            );
            const recordText = sp.bestGrams > 0
                ? fill('个人最重：{weight} · 背包余量：{bag}', { weight: fishWeight(sp.bestGrams), bag: sp.countInBag }).text
                : tr('尚未钓获，前往任意岛屿海边抛竿吧');
            card.append(head, el('p', 'campfire-species-meta', recordText));

            const tiersEl = el('div', 'campfire-tier-list');
            for (const tier of sp.tiers) {
                const row = el('div', `campfire-tier-row${tier.claimable ? ' is-claimable' : tier.claimed ? ' is-claimed' : ''}`);
                const rewardText = tier.rewards
                    .map(r => `${tr(content.items?.[r.id]?.name || (r.id === 100 ? '奇豆' : String(r.id)))}×${r.count}`)
                    .join(' + ');
                row.append(
                    el('div', 'campfire-tier-info', el('span', '', tr(tier.label)), el('small', '', rewardText)),
                );
                const btn = button(
                    tr(tier.claimed ? '已领' : tier.claimable ? '领取' : '待达标'),
                    () => {
                        const res = cb.claimBounty?.(tier.id);
                        if (res?.changed) paint();
                    },
                    tier.claimable ? 'primary small' : 'secondary small',
                );
                btn.disabled = !tier.claimable;
                row.append(btn);
                tiersEl.append(row);
            }
            card.append(tiersEl);
            grid.append(card);
        }
        host.append(grid);
    }

    paint();
}
