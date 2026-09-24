import { LOCALES, lookup, parseLocaleFile, speechCode } from './locale_core.js';
import { setTranslator } from './locale_runtime.js';

const dictionaries = {};
let display = 'zh-CN';
let learning = null;
let tooltip;
let launch;

export async function loadLocaleFiles(fetchText = path => fetch(path).then(response => response.ok ? response.text() : Promise.reject(response.status))) {
    try { dictionaries.en = parseLocaleFile(await fetchText('./data/adventure/locale/en.txt')); }
    catch { dictionaries.en = {}; }
    for (const id of ['ja', 'ko']) {
        try { dictionaries[id] = parseLocaleFile(await fetchText(`./data/adventure/locale/${id}.txt`)); }
        catch { delete dictionaries[id]; }
    }
    applyTranslator();
}

export function configureLocale({ locale = 'zh-CN', languageLearning = null } = {}) {
    learning = languageLearning?.enabled ? languageLearning : null;
    display = learning?.target || locale || 'zh-CN';
    applyTranslator();
    if (!learning && tooltip) tooltip.hidden = true;
    syncLocaleChrome();
    return display;
}

export function displayLocale() { return display; }
export function learningPair() { return learning; }
export function localeChoices() { return LOCALES; }

function applyTranslator() {
    setTranslator(source => lookup(source, display, dictionaries));
}

export function textFor(source, locale) {
    return lookup(String(source ?? ''), locale, dictionaries);
}

let glossAligner = null;

export function setGlossAligner(fn) {
    glossAligner = typeof fn === 'function' ? fn : null;
}

export function speakText(source) {
    const spoken = textFor(source, display);
    const lang = speechCode(display);
    if (typeof window === 'undefined' || !window.speechSynthesis) return false;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.lang = lang;
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
    return true;
}

const GLOSS_COLORS = ['#b45309', '#0f766e', '#1d4ed8', '#7c3aed', '#be123c', '#3f6212', '#c2410c'];

function glossDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('haqi-locale-gloss', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('colors');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function readGloss(key) {
    try {
        const db = await glossDb();
        return await new Promise((resolve, reject) => {
            const request = db.transaction('colors').objectStore('colors').get(key);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    } catch { return null; }
}

async function writeGloss(key, value) {
    try {
        const db = await glossDb();
        await new Promise((resolve, reject) => {
            const request = db.transaction('colors', 'readwrite').objectStore('colors').put(value, key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch { /* The lines stay readable without colors. */ }
}

function parseGlossGroups(text) {
    const raw = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1));
    const groups = Array.isArray(parsed.groups) ? parsed.groups : null;
    if (!groups?.length) return null;
    return groups.filter(group => group && (group.top || group.bottom)).map((group, index) => ({
        color: Number.isInteger(group.color) ? group.color : index,
        top: String(group.top || ''),
        bottom: String(group.bottom || ''),
    }));
}

function paintGlossLine(node, text, groups, side) {
    node.replaceChildren();
    if (!groups?.length) { node.textContent = text; return; }
    const tokens = groups.map(group => ({ color: group.color, text: side === 'top' ? group.top : group.bottom })).filter(token => token.text);
    let rest = text;
    const used = new Set();
    while (rest) {
        let best = null;
        tokens.forEach((token, index) => {
            if (used.has(index)) return;
            const at = rest.toLowerCase().indexOf(token.text.toLowerCase());
            if (at >= 0 && (!best || at < best.at)) best = { at, index, token };
        });
        if (!best) { node.append(rest); break; }
        if (best.at > 0) node.append(rest.slice(0, best.at));
        const span = document.createElement('span');
        span.style.color = GLOSS_COLORS[Math.abs(best.token.color) % GLOSS_COLORS.length];
        span.textContent = rest.slice(best.at, best.at + best.token.text.length);
        node.append(span);
        used.add(best.index);
        rest = rest.slice(best.at + best.token.text.length);
    }
}

const EMPTY_HINT = '拖动任何文字或按钮到这里，可以翻译。';

export function syncLocaleChrome() {
    if (!launch) return;
    const hero = document.querySelector('#hud .hero-status');
    launch.hidden = !learning || !hero;
    launch.classList.toggle('is-open', Boolean(learning && hero && tooltip && !tooltip.hidden));
    if (!learning || !hero) return;
    const rect = hero.getBoundingClientRect();
    launch.style.left = `${rect.left}px`;
    launch.style.top = `${rect.bottom + 8}px`;
}

export function installLocaleTooltip(doc = document) {
    if (!doc?.body || tooltip) return;
    doc.querySelectorAll('.locale-launch, .locale-gloss').forEach(node => node.remove());
    const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h10v8H8l-4 3V5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 9h6v7h-3l-2 2v-2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 8h4M7 11h3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    launch = doc.createElement('button');
    launch.type = 'button';
    launch.className = 'locale-launch';
    launch.hidden = true;
    launch.title = '翻译';
    launch.setAttribute('aria-label', '翻译');
    launch.innerHTML = icon;
    doc.body.append(launch);
    tooltip = doc.createElement('aside');
    tooltip.className = 'locale-gloss';
    tooltip.hidden = true;
    tooltip.setAttribute('role', 'note');
    const topRule = doc.createElement('div');
    topRule.className = 'locale-gloss-rule';
    const hint = doc.createElement('p');
    hint.className = 'locale-gloss-hint';
    const targetLine = doc.createElement('button');
    targetLine.type = 'button';
    targetLine.className = 'locale-gloss-target';
    const targetWords = doc.createElement('span');
    targetWords.className = 'locale-gloss-words';
    const speaker = doc.createElement('span');
    speaker.className = 'locale-gloss-speaker';
    speaker.hidden = true;
    speaker.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M16 9.5a4 4 0 0 1 0 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    targetLine.append(targetWords, speaker);
    const nativeLine = doc.createElement('p');
    nativeLine.className = 'locale-gloss-native';
    const bottomRule = doc.createElement('div');
    bottomRule.className = 'locale-gloss-rule bottom';
    tooltip.append(topRule, hint, targetLine, nativeLine, bottomRule);
    doc.body.append(tooltip);
    let source = '';
    let topText = '';
    let bottomText = '';
    let shownKey = '';
    let placed = false;
    const clampGloss = () => {
        if (tooltip.hidden) return;
        const width = tooltip.offsetWidth;
        const height = tooltip.offsetHeight;
        const left = Math.min(Math.max(8, tooltip.offsetLeft), Math.max(8, window.innerWidth - width - 8));
        const top = Math.min(Math.max(8, tooltip.offsetTop), Math.max(8, window.innerHeight - height - 8));
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    };
    const placeDefault = () => {
        const rect = launch.getBoundingClientRect();
        tooltip.style.left = `${Math.max(8, rect.left)}px`;
        tooltip.style.top = `${rect.bottom + 8}px`;
        clampGloss();
        placed = true;
    };
    const showEmpty = () => {
        source = '';
        hint.textContent = textFor(EMPTY_HINT, display);
        hint.hidden = false;
        targetLine.hidden = true;
        nativeLine.hidden = true;
        bottomRule.hidden = true;
    };
    const show = async node => {
        if (!learning || !node?.dataset?.zh || tooltip.contains(node) || launch.contains(node)) return;
        const nextSource = node.dataset.zh;
        const nextTop = textFor(nextSource, display);
        const nextBottom = textFor(nextSource, learning.native);
        if (!nextTop || !nextBottom || nextTop === nextBottom) return;
        source = nextSource;
        topText = nextTop;
        bottomText = nextBottom;
        shownKey = `${topText}\n${bottomText}`;
        const english = speechCode(display) === 'en-US';
        hint.hidden = true;
        targetLine.hidden = false;
        nativeLine.hidden = false;
        bottomRule.hidden = false;
        targetLine.disabled = !english;
        targetLine.classList.toggle('is-speakable', english);
        targetLine.title = english ? '点击朗读' : '';
        speaker.hidden = !english;
        paintGlossLine(targetWords, topText, null, 'top');
        paintGlossLine(nativeLine, bottomText, null, 'bottom');
        tooltip.hidden = false;
        syncLocaleChrome();
        if (!placed) placeDefault();
        else clampGloss();
        const cached = await readGloss(shownKey);
        if (shownKey === `${topText}\n${bottomText}` && cached) {
            paintGlossLine(targetWords, topText, cached, 'top');
            paintGlossLine(nativeLine, bottomText, cached, 'bottom');
            clampGloss();
        }
    };
    const openPanel = () => {
        if (!source) showEmpty();
        tooltip.hidden = false;
        if (!placed) placeDefault();
        else clampGloss();
        syncLocaleChrome();
    };
    launch.addEventListener('click', () => {
        if (!learning) return;
        if (tooltip.hidden) openPanel();
        else { tooltip.hidden = true; syncLocaleChrome(); }
    });
    window.addEventListener('resize', () => { syncLocaleChrome(); clampGloss(); });
    const interactiveOf = node => node?.closest?.('button, a, summary, label, select, input, textarea, [role="button"]');
    const hits = (element, x, y) => {
        if (!element || element.hidden) return false;
        const box = element.getBoundingClientRect();
        return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    };
    doc.addEventListener('click', event => {
        const node = event.target?.closest?.('[data-zh]');
        if (!learning || tooltip.hidden || !node || tooltip.contains(node) || launch.contains(node) || interactiveOf(node)) return;
        show(node);
    });
    let pulled = null;
    let suppressClick = false;
    const textNode = target => {
        const direct = target?.closest?.('[data-zh]');
        if (direct && !tooltip.contains(direct) && !launch.contains(direct)) return direct;
        const host = target?.closest?.('button, a, summary, label, [role="button"]');
        const inner = host?.querySelector?.('[data-zh]');
        return inner && !tooltip.contains(inner) ? inner : null;
    };
    doc.addEventListener('pointerdown', event => {
        if (launch.contains(event.target) || tooltip.contains(event.target)) return;
        const node = textNode(event.target);
        if (!learning || !node) return;
        pulled = { node, x: event.clientX, y: event.clientY, moved: false };
    });
    doc.addEventListener('pointermove', event => {
        if (!pulled) return;
        if (Math.hypot(event.clientX - pulled.x, event.clientY - pulled.y) > 8) pulled.moved = true;
        if (!pulled.moved) return;
        const over = hits(tooltip, event.clientX, event.clientY) || hits(launch, event.clientX, event.clientY);
        tooltip.classList.toggle('locale-gloss-over', hits(tooltip, event.clientX, event.clientY));
        launch.classList.toggle('locale-gloss-over', over && tooltip.hidden);
    });
    const endPull = event => {
        if (!pulled) return;
        const { node, moved } = pulled;
        pulled = null;
        const over = hits(tooltip, event.clientX, event.clientY) || hits(launch, event.clientX, event.clientY);
        tooltip.classList.remove('locale-gloss-over');
        launch.classList.remove('locale-gloss-over');
        if (moved) suppressClick = true;
        if (moved && over) show(node);
    };
    doc.addEventListener('pointerup', endPull);
    doc.addEventListener('pointercancel', () => { pulled = null; tooltip.classList.remove('locale-gloss-over'); });
    doc.addEventListener('click', event => {
        if (!suppressClick) return;
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
    }, true);
    let drag = null;
    tooltip.addEventListener('pointerdown', event => {
        if (event.target === targetLine && !targetLine.disabled) return;
        drag = { x: event.clientX, y: event.clientY, left: tooltip.offsetLeft, top: tooltip.offsetTop };
        tooltip.classList.add('dragging');
        tooltip.setPointerCapture?.(event.pointerId);
    });
    tooltip.addEventListener('pointermove', event => {
        if (!drag) return;
        tooltip.style.left = `${drag.left + event.clientX - drag.x}px`;
        tooltip.style.top = `${drag.top + event.clientY - drag.y}px`;
        clampGloss();
    });
    const stopDrag = () => { if (drag) placed = true; drag = null; tooltip.classList.remove('dragging'); };
    tooltip.addEventListener('pointerup', stopDrag);
    tooltip.addEventListener('pointercancel', stopDrag);
    targetLine.addEventListener('click', async event => {
        event.stopPropagation();
        if (targetLine.disabled || !source) return;
        speakText(source);
        if (!glossAligner) return;
        const key = shownKey;
        if (await readGloss(key)) return;
        try {
            const reply = await glossAligner(topText, bottomText);
            const groups = parseGlossGroups(reply);
            if (!groups || key !== shownKey) return;
            await writeGloss(key, groups);
            paintGlossLine(targetWords, topText, groups, 'top');
            paintGlossLine(nativeLine, bottomText, groups, 'bottom');
        } catch { /* Speech already started. Uncolored lines remain. */ }
    });
}
