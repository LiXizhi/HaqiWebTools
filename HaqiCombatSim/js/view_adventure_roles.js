import { el, button, createEntryIntro } from './view_adventure.js';
import { tr, setText } from './locale_runtime.js';
import { SCHOOL_NAMES } from './adventure_core.js';
import { MAX_ROLES } from './adventure_roles_core.js';
import {heroPortrait} from './hero_renderer.js';

export function renderRoles(root, assets, model, cb) {
    root.replaceChildren();root.className = 'entry-screen entry-wizard role-screen';
    const intro = createEntryIntro({
        locale: model.locale, secondLocale: cb.secondLocale, setLocale: cb.setLocale, setSecondLocale: cb.setSecondLocale,
    });
    const subtitle = el('p', 'muted');
    if (model.owner) setText(subtitle, 'Keepwork：{owner}', { owner: model.owner });
    else setText(subtitle, '访客角色 · 保存在当前浏览器');
    const head = el('div', 'role-head', el('h1', '', '选择角色'), subtitle);
    if (model.busy) head.append(el('p', 'role-status', model.busy));
    if (model.error) { const error = el('p', 'error-text', model.error);error.setAttribute('role', 'alert');head.append(error); }
    if (model.message) head.append(el('p', 'muted', model.message));
    if (model.owner) head.append(el('p', 'muted', model.dirty ? '当前有本地进度待同步。游玩时每分钟自动同步，也可手动保存。' : '角色云端记录已同步。'));
    const box = el('section', 'character-form role-manager', head);
    const controls = [...intro.controls];
    const addButton = (label, fn, cls = 'secondary') => { const b = button(label, fn, cls);controls.push(b);return b; };
    const rows = el('div', 'role-list');
    const ordered = [...model.catalog.roles].sort((a, b) => (b.id === model.catalog.activeId) - (a.id === model.catalog.activeId));
    for (const row of ordered) {
        const s = row.save, portrait = heroPortrait(assets,s,96,100,{lookAround:false});portrait.className='role-portrait';
        portrait.setAttribute('role', 'img');portrait.setAttribute('aria-label', tr(s.appearance === 'girl' ? '魔法少女' : '魔法少年'));
        const recent = row.id === model.catalog.activeId;
        const meta = el('p', '');setText(meta, '等级 {level} · {school}', { level: s.level, school: SCHOOL_NAMES[s.school] });
        rows.append(el('article', `role-card ${recent ? 'recent' : ''}`, portrait,
            el('div', 'role-description', el('h2', '', s.name), meta, recent && el('small', 'muted', '最近使用')),
            addButton(recent ? '继续旅程' : '进入角色', () => cb.select(row.id), recent ? 'primary' : 'secondary')));
    }
    if (!model.catalog.roles.length) rows.append(el('p', 'muted', '还没有主角，创建你的第一段旅程。'));
    const foot = el('div', 'role-foot');
    const countLine = el('p', 'muted');setText(countLine, '已有 {count} / {total} 个主角', { count: model.catalog.roles.length, total: MAX_ROLES });
    const create = addButton('新建角色', cb.create, 'primary');create.disabled = model.catalog.roles.length >= MAX_ROLES;
    foot.append(countLine, el('div', 'role-create', create));
    if (model.owner) {
        foot.append(el('div', 'role-actions', addButton('保存角色到云端', cb.sync), addButton('刷新云端角色', cb.refresh), addButton('退出 Keepwork', cb.logout)));
        if (model.conflict) foot.append(el('div', 'role-conflict', el('p', '', '云端已有不同的角色进度。加载前会在浏览器自动保留本地副本。'),
            ...model.conflict.catalog.roles.map(row => { const line = el('p', 'muted');setText(line, '{name} · 等级 {level} · {school}', { name: row.save.name, level: row.save.level, school: SCHOOL_NAMES[row.save.school] });return line; }),
            addButton('备份本地并加载云端', cb.useRemote)));
    } else foot.append(addButton('登录 Keepwork', cb.login, 'secondary cloud-entry-button'));
    box.append(rows, foot);
    if (model.busy) for (const control of controls) control.disabled = true;
    root.append(el('div', 'entry-layout', intro.root, box));
    intro.fit();
}
