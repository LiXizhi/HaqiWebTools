// Shared GUI controls. Views supply intent callbacks; no gameplay state here.
import { tr, setText } from '../locale_runtime.js';
import { el, getDoc, svgEl } from './dom.js';

// A modal may remove its opener or repaint its toolbar while it is open.
export function restoreVisibleFocus(...candidates) {
    for (const node of candidates) {
        if (!node?.isConnected || node.disabled || !node.getClientRects?.().length) continue;
        node.focus({ preventScroll: true });
        return node;
    }
    return null;
}

export function createWorldMapSwitch(active, onSelect, haqiLabel = '哈奇世界') {
    const group = el('div', 'parallel-world-buttons');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', tr('切换世界地图'));
    for (const [id, label] of [['haqi', haqiLabel], ['earth', '现实世界']]) {
        const button = el('button', 'primary world-switch-button');
        button.type = 'button';
        button.setAttribute('data-world', id);
        button.setAttribute('aria-label', tr(label));
        const emblem = el('span', 'world-switch-emblem');
        emblem.setAttribute('aria-hidden', 'true');
        // Decorative vectors remain visible until the explorer illustrations load.
        emblem.innerHTML = id === 'haqi'
            ? '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M5 27V14l4-5 4 5v13M19 27V14l4-5 4 5v13M12 27V15l4-7 4 7v12M4 27h24M7 16h4M21 16h4M14 27v-5a2 2 0 0 1 4 0v5M16 8V3l6 2-6 2"/><path d="M8 19h2m12 0h2M15 16h2"/></svg>'
            : '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="16" cy="16" r="11"/><ellipse cx="16" cy="16" rx="5" ry="11"/><path d="M5 16h22M7 10c5 2 13 2 18 0M7 22c5-2 13-2 18 0"/><path d="m25 2 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" fill="currentColor" stroke="none"/></svg>';
        const text = el('span', 'world-switch-label');
        setText(text, label);
        button.append(emblem, text);
        button.setAttribute('aria-pressed', String(id === active));
        button.onclick = () => onSelect(id);
        group.append(button);
    }
    return group;
}

// Map windows share two calm rows: identity/tools above, destination below.
// The illustrated background is cosmetic; all labels and actions remain DOM.
export function createMapHeader(title, active, onSelect, onClose) {
    const header = el('header', 'modal-header map-header');
    const identity = el('div', 'map-header-identity');
    const heading = el('h2');
    setText(heading, title);
    identity.append(heading);
    const tools = el('div', 'map-header-tools');
    tools.append(createCloseButton(onClose));
    const navigation = el('div', 'map-heading');
    if (onSelect) navigation.append(createWorldMapSwitch(active, onSelect));
    header.append(identity, tools, navigation);
    return header;
}

export function createCloseButton(onClose, label = '关闭', extraClass = '') {
    const button = getDoc().createElement('button');
    button.type = 'button';
    button.className = ['close-button', extraClass].filter(Boolean).join(' ');
    button.setAttribute('aria-label', label);
    button.title = label;
    button.onclick = onClose;
    const icon = el('span', 'icon');
    icon.dataset.uiIcon = 'close';
    icon.setAttribute('aria-hidden', 'true');
    // The storybook atlas replaces this vector when available. Keep a clear
    // fallback while the cosmetic asset loads or if its download fails.
    const svg = svgEl('svg', {
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '2.5',
        'stroke-linecap': 'round',
    });
    svg.append(svgEl('path', { d: 'M6 6l12 12M18 6L6 18' }));
    icon.append(svg);
    button.append(icon);
    return button;
}
