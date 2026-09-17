// utils.js — DOM 与格式化小工具（仅 view_* / app 使用，引擎层不得引用）。

/** h('div.cls#id', {attrs}, ...children) */
export function h(tag, attrs, ...children) {
    const m = /^([a-zA-Z0-9-]+)?((?:[.#][\w-]+)*)$/.exec(tag);
    const el = document.createElement((m && m[1]) || 'div');
    if (m && m[2]) {
        for (const part of m[2].match(/[.#][\w-]+/g) || []) {
            if (part[0] === '.') el.classList.add(part.slice(1));
            else el.id = part.slice(1);
        }
    }
    if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
        for (const [k, v] of Object.entries(attrs)) {
            if (v === undefined || v === null || v === false) continue;
            if (k === 'class') el.className += (el.className ? ' ' : '') + v;
            else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
            else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
            else if (k === 'dataset') Object.assign(el.dataset, v);
            else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
            else el.setAttribute(k, v === true ? '' : v);
        }
    } else if (attrs !== undefined && attrs !== null) {
        children.unshift(attrs);
    }
    append(el, children);
    return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** svg('circle', {cx, cy, r, class, onClick}, ...children)：SVG 命名空间版 h() */
export function svg(tag, attrs, ...children) {
    const el = document.createElementNS(SVG_NS, tag);
    if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
        for (const [k, v] of Object.entries(attrs)) {
            if (v === undefined || v === null || v === false) continue;
            if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
            else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
            else el.setAttribute(k, v === true ? '' : v);
        }
    } else if (attrs !== undefined && attrs !== null) {
        children.unshift(attrs);
    }
    append(el, children);
    return el;
}

export function append(el, children) {
    for (const c of children.flat(Infinity)) {
        if (c === null || c === undefined || c === false) continue;
        el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
}

export function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
}

export function pct(v, digits = 1) {
    if (v === null || v === undefined || Number.isNaN(v)) return '-';
    return (v * 100).toFixed(digits) + '%';
}

export function fmt(v, digits = 1) {
    if (v === null || v === undefined || Number.isNaN(v)) return '-';
    if (Number.isInteger(v)) return String(v);
    return Number(v).toFixed(digits);
}

/** 胜率 → 颜色（红 <50% 蓝 >50%） */
export function winColor(p) {
    if (p === null || p === undefined) return '#333';
    const t = Math.max(0, Math.min(1, p));
    const r = Math.round(230 - 180 * t);
    const b = Math.round(60 + 170 * t);
    const g = Math.round(90 + 60 * (1 - Math.abs(t - 0.5) * 2));
    return `rgb(${r},${g},${b})`;
}

export function download(filename, text, type = 'application/json') {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

export function readFileText(file) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = rej;
        r.readAsText(file);
    });
}

export function debounce(fn, ms = 200) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function select(options, value, onChange, attrs = {}) {
    const el = h('select', { ...attrs, onChange: (e) => onChange(e.target.value, e) });
    for (const o of options) {
        const opt = typeof o === 'string' ? { value: o, label: o } : o;
        el.appendChild(h('option', { value: opt.value, selected: String(opt.value) === String(value) }, opt.label));
    }
    return el;
}

export function numberInput(value, onChange, attrs = {}) {
    return h('input', {
        type: 'number', value, ...attrs,
        onChange: (e) => onChange(e.target.value === '' ? null : Number(e.target.value), e),
    });
}

export function toast(msg, ms = 2500) {
    let box = document.getElementById('toast');
    if (!box) { box = h('div#toast'); document.body.appendChild(box); }
    const item = h('div.toast-item', msg);
    box.appendChild(item);
    setTimeout(() => item.remove(), ms);
}
