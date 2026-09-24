// Identity until the browser locale module installs a translator. Safe for Node tests.
let translate = value => value;

export function setTranslator(fn) {
    translate = typeof fn === 'function' ? fn : value => value;
}

export function tr(value) {
    const source = String(value ?? '');
    return translate(source);
}

export function setText(node, source) {
    const text = String(source ?? '');
    if (node?.dataset) node.dataset.zh = text;
    if (node) node.textContent = tr(text);
    return node;
}
