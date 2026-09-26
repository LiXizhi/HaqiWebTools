import { languageSettings } from './view_language_learning.js';
import { createSettingsControls } from './view_settings_controls.js';

// 设置窗页签为纯界面状态：切换时原地显隐内容区，重渲染（如开关音效）后保持当前页签。
export const settingsView = { tab: 'journey' };

const SETTINGS_TABS = [
    ['journey', '🧭', '旅途'],
    ['sound', '🎵', '声音'],
    ['language', '💬', '语言'],
    ['about', '📜', '关于'],
];

export function renderSettings(body, model, cb, { el, button }) {
    body.closest('.modal')?.classList.add('settings-modal');
    const ui = createSettingsControls({ el, button });
    const tabs = el('div', 'settings-tabs gui-tabs');
    const panes = {}, tabButtons = {};
    function select(id) {
        settingsView.tab = id;
        for (const key of Object.keys(panes)) {
            panes[key].hidden = key !== id;
            tabButtons[key].setAttribute('aria-pressed', String(key === id));
        }
    }
    for (const [id, emoji, label] of SETTINGS_TABS) {
        const selected = settingsView.tab === id;
        const tab = button([el('span', 'settings-tab-icon', emoji), el('span', 'settings-tab-label', label)], () => select(id), 'settings-tab');
        tab.setAttribute('aria-pressed', String(selected));
        tabButtons[id] = tab;
        tabs.append(tab);
        panes[id] = el('div', 'settings-pane');
        panes[id].hidden = !selected;
    }

    panes.journey.append(
        ui.section('存档与云端', ui.cell({ icon: '☁️', label: '云端旅途 · 跨设备继续冒险', hint: '本地进度自动保存。登录后，升级、重要操作和每十分钟自动同步云端；网络失败会重试。' }, cb.cloud)),
        ui.section('角色', ui.cell({ icon: '🧙', label: '切换 / 新建角色', hint: '回到开始画面，选择或创建新的冒险角色。' }, cb.roles)),
        ui.section('离开', ui.cell({ icon: '🏠', label: '回到开始画面' }, cb.title)),
    );

    panes.sound.append(ui.section('音效与音乐',
        ui.toggle({ icon: '🎵', label: '背景音乐', hint: '城镇与场景的背景音乐。' }, !!model.save.music, cb.music),
        ui.toggle({ icon: '🔊', label: '技能音效', hint: '施法与战斗时播放音效。' }, !!model.soundEnabled, cb.sound),
    ));

    languageSettings(panes.language, model, cb, { el, button });

    panes.about.append(
        ui.section('关于这段旅程',
            el('p', 'muted settings-note', '本章保留魔法哈奇 kids 原版角色、任务对白和卡牌数据。地图、升级节奏和毕业后的镇区是适合单人游玩的二维改编。'),
            el('details', 'source-details', el('summary', '', '查看改编说明'), ...(model.assets.content.adaptations || []).map(text => el('p', 'muted', text)))),
        ui.section('工具与链接',
            ui.cell({ icon: '🧪', label: '属性编辑器 · 调试', hint: '修改当前存档的调试工具。' }, () => cb.panel('debug')),
            ui.link({ icon: '⚔️', label: '打开战斗模拟器' }, 'HaqiCombatSim.html'),
            ui.link({ icon: '✨', label: '技能特效工坊' }, 'HaqiEffects.html', true)),
    );

    body.append(tabs, ...Object.values(panes));
}
