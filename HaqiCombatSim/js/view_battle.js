// view_battle.js — 2D 人机对战页（只渲染；战斗逻辑全部在 combat_*_core）。
// 组成：对战设置（含配卡）→ 决斗圆盘（SVG：两队站位 + 中央出牌演示 + buff/debuff 徽标）→ 手牌 / 弃牌 / 卡包计数 → 状态明细 → 日志。
import { state, setSetting } from './state.js';
import { resolveParams, SCHOOLS } from './combat_params_core.js';
import { createArena, startCombat, playTurn, actingUnits, castableCards, validTargets, snapshot } from './combat_arena_core.js';
import { createPolicy } from './combat_policy_core.js';
import { unitSpec, presetDeck, aggregateDeck, schoolCardCatalog, SCHOOL_NAMES, SCHOOL_COLORS, MODES, defaultLevel } from './combat_presets_core.js';
import { cardTargetKind, expectedBaseDamage, expectedBaseHeal, isSupportedType } from './combat_cards_core.js';
import * as U from './combat_unit_core.js';
import { h, svg, clear, select, numberInput, toast } from './utils.js';
import { skillCardPreview } from './skill_card_preview.js';

/** 动画速度倍率（0 = 不播放动画） */
const SPEEDS = { slow: 1.8, normal: 1, fast: 0.45, off: 0 };
const SPEED_LABELS = { slow: '慢', normal: '正常', fast: '快', off: '无动画' };
const EXCLUDE_CARD_RE = /Pet|Rune|Crazy|VIP|1000Accuracy|Deleted|_adv$/i;

// 圆盘几何（viewBox 760 × 500）
const VB = { w: 760, h: 500 };
const DISC = { cx: 380, cy: 250, rx: 300, ry: 130 };

/** 全场光环文字：伤害 / 治疗 / 强力能量 三类各自独立（Life_LifeGlobalAura 带 school 但只加治疗） */
function auraLabel(a) {
    const parts = [];
    if (a.boostDamage) parts.push(`${a.boostSchool ? SCHOOL_NAMES[a.boostSchool] || a.boostSchool : '全部'}伤害+${a.boostDamage}%`);
    if (a.boostHeal) parts.push(`治疗+${a.boostHeal}%`);
    if (a.boostPowerPip) parts.push(`强力能量+${a.boostPowerPip}%`);
    return parts.join(' ') || a.cardKey || '—';
}

function shortCardName(key) {
    return (key || '').replace(/^[A-Za-z]+_/, '');
}

/** "烈火专注：+60%烈火攻击" → "烈火专注" */
function shortEffect(desc, fallback) {
    if (!desc) return fallback;
    const m = desc.split(/[：:]/);
    return (m[0] || fallback).slice(0, 8);
}

function isPositive(x) {
    return x.positive === true || x.positive === 'true';
}

/**
 * 单位状态徽标列表（buff / debuff / DOT / HOT / 姿态 / 眩晕 …）
 * @return [{cls, short, full}]
 */
function unitEffects(u, R) {
    const out = [];
    for (const c of u.charms) out.push({ cls: isPositive(c) ? 'pos' : 'neg', short: shortEffect(c.desc, `charm${c.id}`), full: `[charm] ${c.desc || '#' + c.id}` });
    for (const w of u.wards) {
        if (w.pts) out.push({ cls: 'pos', short: `吸收${w.pts}`, full: `[ward] 吸收 ${w.pts} 点伤害` });
        else out.push({ cls: isPositive(w) ? 'pos' : 'neg', short: shortEffect(w.desc, `ward${w.id}`), full: `[ward] ${w.desc || '#' + w.id}` });
    }
    for (const s of u.standingWards) {
        const t = R.wards[s.id] || {};
        out.push({ cls: isPositive(t) ? 'pos' : 'neg', short: `${shortEffect(t.desc, '持续' + s.id)}(${s.rounds})`, full: `[持续 ward] ${t.desc || '#' + s.id}，剩余 ${s.rounds} 回合` });
    }
    for (const d of u.dotList || []) out.push({ cls: 'dot', short: `DOT ${d.ticks.length}回`, full: `[持续伤害] ${shortCardName(d.cardKey)}：${d.ticks.join(' / ')}（${SCHOOL_NAMES[d.school] || d.school}）` });
    for (const d of u.hotList || []) out.push({ cls: 'hot', short: `HOT ${d.ticks.length}回`, full: `[持续治疗] ${shortCardName(d.cardKey)}：${d.ticks.join(' / ')}` });
    if (u.stance) out.push({ cls: 'neutral', short: `姿态(${u.stance.rounds})`, full: `[姿态] ${u.stance.name}，剩余 ${u.stance.rounds} 回合` });
    if (u.miniaura) out.push({ cls: 'pos', short: `${shortEffect(u.miniaura.desc, '小光环')}(${u.miniaura.rounds})`, full: `[小光环] ${u.miniaura.desc || '#' + u.miniaura.id}，剩余 ${u.miniaura.rounds} 回合` });
    if (u.stunned) out.push({ cls: 'neg', short: '眩晕', full: '[眩晕] 下次行动跳过' });
    return out;
}

let game = null;

function unitName(arena, id) {
    const u = arena.unitsById[id];
    return u ? u.name : id;
}

function describeEvent(arena, ev) {
    const R = arena.resolved;
    const n = (id) => unitName(arena, id);
    const card = (k) => shortCardName(k);
    switch (ev.type) {
        case 'combat_start': return { cls: 'turn', text: `战斗开始（${ev.firstSide === 'near' ? '我方' : '敌方'}先手）` };
        case 'turn_begin': return { cls: 'turn', text: `—— 第 ${Math.ceil(ev.turn / 2)} 回合 · ${ev.side === 'near' ? '我方' : '敌方'}行动（剩余 ${ev.remainingRounds}）——` };
        case 'pip': return { cls: 'info', text: `${n(ev.unit)} 获得${ev.kind === 'power' ? (R.version === 'teen' ? '强力判定（+2 魔力点）' : '超级魔力点') : '魔力点'} → 魔力 ${ev.pips.normal}${R.version === 'teen' ? '' : ` · 超级 ${ev.pips.power}`}（可用 ${ev.pips.normal + ev.pips.power * 2}）` };
        case 'cast': return { cls: '', text: `${n(ev.caster)} 使用 ${card(ev.card)}${ev.target && ev.target !== ev.caster ? ' → ' + n(ev.target) : ''}（${ev.pipcost < 0 ? 'X=' + ev.realcost : ev.pipcost}费）` };
        case 'fizzle': return { cls: 'info', text: `${n(ev.caster)} 施放 ${card(ev.card)} 失误（命中 ${ev.accuracy}%）` };
        case 'damage': return { cls: 'dmg', text: `  ${n(ev.target)} 受到 ${ev.amount} ${SCHOOL_NAMES[ev.school] || ev.school}伤害${ev.mark === 'c' ? '（暴击）' : ev.mark === 'd' ? '（闪避）' : ''}${ev.label ? ' [' + ev.label + ']' : ''}` };
        case 'dot': return { cls: 'dmg', text: `  ${n(ev.target)} 持续伤害 ${ev.amount}${ev.mark === 'c' ? '（暴击）' : ''}` };
        case 'heal': return { cls: 'heal', text: `  ${n(ev.target)} 恢复 ${ev.amount}${ev.label ? ' [' + ev.label + ']' : ''}` };
        case 'hot': return { cls: 'heal', text: `  ${n(ev.target)} 持续治疗 ${ev.amount}` };
        case 'dot_applied': return { cls: 'info', text: `  ${n(ev.target)} 被附加 ${ev.ticks} 回合持续伤害` };
        case 'hot_applied': return { cls: 'info', text: `  ${n(ev.target)} 被附加 ${ev.ticks} 回合持续治疗` };
        case 'charm': return { cls: 'info', text: `  ${n(ev.target)} 获得 charm ${ev.ids.map(id => (R.charms[id] || {}).desc || id).join(', ')}` };
        case 'ward': return { cls: 'info', text: `  ${n(ev.target)} 获得 ward ${ev.ids.map(id => (R.wards[id] || {}).desc || id).join(', ')}` };
        case 'standing_ward': return { cls: 'info', text: `  ${n(ev.target)} 获得持续 ward（${ev.rounds} 回合）` };
        case 'absorb': return { cls: 'info', text: `  ${n(ev.target)} 获得 ${ev.amount} 点吸收${ev.label ? ' ' + ev.label : ''}` };
        case 'aura': return { cls: 'info', text: `  全场光环：${auraLabel(ev.aura)}` };
        case 'aura2': return { cls: 'info', text: `  全场属性光环 #${ev.id}` };
        case 'miniaura': return { cls: 'info', text: `  ${n(ev.caster)} 小光环 #${ev.id}（${ev.rounds} 回合）` };
        case 'stance': return { cls: 'info', text: `  ${n(ev.caster)} 进入姿态 ${ev.stance}（${ev.rounds} 回合）` };
        case 'stun': return { cls: 'info', text: `  ${n(ev.target)} 被眩晕` };
        case 'stun_absorbed': return { cls: 'info', text: `  ${n(ev.target)} 免疫眩晕` };
        case 'pips': return { cls: 'info', text: `  ${n(ev.target)} 能量 +${ev.amount}` };
        case 'cleanse': return { cls: 'info', text: `  ${n(ev.target)} 净化` };
        case 'remove_charm': case 'remove_ward': case 'steal_charm': case 'steal_ward': return { cls: 'info', text: `  ${n(ev.caster)} ${ev.type.startsWith('steal') ? '偷取' : '移除'} ${n(ev.target)} 的 #${ev.id}` };
        case 'pass': return { cls: 'info', text: `${n(ev.caster)} 跳过${{ stunned: '（眩晕）', invalid_pick: '（无效出牌）', deck_empty: '（卡包已打空）', no_cards: '（无手牌）', no_target: '（无目标）' }[ev.reason] || ''}` };
        case 'unsupported': return { cls: 'info', text: `${n(ev.caster)} 的 ${card(ev.card)}（${ev.cardType}）未支持，按跳过处理` };
        case 'turn_end': return null;
        case 'combat_end': return { cls: 'end', text: ev.decksExhausted ? '双方卡包全部打空，判平局' : ev.timeout ? '回合耗尽，平局' : ev.winner ? `${ev.winner === 'near' ? '我方' : '敌方'}胜利！` : '同归于尽，平局' };
        default: return { cls: 'info', text: JSON.stringify(ev) };
    }
}

// ---------------------------------------------------------------------------
// 圆盘几何
// ---------------------------------------------------------------------------

function unitPos(side, slot, count) {
    const step = count >= 4 ? 0.5 : count === 3 ? 0.6 : 0.7;
    const off = (slot - (count - 1) / 2) * step;
    const x = DISC.cx + DISC.rx * Math.sin(off);
    const y = side === 'far' ? DISC.cy - DISC.ry * Math.cos(off) : DISC.cy + DISC.ry * Math.cos(off);
    return { x, y };
}

function textWidth(s) {
    let w = 0;
    for (const ch of s) w += /[\u2e80-\uffff]/.test(ch) ? 10 : 6;
    return w;
}

// ---------------------------------------------------------------------------
// 事件 → 动画步骤
// ---------------------------------------------------------------------------

/**
 * 把一次 playTurn 产生的事件切成演示步骤：
 *  tick（行动前 DOT/HOT）→ cast/fizzle/pass（中央出牌 + 箭头 + 目标飘字）→ turn（换边、能量）→ end
 */
function buildSteps(events) {
    const steps = [];
    let cur = null;
    const push = (kind, ev, dur) => { cur = { kind, ev, effects: [], dur }; steps.push(cur); return cur; };
    for (const ev of events) {
        switch (ev.type) {
            case 'combat_start': push('misc', ev, 300); break;
            case 'pip':
                if (!cur || cur.kind !== 'turn' || cur.ev) push('turn', null, 450);
                cur.effects.push(ev); break;
            case 'turn_begin':
                if (cur && cur.kind === 'turn' && !cur.ev) cur.ev = ev; else push('turn', ev, 450);
                break;
            case 'cast': push('cast', ev, 1150); break;
            case 'fizzle': push('fizzle', ev, 800); break;
            case 'pass': case 'unsupported': push('pass', ev, 500); break;
            case 'dot': case 'hot':
                if (!cur || cur.kind !== 'tick') push('tick', ev, 750);
                cur.effects.push(ev); break;
            case 'combat_end': push('end', ev, 700); break;
            case 'turn_end': if (cur) cur.effects.push(ev); break;
            default:
                if (!cur) push('misc', null, 300);
                cur.effects.push(ev);
        }
    }
    return steps;
}

// ---------------------------------------------------------------------------

export function renderBattle(main) {
    const ds = state.dataset;
    const st = state.settings.battle;
    if (!st.level) st.level = defaultLevel(ds.version);
    if (!st.decks) st.decks = {};
    if (!st.animSpeed || !(st.animSpeed in SPEEDS)) st.animSpeed = 'normal';
    const teamSize = MODES[st.mode] || 1;
    while (st.near.length < teamSize) st.near.push(SCHOOLS[st.near.length % SCHOOLS.length]);
    while (st.far.length < teamSize) st.far.push(SCHOOLS[(st.far.length + 1) % SCHOOLS.length]);

    const setup = h('div.panel');
    const deckBox = h('div');
    const arenaBox = h('div');
    main.appendChild(setup);
    main.appendChild(deckBox);
    main.appendChild(arenaBox);

    // ---- 卡组（配卡）----
    const capacity = () => state.params.global.deckCapacity || 0;
    const eachCapacity = () => state.params.global.deckEachCapacity || 0;
    const customDeck = (school) => (st.decks[ds.version] || {})[school] || null;
    /** 该系将实际带入战斗的卡组（自定义优先，否则官方预设），已按容量裁剪 */
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
            h('label', 'Bot 策略 ', select([{ value: 'deck_attacker', label: '官方 AI 卡组权重' }, { value: 'simple', label: '启发式' }, { value: 'random', label: '随机' }], st.botPolicy, (v) => { st.botPolicy = v; setSetting('battle', st); })),
            h('label', '动画 ', select(Object.keys(SPEEDS).map(k => ({ value: k, label: SPEED_LABELS[k] })), st.animSpeed, (v) => { st.animSpeed = v; setSetting('battle', st); })),
            h('label', '种子 ', h('input', { value: st.seed || '', placeholder: '留空随机', style: { width: '90px' }, onChange: (e) => { st.seed = e.target.value; setSetting('battle', st); } })),
            h('button.primary', { onClick: startGame }, game ? '重新开始' : '开始战斗'),
        ));
        setup.appendChild(teamRow('我方（近端）', st.near, 'near'));
        setup.appendChild(teamRow('敌方（远端）', st.far, 'far'));
        setup.appendChild(h('div.muted.small',
            `卡包容量 ${capacity() || '不限'} 张 · 单卡上限 ${eachCapacity() || '不限'} · 未配卡时官方卡组每卡 ${state.params.global.deckPresetCopies} 份（数值面板 deckCapacity / deckEachCapacity / deckPresetCopies）。每次轮到自己时从卡包按洗牌顺序补到 ${state.params.global.handSize} 张手牌，带满不一定最好——抽不到关键牌；可标记弃牌，弃掉的牌下回合被新牌替换；卡包打空后只能跳过。`,
        ));
    }

    // ---- 配卡面板 ----
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
            // teen 同 spellName 共享单卡上限（arena_server.lua L8119）
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
            // 当前卡组
            const chips = h('div.deck-chips');
            const entries = Array.from(working).filter(([, c]) => c > 0).sort((a, b) => (ds.cards[a[0]].pipcost - ds.cards[b[0]].pipcost) || a[0].localeCompare(b[0]));
            if (!entries.length) chips.appendChild(h('span.muted', '卡组为空'));
            for (const [key, count] of entries) {
                const c = ds.cards[key];
                chips.appendChild(h('span.deck-chip', { class: c.spellSchool, title: `${key}\n点击 -1`, onClick: () => { working.set(key, count - 1); if (count - 1 <= 0) working.delete(key); draw(); } },
                    h('b', c.pipcost < 0 ? 'X' : c.pipcost), ` ${shortCardName(key)} `, h('i', `×${count}`)));
            }
            panel.appendChild(chips);
            // 卡表
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

    // ---- 开局 ----
    function startGame() {
        if (game && game.timer) { clearTimeout(game.timer); game.timer = null; }
        const resolved = resolveParams(ds, state.params);
        const mk = (school, side, i) => {
            const isHuman = side === 'near' && st.humanSlot === i;
            const spec = unitSpec(ds, school, {
                level: st.level, policy: isHuman ? 'human' : st.botPolicy,
                deck: deckFor(school).deck,
                name: `${SCHOOL_NAMES[school]}${side === 'near' ? '·我方' : '·敌方'}${teamSize > 1 ? i + 1 : ''}`,
            });
            spec.policyName = isHuman ? 'human' : st.botPolicy;
            return spec;
        };
        const near = st.near.slice(0, teamSize).map((s, i) => mk(s, 'near', i));
        const far = st.far.slice(0, teamSize).map((s, i) => mk(s, 'far', i));
        const seed = st.seed ? (Number.isNaN(Number(st.seed)) ? st.seed : Number(st.seed)) : (Date.now() % 1000000007);
        const logEl = h('div.log');
        const pending = [];
        const arena = createArena({ resolved, near, far, seed, keepEvents: false, onEvent: (ev) => { pending.push(ev); } });
        for (const u of [...arena.sides.near, ...arena.sides.far]) {
            const spec = u.side === 'near' ? near[u.slot] : far[u.slot];
            u.policy = createPolicy(spec.policyName);
        }
        game = { arena, logEl, pending, selected: null, discards: new Set(), discardMode: false, auto: false, busy: false, seed, anim: null, timer: null, ui: null };
        game.ui = { renderArena, proceed, animateTurn };
        clear(deckBox);
        const pre = snapshot(arena);
        startCombat(arena);
        renderSetup();
        animateTurn(pre, pending.splice(0), () => game.ui.proceed());
    }

    function appendLog(ev) {
        const d = describeEvent(game.arena, ev);
        if (d) game.logEl.appendChild(h('div', { class: d.cls }, d.text));
        game.logEl.scrollTop = game.logEl.scrollHeight;
    }

    /**
     * 按步骤播放事件：显示模型从 pre 快照出发，按 damage/heal 事件逐步扣血/回血；
     * 每步渲染圆盘（中央卡牌 + 施法者→目标箭头 + 飘字），播完后回到真实快照。
     */
    function animateTurn(pre, events, done) {
        const speed = SPEEDS[st.animSpeed] ?? 1;
        const steps = buildSteps(events);
        const hp = {};
        for (const u of [...pre.near, ...pre.far]) hp[u.id] = u.hp;
        const meta = { side: pre.currentSide, turn: pre.turn, remaining: pre.remainingRounds };
        const applyEffects = (list) => {
            for (const ev of list) {
                if ((ev.type === 'damage' || ev.type === 'dot') && hp[ev.target] !== undefined) hp[ev.target] = Math.max(0, hp[ev.target] - ev.amount);
                if ((ev.type === 'heal' || ev.type === 'hot') && hp[ev.target] !== undefined) {
                    const mu = [...pre.near, ...pre.far].find(x => x.id === ev.target);
                    hp[ev.target] = Math.min(mu ? mu.maxHp : Infinity, hp[ev.target] + ev.amount);
                }
            }
        };
        if (!speed || !steps.length) {
            for (const s of steps) { if (s.ev) appendLog(s.ev); for (const e of s.effects) appendLog(e); }
            game.anim = null;
            done();
            return;
        }
        let i = 0;
        game.anim = { pre, hp, meta, step: null, skip: () => { i = steps.length; tick(); } };
        const tick = () => {
            if (game.timer) { clearTimeout(game.timer); game.timer = null; }
            if (i >= steps.length) {
                game.anim = null;
                done();
                return;
            }
            const s = steps[i++];
            if (s.ev) appendLog(s.ev);
            for (const e of s.effects) appendLog(e);
            applyEffects(s.effects);
            if (s.kind === 'turn' && s.ev) { meta.side = s.ev.side; meta.turn = s.ev.turn; meta.remaining = s.ev.remainingRounds; }
            game.anim.step = s;
            game.ui.renderArena();
            game.timer = setTimeout(tick, s.dur * speed);
        };
        tick();
    }

    /** 推进：bot 自动出牌；轮到人类则等待 */
    function proceed() {
        const { arena } = game;
        renderArena();
        if (arena.finished) return;
        const acting = actingUnits(arena);
        const humans = acting.filter(u => u.policy && u.policy.name === 'human' && !game.auto);
        if (humans.some(u => !u.picked)) return; // 等待玩家
        game.busy = true;
        game.timer = setTimeout(() => {
            game.timer = null;
            const picks = {};
            for (const u of acting) {
                const pol = (u.policy && u.policy.name === 'human' && game.auto) ? createPolicy(st.botPolicy) : u.policy;
                picks[u.id] = u.picked || (pol ? pol.pick(arena, u) : { pass: true });
            }
            const pre = snapshot(arena);
            playTurn(arena, picks);
            for (const u of acting) u.picked = null;
            game.selected = null;
            game.discards.clear();
            game.busy = false;
            game.ui.animateTurn(pre, game.pending.splice(0), () => game.ui.proceed());
        }, SPEEDS[st.animSpeed] ? (humans.length ? 120 : 200) : 30);
    }

    function humanUnit() {
        const { arena } = game;
        if (game.anim) return null;
        return actingUnits(arena).find(u => u.policy && u.policy.name === 'human' && !game.auto && !u.picked) || null;
    }

    // ---- 圆盘渲染 ----
    function renderField(snap, opts) {
        const { arena } = game;
        const R = arena.resolved;
        const anim = game.anim;
        const step = anim ? anim.step : null;
        const hpOf = (u) => (anim && anim.hp[u.id] !== undefined ? anim.hp[u.id] : u.hp);
        const units = [...snap.far, ...snap.near];
        const byId = Object.fromEntries(units.map(u => [u.id, u]));
        const posOf = (u) => unitPos(u.side, u.slot, snap[u.side].length);

        const root = svg('svg', { class: 'disc', viewBox: `0 0 ${VB.w} ${VB.h}`, preserveAspectRatio: 'xMidYMid meet' });
        root.appendChild(svg('defs', null,
            svg('marker', { id: 'arrow-head', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, svg('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'currentColor' })),
            svg('radialGradient', { id: 'disc-grad', cx: '50%', cy: '50%', r: '60%' }, svg('stop', { offset: '0%', 'stop-color': '#2a3a4f' }), svg('stop', { offset: '100%', 'stop-color': '#151c26' })),
        ));
        // 圆盘
        root.appendChild(svg('ellipse', { cx: DISC.cx, cy: DISC.cy, rx: DISC.rx + 40, ry: DISC.ry + 40, fill: 'url(#disc-grad)', stroke: '#2c3a4d', 'stroke-width': 2 }));
        root.appendChild(svg('ellipse', { cx: DISC.cx, cy: DISC.cy, rx: DISC.rx, ry: DISC.ry, fill: 'none', stroke: '#3b4c63', 'stroke-width': 1.5, 'stroke-dasharray': '6 6' }));
        root.appendChild(svg('ellipse', { cx: DISC.cx, cy: DISC.cy, rx: 150, ry: 62, fill: 'none', stroke: '#3b4c63', 'stroke-width': 1 }));
        root.appendChild(svg('line', { x1: DISC.cx - DISC.rx - 40, y1: DISC.cy, x2: DISC.cx + DISC.rx + 40, y2: DISC.cy, stroke: '#2c3a4d', 'stroke-width': 1 }));
        root.appendChild(svg('text', { x: 14, y: 22, class: 'side-caption', fill: snap.currentSide === 'far' ? '#e8b04a' : '#8892a0' }, `敌方${snap.currentSide === 'far' && !snap.finished ? ' · 行动中' : ''}`));
        root.appendChild(svg('text', { x: 14, y: VB.h - 10, class: 'side-caption', fill: snap.currentSide === 'near' ? '#e8b04a' : '#8892a0' }, `我方${snap.currentSide === 'near' && !snap.finished ? ' · 行动中' : ''}`));
        // 图例：魔力点 / 超级魔力点
        const legend = svg('g', { transform: `translate(${VB.w - 14},22)`, class: 'legend' });
        if (R.version === 'teen') {
            legend.appendChild(svg('circle', { cx: -118, cy: -4, r: 4, class: 'pipdot normal' }));
            legend.appendChild(svg('text', { x: -110, y: 0 }, '魔力点（teen 强力判定直接 +2）'));
        } else {
            legend.appendChild(svg('circle', { cx: -196, cy: -4, r: 4, class: 'pipdot normal' }));
            legend.appendChild(svg('text', { x: -188, y: 0 }, '魔力点'));
            legend.appendChild(svg('circle', { cx: -136, cy: -4, r: 4.5, class: 'pipdot power' }));
            legend.appendChild(svg('text', { x: -128, y: 0 }, '超级魔力点（本系抵 2 点）'));
        }
        root.appendChild(legend);

        // 站位点
        for (const u of units) {
            const p = posOf(u);
            root.appendChild(svg('circle', { cx: p.x, cy: p.y + (u.side === 'far' ? 0 : 0), r: 34, fill: 'none', stroke: '#2c3a4d', 'stroke-width': 1 }));
        }

        // 施法箭头（在单位下面画）
        if (step && (step.kind === 'cast' || step.kind === 'fizzle') && step.ev) {
            const c = byId[step.ev.caster], t = byId[step.ev.target || step.ev.caster];
            if (c && t) {
                const color = SCHOOL_COLORS[step.ev.school || (R.cards[step.ev.card] || {}).spellSchool] || '#fff';
                const pc = posOf(c), pt = posOf(t);
                if (c.id === t.id) {
                    root.appendChild(svg('circle', { cx: pc.x, cy: pc.y, r: 30, fill: 'none', stroke: color, 'stroke-width': 3, class: 'self-pulse' }));
                } else {
                    const dx = pt.x - pc.x, dy = pt.y - pc.y, len = Math.hypot(dx, dy) || 1;
                    const x1 = pc.x + dx / len * 34, y1 = pc.y + dy / len * 34, x2 = pt.x - dx / len * 40, y2 = pt.y - dy / len * 40;
                    root.appendChild(svg('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': 3, class: step.kind === 'fizzle' ? 'beam fizzle' : 'beam', 'marker-end': 'url(#arrow-head)', style: { color } }));
                    const proj = svg('circle', { r: 7, fill: color, class: 'projectile' });
                    proj.appendChild(svg('animateMotion', { dur: `${Math.max(0.25, 0.45 * (SPEEDS[st.animSpeed] || 1))}s`, fill: 'freeze', path: `M${x1},${y1} L${x2},${y2}` }));
                    root.appendChild(proj);
                }
            }
        }

        // 单位
        const targetIds = opts.targetIds || new Set();
        for (const u of units) {
            const p = posOf(u);
            const hp = hpOf(u);
            const dead = hp <= 0;
            const far = u.side === 'far';
            const g = svg('g', { transform: `translate(${p.x},${p.y})`, class: ['tok', dead ? 'dead' : '', targetIds.has(u.id) ? 'targetable' : ''].join(' '), onClick: () => { if (targetIds.has(u.id)) confirmPick(u.id); } });
            g.appendChild(svg('title', `${u.name} Lv${u.level}\nHP ${hp}/${u.maxHp}\n魔力点 ${u.pips.normal} · 超级魔力点 ${u.pips.power}（可用 ${u.pips.normal + u.pips.power * 2}）\n卡包剩余 ${u.deck.remaining}/${u.deck.total}`));
            if (targetIds.has(u.id)) g.appendChild(svg('circle', { r: 40, fill: 'rgba(79,163,255,.12)', stroke: '#4fa3ff', 'stroke-width': 2, 'stroke-dasharray': '5 4', class: 'target-ring' }));
            if (snap.currentSide === u.side && !dead && !snap.finished) g.appendChild(svg('circle', { r: 33, fill: 'none', stroke: '#e8b04a', 'stroke-width': 2, opacity: .9 }));
            if (opts.meId === u.id) g.appendChild(svg('circle', { r: 37, fill: 'none', stroke: '#e8b04a', 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
            g.appendChild(svg('circle', { r: 28, fill: SCHOOL_COLORS[u.school] || '#888', stroke: '#0f1216', 'stroke-width': 2 }));
            g.appendChild(svg('text', { y: 6, 'text-anchor': 'middle', class: 'tok-initial' }, (SCHOOL_NAMES[u.school] || u.school)[0]));
            if (!u.isBot) g.appendChild(svg('text', { x: 24, y: -22, class: 'tok-you' }, '你'));
            if (dead) g.appendChild(svg('text', { y: 6, 'text-anchor': 'middle', class: 'tok-dead' }, '倒下'));
            // 名字
            g.appendChild(svg('text', { y: far ? 50 : -40, 'text-anchor': 'middle', class: 'tok-name' }, `${u.name} Lv${u.level}`));
            // HP
            const barY = far ? -50 : 36;
            const ratio = u.maxHp ? Math.max(0, Math.min(1, hp / u.maxHp)) : 0;
            g.appendChild(svg('rect', { x: -50, y: barY, width: 100, height: 9, rx: 4, fill: '#0f1216', stroke: '#2c3a4d' }));
            g.appendChild(svg('rect', { x: -50, y: barY, width: 100 * ratio, height: 9, rx: 4, fill: ratio < 0.3 ? '#e8562a' : '#4fc45a', class: 'hp-fill' }));
            g.appendChild(svg('text', { y: far ? -56 : 58, 'text-anchor': 'middle', class: 'tok-hp' }, `${hp} / ${u.maxHp}`));
            // 能量球
            const pipY = far ? -70 : 70;
            const maxPips = R.global.maxPips;
            const pipStep = Math.min(9, 110 / maxPips);
            for (let i = 0; i < maxPips; i++) {
                const cls = i < u.pips.power ? 'power' : (i < u.pips.power + u.pips.normal ? 'normal' : 'empty');
                g.appendChild(svg('circle', { cx: (i - (maxPips - 1) / 2) * pipStep, cy: pipY, r: cls === 'power' ? 3.8 : 3.2, class: `pipdot ${cls}` }));
            }
            // 魔力点数字：普通（蓝）/ 超级（金）
            const pipText = svg('text', { x: 60, y: pipY + 4, class: 'tok-pips' });
            pipText.appendChild(svg('tspan', { class: 'n' }, String(u.pips.normal)));
            if (R.version !== 'teen') { pipText.appendChild(svg('tspan', { class: 'sep' }, '+')); pipText.appendChild(svg('tspan', { class: 'p' }, String(u.pips.power))); }
            g.appendChild(pipText);
            // 卡包计数
            g.appendChild(svg('text', { x: 56, y: barY + 8, class: 'tok-deck', fill: u.deck.remaining === 0 ? '#ff7a5a' : '#8892a0' }, `牌${u.deck.remaining}`));
            // 状态徽标（最多两行）
            const effects = unitEffects(u, R);
            let x = -58, row = 0;
            const chipY0 = far ? -92 : 82;
            const shown = [];
            for (const e of effects) {
                const w = textWidth(e.short) + 8;
                if (x + w > 58) { x = -58; row++; if (row >= 2) break; }
                const cy = chipY0 + (far ? -row * 15 : row * 15);
                const chip = svg('g', { class: `schip ${e.cls}`, transform: `translate(${x},${cy})` });
                chip.appendChild(svg('title', e.full));
                chip.appendChild(svg('rect', { width: w, height: 13, rx: 3 }));
                chip.appendChild(svg('text', { x: w / 2, y: 10, 'text-anchor': 'middle' }, e.short));
                g.appendChild(chip);
                shown.push(e);
                x += w + 3;
            }
            if (effects.length > shown.length) g.appendChild(svg('text', { x: 60, y: chipY0 + (far ? -10 : 24), class: 'tok-more' }, `+${effects.length - shown.length}`));
            root.appendChild(g);
        }

        // 中央：出牌 / 回合信息
        const center = svg('g', { transform: `translate(${DISC.cx},${DISC.cy})` });
        if (step && (step.kind === 'cast' || step.kind === 'fizzle') && step.ev) {
            const card = R.cards[step.ev.card] || {};
            const school = step.ev.school || card.spellSchool;
            const color = SCHOOL_COLORS[school] || '#fff';
            const c = byId[step.ev.caster], t = byId[step.ev.target || step.ev.caster];
            center.appendChild(svg('rect', { x: -78, y: -46, width: 156, height: 92, rx: 8, fill: '#1a222d', stroke: color, 'stroke-width': 3, class: 'spot-card' }));
            center.appendChild(svg('rect', { x: -78, y: -46, width: 156, height: 18, rx: 8, fill: color, opacity: .85 }));
            center.appendChild(svg('text', { x: -70, y: -33, class: 'spot-school' }, `${SCHOOL_NAMES[school] || school || ''} · ${card.type || ''}`));
            center.appendChild(svg('text', { x: 62, y: -33, 'text-anchor': 'end', class: 'spot-cost' }, step.ev.pipcost < 0 ? `X=${step.ev.realcost}` : `${step.ev.pipcost ?? card.pipcost}费`));
            const name = shortCardName(step.ev.card);
            center.appendChild(svg('text', { y: -4, 'text-anchor': 'middle', class: 'spot-name' }, name.length > 22 ? name.slice(0, 21) + '…' : name));
            center.appendChild(svg('text', { y: 18, 'text-anchor': 'middle', class: 'spot-sub', fill: step.kind === 'fizzle' ? '#ff7a5a' : '#c8d0da' },
                step.kind === 'fizzle' ? `失误（命中 ${step.ev.accuracy}%）` : (c && t ? (c.id === t.id ? `${c.name} 对自己` : `${c.name} → ${t.name}`) : '')));
            const fx = step.effects.filter(e => ['charm', 'ward', 'standing_ward', 'absorb', 'aura', 'stun', 'dot_applied', 'hot_applied', 'stance', 'miniaura', 'cleanse', 'pips', 'steal_charm', 'steal_ward', 'remove_charm', 'remove_ward'].includes(e.type));
            if (fx.length) center.appendChild(svg('text', { y: 36, 'text-anchor': 'middle', class: 'spot-fx' }, fx.map(e => ({ charm: 'charm', ward: 'ward', standing_ward: '持续ward', absorb: '吸收', aura: '光环', stun: '眩晕', dot_applied: 'DOT', hot_applied: 'HOT', stance: '姿态', miniaura: '小光环', cleanse: '净化', pips: '能量', steal_charm: '偷charm', steal_ward: '偷ward', remove_charm: '移除charm', remove_ward: '移除ward' })[e.type]).filter((v, i, a) => a.indexOf(v) === i).join(' · ')));
        } else if (step && step.kind === 'tick') {
            center.appendChild(svg('text', { y: -6, 'text-anchor': 'middle', class: 'spot-name' }, '持续效果结算'));
            center.appendChild(svg('text', { y: 16, 'text-anchor': 'middle', class: 'spot-sub' }, `${unitName(arena, step.ev.target)} 的 DOT / HOT`));
        } else if (step && step.kind === 'pass' && step.ev) {
            center.appendChild(svg('text', { y: -6, 'text-anchor': 'middle', class: 'spot-name' }, `${unitName(arena, step.ev.caster)} 跳过`));
            center.appendChild(svg('text', { y: 16, 'text-anchor': 'middle', class: 'spot-sub' }, { stunned: '眩晕中', deck_empty: '卡包已打空', no_cards: '没有手牌', invalid_pick: '无效出牌', no_target: '无目标' }[step.ev.reason] || (step.ev.type === 'unsupported' ? `${shortCardName(step.ev.card)} 未支持` : '主动跳过')));
        } else {
            const roundNo = Math.ceil(snap.turn / 2);
            if (snap.finished) {
                center.appendChild(svg('text', { y: -4, 'text-anchor': 'middle', class: 'spot-name big', fill: snap.winner === 'near' ? '#8fe08a' : snap.winner === 'far' ? '#ff7a5a' : '#e8b04a' }, snap.timeout ? '回合耗尽 · 平局' : snap.winner === 'near' ? '我方胜利' : snap.winner === 'far' ? '敌方胜利' : '平局'));
                center.appendChild(svg('text', { y: 18, 'text-anchor': 'middle', class: 'spot-sub' }, `共 ${roundNo} 回合 · 种子 ${game.seed}`));
            } else {
                center.appendChild(svg('text', { y: -8, 'text-anchor': 'middle', class: 'spot-name big' }, `第 ${roundNo} 回合`));
                center.appendChild(svg('text', { y: 14, 'text-anchor': 'middle', class: 'spot-sub' }, `${snap.currentSide === 'near' ? '我方' : '敌方'}行动 · 剩余 ${snap.remainingRounds} 半回合`));
            }
        }
        if (snap.aura) center.appendChild(svg('text', { y: 58, 'text-anchor': 'middle', class: 'spot-aura' }, `全场光环：${auraLabel(snap.aura)}`));
        root.appendChild(center);

        // 飘字
        if (step) {
            const perTarget = {};
            for (const e of step.effects) {
                let f = null;
                if (e.type === 'damage' || e.type === 'dot') f = { text: `-${e.amount}${e.mark === 'c' ? ' 暴击' : e.mark === 'd' ? ' 闪避' : ''}`, cls: e.mark === 'c' ? 'crit' : 'dmg', id: e.target };
                else if (e.type === 'heal' || e.type === 'hot') f = { text: `+${e.amount}`, cls: 'heal', id: e.target };
                else if (e.type === 'absorb') f = { text: `吸收 ${e.amount}`, cls: 'buff', id: e.target };
                else if (e.type === 'charm') f = { text: '+charm', cls: 'buff', id: e.target };
                else if (e.type === 'ward') f = { text: '+ward', cls: 'buff', id: e.target };
                else if (e.type === 'stun') f = { text: '眩晕', cls: 'debuff', id: e.target };
                else if (e.type === 'dot_applied') f = { text: `DOT ×${e.ticks}`, cls: 'debuff', id: e.target };
                else if (e.type === 'hot_applied') f = { text: `HOT ×${e.ticks}`, cls: 'buff', id: e.target };
                if (!f) continue;
                perTarget[f.id] = (perTarget[f.id] || 0) + 1;
                const u = byId[f.id];
                if (!u) continue;
                const p = posOf(u);
                const y0 = p.y - 44 - (perTarget[f.id] - 1) * 16;
                const tx = svg('text', { x: p.x, y: y0, 'text-anchor': 'middle', class: `sfloat ${f.cls}` }, f.text);
                tx.appendChild(svg('animate', { attributeName: 'y', from: y0, to: y0 - 34, dur: '1s', fill: 'freeze' }));
                tx.appendChild(svg('animate', { attributeName: 'opacity', from: 1, to: 0, begin: '0.5s', dur: '0.6s', fill: 'freeze' }));
                root.appendChild(tx);
            }
            if (step.kind === 'fizzle' && step.ev) {
                const u = byId[step.ev.caster];
                if (u) { const p = posOf(u); root.appendChild(svg('text', { x: p.x, y: p.y - 44, 'text-anchor': 'middle', class: 'sfloat fizzle' }, '失误')); }
            }
        }
        return root;
    }

    // ---- 整页渲染 ----
    function renderArena() {
        clear(arenaBox);
        if (!game) return;
        const { arena } = game;
        const R = arena.resolved;
        // 动画中：结构性状态（charm / ward）用真实快照，HP 用逐步模型，回合/行动方跟随步骤
        const live = snapshot(arena);
        const view = game.anim ? { ...live, currentSide: game.anim.meta.side, turn: game.anim.meta.turn, remainingRounds: game.anim.meta.remaining, finished: false } : live;
        const me = humanUnit();
        const selectedCard = game.selected;
        let targetIds = new Set();
        if (me && selectedCard) targetIds = new Set(validTargets(arena, me, selectedCard.card).map(t => t.id));

        const field = h('div.field2', renderField(view, { targetIds, meId: me ? me.id : null }));

        // 控制栏
        const controls = h('div.row.controls');
        if (game.anim) {
            controls.appendChild(h('span.muted', '演示中…'));
            controls.appendChild(h('button', { onClick: () => game.anim && game.anim.skip() }, '跳过动画'));
        } else if (me) {
            const hand = U.cardsInHand(me);
            if (!hand.length) controls.appendChild(h('span', { style: { color: 'var(--bad)' } }, U.isDeckExhausted(me) ? `轮到 ${me.name}：卡包已打空，只能跳过。` : `轮到 ${me.name}：没有手牌，只能跳过。`));
            else if (selectedCard) controls.appendChild(h('span', `已选 ${shortCardName(selectedCard.key)}：点击圆盘上高亮的目标。`));
            else controls.appendChild(h('span', `轮到 ${me.name}：点一张手牌，再点目标。`));
            controls.appendChild(h('button', { onClick: () => { me.picked = { pass: true, discardSeqs: [...game.discards] }; game.selected = null; proceed(); } }, game.discards.size ? `跳过并弃 ${game.discards.size} 张` : '跳过（Pass）'));
            controls.appendChild(h('button', { class: game.discardMode ? 'active' : '', title: '开启后点击手牌标记为弃牌（也可右键手牌切换）；出牌或跳过时生效，下回合补新牌', onClick: () => { game.discardMode = !game.discardMode; game.selected = null; renderArena(); } }, game.discardMode ? '弃牌模式：开' : '弃牌模式'));
        } else if (!arena.finished) {
            controls.appendChild(h('span.muted', game.busy ? 'Bot 正在行动…' : '等待…'));
        }
        controls.appendChild(h('label', h('input', { type: 'checkbox', checked: game.auto, onChange: (e) => { game.auto = e.target.checked; if (game.auto) { for (const u of actingUnits(arena)) u.picked = null; } proceed(); } }), ' 托管（Bot 替我出牌）'));
        controls.appendChild(h('label', '动画 ', select(Object.keys(SPEEDS).map(k => ({ value: k, label: SPEED_LABELS[k] })), st.animSpeed, (v) => { st.animSpeed = v; setSetting('battle', st); })));
        if (arena.finished) controls.appendChild(h('button.primary', { onClick: startGame }, '再来一局'));

        // 卡包计数 + 手牌
        const deckBar = h('div.deckbar');
        const hand = h('div.hand');
        if (me) {
            const dc = U.deckCounts(me);
            deckBar.appendChild(h('span.tag', `卡包 剩余 ${dc.remaining} / ${dc.total}`));
            deckBar.appendChild(h('span.piptag', h('i.pip-n'), ` 魔力点 ${me.pips.normal}`, R.version !== 'teen' ? [' · ', h('i.pip-p'), ` 超级魔力点 ${me.pips.power}`] : null, h('span.muted.small', `（可用 ${U.pipValue(me)}${R.version !== 'teen' ? '，超级点只对本系抵 2' : ''}）`)));
            deckBar.appendChild(h('span.muted.small', `手牌 ${dc.inHand} · 未抽 ${dc.unused} · 已用 ${dc.used}${dc.fizzled ? ` · 失误重抽 ${dc.fizzled}` : ''}${game.discards.size ? ` · 待弃 ${game.discards.size}` : ''}${me.deckTrimmed ? ` · 配卡超容量已裁 ${me.deckTrimmed} 张` : ''}`));
            const castable = new Set(castableCards(arena, me).map(c => c.seq));
            for (const { seq, key } of U.cardsInHand(me)) {
                const card = R.cards[key];
                if (!card) continue;
                const ok = castable.has(seq) && isSupportedType(card.type);
                const dmg = expectedBaseDamage(card);
                const heal = expectedBaseHeal(card);
                const own = card.spellSchool === me.school;
                const cd = me.cooldowns[card.spellName] || 0;
                const discarding = game.discards.has(seq);
                const toggleDiscard = () => { if (discarding) game.discards.delete(seq); else game.discards.add(seq); if (game.selected && game.selected.seq === seq) game.selected = null; renderArena(); };
                const el = h('div.card', {
                    class: [card.spellSchool, ok ? '' : 'disabled', selectedCard && selectedCard.seq === seq ? 'selected' : '', discarding ? 'discarding' : ''].join(' '),
                    title: `${key}\n${card.type}\n${JSON.stringify(card.params)}\n右键：标记 / 取消弃牌`,
                    onContextMenu: (e) => { e.preventDefault(); toggleDiscard(); },
                    onClick: () => {
                        if (game.discardMode) return toggleDiscard();
                        if (discarding) return toggleDiscard();
                        if (!ok) return;
                        game.selected = selectedCard && selectedCard.seq === seq ? null : { seq, key, card };
                        const kind = cardTargetKind(card);
                        if (game.selected && (kind === 'self' || validTargets(arena, me, card).length === 1)) {
                            const t = validTargets(arena, me, card)[0];
                            if (t) return confirmPick(t.id);
                        }
                        renderArena();
                    },
                },
                    h('span.cost', card.pipcost < 0 ? 'X' : card.pipcost),
                    h('div.ctype', `${card.type}${own ? '' : ' · 他系'}`),
                    h('div.cname', shortCardName(key)),
                    h('div.cinfo', `命中 ${card.accuracy}%${dmg ? ' · 伤害≈' + Math.round(dmg) : ''}${heal ? ' · 治疗≈' + Math.round(heal) : ''}${cd ? ' · 冷却 ' + cd : ''}${!isSupportedType(card.type) ? ' · 未支持' : ''}`),
                    discarding ? h('div.ribbon', '弃') : null,
                );
                const artwork=skillCardPreview(card,R.version);
                if(artwork)el.prepend(artwork);
                hand.appendChild(el);
            }
        }

        // 状态明细板（全部 buff / debuff 全文）
        const board = h('div.status-board');
        for (const side of ['far', 'near']) {
            const col = h('div.status-col', h('div.muted.small', side === 'far' ? '敌方' : '我方'));
            for (const u of live[side]) {
                const effects = unitEffects(u, R);
                const cds = Object.entries(u.cooldowns || {});
                col.appendChild(h('div.status-row',
                    h('span.status-name', { style: { color: SCHOOL_COLORS[u.school] } }, u.name),
                    h('span.muted.small', ` HP ${u.hp}/${u.maxHp} · 牌 ${u.deck.remaining}/${u.deck.total}`),
                    h('div.chips',
                        ...effects.map(e => h('span.chip', { class: e.cls, title: e.full }, e.full.replace(/^\[[^\]]+\]\s*/, ''))),
                        ...cds.map(([name, n]) => h('span.chip.neutral', { title: `技能冷却：${name}` }, `冷却 ${shortCardName(name)} ${n}`)),
                        effects.length || cds.length ? null : h('span.muted.small', '无状态'),
                    ),
                ));
            }
            board.appendChild(col);
        }

        arenaBox.appendChild(h('div.arena',
            h('div', field, controls, deckBar, hand, board),
            h('div', h('h3.muted', '战斗日志'), game.logEl),
        ));
    }

    function confirmPick(targetId) {
        const me = humanUnit();
        if (!me || !game.selected) return;
        me.picked = { seq: game.selected.seq, key: game.selected.key, targetId, discardSeqs: [...game.discards] };
        game.selected = null;
        proceed();
    }

    renderSetup();
    if (game && game.arena) {
        // 从其他页切回：把进行中的对局接到新 DOM 上（后台定时器继续走）
        game.ui = { renderArena, proceed, animateTurn };
        renderArena();
    }
    return () => { game = game && game.arena.finished ? null : game; };
}
