// combat/view_sim_disc.js — 战斗模拟器 SVG 决斗圆盘、动画步骤拆分与状态明细渲染。
import { SCHOOL_NAMES, SCHOOL_COLORS } from '../combat_presets_core.js';
import { h, svg } from '../utils.js';

/** 动画速度倍率（0 = 不播放动画） */
export const SPEEDS = { slow: 1.8, normal: 1, fast: 0.45, off: 0 };
export const SPEED_LABELS = { slow: '慢', normal: '正常', fast: '快', off: '无动画' };
export const EXCLUDE_CARD_RE = /Pet|Rune|Crazy|VIP|1000Accuracy|Deleted|_adv$/i;

// 圆盘几何（viewBox 760 × 500）
export const VB = { w: 760, h: 500 };
export const DISC = { cx: 380, cy: 250, rx: 300, ry: 130 };

/** 全场光环文字：伤害 / 治疗 / 强力能量 三类各自独立（Life_LifeGlobalAura 带 school 但只加治疗） */
export function auraLabel(a) {
    const parts = [];
    if (a.boostDamage) parts.push(`${a.boostSchool ? SCHOOL_NAMES[a.boostSchool] || a.boostSchool : '全部'}伤害+${a.boostDamage}%`);
    if (a.boostHeal) parts.push(`治疗+${a.boostHeal}%`);
    if (a.boostPowerPip) parts.push(`强力能量+${a.boostPowerPip}%`);
    return parts.join(' ') || a.cardKey || '—';
}

export function shortCardName(key) {
    return (key || '').replace(/^[A-Za-z]+_/, '');
}

/** "烈火专注：+60%烈火攻击" → "烈火专注" */
export function shortEffect(desc, fallback) {
    if (!desc) return fallback;
    const m = desc.split(/[：:]/);
    return (m[0] || fallback).slice(0, 8);
}

export function isPositive(x) {
    return x.positive === true || x.positive === 'true';
}

/**
 * 单位状态徽标列表（buff / debuff / DOT / HOT / 姿态 / 眩晕 …）
 * @return [{cls, short, full}]
 */
export function unitEffects(u, R) {
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

export function unitName(arena, id) {
    const u = arena.unitsById[id];
    return u ? u.name : id;
}

export function describeEvent(arena, ev) {
    const R = arena.resolved;
    const n = (id) => unitName(arena, id);
    const card = (k) => shortCardName(k);
    switch (ev.type) {
        case 'freeze': return { cls: 'info', text: `${n(ev.target)} ${ev.success ? '被冰封了' : '抵抗了冰封'}` };
        case 'freeze_break': return { cls: 'info', text: `${n(ev.target)} 的冰封解除` };
        case 'guardian': return { cls: 'info', text: `${n(ev.target)} 获得一次替身守护` };
        case 'enrage': return { cls: 'info', text: `${n(ev.target)} 被激怒了` };
        case 'combat_start': return { cls: 'turn', text: `战斗开始（${ev.firstSide === 'near' ? '我方' : '敌方'}先手）` };
        case 'turn_begin': return { cls: 'turn', text: `—— 第 ${Math.ceil(ev.turn / 2)} 回合 · ${ev.side === 'near' ? '我方' : '敌方'}行动（剩余 ${ev.remainingRounds}）——` };
        case 'pip': return { cls: 'info', text: `${n(ev.unit)} 获得${ev.kind === 'power' ? (R.version === 'teen' ? '强力判定（+2 魔力点）' : '超级魔力点') : '魔力点'} → 魔力 ${ev.pips.normal}${R.version === 'teen' ? '' : ` · 超级 ${ev.pips.power}`}（可用 ${ev.pips.normal + ev.pips.power * 2}）` };
        case 'cast': return { cls: '', text: `${n(ev.caster)} 使用 ${card(ev.card)}${ev.target && ev.target !== ev.caster ? ' → ' + n(ev.target) : ''}（${ev.pipcost < 0 ? 'X=' + ev.realcost : ev.pipcost}费）` };
        case 'fizzle': return { cls: 'info', text: `${n(ev.caster)} 施放 ${card(ev.card)} 失误（命中 ${ev.accuracy}%）` };
        case 'hanzi_buff': return { cls: 'buff', text: `${n(ev.caster)} · ${ev.description}` };
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
        case 'pass': return { cls: 'info', text: `${n(ev.caster)} 跳过${{ stunned: '（眩晕）', frozen: '（冰封）', invalid_pick: '（无效出牌）', deck_empty: '（卡包已打空）', no_cards: '（无手牌）', no_target: '（无目标）' }[ev.reason] || ''}` };
        case 'unsupported': return { cls: 'info', text: `${n(ev.caster)} 的 ${card(ev.card)}（${ev.cardType}）未支持，按跳过处理` };
        case 'turn_end': return null;
        case 'combat_end': return { cls: 'end', text: ev.decksExhausted ? '双方卡包全部打空，判平局' : ev.timeout ? '回合耗尽，平局' : ev.winner ? `${ev.winner === 'near' ? '我方' : '敌方'}胜利！` : '同归于尽，平局' };
        default: return { cls: 'info', text: JSON.stringify(ev) };
    }
}

export function unitPos(side, slot, count) {
    const step = count >= 4 ? 0.5 : count === 3 ? 0.6 : 0.7;
    const off = (slot - (count - 1) / 2) * step;
    const x = DISC.cx + DISC.rx * Math.sin(off);
    const y = side === 'far' ? DISC.cy - DISC.ry * Math.cos(off) : DISC.cy + DISC.ry * Math.cos(off);
    return { x, y };
}

export function textWidth(s) {
    let w = 0;
    for (const ch of s) w += /[\u2e80-\uffff]/.test(ch) ? 10 : 6;
    return w;
}

/**
 * 把一次 playTurn 产生的事件切成演示步骤：
 *  tick（行动前 DOT/HOT）→ cast/fizzle/pass（中央出牌 + 箭头 + 目标飘字）→ turn（换边、能量）→ end
 */
export function buildSteps(events) {
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

export function renderSimDiscField(game, snap, opts, confirmPick, animSpeed) {
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
    root.appendChild(svg('ellipse', { cx: DISC.cx, cy: DISC.cy, rx: DISC.rx + 40, ry: DISC.ry + 40, fill: 'url(#disc-grad)', stroke: '#2c3a4d', 'stroke-width': 2 }));
    root.appendChild(svg('ellipse', { cx: DISC.cx, cy: DISC.cy, rx: DISC.rx, ry: DISC.ry, fill: 'none', stroke: '#3b4c63', 'stroke-width': 1.5, 'stroke-dasharray': '6 6' }));
    root.appendChild(svg('ellipse', { cx: DISC.cx, cy: DISC.cy, rx: 150, ry: 62, fill: 'none', stroke: '#3b4c63', 'stroke-width': 1 }));
    root.appendChild(svg('line', { x1: DISC.cx - DISC.rx - 40, y1: DISC.cy, x2: DISC.cx + DISC.rx + 40, y2: DISC.cy, stroke: '#2c3a4d', 'stroke-width': 1 }));
    root.appendChild(svg('text', { x: 14, y: 22, class: 'side-caption', fill: snap.currentSide === 'far' ? '#e8b04a' : '#8892a0' }, `敌方${snap.currentSide === 'far' && !snap.finished ? ' · 行动中' : ''}`));
    root.appendChild(svg('text', { x: 14, y: VB.h - 10, class: 'side-caption', fill: snap.currentSide === 'near' ? '#e8b04a' : '#8892a0' }, `我方${snap.currentSide === 'near' && !snap.finished ? ' · 行动中' : ''}`));

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

    for (const u of units) {
        const p = posOf(u);
        root.appendChild(svg('circle', { cx: p.x, cy: p.y, r: 34, fill: 'none', stroke: '#2c3a4d', 'stroke-width': 1 }));
    }

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
                proj.appendChild(svg('animateMotion', { dur: `${Math.max(0.25, 0.45 * (SPEEDS[animSpeed] || 1))}s`, fill: 'freeze', path: `M${x1},${y1} L${x2},${y2}` }));
                root.appendChild(proj);
            }
        }
    }

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
        g.appendChild(svg('text', { y: far ? 50 : -40, 'text-anchor': 'middle', class: 'tok-name' }, `${u.name} Lv${u.level}`));

        const barY = far ? -50 : 36;
        const ratio = u.maxHp ? Math.max(0, Math.min(1, hp / u.maxHp)) : 0;
        g.appendChild(svg('rect', { x: -50, y: barY, width: 100, height: 9, rx: 4, fill: '#0f1216', stroke: '#2c3a4d' }));
        g.appendChild(svg('rect', { x: -50, y: barY, width: 100 * ratio, height: 9, rx: 4, fill: ratio < 0.3 ? '#e8562a' : '#4fc45a', class: 'hp-fill' }));
        g.appendChild(svg('text', { y: far ? -56 : 58, 'text-anchor': 'middle', class: 'tok-hp' }, `${hp} / ${u.maxHp}`));

        const pipY = far ? -70 : 70;
        const maxPips = R.global.maxPips;
        const pipStep = Math.min(9, 110 / maxPips);
        for (let i = 0; i < maxPips; i++) {
            const cls = i < u.pips.power ? 'power' : (i < u.pips.power + u.pips.normal ? 'normal' : 'empty');
            g.appendChild(svg('circle', { cx: (i - (maxPips - 1) / 2) * pipStep, cy: pipY, r: cls === 'power' ? 3.8 : 3.2, class: `pipdot ${cls}` }));
        }
        const pipText = svg('text', { x: 60, y: pipY + 4, class: 'tok-pips' });
        pipText.appendChild(svg('tspan', { class: 'n' }, String(u.pips.normal)));
        if (R.version !== 'teen') { pipText.appendChild(svg('tspan', { class: 'sep' }, '+')); pipText.appendChild(svg('tspan', { class: 'p' }, String(u.pips.power))); }
        g.appendChild(pipText);
        g.appendChild(svg('text', { x: 56, y: barY + 8, class: 'tok-deck', fill: u.deck.remaining === 0 ? '#ff7a5a' : '#8892a0' }, `牌${u.deck.remaining}`));

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

export function renderSimStatusBoard(live, R) {
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
    return board;
}
