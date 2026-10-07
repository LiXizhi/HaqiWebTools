import { el, button, createEntryIntro } from './view_adventure.js';
import { tr, setText, fill } from './locale_runtime.js';
import { SCHOOL_NAMES } from './adventure_core.js';
import { MAX_ROLES_FREE, roleLimit } from './adventure_roles_core.js';
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
    const duo = model.duoSelection;
    const heading = el('div', 'role-heading', el('h2', '', '选择角色'));
    if (cb.toggleDuo) {
        const toggle = addButton(duo ? '单人模式' : '双人模式', cb.toggleDuo);
        if (!duo) toggle.title = tr('双人模式至少需要两个不同角色。');
        heading.append(toggle);
    }
    const head = el('div', 'role-head', el('p', 'eyebrow', '重返魔法世界'), heading);
    if (cb.toggleDuo && model.catalog.roles.length < 2) head.append(el('p', 'role-duo-status', '双人模式至少需要两个不同角色，请先点击“新建角色”创建第二个角色。'));
    if (duo) {
        const choices=el('div','gui-tabs');
        for(const [value,label] of [['human','两位真人'],['ai','真人和 AI']]){
            const choice=addButton(label,()=>cb.setDuoController?.(value));choice.setAttribute('aria-pressed',String((model.duoController||'human')===value));choices.append(choice);
        }
        head.append(choices);
        const status = el('p', 'role-duo-status');status.setAttribute('aria-live', 'polite');
        setText(status, '已确认 {count} / 2 · 两个角色确认后进入游戏', {count: duo.filter(Boolean).length});
        head.append(status);
        if (duo.every(Boolean)) head.append(addButton('进入双人冒险', cb.retryDuo, 'primary'));
    }
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
        const removeLabel = fill('删除角色 {name}', { name: s.name || '' }).text;
        const remove = el('button', 'role-delete');
        remove.type = 'button';
        remove.setAttribute('aria-label', removeLabel);
        remove.title = removeLabel;
        remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M7 7l1 13h8l1-13"/></svg>';
        remove.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            const prompt = fill('确定删除角色 {name} 吗？', { name: s.name || '' }).text;
            if (window.confirm(`${prompt}\n${tr('删除后无法撤销；云端角色的删除也会同步到账号。')}`)) cb.remove?.(row.id);
        };
        controls.push(remove);
        const description = el('div', 'role-description', el('div', 'role-name-line', el('h2', '', s.name), remove), meta, recent && el('small', 'muted', '最近使用'));
        let action;
        const slot = duo ? duo.indexOf(row.id) : -1;
        if (duo) {
            if (slot >= 0) {
                const badge = el('span', `role-player-tag player-${slot + 1}`);
                setText(badge, '角色{number} · 已确认', {number: slot + 1});description.prepend(badge);
            }
            action = addButton(slot >= 0 ? '取消确认' : '确认角色', () => cb.confirmDuo(row.id), slot >= 0 ? 'secondary' : 'primary');
            if (slot < 0) {
                setText(action, '确认角色{number}', {number: duo.indexOf(null) + 1});
                action.disabled = duo.every(Boolean);
                if (action.disabled) setText(action, '等待进入');
            }
        } else action = addButton(recent ? '继续旅程' : '进入角色', () => cb.select(row.id), recent ? 'primary' : 'secondary');
        rows.append(el('article', `role-card ${recent ? 'recent' : ''} ${slot >= 0 ? 'duo-confirmed' : ''}`, portrait, description, action));
    }
    if (!model.catalog.roles.length) rows.append(el('p', 'muted', '还没有主角，创建你的第一段旅程。'));
    const foot = el('div', 'role-foot');
    const limit = Number.isFinite(model.roleLimit) ? model.roleLimit : roleLimit(model.isVip === true);
    const countLine = el('p', 'muted role-count');setText(countLine, '已有 {count} / {total} 个主角', { count: model.catalog.roles.length, total: limit });
    const create = addButton('新建角色', cb.create, 'primary');create.disabled = model.catalog.roles.length >= limit;
    const createRow = el('div', 'role-create', create);
    if (!model.owner) createRow.append(addButton('登录 Keepwork 云端账号', cb.login, 'primary role-cloud-login'));
    foot.append(countLine);
    if (model.owner && limit <= MAX_ROLES_FREE && model.catalog.roles.length >= MAX_ROLES_FREE) {
        foot.append(el('p', 'muted role-vip-hint', '开通会员可将主角名额提升到 20 个。'));
    }
    foot.append(createRow);
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
