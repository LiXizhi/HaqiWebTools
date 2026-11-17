// combat/view_sim_arena.js — 2D 人机对战页主流程控制与手牌渲染。
import { state, setSetting } from '../state.js';
import { resolveParams, SCHOOLS } from '../combat_params_core.js';
import { createArena, startCombat, playTurn, actingUnits, castableCards, validTargets, snapshot } from '../combat_arena_core.js';
import { createPolicy } from '../combat_policy_core.js';
import { unitSpec, SCHOOL_NAMES, MODES, defaultLevel } from '../combat_presets_core.js';
import { cardTargetKind, expectedBaseDamage, expectedBaseHeal, isSupportedType } from '../combat_cards_core.js';
import * as U from '../combat_unit_core.js';
import { coordinateTeam } from '../battle_ai/policy_core.js';
import { BattleReviewSession } from '../battle_ai/session_core.js';
import { h, clear, select } from '../utils.js';
import { skillCardPreview } from '../skill_card_preview.js';
import {
    SPEEDS,
    SPEED_LABELS,
    shortCardName,
    describeEvent,
    buildSteps,
    renderSimDiscField,
    renderSimStatusBoard,
} from './view_sim_disc.js';
import { createSimSetupController } from './view_sim_setup.js';

let game = null;

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

    const { deckFor, renderSetup } = createSimSetupController({
        setup,
        deckBox,
        main,
        ds,
        st,
        teamSize,
        getGame: () => game,
        startGame,
        renderBattle,
    });

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
        if (arena.resolved.version === 'kids') game.reviewSession = new BattleReviewSession();
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

    function proceed() {
        const { arena } = game;
        renderArena();
        if (arena.finished) return;
        const acting = actingUnits(arena);
        const humans = acting.filter(u => u.policy && u.policy.name === 'human' && !game.auto);
        if (humans.some(u => !u.picked)) return;
        game.busy = true;
        game.timer = setTimeout(() => {
            game.timer = null;
            let picks = {};
            const policies = {};
            for (const u of acting) {
                const pol = (u.policy && u.policy.name === 'human' && game.auto) ? createPolicy(st.botPolicy) : u.policy;
                policies[u.id] = pol;
                if (u.picked) picks[u.id] = u.picked;
            }
            picks = coordinateTeam(arena, policies, picks);
            const reviewer = acting.find(u => u.side === 'near');
            if (reviewer && game.reviewSession) game.reviewSession.record(arena, game.reviewSession.analyze(arena, reviewer), picks[reviewer.id]);
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

    function renderArena() {
        clear(arenaBox);
        if (!game) return;
        const { arena } = game;
        const R = arena.resolved;
        const live = snapshot(arena);
        const view = game.anim ? { ...live, currentSide: game.anim.meta.side, turn: game.anim.meta.turn, remainingRounds: game.anim.meta.remaining, finished: false } : live;
        const me = humanUnit();
        const selectedCard = game.selected;
        let targetIds = new Set();
        if (me && selectedCard) targetIds = new Set(validTargets(arena, me, selectedCard.card).map(t => t.id));

        const field = h('div.field2', renderSimDiscField(game, view, { targetIds, meId: me ? me.id : null }, confirmPick, st.animSpeed));

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
        if (arena.finished && game.reviewSession) {
            const review = game.reviewSession.review(arena);
            controls.appendChild(h('details', h('summary', review.presentation.headline), ...review.diagnoses.slice(0, 3).map(d => h('p', d.text))));
        }

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
                const artwork = skillCardPreview(card, R.version);
                if (artwork) el.prepend(artwork);
                hand.appendChild(el);
            }
        }

        const board = renderSimStatusBoard(live, R);

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
        game.ui = { renderArena, proceed, animateTurn };
        renderArena();
    }
    return () => { game = game && game.arena.finished ? null : game; };
}
