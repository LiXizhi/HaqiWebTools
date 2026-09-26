import { teachingMode } from './adventure_core.js';

// 教学模式指引（2026-09-26 用户约定）：营地任务链未完成时，新手任务会打开的
// 面板（魔法卡包、背包/装备、强化、宠物）以悬浮指针直接指向需要点击的对象，
// 不占主 UI 布局；任务链全部交付后指针自动消失。判定统一走 adventure_core
// 的 teachingMode。

// 在目标节点上叠加悬浮教学指针（👇 + 脉冲光晕）；非教学模式或目标缺失时跳过。
// 目标节点需 position:relative（bag-library-card、强化按钮、宠物教学按钮、装备
// 物品按钮均满足；.teach-target 类本身也会强制 position:relative 兜底）。
// 重复调用同节点不会叠加多个指针。
export function teachPointer(target, save, content) {
    if (!target || !teachingMode(save, content)) return;
    target.classList.add('teach-target');
    if (target.querySelector(':scope > .teach-pointer')) return;
    const ptr = document.createElement('span');
    ptr.className = 'teach-pointer';
    ptr.textContent = '👇';
    ptr.setAttribute('aria-hidden', 'true');
    target.append(ptr);
}
