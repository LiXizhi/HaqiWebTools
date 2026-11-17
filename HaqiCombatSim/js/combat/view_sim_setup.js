// combat/view_sim_setup.js — 战斗模拟器对战设置与配卡面板。
import { state, setSetting } from '../state.js';
import { SCHOOLS } from '../combat_params_core.js';
import { presetDeck, aggregateDeck, schoolCardCatalog, SCHOOL_NAMES, MODES } from '../combat_presets_core.js';
import * as U from '../combat_unit_core.js';
import { h, clear, select, numberInput, toast } from '../utils.js';
import { SPEEDS, SPEED_LABELS, EXCLUDE_CARD_RE, shortCardName } from './view_sim_disc.js';

export function createSimSetupController({ setup, deckBox, main, ds, st, teamSize, getGame, startGame, renderBattle }) {
    const capacity = () => state.params.global.deckCapacity || 0;
    const eachCapacity = () => state.params.global.deckEachCapacity || 0;
    const customDeck = (school) => (st.decks[ds.version] || {})[school] || null;

    function deckFor(school) {
        const raw = customDeck(school) || presetDeck(ds, school, { maxLevel: st.level, copies: state.params.global.deckPresetCopies });
        return U.clampDeck(aggregateDeck(raw), { capacity: capacity(), eachCapacity: eachCapacity(), cards: ds.cards, version: ds.version });
    }

    function saveDeck(school, deck) {
        st.decks[ds.version] = st.decks[ds.version] || {};
        if (deck) st.decks[ds.version][school] = deck; else delete st.decks[ds.version][school];
        setSetting('battle', st);
    }

    function renderSetup() {
        clear(setup);
        setup.appendChild(h('h2', '对战设置'));
        const teamRow = (label, arr, side) => h('div.row', h('label', label),
            ...Array.from({ length: teamSize }, (_, i) => {
                const d = deckFor(arr[i]);
                return h('span.slot',
                    select(SCHOOLS.map(s => ({ value: s, label: SCHOOL_NAMES[s] })), arr[i], (v) => { arr[i] = v; setSetting('battle', st); renderSetup(); }),
                    h('button.small-btn', { class: customDeck(arr[i]) ? 'custom' : '', title: '配卡：选择带入战斗的卡牌与份数', onClick: () => renderDeckBuilder(arr[i]) }, `配卡 ${d.total}/${capacity() || '∞'}${customDeck(arr[i]) ? ' · 自定义' : ''}`),
                    side === 'near' && st.humanSlot === i ? h('span.tag', '你') : null,
                );
            }));
        setup.appendChild(h('div.row',
            h('label', '模式 ', select(Object.keys(MODES), st.mode, (v) => { st.mode = v; setSetting('battle', st); renderBattle(clear(main)); })),
            h('label', '等级 ', numberInput(st.level, (v) => { st.level = v || 1; setSetting('battle', st); renderSetup(); }, { min: 1, max: 100 })),
            h('label', '我方操控位 ', select([{ value: -1, label: '全托管' }, ...Array.from({ length: teamSize }, (_, i) => ({ value: i, label: `${i + 1} 号位` }))], st.humanSlot, (v) => { st.humanSlot = Number(v); setSetting('battle', st); renderSetup(); })),
            h('label', 'Bot 策略 ', select([{ value: 'reasoning_easy', label: '推理 AI · 简单' }, { value: 'reasoning_normal', label: '推理 AI · 普通' }, { value: 'reasoning_advanced', label: '推理 AI · 高级' }, { value: 'reasoning_expert', label: '推理 AI · 专家' }, { value: 'deck_attacker', label: '官方 AI 卡组权重' }, { value: 'simple', label: '启发式' }, { value: 'random', label: '随机' }].filter(option => ds.version === 'kids' || !option.value.startsWith('reasoning')), st.botPolicy, (v) => { st.botPolicy = v; setSetting('battle', st); })),
            h('label', '动画 ', select(Object.keys(SPEEDS).map(k => ({ value: k, label: SPEED_LABELS[k] })), st.animSpeed, (v) => { st.animSpeed = v; setSetting('battle', st); })),
            h('label', '种子 ', h('input', { value: st.seed || '', placeholder: '留空随机', style: { width: '90px' }, onChange: (e) => { st.seed = e.target.value; setSetting('battle', st); } })),
            h('button.primary', { onClick: startGame }, getGame() ? '重新开始' : '开始战斗'),
        ));
        setup.appendChild(teamRow('我方（近端）', st.near, 'near'));
        setup.appendChild(teamRow('敌方（远端）', st.far, 'far'));
        setup.appendChild(h('div.muted.small',
            `卡包容量 ${capacity() || '不限'} 张 · 单卡上限 ${eachCapacity() || '不限'} · 未配卡时官方卡组每卡 ${state.params.global.deckPresetCopies} 份（数值面板 deckCapacity / deckEachCapacity / deckPresetCopies）。每次轮到自己时从卡包按洗牌顺序补到 ${state.params.global.handSize} 张手牌，带满不一定最好——抽不到关键牌；可标记弃牌，弃掉的牌下回合被新牌替换；卡包打空后只能跳过。`,
        ));
    }

    function renderDeckBuilder(school) {
        clear(deckBox);
        const cap = capacity(), each = eachCapacity();
        const working = new Map();
        for (const { key, count } of deckFor(school).deck) working.set(key, count);
        const catalog = schoolCardCatalog(ds, school).filter(c => c.supported && c.level <= st.level && !EXCLUDE_CARD_RE.test(c.key));
        let filter = '';
        const panel = h('div.panel.deck-builder');
        deckBox.appendChild(panel);

        const total = () => Array.from(working.values()).reduce((a, b) => a + b, 0);
        const groupCount = (key) => {
            if (ds.version !== 'teen') return working.get(key) || 0;
            const name = (ds.cards[key] || {}).spellName;
            let n = 0;
            for (const [k, c] of working) if (k === key || (name && (ds.cards[k] || {}).spellName === name)) n += c;
            return n;
        };
        const canAdd = (key) => (!cap || total() < cap) && (!each || groupCount(key) < each);

        function draw() {
            clear(panel);
            const t = total();
            panel.appendChild(h('div.row',
                h('h2', { style: { margin: 0 } }, `配卡 · ${SCHOOL_NAMES[school]}`),
                h('span.tag', { class: cap && t > cap ? 'warn' : '' }, `已配 ${t} / ${cap || '∞'}`),
                h('span.muted.small', `单卡上限 ${each || '∞'}${ds.version === 'teen' ? '（同名技能共享）' : ''} · 仅列出 Lv≤${st.level} 且引擎支持的卡`),
                h('button', { onClick: () => { working.clear(); for (const { key, count } of U.clampDeck(presetDeck(ds, school, { maxLevel: st.level, copies: state.params.global.deckPresetCopies }), { capacity: cap, eachCapacity: each, cards: ds.cards, version: ds.version }).deck) working.set(key, count); draw(); } }, `官方预设（每卡 ${state.params.global.deckPresetCopies} 份）`),
                h('button', { onClick: () => { working.clear(); draw(); } }, '清空'),
                h('button.primary', { onClick: () => { saveDeck(school, Array.from(working, ([key, count]) => ({ key, count }))); toast(`已保存 ${SCHOOL_NAMES[school]} 卡组（${total()} 张）`); clear(deckBox); renderSetup(); } }, '保存'),
                customDeck(school) ? h('button', { onClick: () => { saveDeck(school, null); toast('已恢复官方预设'); clear(deckBox); renderSetup(); } }, '恢复预设') : null,
                h('button', { onClick: () => clear(deckBox) }, '关闭'),
            ));
            const chips = h('div.deck-chips');
            const entries = Array.from(working).filter(([, c]) => c > 0).sort((a, b) => (ds.cards[a[0]].pipcost - ds.cards[b[0]].pipcost) || a[0].localeCompare(b[0]));
            if (!entries.length) chips.appendChild(h('span.muted', '卡组为空'));
            for (const [key, count] of entries) {
                const c = ds.cards[key];
                chips.appendChild(h('span.deck-chip', { class: c.spellSchool, title: `${key}\n点击 -1`, onClick: () => { working.set(key, count - 1); if (count - 1 <= 0) working.delete(key); draw(); } },
                    h('b', c.pipcost < 0 ? 'X' : c.pipcost), ` ${shortCardName(key)} `, h('i', `×${count}`)));
            }
            panel.appendChild(chips);
            panel.appendChild(h('div.row', h('input.card-search', { placeholder: '搜索卡名 / 类型', value: filter, onInput: (e) => { filter = e.target.value.trim().toLowerCase(); drawTable(); } })));
            const tableBox = h('div.cardlist.deck-list');
            panel.appendChild(tableBox);
            function drawTable() {
                clear(tableBox);
                const tbl = h('table');
                tbl.appendChild(h('tr', h('th', '卡牌'), h('th', '系'), h('th', '费'), h('th', '类型'), h('th', '命中'), h('th', '伤害≈'), h('th', 'Lv'), h('th', '份数')));
                for (const c of catalog) {
                    if (filter && !(c.key.toLowerCase().includes(filter) || c.type.toLowerCase().includes(filter))) continue;
                    const n = working.get(c.key) || 0;
                    tbl.appendChild(h('tr', { class: n ? 'in-deck' : '' },
                        h('td', { title: c.key }, shortCardName(c.key)),
                        h('td', h('span.tag', { class: ds.cards[c.key].spellSchool }, SCHOOL_NAMES[ds.cards[c.key].spellSchool] || ds.cards[c.key].spellSchool)),
                        h('td', c.pipcost < 0 ? 'X' : c.pipcost),
                        h('td.muted', c.type),
                        h('td', `${c.accuracy}%`),
                        h('td', c.dmg ? Math.round(c.dmg) : (c.heal ? '治疗' : '-')),
                        h('td', c.level),
                        h('td.count-cell',
                            h('button.small-btn', { disabled: !n, onClick: () => { working.set(c.key, n - 1); if (n - 1 <= 0) working.delete(c.key); draw(); } }, '-'),
                            h('b', String(n)),
                            h('button.small-btn', { disabled: !canAdd(c.key), onClick: () => { working.set(c.key, n + 1); draw(); } }, '+'),
                        ),
                    ));
                }
                tableBox.appendChild(tbl);
            }
            drawTable();
        }
        draw();
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    return { deckFor, renderSetup, renderDeckBuilder };
}
