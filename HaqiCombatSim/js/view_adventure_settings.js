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
        ui.section('存档与云端', ui.cell({ icon: '☁️', label: '登录 Keepwork', hint: '直接打开 Keepwork 登录。登录后回到开始画面，列出该账号的全部云端角色，不会自动进入世界。' }, cb.cloud)),
        ui.section('角色', ui.cell({ icon: '🧙', label: '切换 / 新建角色', hint: '回到开始画面，选择或创建新的冒险角色。' }, cb.roles)),
        ui.section('离开', ui.cell({ icon: '🏠', label: '回到开始画面' }, cb.title)),
    );

    const volume=el('input'),volumeLabel=el('output');
    volume.className='settings-sound-volume';volume.type='range';volume.min='0';volume.max='100';volume.step='1';
    volume.value=String(Math.round((model.soundVolume??.3)*100));
    volume.setAttribute('aria-label','游戏音效音量');
    volumeLabel.textContent=`${volume.value}%`;
    volume.oninput=()=>{volumeLabel.textContent=`${volume.value}%`;cb.soundVolume?.(Number(volume.value)/100);};
    const preview=button('试听音效',cb.soundPreview,'secondary small');
    preview.disabled=!model.soundEnabled;
    panes.sound.append(ui.section('音效与音乐',
        ui.toggle({ icon: '🎵', label: '背景音乐', hint: '城镇与场景的背景音乐。' }, !!model.save.music, cb.music),
        ui.toggle({ icon: '', label: '游戏音效', hint: '战斗、奖励与冒险交互的短音效；朗读和录音时自动静音。' }, !!model.soundEnabled, cb.sound),
        ui.field('音效音量',volume,volumeLabel,preview),
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
