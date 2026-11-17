import { tr } from '../locale_runtime.js';
import { DetailDialog } from './detail_dialog.js';
import { button, el, getDoc } from './dom.js';

// In-game replacement for window.confirm; resolves true only when the confirm button is pressed.
export function askAdventureConfirm({
    parent = getDoc().body,
    title = tr('确认'),
    message,
    okText = tr('确定'),
    cancelText = tr('取消'),
} = {}) {
    return new Promise(resolve => {
        const dialog = new DetailDialog(parent, {
            el,
            title,
            className: 'equipment-item-dialog adventure-confirm-dialog',
        });
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true;
            resolve(value);
            dialog.close();
        };
        dialog.dialog.addEventListener('close', () => finish(false));
        dialog.body.append(el('p', '', message));
        dialog.footer.append(
            button(cancelText, () => finish(false), 'secondary'),
            button(okText, () => finish(true), 'primary'),
        );
        dialog.open();
    });
}
