// 设置窗共享控件：分区卡片、可点单元格（动作/链接）、开关行与界面语言按钮组。
// 只依赖注入的 el/button，保持与冒险视图相同的 DOM 构建方式。
import { LOCALES } from './locale_core.js';

export function createSettingsControls({ el, button }) {
    function section(title, ...children) {
        return el('section', 'settings-section', el('h3', 'settings-section-title', title), ...children);
    }
    function textBlock(label, hint) {
        return el('span', 'settings-cell-text', el('strong', '', label), hint ? el('small', '', hint) : null);
    }
    // 动作单元格：整行可点，右侧箭头由 CSS 绘制。
    function cell({ icon, label, hint }, fn) {
        const node = el('button', 'settings-cell', el('span', 'settings-cell-icon', icon), textBlock(label, hint));
        node.type = 'button';
        node.onclick = fn;
        return node;
    }
    function link({ icon, label, hint }, href, blank = false) {
        const node = el('a', 'settings-cell', el('span', 'settings-cell-icon', icon), textBlock(label, hint));
        node.href = href;
        if (blank) { node.target = '_blank'; node.rel = 'noopener'; }
        return node;
    }
    // 开关行：左侧图标与说明，右侧药丸按钮显示 已开启/已关闭。
    function toggle({ icon, label, hint }, on, fn) {
        const pill = button(on ? '已开启' : '已关闭', fn, `settings-toggle${on ? ' on' : ''}`);
        pill.setAttribute('aria-pressed', String(!!on));
        return el('div', 'settings-row', el('span', 'settings-cell-icon', icon), textBlock(label, hint), pill);
    }
    function field(label, ...children) {
        return el('div', 'settings-field', el('span', 'settings-field-label', label), ...children);
    }
    // 界面语言按钮组：设置窗与首页共用；当前语言用主色按钮表达，配 aria-pressed。
    function localeSelector(current, onPick) {
        const row = el('div', 'locale-choices');
        for (const locale of LOCALES) {
            const selected = current === locale.id;
            const control = button(locale.name, () => onPick(locale.id), selected ? 'primary small' : 'secondary small');
            control.setAttribute('aria-pressed', String(selected));
            control.setAttribute('lang', locale.id);
            row.append(control);
        }
        return row;
    }
    return { section, cell, link, toggle, field, localeSelector };
}
