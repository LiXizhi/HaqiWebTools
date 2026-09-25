// Identity until the browser locale module installs a translator. Safe for Node tests.
let translate = value => value;

export function setTranslator(fn) {
    translate = typeof fn === 'function' ? fn : value => value;
}

const CJK = /[\u4e00-\u9fff]/;

export function tr(value) {
    const source = String(value ?? '');
    return translate(source);
}

function slot(value) {
    const raw = value == null ? '' : String(value);
    return CJK.test(raw) ? tr(raw) : raw;
}

// Translate a Chinese pattern, then substitute {tokens}. Chinese slot values are looked up too.
export function fill(pattern, vars = {}) {
    const source = String(pattern ?? '');
    let text = tr(source);
    let zh = source;
    for (const [key, value] of Object.entries(vars)) {
        const raw = value == null ? '' : String(value);
        const token = `{${key}}`;
        text = text.replaceAll(token, slot(value));
        zh = zh.replaceAll(token, raw);
    }
    return { zh, text };
}

export function setText(node, source, vars) {
    if (vars) {
        const filled = fill(source, vars);
        if (node?.dataset) node.dataset.zh = filled.zh;
        if (node) node.textContent = filled.text;
        return node;
    }
    const text = String(source ?? '');
    if (node?.dataset) node.dataset.zh = text;
    if (node) node.textContent = tr(text);
    return node;
}
