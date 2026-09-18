import { el, button } from './view_adventure.js';
import { SCHOOL_NAMES } from './adventure_core.js';
import { MAX_ROLES } from './adventure_roles_core.js';

export function renderRoles(root, assets, model, cb) {
    root.replaceChildren();root.className = 'entry-screen role-screen';
    const box = el('section', 'character-form role-manager', el('p', 'eyebrow', '魔法哈奇 · 你的主角'),
        el('h1', '', '选择角色'), el('p', 'muted', model.owner ? `Keepwork：${model.owner}` : '访客角色 · 保存在当前浏览器'));
    if (model.busy) box.append(el('p', 'role-status', model.busy));
    if (model.error) { const error = el('p', 'error-text', model.error);error.setAttribute('role', 'alert');box.append(error); }
    if (model.message) box.append(el('p', 'muted', model.message));
    if (model.owner) box.append(el('p', 'muted', model.dirty ? '当前有本地进度待同步。游玩时每分钟自动同步，也可手动保存。' : '角色云端记录已同步。'));
    const controls = [];
    const addButton = (label, fn, cls = 'secondary') => { const b = button(label, fn, cls);controls.push(b);return b; };
    const rows = el('div', 'role-list');
    for (const row of model.catalog.roles) {
        const s = row.save, portrait = el('canvas', 'role-portrait');portrait.width = 96;portrait.height = 100;
        assets.tile(portrait.getContext('2d'), 'sprites', s.appearance === 'girl' ? 12 : 8, 0, 0, 96, 100);
        portrait.setAttribute('role', 'img');portrait.setAttribute('aria-label', s.appearance === 'girl' ? '魔法少女' : '魔法少年');
        const recent = row.id === model.catalog.activeId;
        rows.append(el('article', `role-card ${recent ? 'recent' : ''}`, portrait,
            el('div', 'role-description', el('h2', '', s.name), el('p', '', `等级 ${s.level} · ${SCHOOL_NAMES[s.school]}`), recent && el('small', 'muted', '最近使用')),
            addButton(recent ? '继续旅程' : '进入角色', () => cb.select(row.id), recent ? 'primary' : 'secondary')));
    }
    if (!model.catalog.roles.length) rows.append(el('p', 'muted', '还没有主角，创建你的第一段旅程。'));
    box.append(rows, el('p', 'muted', `已有 ${model.catalog.roles.length} / ${MAX_ROLES} 个主角`));
    const create = addButton('新建角色', cb.create, 'primary');create.disabled = model.catalog.roles.length >= MAX_ROLES;
    box.append(el('div', 'role-create', create));
    if (model.owner) {
        box.append(el('div', 'role-actions', addButton('保存角色到云端', cb.sync), addButton('刷新云端角色', cb.refresh), addButton('退出 Keepwork', cb.logout)));
        if (model.conflict) box.append(el('div', 'role-conflict', el('p', '', '云端已有不同的角色进度。加载前会在浏览器自动保留本地副本。'),
            ...model.conflict.catalog.roles.map(row => el('p', 'muted', `${row.save.name} · 等级 ${row.save.level} · ${SCHOOL_NAMES[row.save.school]}`)),
            addButton('备份本地并加载云端', cb.useRemote)));
    } else box.append(addButton('登录 Keepwork，继续最近角色', cb.login, 'secondary cloud-entry-button'));
    if (model.busy) for (const control of controls) control.disabled = true;
    root.append(box);
}
