import { languageSettings } from './view_language_learning.js';
import { createSettingsControls } from './view_settings_controls.js';
import { tr } from './locale_runtime.js';
import {assignPlayerInput,normalizePlayerInputs} from './player_input_core.js';
import {connectedPads} from './player_input.js';

// 设置窗页签为纯界面状态：切换时原地显隐内容区，重渲染（如开关音效）后保持当前页签。
export const settingsView = { tab: 'journey' };

const SETTINGS_TABS = [
    ['journey', '🧭', '旅途'],
    ['game', '🎮', '游戏'],
    ['language', '💬', '语言'],
    ['about', '📜', '关于'],
];

export function renderSettings(body, model, cb, { el, button }) {
    body.closest('.modal')?.classList.add('settings-modal');
    const ui = createSettingsControls({ el, button });
    const focusAction=(key,fn)=>async()=>{await fn?.();body.ownerDocument.querySelector(`[data-game-control="${key}"]`)?.focus();};
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
        if(settingsView.tab==='sound')settingsView.tab='game';
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
        ui.section('角色', ui.cell({ icon: '🧙', label: '切换 / 新建角色', hint: '回到开始画面，选择或创建新的冒险角色。' }, cb.roles),
            ui.cell({ icon: '', label: '删除当前角色', hint: '删除后无法撤销；云端角色的删除也会同步到账号。' }, () => {
                if (window.confirm(`${tr('确定删除当前角色吗？')}\n${model.save.name || ''}\n${tr('删除后无法撤销；云端角色的删除也会同步到账号。')}`)) cb.deleteRole?.();
            })),
        ui.section('离开', ui.cell({ icon: '🏠', label: '回到开始画面' }, cb.title)),
    );

    panes.game.append(el('p','muted settings-note','仅保存在此设备，不同步到云端。'));
    const devices=ui.section('每位玩家的控制器'),deviceMessage=el('p','muted');
    let assignments=normalizePlayerInputs(model.gameSettings?.playerInputs),deviceSignature='';
    const deviceSelects=[0,1].map(owner=>{
        const select=el('select','');select.setAttribute('aria-label',`玩家${owner+1}控制器`);
        select.onchange=()=>{try{
            const pad=connectedPads().find(p=>`gamepad:${p.index}`===select.value);
            if(select.value.startsWith('gamepad:')&&!pad)throw Error('手柄已经断开，请刷新设备列表');
            const device=pad?{type:'gamepad',index:pad.index,id:pad.id}:{type:select.value};
            assignments=assignPlayerInput(assignments,owner,device);cb.gameSetting?.('playerInputs',assignments);deviceMessage.textContent=assignments[1-owner].type==='none'?'控制器分配已保存；另一位玩家暂不分配设备':'控制器分配已保存';
        }catch(error){deviceMessage.textContent=error.message;}refreshDevices(true);};
        devices.append(ui.field(`玩家${owner+1}`,select));return select;
    });
    function refreshDevices(force=false){
        const pads=connectedPads(),signature=JSON.stringify(pads.map(p=>[p.index,p.id,p.mapping]));if(!force&&signature===deviceSignature)return;deviceSignature=signature;
        deviceSelects.forEach((select,owner)=>{
            select.replaceChildren();
            const options=[['none','暂不分配'],['keyboard-mouse','完整鼠标＋键盘'],['keyboard-left','键盘左侧（WASD）'],['keyboard-right','键盘右侧（方向键）'],...pads.map(p=>[`gamepad:${p.index}`,`手柄 ${p.index+1}：${p.id}${p.mapping==='standard'?'':'（暂不支持此映射）'}`])];
            const current=assignments[owner],value=current.type==='gamepad'?`gamepad:${current.index}`:current.type;
            if(current.type==='gamepad'&&!pads.some(p=>p.index===current.index&&p.id===current.id))options.push([`missing:${owner}`,`已断开：${current.id}（重新连接或更换设备）`]);
            for(const [id,label] of options){const option=el('option','',label);option.value=id;const pad=pads.find(p=>`gamepad:${p.index}`===id);option.disabled=id.startsWith('missing:')||id.startsWith('gamepad:')&&pad?.mapping!=='standard';select.append(option);}
            select.value=current.type==='gamepad'&&!pads.some(p=>p.index===current.index&&p.id===current.id)?`missing:${owner}`:value;
        });
    }
    devices.append(deviceMessage,el('p','muted','连接手柄后按一次按钮，再选择设备。Xbox标准布局：左摇杆／十字键移动或选择，A确认，B返回，X弃牌，Y宠物，LB卡包，RB跳过，RT跟随，View背包，Menu设置。断开时角色停止；重新连接后先松开按键。'),button('刷新已连接手柄',()=>refreshDevices(true),'secondary'));
    panes.game.append(devices);refreshDevices(true);
    const deviceTimer=setInterval(()=>{if(!body.isConnected){clearInterval(deviceTimer);return;}refreshDevices();},1000);
    const graphics=ui.section('画面'),graphicUpdates=[];
    for(const [key,label] of [['particles','场景粒子'],['trails','角色足迹与拖尾']]){
        const choices=el('div','locale-choices'),status=el('small','muted');
        let chosen=model.gameSettings?.[key]||'auto';
        const controls=[];
        const update=()=>{for(const [value,node] of controls){node.setAttribute('aria-pressed',String(value===chosen));node.className=value===chosen?'primary small':'secondary small';}status.textContent=tr(chosen==='auto'?(model.effectiveGraphics?.[key]===false?'自动：为保持流畅，已关闭':'自动：已开启'):chosen==='on'?'已开启':'已关闭');};
        for(const [value,text] of [['auto','自动'],['on','开启'],['off','关闭']]){
            const control=button(text,()=>{chosen=value;const effective=cb.gameSetting?.(key,value);if(effective)model.effectiveGraphics=effective;else if(value==='auto'&&model.effectiveGraphics)model.effectiveGraphics[key]=true;for(const update of graphicUpdates)update();},'secondary small');controls.push([value,control]);choices.append(control);
        }
        graphicUpdates.push(update);update();graphics.append(ui.field(label,choices,status));
    }
    panes.game.append(graphics);
    const environment=ui.section('现实世界光照与天气');
    for(const [key,label,options] of [
        ['earthLight','昼夜',[['auto','当地日照'],['day','白昼'],['dusk','黄昏'],['night','夜晚']]],
        ['earthWeather','天气',[['auto','模拟天气'],['clear','晴朗'],['rain','下雨'],['snow','下雪'],['fog','薄雾'],['sand','风沙'],['off','关闭']]],
    ]){
        const choices=el('div','locale-choices'),controls=[];let chosen=model.gameSettings?.[key]||(key==='earthLight'?'day':'clear');
        const update=()=>{for(const [value,node] of controls){node.setAttribute('aria-pressed',String(value===chosen));node.className=value===chosen?'primary small':'secondary small';}};
        for(const [value,text] of options){const control=button(text,()=>{chosen=value;cb.gameSetting?.(key,value);update();},'secondary small');controls.push([value,control]);choices.append(control);}
        update();environment.append(ui.field(label,choices));
    }
    environment.append(el('p','muted settings-note','仅作用于现实世界和城市街景。当地日照按经纬度估算；模拟天气并非实时预报。关闭场景粒子可同时停用动态天气与水面微光。'));
    panes.game.append(environment);
    const volume=el('input'),volumeLabel=el('output');
    volume.className='settings-sound-volume';volume.type='range';volume.min='0';volume.max='100';volume.step='1';
    volume.value=String(Math.round((model.soundVolume??.3)*100));
    volume.setAttribute('aria-label','游戏音效音量');
    volumeLabel.textContent=`${volume.value}%`;
    volume.oninput=()=>{volumeLabel.textContent=`${volume.value}%`;cb.soundVolume?.(Number(volume.value)/100);};
    const preview=button('试听音效',cb.soundPreview,'secondary small');
    preview.disabled=!model.soundEnabled;
    panes.game.append(ui.section('音效与音乐',
        ui.toggle({ icon: '🎵', label: '背景音乐', hint: '城镇与场景的背景音乐。' }, !!model.gameSettings?.music, focusAction('music',cb.music)),
        ui.toggle({ icon: '', label: '游戏音效', hint: '战斗、奖励与冒险交互的短音效；朗读和录音时自动静音。' }, !!model.soundEnabled, focusAction('sound',cb.sound)),
        ui.field('音效音量',volume,volumeLabel,preview),
    ));

    const audioToggles=panes.game.querySelectorAll('.settings-toggle');
    ['music','sound'].forEach((key,i)=>{if(audioToggles[i])audioToggles[i].dataset.gameControl=key;});
    panes.game.append(ui.section('操作',
        el('p','muted','WASD 或方向键移动；点击地面寻路，按住鼠标跟随。'),
        el('p','muted','触屏轻点寻路，拖动摇杆移动，双指缩放。'),
        el('p','muted','E 交谈，B / I 背包，C 卡包，J 任务，P 宠物，Esc 关闭或打开设置。'),
        ui.cell({icon:'',label:'重置场景缩放'},()=>cb.resetZoom?.())));

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
