// Interactive Storybook UI for the Hanzi Island Compound Forge ("字源合字坊 · 会意造字炉").
// Follows docs/gui-style-guide.md: createCloseButton, shared .gui-tabs, no emoji,
// keyboard + touch accessible, and zero state mutation in the view.

import {
    HANZI_FORGE_RADICALS,
    HANZI_FORGE_RECIPES,
    hanziForgeCount,
    hanziForgeDiscovered,
    hanziRadicalById,
    nextUndiscoveredForgeRecipe,
} from '../hanzi_forge_core.js';
import { equippedHanziSeal, hanziSealById } from '../hanzi_seal_core.js';
import { createCloseButton } from '../ui/controls.js';
import { el, ensureStylesheet } from '../ui/dom.js';
import { tr, fill } from '../locale_runtime.js';

const button = (text, fn, cls = 'secondary') => {
    const b = el('button', cls, text);
    b.type = 'button';
    b.onclick = fn;
    return b;
};

export function renderHanziForge(root, model, cb) {
    ensureStylesheet('hanzi-forge-style', new URL('../../css/hanzi-forge.css', import.meta.url).href);
    const { save } = model;

    root.replaceChildren();
    root.className = 'overlay visible hanzi-forge-layer';

    const modal = el('section', 'modal hanzi-forge-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', tr('字源合字坊'));

    const header = el(
        'header',
        'modal-header',
        el('h2', '', tr('字源合字坊 · 会意造字炉')),
        createCloseButton(cb.close, tr('关闭字源合字坊')),
    );
    const body = el('div', 'modal-body hanzi-forge-body');
    modal.append(header, body);
    root.append(modal);

    let activeTab = 'bench';
    let selectedParts = [];
    let lastOutcome = null;

    const tabsBar = el('div', 'gui-tabs hanzi-forge-tabs');
    const sealBar = el('div', 'hanzi-forge-seal-bar');
    const contentHost = el('div', 'hanzi-forge-content');
    body.append(tabsBar, sealBar, contentHost);

    function currentSave() {
        return cb.getSave?.() || save;
    }

    function equipSeal(sealId) {
        const res = cb.equipSeal?.(sealId);
        if (!res) return;
        paint();
    }

    function submitForge() {
        if (selectedParts.length < 2) {
            lastOutcome = {
                ok: false,
                message: tr('请先从下方字块盘中点选 2 至 3 枚象形字块放进砚台。'),
            };
            paint();
            return;
        }
        const res = cb.forge?.({ type: 'hanzi-forge', parts: [...selectedParts] });
        if (!res) return;
        lastOutcome = res;
        if (res.ok) {
            selectedParts = [];
        }
        paint();
    }

    modal.onkeydown = e => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            cb.close?.();
            return;
        }
        if (activeTab !== 'bench') return;
        if (e.key === 'Enter' && selectedParts.length >= 2 && document.activeElement?.tagName !== 'BUTTON') {
            e.preventDefault();
            submitForge();
        } else if (e.key === 'Backspace' && selectedParts.length > 0 && document.activeElement?.tagName !== 'INPUT') {
            e.preventDefault();
            selectedParts.pop();
            paint();
        }
    };

    function paint() {
        const liveSave = currentSave();
        const doneCount = hanziForgeCount(liveSave);
        const total = HANZI_FORGE_RECIPES.length;

        tabsBar.replaceChildren();
        const benchTab = button(tr('合字砚台'), () => {
            activeTab = 'bench';
            paint();
        }, '');
        benchTab.setAttribute('aria-pressed', activeTab === 'bench' ? 'true' : 'false');
        const codexTab = button(
            fill('造字图谱（{done} / {total}）', { done: doneCount, total }).text,
            () => {
                activeTab = 'codex';
                paint();
            },
            '',
        );
        codexTab.setAttribute('aria-pressed', activeTab === 'codex' ? 'true' : 'false');
        tabsBar.append(benchTab, codexTab);

        const activeSeal = equippedHanziSeal(liveSave);
        sealBar.replaceChildren();
        if (activeSeal) {
            const info = el(
                'div',
                'hanzi-forge-seal-info',
                el('span', 'hanzi-forge-seal-glyph', activeSeal.glyph),
                el(
                    'div',
                    '',
                    el('strong', '', fill('当前战印：{name}', { name: tr(activeSeal.name) }).text),
                    el('small', '', tr(activeSeal.effectText)),
                ),
            );
            const unequipBtn = button(tr('卸下战印'), () => equipSeal(null), 'secondary small');
            unequipBtn.disabled = !!liveSave.pendingEncounter;
            sealBar.append(info, unequipBtn);
        } else {
            sealBar.append(
                el(
                    'p',
                    'hanzi-forge-seal-empty',
                    tr('字源战印：未佩戴（造出任意会意字后，可在图谱中佩戴为战斗被动增益）'),
                ),
            );
        }

        contentHost.replaceChildren();
        if (activeTab === 'bench') {
            paintBench(liveSave, doneCount, total);
        } else {
            paintCodex(liveSave, doneCount, total);
        }
    }

    function paintBench(liveSave, doneCount, total) {
        const nextHint = nextUndiscoveredForgeRecipe(liveSave);
        contentHost.append(
            el(
                'p',
                'hanzi-forge-eyebrow',
                fill('象形合意 · 已发现 {done} / {total} 枚会意汉字（每新造 1 字获 35 奇豆与 60 经验，每满 3 字赠额外好礼）', {
                    done: doneCount,
                    total,
                }).text,
            ),
        );

        // Ink-stone combining altar
        const altar = el('div', `hanzi-forge-altar${lastOutcome?.ok ? ' is-success' : ''}`);
        const equation = el('div', 'hanzi-forge-equation');
        for (let i = 0; i < 3; i++) {
            if (i > 0) {
                equation.append(el('span', `hanzi-forge-op${i === 2 && selectedParts.length < 3 ? ' is-optional' : ''}`, '+'));
            }
            const partId = selectedParts[i];
            const radical = partId ? hanziRadicalById(partId) : null;
            const slotBtn = document.createElement('button');
            slotBtn.type = 'button';
            slotBtn.className = [
                'hanzi-forge-slot',
                radical ? 'is-filled' : 'is-empty',
                i === 2 && !radical ? 'is-optional' : '',
            ].filter(Boolean).join(' ');
            slotBtn.setAttribute(
                'aria-label',
                radical
                    ? fill('移除砚台第 {idx} 槽的「{glyph}」', { idx: i + 1, glyph: radical.glyph }).text
                    : i === 2
                        ? tr('第三槽（可选，用于三字合意）')
                        : fill('砚台第 {idx} 槽（空）', { idx: i + 1 }).text,
            );
            slotBtn.disabled = !radical;
            if (radical) {
                slotBtn.append(
                    el('strong', 'hanzi-forge-slot-glyph', radical.glyph),
                    el('small', 'hanzi-forge-slot-cue', tr(radical.cue)),
                );
                slotBtn.onclick = () => {
                    selectedParts.splice(i, 1);
                    lastOutcome = null;
                    paint();
                };
            } else {
                slotBtn.append(
                    el('strong', 'hanzi-forge-slot-glyph', i === 2 ? '选' : '空'),
                    el('small', 'hanzi-forge-slot-cue', tr(i === 2 ? '三连可选' : '点选字块')),
                );
            }
            equation.append(slotBtn);
        }

        equation.append(el('span', 'hanzi-forge-op is-arrow', '→'));

        const medallion = el(
            'div',
            `hanzi-forge-medallion${lastOutcome?.ok && lastOutcome.recipe ? ' is-revealed' : ''}`,
        );
        if (lastOutcome?.ok && lastOutcome.recipe) {
            medallion.append(
                el('span', 'hanzi-forge-medallion-pinyin', lastOutcome.recipe.pinyin),
                el('strong', 'hanzi-forge-medallion-glyph', lastOutcome.recipe.glyph),
                el('small', 'hanzi-forge-medallion-title', tr(lastOutcome.recipe.title)),
            );
        } else {
            medallion.append(
                el('strong', 'hanzi-forge-medallion-glyph is-mystery', '？'),
                el('small', 'hanzi-forge-medallion-title', tr('会意成字')),
            );
        }
        equation.append(medallion);

        const controls = el('div', 'hanzi-forge-controls');
        const forgeBtn = button(tr('以意合字'), submitForge, 'primary');
        forgeBtn.disabled = selectedParts.length < 2;
        const clearBtn = button(tr('清空砚台'), () => {
            selectedParts = [];
            lastOutcome = null;
            paint();
        }, 'secondary');
        clearBtn.disabled = selectedParts.length === 0;
        controls.append(forgeBtn, clearBtn);

        if (nextHint) {
            const clueBtn = button(tr('灵感提示'), () => {
                lastOutcome = {
                    ok: false,
                    isHint: true,
                    message: fill('图谱线索：{hint}', { hint: tr(nextHint.hint) }).text,
                };
                paint();
            }, 'text-button');
            controls.append(clueBtn);
        }

        altar.append(equation, controls);
        contentHost.append(altar);

        // Discovery / reaction feedback card
        if (lastOutcome?.message) {
            const fb = el(
                'div',
                `hanzi-forge-feedback${lastOutcome.ok ? ' is-success' : lastOutcome.isHint ? ' is-hint' : ' is-react'}`,
            );
            fb.setAttribute('role', 'status');
            fb.append(el('p', 'hanzi-forge-feedback-main', tr(lastOutcome.message)));
            if (lastOutcome.ok && lastOutcome.recipe?.words?.length) {
                const wordsLine = fill('常用词语：{words}', {
                    words: lastOutcome.recipe.words.map(w => tr(w)).join(' · '),
                }).text;
                fb.append(el('p', 'hanzi-forge-feedback-sub', wordsLine));
            }
            if (lastOutcome.ok && lastOutcome.recipe) {
                const seal = hanziSealById(lastOutcome.recipe.id);
                if (seal) {
                    const isEquipped = liveSave.hanziSeal === seal.id;
                    const sealRow = el(
                        'div',
                        'hanzi-forge-feedback-seal',
                        el('span', '', fill('字源战印「{name}」：{effect}', { name: tr(seal.name), effect: tr(seal.effectText) }).text),
                    );
                    const equipBtn = button(tr(isEquipped ? '已佩戴此战印' : '立即佩戴战印'), () => equipSeal(isEquipped ? null : seal.id), isEquipped ? 'secondary small' : 'primary small');
                    equipBtn.disabled = !!liveSave.pendingEncounter;
                    sealRow.append(equipBtn);
                    fb.append(sealRow);
                }
            }
            contentHost.append(fb);
        } else if (nextHint) {
            const starter = el('p', 'hanzi-forge-riddle-bar', fill('今日造字灵感：{hint}', { hint: tr(nextHint.hint) }).text);
            contentHost.append(starter);
        } else {
            contentHost.append(el('p', 'hanzi-forge-riddle-bar is-complete', tr('十二枚会意汉字已全部点亮！你可以随时重新组合，重温象形会意之趣。')));
        }

        // Tactile pictograph radical tray
        contentHost.append(el('p', 'hanzi-forge-tray-label', tr('点选基础象形字块放入砚台（同字可重复放入，如木+木、火+火）：')));
        const tray = el('div', 'hanzi-forge-tray');
        for (const rad of HANZI_FORGE_RADICALS) {
            const tile = document.createElement('button');
            tile.type = 'button';
            tile.className = 'hanzi-forge-radical';
            tile.disabled = selectedParts.length >= 3;
            tile.setAttribute('aria-label', `${rad.glyph}（${rad.pinyin}，${tr(rad.cue)}）`);
            tile.append(
                el('span', 'hanzi-forge-radical-pinyin', rad.pinyin),
                el('strong', 'hanzi-forge-radical-glyph', rad.glyph),
                el('small', 'hanzi-forge-radical-cue', tr(rad.cue)),
            );
            tile.onclick = () => {
                if (selectedParts.length >= 3) return;
                selectedParts.push(rad.id);
                lastOutcome = null;
                cb.onPick?.();
                paint();
            };
            tray.append(tile);
        }
        contentHost.append(tray);
    }

    function paintCodex(liveSave, doneCount, total) {
        contentHost.append(
            el(
                'p',
                'hanzi-forge-eyebrow',
                fill('已点亮 {done} / {total} 枚会意汉字 · 集齐 6 枚获「会意造字师」，集齐 12 枚获「万象造字宗师」', {
                    done: doneCount,
                    total,
                }).text,
            ),
        );
        const grid = el('div', 'hanzi-forge-codex');
        for (const recipe of HANZI_FORGE_RECIPES) {
            const discovered = hanziForgeDiscovered(liveSave, recipe);
            const card = el('article', `hanzi-forge-card${discovered ? ' is-discovered' : ''}`);
            if (discovered) {
                const formula = recipe.parts.map(id => hanziRadicalById(id)?.glyph || id).join(' + ');
                const seal = hanziSealById(recipe.id);
                const isEquipped = liveSave.hanziSeal === recipe.id;
                card.append(
                    el('div', 'hanzi-forge-card-head',
                        el('strong', 'hanzi-forge-card-glyph', recipe.glyph),
                        el('div', 'hanzi-forge-card-meta',
                            el('span', 'hanzi-forge-card-pinyin', `${recipe.pinyin} · ${tr(recipe.title)}`),
                            el('span', 'hanzi-forge-card-formula', `${formula} → ${recipe.glyph}`),
                        ),
                    ),
                    el('p', 'hanzi-forge-card-story', tr(recipe.story)),
                    el('p', 'hanzi-forge-card-words', recipe.words.map(w => tr(w)).join(' · ')),
                );
                if (seal) {
                    const sealFooter = el(
                        'div',
                        'hanzi-forge-card-seal',
                        el('small', '', tr(seal.effectText)),
                    );
                    const btn = button(tr(isEquipped ? '卸下战印' : '佩戴战印'), () => equipSeal(isEquipped ? null : seal.id), isEquipped ? 'primary small' : 'secondary small');
                    btn.disabled = !!liveSave.pendingEncounter;
                    sealFooter.append(btn);
                    card.append(sealFooter);
                }
            } else {
                const slotCountText = fill('{n} 枚字块合成', { n: recipe.parts.length }).text;
                const tryBtn = button(tr('放入首枚字块去试试'), () => {
                    selectedParts = [recipe.parts[0]];
                    lastOutcome = {
                        ok: false,
                        isHint: true,
                        message: fill('已放入首枚字块，对照线索试试：{hint}', { hint: tr(recipe.hint) }).text,
                    };
                    activeTab = 'bench';
                    paint();
                }, 'text-button');
                card.append(
                    el('div', 'hanzi-forge-card-head',
                        el('strong', 'hanzi-forge-card-glyph is-locked', '？'),
                        el('div', 'hanzi-forge-card-meta',
                            el('span', 'hanzi-forge-card-pinyin', tr('待发现会意字')),
                            el('span', 'hanzi-forge-card-formula', slotCountText),
                        ),
                    ),
                    el('p', 'hanzi-forge-card-story', tr(recipe.hint)),
                    tryBtn,
                );
            }
            grid.append(card);
        }
        contentHost.append(grid);
    }

    paint();
}
