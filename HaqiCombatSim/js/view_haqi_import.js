import { createCloseButton } from './view_adventure_controls.js';

export function renderOriginalImport(root, state, callbacks) {
    const el = (tag, text, cls = '') => {
        const node = document.createElement(tag);node.textContent = text;node.className = cls;return node;
    };
    const button = (text, action) => { const node = el('button', text, 'secondary');node.type = 'button';node.onclick = action;return node; };
    root.replaceChildren();root.className = 'entry-screen entry-wizard';
    const panel = el('section', '', 'character-form creation-form');
    panel.style.maxHeight = '90dvh';panel.style.overflowY = 'auto';panel.style.overflowWrap = 'anywhere';
    const header = el('div', '', 'panel-header');
    header.style.display = 'flex';header.style.alignItems = 'center';header.style.justifyContent = 'space-between';
    header.append(el('h2', '导入魔法哈奇角色'), createCloseButton(callbacks.close, '取消角色导入'));
    panel.append(header, el('p', '使用当前 Keepwork 账号授权登录原版 MMORPG，只读取人物、装备和卡包，不修改原服数据。可能影响原客户端在线会话，请先退出原版游戏。'));
    panel.append(el('p', '导入后作为独立新角色，占用一个角色名额。冒险剧情从头开始；不支持的数据会在确认前列出，不会覆盖现有角色。'));
    panel.append(el('p', '当前仅支持已在原版完成实名认证的成年账号；未成年账号的游戏时长核验尚未接入。'));
    if (state.busy) {
        const status = el('p', state.busy);status.setAttribute('role', 'status');status.setAttribute('aria-live', 'polite');panel.append(status);
    }
    if (state.error) { const error = el('p', state.error, 'error-text');error.setAttribute('role', 'alert');panel.append(error); }
    if (state.preview) {
        const save = state.preview.save;
        panel.append(el('h3', `${save.name} · 等级 ${save.level}`));
        const summary = state.preview.summary;
        if (typeof summary === 'string') panel.append(el('p', summary));
        if (state.preview.warnings.length) {
            panel.append(el('h3', '导入差异，请确认'));
            const list = el('ul', '');
            for (const warning of state.preview.warnings) list.append(el('li', warning));
            panel.append(list);
        }
        const confirm = button('确认导入为新角色', callbacks.confirm);confirm.className = 'primary';confirm.disabled = Boolean(state.busy);panel.append(confirm);
    } else if (!state.busy) {
        panel.append(button('授权并读取原服角色', callbacks.read));
    }
    panel.append(button(state.busy ? '取消读取' : '返回新建角色', callbacks.close));
    if (state.committing) for (const node of panel.querySelectorAll('button')) node.disabled = true;
    root.append(panel);
}
