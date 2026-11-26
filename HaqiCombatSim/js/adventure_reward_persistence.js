import {applyAction} from './adventure_core.js';
import {saveLocal} from './adventure_assets.js';
import {economySnapshot,recordEconomyChange} from './adventure_economy_ledger_core.js';

// Stage grants separately: storage failures (including a stale browser tab)
// must not award currency or consume a claim in the live character.
export function persistSaveChange(save, storage, change, saveLocalFn = saveLocal, { shouldSave = () => true } = {}) {
    if (!storage) throw Error('尚未选择角色，无法保存领取记录。');
    const next = structuredClone(save);
    const economyBefore = economySnapshot(save);
    const result = change(next);
    if (!shouldSave(result, next)) return { save, result, skipped: true };
    recordEconomyChange(next, economyBefore);
    saveLocalFn(next, storage);
    return { save: next, result, skipped: false };
}

export function persistReward(save, content, action, access, storage, saveLocalFn = saveLocal) {
    return persistSaveChange(save, storage, next => applyAction(next, content, action, access), saveLocalFn);
}

export function createSaveCommitter({
    getContext,
    saveLocal: saveLocalFn = saveLocal,
    persistRewardFn = persistReward,
    queueCloudSave = () => {},
    paintHud = () => {},
    paintPanel = () => {},
} = {}) {
    function isIdentityValid(expected, ctx) {
        if (!expected) return true;
        if ('save' in expected && ctx?.save !== expected.save) return false;
        if ('epoch' in expected && ctx?.roleEpoch !== expected.epoch) return false;
        if ('owner' in expected && ctx?.roleStore?.owner !== expected.owner) return false;
        if ('roleId' in expected && ctx?.roleStore?.catalog?.activeId !== expected.roleId) return false;
        return true;
    }

    function syncCommittedSave(ctx, next, { mutateInPlace = false } = {}) {
        const activeId = ctx?.roleStore?.catalog?.activeId;
        const stored = activeId
            ? ctx?.roleStore?.catalog?.roles?.find(row => row.id === activeId)?.save
            : null;
        if (stored && next?.petInstanceVersion === 1) {
            next.petFileRefs = stored.petFileRefs;
            next.petPages = stored.petPages;
        }
        if (mutateInPlace && ctx?.save) {
            Object.assign(ctx.save, next);
            return ctx.save;
        }
        ctx?.setSave?.(next);
        return next;
    }

    function finalize(ctx, next, result, { paint = 'hud', cloud = true, mutateInPlace = false, setWarning = true } = {}) {
        const committedSave = syncCommittedSave(ctx, next, { mutateInPlace });
        if (setWarning) ctx?.setStorageWarning?.(false);
        if (cloud) queueCloudSave();
        if (paint === 'hud' || paint === 'both') paintHud();
        if (paint === 'panel' || paint === 'both') paintPanel();
        return { save: committedSave, result, skipped: false, rejected: false };
    }

    function commitSave(changeOrSave, options = {}) {
        const ctx = getContext();
        if (!isIdentityValid(options.expected, ctx)) return null;
        const { save, roleStorage } = ctx || {};
        let committed;
        if (typeof changeOrSave === 'function') {
            committed = persistSaveChange(save, roleStorage, changeOrSave, saveLocalFn, {
                shouldSave: options.shouldSave || (() => true),
            });
            if (committed.skipped) return committed;
        } else {
            if (!roleStorage) throw Error('尚未选择角色，无法保存领取记录。');
            // Gift/pet actions stage a complete save rather than a callback.
            // Keep accounting atomic and leave the caller's proposal untouched.
            const next = structuredClone(changeOrSave);
            recordEconomyChange(next, economySnapshot(save), options.economySource);
            saveLocalFn(next, roleStorage);
            committed = { save: next, result: undefined, skipped: false };
        }
        return finalize(ctx, committed.save, committed.result, options);
    }

    function commitReward(action, access = {}, options = {}) {
        const ctx = getContext();
        if (!isIdentityValid(options.expected, ctx)) return null;
        const { save, assets, roleStorage } = ctx || {};
        const committed = persistRewardFn(save, assets?.content, action, access, roleStorage, saveLocalFn);
        if (options.accept && !options.accept(committed.result)) {
            return { save, result: committed.result, skipped: false, rejected: true };
        }
        return finalize(ctx, committed.save, committed.result, options);
    }

    return { commitSave, commitReward };
}
