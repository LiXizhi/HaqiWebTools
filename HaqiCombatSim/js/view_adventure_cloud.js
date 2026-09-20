import {createCloseButton} from './view_adventure_controls.js';
import { islandName } from './adventure_world_map_core.js';
import { el, button } from './view_adventure.js';
import { SCHOOL_NAMES } from './adventure_core.js';
function progressCard(save, label) {
    return el('article', 'cloud-progress', el('p', 'eyebrow', label), save
        ? el('div', '', el('h3', '', save.name), el('p', '', `${SCHOOL_NAMES[save.school]} · 等级 ${save.level} · ${Object.values(save.quests).filter(q => q.claimed).length} / 14 任务`), el('small', 'muted', `${islandName(save.zone)}${save.pendingEncounter ? ' · 战斗中（恢复已保存的回合）' : ''}`))
        : el('p', 'muted', '还没有本地冒险记录'));
}
function readableDate(value) { const date = new Date(value);return Number.isFinite(+date) ? date.toLocaleString('zh-CN', { hour12: false }) : '未知时间'; }
export function renderCloud(root, state, callbacks) {
    root.replaceChildren();root.className = 'overlay visible';
    const box = el('section', 'modal cloud-modal');box.setAttribute('role', 'dialog');box.setAttribute('aria-modal', 'true');box.setAttribute('aria-label', '云端旅途');
    const close = createCloseButton(callbacks.close);
    const body = el('div', 'modal-body');
    box.append(el('header', 'modal-header', el('div', '', el('p', 'eyebrow', '在另一台设备，接着冒险'), el('h2', '', '云端旅途')), close), body);root.append(box);
    body.append(el('p', 'muted', '本地进度照常自动保存。手动保存到 Keepwork 后，可在其他设备登录同一账号、选择记录继续。每次保存都会新增一条记录。'), progressCard(state.local, '当前本地进度'));
    if (state.localUpdatedAt) body.append(el('p', 'muted cloud-time', `本地保存：${readableDate(state.localUpdatedAt)}`));
    const account = el('div', 'cloud-actions', el('span', '', state.owner ? `Keepwork · ${state.owner}` : '尚未连接 Keepwork'), button(state.owner ? '重新连接' : '连接 Keepwork', callbacks.connect, 'secondary'));
    body.append(account);
    if (state.owner) {
        const upload = button('保存当前进度到云端', callbacks.upload, 'primary');upload.disabled = !state.local;
        body.append(el('div', 'cloud-actions', upload, button('刷新云端记录', callbacks.refresh, 'secondary')));
    }
    const status = el('p', state.error ? 'error-text cloud-status' : 'muted cloud-status', state.busy || state.error || state.message || '连接后可查看云端记录。');status.setAttribute('role', state.error ? 'alert' : 'status');body.append(status);
    if (state.preview) {
        const preview = el('section', 'cloud-preview', progressCard(state.preview.save, '即将恢复的云端进度'), el('p', 'muted', `保存时间：${readableDate(state.preview.snapshot.updatedAt)}`), el('p', '', '恢复会替换当前旅程。替换前会在此浏览器保留一份本地备份，可在这里恢复。'), el('div', 'cloud-actions', button('确认恢复这份进度', callbacks.restore, 'primary'), button('取消恢复', callbacks.cancelPreview, 'secondary')));
        body.append(preview);
    }
    if (state.paths.length) {
        body.append(el('h3', 'cloud-list-title', '最近的云端记录'));
        const list = el('div', 'cloud-list');
        for (const path of state.paths) {
            const parts = path.match(/(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)(\d{3})Z/);
            const date = parts ? `${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}.${parts[7]}Z` : '';
            list.append(button([el('span', '', readableDate(date)), el('small', '', '查看并比较 →')], () => callbacks.preview(path), 'cloud-record'));
        }
        body.append(list, el('p', 'muted', '最多显示最近 30 条。先查看角色与任务进度，再决定是否恢复。'));
    }
    if (state.hasBackup) body.append(button('恢复上次保留的本地进度', callbacks.backup, 'secondary settings-button'));
    body.append(el('p', 'muted cloud-footnote', '云端仅保存角色与游戏进度，存储于你的 Keepwork 项目；可见性遵循该项目设置。'));
    if (state.busy) for (const node of body.querySelectorAll('button')) node.disabled = true;
}
