import { tacticalClue } from '../../tactical_clue_core.js';
import { button, el } from './primitives.js';

export function describeIntent(battle, row, short) {
    const caster = battle.unitsById[row.caster];
    if (!caster || caster.hp <= 0) return '';
    const target = battle.unitsById[row.targetId];
    const who = target?.id === battle.sides.near[0].id ? '你' : target?.name || '';
    const actor = battle.sides.far.length > 1 ? caster.name.replace(/^巡夜/, '') : '';
    const area = row.scope === 'all';
    const noTargets = area ? !row.affectedTargetIds.some(id => battle.unitsById[id]?.hp > 0) : target && target.hp <= 0;
    if (noTargets) return (actor ? actor + ' ' : '') + '目标已倒下，本招取消';
    const chargingShield = row.effect === '蓄力' && row.effects?.modifiers?.some(mod => mod.kind === 'ward' && mod.damagePercent < 0);
    const verb = chargingShield ? '蓄力并上盾' : row.effect || '等待';
    const subject = !short ? caster.name : actor;
    const aim = area ? ' → ' + row.targetName : target && target !== caster ? ' → ' + who : '';
    const ticks = row.effects?.dot?.length || 0;
    const boost = row.effect === '蓄力' && row.effects?.modifiers?.find(mod => mod.kind === 'charm' && mod.damagePercent > 0);
    let effect = short && ticks ? '（持续' + ticks + '次）' : '';
    if (short && boost) effect = '（+' + boost.damagePercent + '%）';
    if (short && target?.side === 'near' && row.effect === '重击') {
        const hit = preparedHit(battle, row);
        if (hit && hit.total >= target.hp) effect = '（未减伤命中约' + hit.total + '，可能击倒' + who + '）';
    }
    return subject + (subject ? ' ' : '') + verb + aim + effect;
}

// Only include the advertised preparation. The player's next play can still change the hit.
function preparedHit(battle, row) {
    const damage = row.effects?.damage;
    if (row.effect !== '重击' || !damage || damage.min !== damage.max || row.effects.dot?.length) return null;
    const card = battle.resolved.cards[row.key];
    const preparation = battle.resolved.cards.Fire_FireDamageBlade_Adv;
    if (!preparation || card?.spellSchool !== preparation.spellSchool) return null;
    const id = Number(preparation.params.charms);
    const turn = battle.tacticalEncounter.intents.find(action => action.caster === row.caster);
    const anticipated = row.turn === battle.turn + 1 && turn?.key === preparation.key;
    const active = row.turn === battle.turn && battle.unitsById[row.caster]?.charms.includes(id);
    if (!anticipated && !active) return null;
    const boost = Number(battle.resolved.charms[id]?.boost_damage);
    if (!(boost > 0)) return null;
    return { anticipated, total: Math.round(damage.min * (1 + boost / 100)) };
}

export function preparedHitDetail(battle, row) {
    const hit = preparedHit(battle, row);
    if (!hit) return '';
    return (hit.anticipated ? '若本轮蓄力成功' : '蓄力已生效') + '，重击命中约 ' + hit.total + ' 点。护盾、虚弱与抗性另计。';
}

function spellIcon(assets, key) {
    const base = assets?.effects?.cards?.[key]?.base;
    if (!base || !assets.skillArt) return null;
    const icon = el('canvas', 'tactical-intent-icon');
    icon.width = icon.height = 64;
    icon.setAttribute('aria-hidden', 'true');
    const context = icon.getContext('2d');
    if (!context) return null;
    assets.skillArt.ensure(base).then(() => assets.skillArt.drawSubject(context, base, 0, 0, 64, 64)).catch(() => icon.remove());
    return icon;
}

function clueForm(battle, save, answer, memory) {
    const clue = tacticalClue(battle, save);
    if (!clue || !answer) return null;
    if (battle.tacticalEncounter.clueWardUsed) return el('p', 'tactical-clue-used', '本场口令已解读，护盾已领取。');
    const input = el('input');
    input.type = 'text';
    input.lang = clue.language;
    input.autocomplete = 'off';
    input.maxLength = 48;
    input.required = true;
    input.value = memory.answer;
    input.oninput = () => { memory.answer = input.value; };
    const feedback = el('p', 'tactical-clue-feedback', memory.feedback);
    feedback.setAttribute('role', 'status');
    const submit = el('button', '', '领一次护盾');
    submit.type = 'submit';
    const sentence = el('q', '', clue.sentence);
    sentence.lang = clue.language;
    const form = el('form', 'tactical-clue', sentence,
        el('label', '', '找出口令里表示“' + clue.meaning + '”的词', input), submit, feedback);
    form.onsubmit = async event => {
        event.preventDefault();
        if (submit.disabled || !input.value.trim()) return;
        submit.disabled = true;
        try { feedback.textContent = memory.feedback = await answer(input.value); }
        finally { submit.disabled = false; }
    };
    return form;
}

export function tacticalIntentPanel(model, cb, memory) {
    const { battle, save } = model;
    const state = battle.tacticalEncounter;
    const turns = [['本回合', state.intents], ['下回合', state.queued]];
    const entries = turns.map(([label, rows]) => {
        const visible = rows.filter(row => battle.unitsById[row.caster]?.hp > 0);
        let summary = visible.map(row => describeIntent(battle, row, true)).join('  /  ') || '无行动';
        if (label === '本回合' && visible.some(row => row.effect === '恢复' || row.effect === '等待')) {
            const burning = battle.sides.near.filter(unit => unit.hp > 0 && unit.dots?.some(dot => dot.ticks?.length));
            if (burning.length) summary += ' · ' + burning.map(unit => unit === battle.sides.near[0] ? '你' : unit.name).join('、') + '仍会受到持续伤害';
        }
        return { label, visible, summary };
    });
    const notes = el('div', 'tactical-intent-notes');
    for (const {label, visible} of entries) {
        notes.append(el('strong', '', label));
        for (const row of visible) {
            const card = model.assets?.dataset?.cards?.[row.key];
            const description = [describeIntent(battle, row, false), card?.name].filter(Boolean).join(' · ');
            const prepared = preparedHitDetail(battle, row);
            notes.append(el('div', 'tactical-intent-spell', spellIcon(model.assets, row.key),
                el('div', '', el('p', '', description), prepared && el('p', 'tactical-effect-values', prepared),
                    row.effectDetail && el('p', 'tactical-effect-values', row.effectDetail),
                    el('small', '', row.counter), row.effects?.dot?.length ? el('small', '', row.mitigationDetail) : null)));
        }
    }
    const phase = state.id === 'boss' ? (state.phase === 2 ? '第二阶段 · ' : '第一阶段 · ') : '';
    const toggle = el('summary', '', phase + '招式详情与口令');
    const speed = el('input');
    speed.type = 'checkbox';
    speed.checked = !!model.fastChallengePlayback;
    speed.onchange = () => cb.setFastChallengePlayback?.(speed.checked);
    const playback = cb.setFastChallengePlayback
        ? el('label', 'tactical-playback-speed', speed, '快速播放出招（1.5×）') : null;
    const details = el('details', 'tactical-intent-details', toggle, el('div', 'tactical-intent-sheet', playback,
        clueForm(battle, save, cb.answerTacticalClue, memory), notes, button('收起', () => { details.open = false; toggle.focus(); })));
    details.open = memory.open;
    details.ontoggle = () => { memory.open = details.open; };
    const panel = el('aside', 'tactical-intent-panel', ...entries.map(({label, visible, summary}) => {
        const critical = visible.some(row => ['重击', '群攻', '全体虚弱'].includes(row.effect));
        return el('div', 'tactical-intent-row' + (critical ? ' imminent-threat' : ''), el('b', '', label), el('span', '', summary));
    }), details);
    panel.setAttribute('aria-label', '已锁定的敌方行动');
    return panel;
}
