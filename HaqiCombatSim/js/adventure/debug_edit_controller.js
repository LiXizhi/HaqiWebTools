// adventure/debug_edit_controller.js — 设置页调试属性修改与备份恢复。
import { prepareDebugEdit } from '../adventure_debug_core.js';
import { DEBUG_BACKUP_KEY, storeDebugEdit, restoreDebugBackup } from '../adventure_debug.js';
import { readLocal } from '../adventure_assets.js';

export function createDebugEditController({
    getContext,
    services,
    queueCloudSave = services?.persistence?.queueCloudSave,
    enterWorld = services?.navigation?.enterWorld,
    openPanel = services?.navigation?.openPanel,
    paintHud = services?.navigation?.paintHud,
    paintPanel = services?.navigation?.paintPanel,
    toast = services?.feedback?.toast,
    safely = services?.feedback?.safely,
}) {
    function applyDebug(patch) {
        safely(() => {
            const ctx = getContext();
            if (ctx.stage !== 'world') throw Error('请先完成当前战斗');
            const result = prepareDebugEdit(ctx.save, ctx.assets.content, patch);
            if (!result.changes.length) return;
            storeDebugEdit(ctx.save, result.save, ctx.roleStorage);
            ctx.setSave(result.save);
            queueCloudSave();
            paintHud();
            paintPanel();
            toast('调试属性已保存，修改前的备份已保留。');
        });
    }

    async function restoreDebug() {
        const ctx = getContext();
        const target = ctx.roleStorage;
        const current = ctx.save;
        const epoch = ctx.roleEpoch;
        try {
            if (ctx.stage !== 'world') throw Error('请先完成当前战斗');
            const raw = target.getItem(DEBUG_BACKUP_KEY);
            const localRaw = readLocal(target);
            if (!raw) throw Error('没有可恢复的调试备份');
            await ctx.assets.dungeons.prepareSaves([JSON.parse(raw)]);
            const latest = getContext();
            if (
                target !== latest.roleStorage
                || latest.save !== current
                || epoch !== latest.roleEpoch
                || latest.stage !== 'world'
                || readLocal(target) !== localRaw
                || target.getItem(DEBUG_BACKUP_KEY) !== raw
            ) {
                throw Error('角色进度已变化，请重试');
            }
            const restored = restoreDebugBackup(latest.save, latest.assets.content, target);
            enterWorld(restored);
            openPanel('debug');
            toast('已恢复上次调试修改前的存档。');
        } catch (error) {
            toast(error.message);
        }
    }

    return { applyDebug, restoreDebug };
}
