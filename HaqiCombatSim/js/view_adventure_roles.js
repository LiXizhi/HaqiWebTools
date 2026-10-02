import { el, button, createEntryIntro } from './view_adventure.js';
import { tr, setText, fill } from './locale_runtime.js';
import { SCHOOL_NAMES } from './adventure_core.js';
import { MAX_ROLES } from './adventure_roles_core.js';
import {heroPortrait} from './hero_renderer.js';
import {drawSchoolIcon} from './card_renderer.js';

function schoolIcon(school){
    const label=fill('{school}系',{school:SCHOOL_NAMES[school]||school}).text;
    const canvas=el('canvas','role-school-icon');canvas.width=48;canvas.height=48;
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label',label);canvas.title=label;
    const context=canvas.getContext('2d');if(context)drawSchoolIcon(context,school,24,24,40);
    return canvas;
}

export function renderRoles(root, assets, model, cb) {
    root.replaceChildren();root.className = 'entry-screen entry-wizard role-screen';
    const intro = createEntryIntro({
        locale: model.locale, secondLocale: cb.secondLocale, setLocale: cb.setLocale, setSecondLocale: cb.setSecondLocale,
    });
    const controls = [...intro.controls];
    const addButton = (label, fn, cls = 'secondary') => { const b = button(label, fn, cls);controls.push(b);return b; };
    const head = el('div', 'role-head', el('p', 'eyebrow', '重返魔法世界'), el('h2', '', '选择角色'));
    if (model.owner) {
        const subtitle = el('p', 'muted role-account');
        const status = model.message || (!model.recovering && (model.dirty
            ? '当前有本地进度待同步。游玩时每分钟自动同步，也可手动保存。'
            : '角色云端记录已同步。'));
        if (status) setText(subtitle, '{owner}已登录 · {status}', { owner: model.owner, status });
        else setText(subtitle, '{owner}已登录', { owner: model.owner });
        head.append(subtitle);
    } else {
        head.append(
            el('p', 'role-guest-note', '当前为本地访客模式，角色只保存在这台浏览器。'),
            el('p', 'role-guest-note', '请登录 Keepwork 云端账号。'),
        );
    }
    if (model.busy) head.append(el('p', 'role-status', model.busy));
    if (model.error) { const error = el('p', 'error-text', model.error);error.setAttribute('role', 'alert');head.append(error); }
    if (model.message && !model.owner) head.append(el('p', 'muted', model.message));
    if (model.recovering) head.append(el('p', 'role-status', '部分角色暂时无法读取，原存档已保留。可以选择其他角色或新建角色继续游玩。当前进度仅保存在本机，云端同步暂时暂停。'));
    const box = el('section', 'character-form role-manager', head);
    const rows = el('div', 'role-list');
    const ordered = [...model.catalog.roles].sort((a, b) => (b.id === model.catalog.activeId) - (a.id === model.catalog.activeId));
    for (const row of ordered) {
        const s = row.save, portrait = heroPortrait(assets,s,68,76,{lookAround:false});portrait.className='role-portrait';
        portrait.setAttribute('role', 'img');portrait.setAttribute('aria-label', tr(s.appearance === 'girl' ? '魔法少女' : '魔法少年'));
        const recent = row.id === model.catalog.activeId;
        const level = el('span', '');setText(level, '等级 {level}', { level: s.level });
        const meta = el('p', 'role-meta', level, schoolIcon(s.school));
        rows.append(el('article', `role-card ${recent ? 'recent' : ''}`, portrait,
            el('div', 'role-description', el('h2', '', s.name), meta, recent && el('small', 'muted', '最近使用')),
            addButton(recent ? '继续旅程' : '进入角色', () => cb.select(row.id), recent ? 'primary' : 'secondary')));
    }
    if (!model.catalog.roles.length) rows.append(el('p', 'muted', '还没有主角，创建你的第一段旅程。'));
    const foot = el('div', 'role-foot');
    const countLine = el('p', 'muted role-count');setText(countLine, '已有 {count} / {total} 个主角', { count: model.catalog.roles.length, total: MAX_ROLES });
    const create = addButton('新建角色', cb.create, 'primary');create.disabled = model.catalog.roles.length >= MAX_ROLES;
    const createRow = el('div', 'role-create', create);
    if (!model.owner) createRow.append(addButton('登录 Keepwork 云端账号', cb.login, 'primary role-cloud-login'));
    foot.append(countLine, createRow);
    if (model.owner) {
        const sync=addButton('保存角色到云端', cb.sync, 'text-button');sync.disabled=!!model.recovering;
        foot.append(el('div', 'role-actions', sync, addButton('刷新云端角色', cb.refresh, 'text-button'), addButton('退出 Keepwork', cb.logout, 'text-button')));
        if (model.conflict) foot.append(el('div', 'role-conflict', el('p', '', '云端已有不同的角色进度。加载前会在浏览器自动保留本地副本。'),
            ...model.conflict.catalog.roles.map(row => { const line = el('p', 'muted');setText(line, '{name} · 等级 {level} · {school}', { name: row.save.name, level: row.save.level, school: SCHOOL_NAMES[row.save.school] });return line; }),
            addButton('备份本地并加载云端', cb.useRemote)));
    }
    box.append(rows, foot);
    if (model.busy) for (const control of controls) control.disabled = true;
    root.append(el('div', 'entry-layout', intro.root, box));
    intro.fit();
}
