import { battleGoal, testDurationMs } from './language_learning_core.js';
import { textFor, speakText, localeChoices } from './locale.js';
import { recognitionLanguage } from './language_learning.js';

export function languageSettings(body, model, cb, { el, button }) {
    const learning = model.save.languageLearning;
    body.append(el('h3', '', '界面语言'));
    const locales = el('div', 'locale-choices');
    for (const row of localeChoices()) {
        const selected = !learning.enabled && model.save.locale === row.id;
        const control = button(row.name, () => cb.setLocale(row.id), selected ? 'primary small' : 'secondary small');
        control.setAttribute('aria-pressed', String(selected));
        locales.append(control);
    }
    body.append(locales);
    body.append(button(learning.enabled ? '语言学习：开启' : '语言学习：关闭', () => cb.setLearning({ ...learning, enabled: !learning.enabled }), 'primary settings-button'));
    if (!learning.enabled) return;
    body.append(el('p', 'muted', '母语'));
    body.append(pairRow('native', learning, cb, { el, button }));
    body.append(el('p', 'muted', '目标语言'));
    body.append(pairRow('target', learning, cb, { el, button }));
}

function pairRow(field, learning, cb, { el, button }) {
    const row = el('div', 'locale-choices');
    for (const locale of localeChoices()) {
        const selected = learning[field] === locale.id;
        const control = button(locale.name, () => {
            const next = { ...learning, [field]: locale.id };
            if (next.native === next.target) next.target = next.native === 'en' ? 'ja' : 'en';
            cb.setLearning(next);
        }, selected ? 'primary small' : 'secondary small');
        control.setAttribute('aria-pressed', String(selected));
        row.append(control);
    }
    return row;
}

export function renderFreeTalk(root, model, npc, cb, { el, button }) {
    const learning = model.save.languageLearning;
    root.replaceChildren();
    root.className = 'overlay visible';
    const box = el('section', 'modal language-room');
    box.setAttribute('role', 'dialog');
    const log = el('div', 'language-log');
    const input = document.createElement('textarea');
    input.className = 'language-input';
    input.rows = 3;
    const status = el('p', 'muted', '自由交谈');
    const send = button('发送', () => submit(input.value), 'primary');
    const mic = button('按住说话', () => {}, 'secondary');
    const phone = button('对话挑战', () => cb.voice(npc), 'secondary');
    box.append(el('header', 'modal-header', el('h2', '', npc.name), button('下次再聊', cb.close, 'secondary small')), status, log, input, el('div', 'language-actions', send, mic, phone));
    root.append(box);
    let listening = false;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    mic.disabled = !Recognition;
    mic.addEventListener('pointerdown', () => {
        if (!Recognition || listening) return;
        const session = new Recognition();
        session.lang = recognitionLanguage(learning.target);
        session.onresult = event => { input.value = event.results?.[0]?.[0]?.transcript || input.value; };
        session.start();
        listening = true;
        mic.addEventListener('pointerup', () => { session.stop(); listening = false; }, { once: true });
    });
    function add(role, text) {
        log.append(el('p', role === 'user' ? 'language-user' : 'language-npc', text));
        log.scrollTop = log.scrollHeight;
    }
    async function submit(value) {
        const answer = String(value || '').trim();
        if (!answer) return;
        input.value = '';
        add('user', answer);
        status.textContent = '…';
        try {
            const reply = await cb.reply(npc, answer);
            add('npc', reply);
            speakText(reply);
            status.textContent = '自由交谈';
        } catch (error) {
            status.textContent = error.message || '语言老师还没有准备好';
        }
    }
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(input.value); } });
    cb.greet(npc).then(text => { if (text) { add('npc', text); speakText(text); } }).catch(() => { status.textContent = '语言老师还没有准备好'; });
}

export function renderLanguageTest(root, model, task, cb, { el, button }) {
    const learning = model.save.languageLearning;
    const duration = testDurationMs(task.price, task.prices);
    root.replaceChildren();
    root.className = 'overlay visible';
    const box = el('section', 'modal language-room');
    const hints = el('ul', 'language-hints');
    for (const hint of task.hints) {
        const item = el('li', '', hint);
        item.textContent = textFor(hint, learning.native);
        hints.append(item);
    }
    const input = document.createElement('textarea');
    input.className = 'language-input';
    const remain = el('p', '', '');
    const status = el('p', 'muted', task.name);
    box.append(el('header', 'modal-header', el('h2', '', '语言挑战'), button('下次再聊', () => finish(false), 'secondary small')), status, remain, hints, input);
    root.append(box);
    const started = Date.now();
    const timer = setInterval(() => {
        const left = Math.max(0, duration - (Date.now() - started));
        remain.textContent = `${Math.ceil(left / 1000)}s`;
        if (!left) finish(true);
    }, 250);
    function finish(judge) {
        clearInterval(timer);
        if (!judge) { cb.close(); return; }
        cb.finish(input.value, duration);
    }
}

export function battleChallengeBar(model, { el, button }) {
    const learning = model.save.languageLearning;
    if (!learning?.enabled) return null;
    const goal = battleGoal(model.battle?.seed);
    const bar = el('div', 'learning-battle');
    const meter = el('div', 'learning-meter', el('i'));
    meter.firstChild.style.width = `${model.learningProgress || 0}%`;
    const hints = el('div', 'learning-hints');
    for (const hint of goal.hints) {
        const item = el('span', '', hint);
        item.textContent = textFor(hint, learning.native);
        hints.append(item);
    }
    const input = document.createElement('input');
    input.className = 'language-input';
    const send = button('发送', () => model.onBattleSpeech?.(input.value, goal), 'primary small');
    bar.append(el('p', '', goal.goal), meter, hints, input, send);
    return bar;
}
