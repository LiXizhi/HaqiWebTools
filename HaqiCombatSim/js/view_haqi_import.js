import { createCloseButton } from './view_adventure_controls.js';

export function renderOriginalImport(root, state, callbacks) {
    const el = (tag, text, cls = '') => {
        const node = document.createElement(tag);node.textContent = text;node.className = cls;return node;
    };
    const button = (text, action) => { const node = el('button', text, 'secondary');node.type = 'button';node.onclick = action;return node; };
    root.replaceChildren();root.className = 'entry-screen entry-wizard original-import';
    const panel = el('section', '', 'character-form creation-form import-panel');
    const header = el('div', '', 'panel-header');
    header.style.display = 'flex';header.style.alignItems = 'center';header.style.justifyContent = 'space-between';
    header.append(el('h2', '导入哈奇角色'), createCloseButton(callbacks.close, '取消角色导入'));
    panel.append(header);
    if (state.busy && !state.roleIds) {
        const status = el('p', state.busy, 'import-status');status.setAttribute('role', 'status');status.setAttribute('aria-live', 'polite');panel.append(status);
    }
    if (state.error) { const error = el('p', state.error, 'error-text');error.setAttribute('role', 'alert');panel.append(error); }
    if (state.roleIds) {
        panel.append(el('h3', '选择哈奇账号'));
        const roles = el('div', '', 'import-roles');
        for (const id of state.roleIds) {
            const choice = button(`哈奇号 ${id}`, () => callbacks.selectRole(id));
            choice.className = 'secondary import-role';roles.append(choice);
        }
        panel.append(roles);
    }
    if (state.preview) {
        const save = state.preview.save;
        const identity = el('div', '', 'import-identity');
        identity.append(el('h3', save.name), el('span', `Lv.${save.level}`, 'import-level'));
        panel.append(identity);
        const summary = state.preview.summary;
        const previews = el('div', '', 'import-previews');
        for (const [kind, label, iconName] of [['inventory', '背包', 'bag'], ['deck', '卡包', 'cards']]) {
            const entry = button('', () => callbacks.preview(kind));entry.className = 'secondary import-preview';
            entry.disabled = Boolean(state.busy);entry.setAttribute('aria-label', `预览${label}`);
            const icon = el('span', '', 'icon');icon.dataset.uiIcon = iconName;icon.setAttribute('aria-hidden', 'true');
            entry.append(icon, el('strong', label));
            if (summary && typeof summary !== 'string') entry.append(el('span', kind === 'inventory' ? `${summary.equipment} 件装备` : `${summary.cards} 种卡牌`, 'import-count'));
            if (state.reviewed?.[kind]) entry.append(el('span', '已查看', 'import-reviewed'));
            previews.append(entry);
        }
        panel.append(previews);
        const details = el('details', '', 'import-details');
        details.append(el('summary', `导入说明${state.preview.warnings.length ? ` · ${state.preview.warnings.length} 项差异` : ''}`));
        details.append(el('p', '创建独立新角色，不覆盖已有角色；剧情重新开始。'));
        const list = el('ul', '');list.setAttribute('aria-label','导入差异明细');
        for (const warning of state.preview.warnings) list.append(el('li', warning));
        details.append(list);panel.append(details);
        const confirm = button('导入角色', callbacks.confirm);confirm.className = 'primary import-confirm';confirm.disabled = Boolean(state.busy) || !state.reviewed?.inventory || !state.reviewed?.deck;
        if (confirm.disabled && !state.busy) panel.append(el('p', '请先查看背包与卡包', 'import-hint'));
        panel.append(confirm);
    } else if (!state.busy && !state.roleIds) {
        panel.append(el('h3', '当前登录账号'));
        panel.append(el('p', '请先退出原版游戏，读取可能中断原服会话。', 'import-hint'));
        const read = button('查看哈奇账号', callbacks.read);read.className = 'primary import-confirm';panel.append(read);
    }
    if (state.busy) panel.append(button('取消读取', callbacks.close));
    if (state.committing) for (const node of panel.querySelectorAll('button')) node.disabled = true;
    root.append(panel);
}
