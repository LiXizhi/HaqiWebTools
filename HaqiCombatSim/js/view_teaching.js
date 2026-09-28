import { teachingMode } from './adventure_core.js';

// 教学模式指引（2026-09-26 用户约定）：营地任务链未完成时，新手任务会打开的
// 面板（魔法卡包、背包/装备、强化、宠物）以悬浮指针直接指向需要点击的对象，
// 不占主 UI 布局。判定统一走 adventure_core 的 teachingMode。
// 2026-09-28：指针改挂到 document.body，固定定位且层级高于面板，避免被卡牌列表、
// 弹窗的 overflow 裁掉。卡包少于 8 张，或身上有能强化但还没强化、材料也够的装备时，箭头一直显示，点击不消失。

const GUIDE_KEYS = new Set(['teachDeck', 'teachUpgrade']);

function canFloat(target) {
    return !!target?.getBoundingClientRect && typeof document !== 'undefined' && document.body
        && typeof document.body.append === 'function' && typeof getComputedStyle === 'function'
        && typeof requestAnimationFrame === 'function';
}

// 最近的可滚动/裁剪祖先。指针锚点离开这块区域时隐藏，避免滚出列表后还指着别的控件。
function clipParent(node) {
    for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (/(auto|scroll|hidden)/.test(`${style.overflowX} ${style.overflowY}`)) return parent;
    }
    return null;
}

function placeFloat(target, ptr) {
    if (!target.isConnected) return false;
    const rect = target.getBoundingClientRect();
    const clip = clipParent(target)?.getBoundingClientRect();
    const shown = rect.width > 0 && rect.height > 0
        && (!clip || (rect.top >= clip.top - 1 && rect.top <= clip.bottom && rect.left + rect.width / 2 >= clip.left && rect.left + rect.width / 2 <= clip.right));
    ptr.hidden = !shown;
    ptr.style.left = `${rect.left + rect.width / 2}px`;
    ptr.style.top = `${rect.top}px`;
    return true;
}

function mountPointer(target) {
    const ptr = document.createElement('span');
    ptr.className = 'teach-pointer';
    ptr.textContent = '👇';
    ptr.setAttribute('aria-hidden', 'true');
    if (!canFloat(target)) {
        if (target.querySelector(':scope > .teach-pointer')) return null;
        target.append(ptr);
        return {ptr, stop() { ptr.remove(); }};
    }
    if (target._teachFloat) return null;
    ptr.classList.add('teach-float');
    document.body.append(ptr);
    let alive = true;
    const stop = () => {
        if (!alive) return;
        alive = false;
        target._teachFloat = null;
        ptr.remove();
    };
    target._teachFloat = stop;
    const loop = () => {
        if (!alive) return;
        if (!placeFloat(target, ptr)) { stop(); return; }
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return {ptr, stop};
}

// 在目标节点上叠加悬浮教学指针。卡包与强化由调用方决定是否继续显示，点击本身不消失。
// 带 key 的旧入口仍是点一次后不再出现。其余面板只在营地任务链未完成时显示。
// 重复调用同节点不会叠加多个指针。
export function teachPointer(target, save, content, options = {}) {
    const key = options.key;
    const campGuide = options.camp || (key && GUIDE_KEYS.has(key));
    if (!target || (key && save?.tips?.[key])) return;
    if (!options.guide && (campGuide ? save?.zone !== 'camp' : !teachingMode(save, content))) return;
    target.classList.add('teach-target');
    const mounted = mountPointer(target);
    if (!mounted || !key || !GUIDE_KEYS.has(key) || typeof target.addEventListener !== 'function') return;
    const dismiss = () => {
        mounted.stop();
        target.classList.remove('teach-target');
        if (save.tips[key]) return;
        if (typeof options.onSeen === 'function') options.onSeen(key);
        else save.tips[key] = true;
    };
    target.addEventListener('click', dismiss, {capture: true, once: true});
}
