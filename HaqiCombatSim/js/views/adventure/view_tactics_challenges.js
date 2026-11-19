import { el, button } from './primitives.js';
import { createCloseButton } from '../../ui/controls.js';
import { TACTICS_FIELD_ENCOUNTERS } from '../../tactics_field_battle_core.js';
import {
  TACTICS_CHALLENGES, TACTICS_SCHOOLS, TACTICS_LOADOUTS, tacticsLoadoutCounts
} from '../../tactics_challenge_core.js';

function choice(label, choices, initial) {
  const select = el('select');
  select.setAttribute('aria-label', label);
  for (const [id, name] of Object.entries(choices)) {
    const option = el('option', '', name);
    option.value = id;
    select.append(option);
  }
  if (Object.hasOwn(choices, initial)) select.value = initial;
  return { select, label: el('label', '', label + ' ', select) };
}

function deckGuide(school, deck) {
  const actions = el('ul');
  for (const hint of [
    '攻击：用小招消耗护盾，把高伤害的牌留给破盾后。',
    '蓄力：强化给自己，陷阱给敌人，随后用本学派攻击。',
    '防守：护盾给即将挨打的人，虚弱给准备重击的敌人。',
    '恢复：治疗也要占一回合，留心敌人的恢复时机。',
    '留牌：重击将至时留盾或虚弱。点重复的牌再选「弃牌」，本回合仍可出招。下回合从待抽牌中补牌。'
  ]) actions.append(el('li', '', hint));
  const note = el('p');
  const update = () => {
    const [small, medium, large, blade, trap, shield, weak, heal] = tacticsLoadoutCounts(deck.value);
    const cards = deck.value === 'attack'
      ? `三种攻击各${small}张，缺少防护和治疗。`
      : `攻击${small + medium + large}、强化${blade}、陷阱${trap}、护盾${shield}、虚弱${weak}、治疗${heal}。`;
    const tip = school.value === 'fire'
      ? ' 灼烧在敌人恢复时也会结算，挂上灼烧后可以穿插治疗。' : '';
    note.textContent = cards + tip;
  };
  school.addEventListener('change', update);
  deck.addEventListener('change', update);
  update();
  return el('details', '', el('summary', '', '查看配卡与出牌提示'), note, actions,
    el('small', '', '借用5级角色，手牌上限6张，有待抽牌时才会补牌。同一场失利后，用原学派和配卡可以重试同一手起始牌。'));
}

export function renderTacticsChallenges(root, save, cb, retry) {
  root.replaceChildren();
  root.className = 'overlay visible';
  const modal = el('section', 'modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', '巡夜战术挑战');
  const header = el('div', 'modal-header', el('h2', '', '巡夜战术挑战'), createCloseButton(cb.close));
  const retryRow = TACTICS_CHALLENGES.find(row => row.id === retry?.id);
  const intro = retryRow
    ? `再战「${retryRow.title}」前，可以换一套配卡或借用其他学派。`
    : '第一次玩？保持默认配卡，先挑战「巡夜试锋」。角色与卡牌免费借用。';
  const school = choice('借用学派', TACTICS_SCHOOLS, retryRow ? retry.school : save.school);
  const deck = choice('配卡倾向', TACTICS_LOADOUTS, retryRow ? retry.loadout : 'balanced');
  const body = el('div', 'modal-body', el('p', '', intro), school.label, deck.label,
    deckGuide(school.select, deck.select));
  for (const row of retryRow ? [retryRow] : TACTICS_CHALLENGES) {
    const record = save.tacticsChallenges?.completed?.[row.id];
    const section = el('section', 'opening-progress', el('h3', '', `${row.kind} · ${row.title}`),
      el('p', '', `${row.size}人编队。${row.summary}`));
    for (const line of row.strategies) section.append(el('p', '', line));
    const reward = record
      ? `已获「${row.honor}」 · 最快${record.bestRounds}回合。每次通关后重新洗牌。`
      : `首胜称号：${row.honor}。`;
    section.append(el('p', '', reward), button('挑战' + row.title,
      () => cb.start(row.id, school.select.value, deck.select.value), 'primary'));
    body.append(section);
  }
  body.append(el('small', '', '去背包的「冒险荣誉」佩戴巡夜称号，角色头顶也会展示。挑战不发经验或金币。'));
  const completed = TACTICS_FIELD_ENCOUNTERS.filter(row => save.tacticsTraining?.completed?.[row.id]?.fieldWins).length;
  const practice = el('details', '', el('summary', '', `和茜茜练习 · ${completed}/4 已完成`),
    el('p', '', '跟着茜茜练习集火、破盾与防护，可随时重练。'));
  for (const row of TACTICS_FIELD_ENCOUNTERS) {
    const won = save.tacticsTraining?.completed?.[row.id]?.fieldWins;
    practice.append(el('div', 'opening-progress', button((won ? '✓ ' : '') + row.title, () => cb.lesson(row.id)),
      el('small', '', row.summary)));
  }
  body.append(practice);
  modal.append(header, body);
  root.append(modal);
}
