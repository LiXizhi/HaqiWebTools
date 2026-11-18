// Shared DOM primitives for UI components. Safe for Node tests that inject globalThis.document.

export const getDoc = () => globalThis.document;

export function append(node, children) {
    for (const child of children.flat(Infinity)) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child instanceof globalThis.Node || typeof child === 'object' ? child : String(child));
    }
    return node;
}

export function clear(node) {
    node.replaceChildren();
    return node;
}

export function el(tag, className = '', ...children) {
    const node = getDoc().createElement(tag);
    if (className) node.className = className;
    if (children.length) append(node, children);
    return node;
}

export function button(label, onClick, className = '') {
    const btn = el('button', className, label);
    btn.type = 'button';
    if (onClick) btn.onclick = onClick;
    return btn;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgEl(tag, attrs = {}) {
    const node = getDoc().createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === null || value === false) continue;
        node.setAttribute(key, value === true ? '' : String(value));
    }
    return node;
}

export function ensureStylesheet(id, href) {
    const doc = getDoc();
    if (!doc || doc.getElementById(id)) return;
    const link = doc.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    doc.head.append(link);
}

export function createArtCanvas(assets, spec, width, height, ...drawArgs) {
    const doc = getDoc();
    if (!doc || !spec) return null;
    const canvas = doc.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    try {
        assets.draw(canvas.getContext('2d'), spec, 0, 0, width, height, ...drawArgs);
        return canvas;
    } catch {
        return null;
    }
}
