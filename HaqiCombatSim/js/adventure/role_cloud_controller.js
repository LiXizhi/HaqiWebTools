// adventure/role_cloud_controller.js — 角色云端同步、多端冲突恢复、账号登录与角色激活控制。
import { checkedRoleProgress, roleLimit, startupRoleId } from '../adventure_roles_core.js';
import { startWorldOnFoot } from '../adventure_mounts_core.js';
import { checkedProgress } from '../adventure_cloud_core.js';
import { renderCloud } from '../views/adventure/view_adventure_cloud.js';
import { readLocal, localUpdatedAt, replaceLocalWithBackup, readBackup } from '../adventure_assets.js';
import { createRoleTitleController } from './role_title_controller.js';
import * as A from '../adventure_core.js';

export const ROLE_RECOVERY_MESSAGE = '部分角色暂时无法读取，原存档已保留，云端同步已暂停。请重新读取本地角色，或刷新云端角色后选择恢复。';
export const LAST_ACCOUNT_KEY = 'haqi.roles.last-account.v1';
export const KICKED_SESSION_KEY = 'haqi.gameServer.kicked';

export function createRoleCloudController({
    nodes,
    getContext,
    services,
    autoSave,
    persist = services?.persistence?.persist,
    close = services?.navigation?.close,
    applyLocale,
    setEntryNative,
    setSecondLocale,
    secondLocaleFor,
    enterWorld = services?.navigation?.enterWorld,
    updateMusic,
    accountIsVip,
    earth,
    wordLearning,
    prologue,
    rewardFeedback,
    globalReward = services?.feedback?.globalReward,
    spellSound = services?.feedback?.spellSound,
    localPlay,
    membership,
    toast = services?.feedback?.toast,
    safely = services?.feedback?.safely,
    onOpenCreationForm,
}) {
    const roles = {
        busy: '',
        error: '',
        message: '',
        conflict: null,
        localOnly: false,
        duoSelection: null,
        duoController: 'human',
    };
    const cloud = { owner: null, busy: '', error: '', message: '', paths: [], preview: null };
    let titleView = 'create';
    let roleDraft = null;

    function currentRoleLimit() {
        return roleLimit(accountIsVip());
    }

    function cloudLocal() {
        const ctx = getContext();
        if (ctx.stage !== 'title') return ctx.save;
        try {
            const raw = ctx.roleStorage && readLocal(ctx.roleStorage);
            return raw ? A.parseSave(raw, ctx.assets.content) : null;
        } catch {
            return null;
        }
    }

    function openCloud() {
        const ctx = getContext();
        persist();
        close();
        ctx.clearMovementPath();
        if (!cloud.busy) {
            cloud.preview = null;
            cloud.error = '';
            cloud.message = cloud.owner ? '请选择一份记录查看，或保存当前旅程。' : '';
        }
        ctx.setPanel('cloud');
        paintCloud();
    }

    function paintCloud() {
        const ctx = getContext();
        if (ctx.panel !== 'cloud') return;
        renderCloud(
            nodes.overlay,
            {
                ...cloud,
                local: cloudLocal(),
                localUpdatedAt: ctx.roleStorage && localUpdatedAt(ctx.roleStorage),
                hasBackup: ctx.roleStorage && !!readBackup(ctx.roleStorage),
            },
            {
                close,
                connect: () => void loginRoles(),
                logout: () => changeCloudAccount(false),
                switchAccount: () => changeCloudAccount(true),
                refresh: () =>
                    cloudAction('正在读取云端目录…', async () => {
                        cloud.paths = await getContext().cloudClient.list();
                        cloud.message = cloud.paths.length ? '云端目录已刷新。' : '未找到云端记录，可刷新重试。';
                    }),
                upload: () =>
                    cloudAction('正在保存云端进度…', async () => {
                        const current = cloudLocal();
                        if (!current) throw new Error('请先开始一段冒险。');
                        const nowCtx = getContext();
                        const result = await nowCtx.cloudClient.upload(current, { roleId: nowCtx.roleStore.catalog.activeId });
                        cloud.paths = [result.path, ...cloud.paths.filter(p => p !== result.path)].sort().reverse().slice(0, 30);
                        cloud.message = '已保存到云端。';
                    }),
                preview: path =>
                    cloudAction('正在校验存档与战斗记录…', async () => {
                        const nowCtx = getContext();
                        if (!nowCtx.roleStorage) throw Error('请先新建或选择一个角色。');
                        const target = nowCtx.roleStorage;
                        const localRaw = readLocal(target);
                        const preview = await nowCtx.cloudClient.read(path);
                        const after = getContext();
                        if (after.roleStorage !== target || readLocal(target) !== localRaw) {
                            throw new Error('本地进度已变化，请重新查看这份记录。');
                        }
                        cloud.preview = { ...preview, localRaw };
                        cloud.message = '请比较两份进度，确认后恢复。';
                    }),
                cancelPreview: () => {
                    cloud.preview = null;
                    paintCloud();
                },
                restore: () =>
                    safely(() => {
                        const nowCtx = getContext();
                        nowCtx.cloudClient.assertPreview(cloud.preview);
                        const restored = checkedProgress(cloud.preview.save, nowCtx.assets.content, nowCtx.assets.dataset);
                        replaceLocalWithBackup(restored.save, nowCtx.roleStorage, cloud.preview.localRaw);
                        cloud.preview = null;
                        enterWorld(restored.save, restored.battle);
                        toast('云端进度已恢复。原本地进度已保留为备份。');
                    }),
                backup: () =>
                    cloudAction('正在加载备份…', async () => {
                        const nowCtx = getContext();
                        const target = nowCtx.roleStorage;
                        const raw = readBackup(target);
                        const localRaw = readLocal(target);
                        await nowCtx.assets.dungeons.prepareSaves([JSON.parse(raw)]);
                        const after = getContext();
                        if (after.roleStorage !== target || readLocal(target) !== localRaw) throw Error('角色进度已变化，请重试');
                        const restored = checkedProgress(raw, after.assets.content, after.assets.dataset);
                        replaceLocalWithBackup(restored.save, target, localRaw);
                        enterWorld(restored.save, restored.battle);
                        toast('已恢复本地备份。');
                    }),
            },
        );
    }

    async function cloudAction(label, fn) {
        if (cloud.busy || roles.busy) return;
        cloud.busy = label;
        cloud.error = '';
        cloud.message = '';
        cloud.preview = null;
        paintCloud();
        try {
            await fn();
        } catch (e) {
            cloud.error = e.message;
        } finally {
            cloud.busy = '';
            cloud.owner = getContext().cloudClient.owner;
            paintCloud();
        }
    }

    async function changeCloudAccount(reconnect) {
        if (cloud.busy || roles.busy) return;
        showTitle();
        if (getContext().stage !== 'title') return;
        let disconnected = false;
        await roleOperation('正在退出账号…', async () => {
            let pending = false;
            try {
                await syncRoles();
            } catch {
                pending = true;
            }
            await getContext().cloudClient.disconnect();
            resetRoleAccount();
            localStorage.removeItem(LAST_ACCOUNT_KEY);
            disconnected = true;
            roles.message = pending ? '已退出账号。未同步进度保留在原账号的本机缓存。' : '已退出账号，本地进度已保留。';
        });
        if (reconnect && disconnected) await connectRoles();
    }

    async function loginForCharacterChat(source, options, resume = () => getContext().characterChat.open(source, options)) {
        if (roles.busy || cloud.busy) return;
        persist();
        if (getContext().storageWarning) {
            toast('当前进度尚未保存，请先重试保存。');
            return;
        }
        let transfer;
        try {
            transfer = getContext().roleStore.guestTransfer();
        } catch (e) {
            toast(e.message);
            return;
        }
        const originalId = getContext().roleStore.catalog.activeId;
        await showTitle();
        if (getContext().stage !== 'title') return;
        await connectRoles(true, { enter: true, transfer });
        const latest = getContext();
        if (roles.error || roles.conflict) {
            if (!latest.roleStore.owner && latest.roleStore.catalog.activeId === originalId) {
                await activateRole(originalId);
                await resume();
            }
            return;
        }
        if (latest.stage === 'world' && latest.roleStore.owner) await resume();
    }

    async function loginRoles() {
        if (getContext().stage !== 'title') {
            await showTitle();
            if (getContext().stage !== 'title') return;
        }
        await connectRoles(true, { enter: false });
    }

    async function roleOperation(label, fn) {
        if (roles.busy || cloud.busy) return;
        roles.busy = label;
        roles.error = '';
        roles.message = '';
        paintTitle();
        try {
            await refreshRoleCache();
            await fn();
        } catch (e) {
            roles.error = e.message;
            toast(e.message);
        } finally {
            roles.busy = '';
            paintTitle();
        }
    }

    async function refreshRoleCache() {
        const ctx = getContext();
        if (ctx.stage !== 'title' || !ctx.roleStore.stale) return;
        const owner = ctx.roleStore.owner;
        const epoch = ctx.roleEpoch;
        await ctx.roleStore.prepareOpen(owner, { recover: true });
        const latest = getContext();
        if (latest.stage !== 'title' || owner !== latest.roleStore.owner || epoch !== latest.roleEpoch) return;
        latest.roleStore.open(owner, { recover: true });
        latest.setRoleStorage(null);
        roles.error = '';
        paintTitle();
    }

    async function activateRole(id) {
        await refreshRoleCache();
        const ctx = getContext();
        const roleStore = ctx.roleStore;
        if (!roleStore.catalog.roles.some(row => row.id === id)) throw Error('角色不存在');
        try {
            if (roleStore.owner) {
                ctx.setJoiningRoleId(id);
                ctx.gameServerSession.start();
                await ctx.gameServerSession.waitUntilConnected();
                await refreshRoleCache();
            }
            const latest = getContext();
            const row = latest.roleStore.catalog.roles.find(item => item.id === id);
            if (!row) throw Error('角色不存在');
            let restored;
            try {
                restored = checkedRoleProgress(row.save, latest.assets.content, latest.assets.dataset);
            } catch (error) {
                console.warn('角色恢复失败', error);
                throw Error(ROLE_RECOVERY_MESSAGE);
            }
            restored.save.mountHidden = true;
            restored.save.languageLearning.enabled = true;
            autoSave.reset();
            latest.roleStore.select(id);
            latest.setRoleStorage(latest.roleStore.scoped());
            if (latest.roleStore.owner) void import('../home/home_session_controller.js').then(m => m.primeHomeDirectory(latest.cloudClient, id));
            latest.setSelected(null);
            latest.setDiscarded([]);
            latest.shopView.page = 0;
            latest.petView.selected = null;
            startWorldOnFoot(restored.save);
            return await enterWorld(restored.save, restored.battle);
        } finally {
            getContext().setJoiningRoleId(null);
            getContext().gameServerSession?.tick();
        }
    }

    async function syncRoles(force = false) {
        const ctx = getContext();
        const roleStore = ctx.roleStore;
        if (roleStore.recovering || roles.localOnly) return;
        if (!roleStore.owner || (!force && !roleStore.dirty) || roleStore.catalog.roles.some(row => row.save.pendingEncounter)) return;
        if (roles.conflict) throw Error('角色有云端冲突，本地进度已保留。请在角色列表处理。');
        const epoch = ctx.roleEpoch;
        const captured = roleStore.checkpoint();
        const owner = roleStore.owner;
        const revision = await ctx.cloudClient.saveRoles(JSON.parse(captured), roleStore.base, {
            onProgress: ({ done, total }) => {
                if (done !== 1 && done !== total && done % 5) return;
                const label = `正在同步云端宠物 ${done}/${total}…`;
                if (roles.busy === label) return;
                roles.busy = label;
                if (getContext().stage === 'title') paintTitle();
            },
        });
        const after = getContext();
        if (epoch !== after.roleEpoch || owner !== after.roleStore.owner) throw Error('账号已切换，请重新连接。');
        roleStore.markSynced(revision, captured);
        after.setLastRoleSync(performance.now());
        roles.message = '角色已保存到云端。';
    }

    async function reconcileRoles(remote) {
        const ctx = getContext();
        const epoch = ctx.roleEpoch;
        if (remote.owner !== ctx.roleStore.owner || remote.owner !== ctx.cloudClient.owner) throw Error('账号已变化，请重新登录。');
        if (ctx.roleStore.recovering) {
            roles.conflict = remote;
            roles.message = ROLE_RECOVERY_MESSAGE;
            return;
        }
        if (ctx.roleStore.dirty && ctx.roleStore.base !== remote.revision) {
            roles.conflict = remote;
            roles.error = '本地有未同步进度，与本次读取的云端版本不同，请先备份再加载云端。';
            return;
        }
        if (epoch !== getContext().roleEpoch) throw Error('账号已变化，请重新登录。');
        if (!ctx.roleStore.dirty) ctx.roleStore.replace(remote.catalog, remote.revision);
        ctx.setRoleStorage(ctx.roleStore.catalog.activeId ? ctx.roleStore.scoped() : null);
        roles.conflict = null;
    }

    function connectRoles(interactive = true, { enter = false, transfer = null } = {}) {
        return roleOperation('正在登录并读取角色…', async () => {
            const lp = localPlay();
            if (lp.active) {
                persist();
                lp.leave();
            }
            const cc = getContext().cloudClient;
            const owner = await cc.connect({ interactive });
            if (interactive) sessionStorage.removeItem(KICKED_SESSION_KEY);
            cloud.owner = owner;
            cloud.preview = null;
            cloud.paths = [];
            getContext().gameServerSession?.start();
            await membership().refresh().catch(error => toast(error.message));
            let remote;
            let readError;
            try {
                remote = await cc.roles();
            } catch (error) {
                readError = error;
                console.warn('云端角色读取失败', error);
            }
            await getContext().roleStore.prepareOpen(owner, { recover: true });
            const nowCtx = getContext();
            nowCtx.bumpRoleEpoch();
            nowCtx.roleStore.open(owner, { recover: true });
            nowCtx.setRoleStorage(null);
            cloud.owner = owner;
            cloud.preview = null;
            cloud.paths = [];
            localStorage.setItem(LAST_ACCOUNT_KEY, owner);
            roles.localOnly = !remote;
            if (!remote) {
                titleView = 'roles';
                roles.error = readError?.message || '云端角色暂时无法读取，请重试。';
                roles.message = '云端角色暂时无法读取，本地存档已保留，云端同步已暂停。请点击“刷新云端角色”重试。';
                return;
            }
            await reconcileRoles(remote);
            if (roles.conflict) return;
            const stale = remote.partsStale?.length > 0;
            const id = transfer
                ? nowCtx.roleStore.adoptGuest(transfer, { isVip: accountIsVip() })
                : startupRoleId(nowCtx.roleStore.catalog, { direct: enter, blocked: nowCtx.roleStore.recovering });
            if (transfer) {
                await syncRoles(true);
                if (nowCtx.roleStore.dirty) throw Error('角色尚未完成云端同步，请重试。');
            }
            if (id) {
                await localPlay().guardSolo();
                await activateRole(id);
                await syncRoles(stale);
                return;
            }
            titleView = nowCtx.roleStore.catalog.roles.length || nowCtx.roleStore.recovering ? 'roles' : 'create';
            if (titleView === 'create') roleDraft = null;
            if (stale) await syncRoles(true);
        });
    }

    function resetRoleAccount() {
        const ctx = getContext();
        ctx.gameServerSession?.stop();
        persist();
        const lp = localPlay();
        if (lp.active) lp.leave();
        autoSave.reset();
        ctx.bumpRoleEpoch();
        ctx.roleStore.open(null, { recover: true });
        ctx.setRoleStorage(ctx.roleStore.catalog.activeId ? ctx.roleStore.scoped() : null);
        cloud.owner = null;
        cloud.preview = null;
        cloud.paths = [];
        roles.conflict = null;
        roles.message = '';
        roles.localOnly = false;
        ctx.setStage('title');
        void showTitle();
    }

    const titleCtrl = createRoleTitleController({
        nodes,
        getContext,
        roles,
        cloud,
        getTitleView: () => titleView,
        setTitleView: next => {
            titleView = next;
        },
        getRoleDraft: () => roleDraft,
        setRoleDraft: next => {
            roleDraft = next;
        },
        currentRoleLimit,
        autoSave,
        persist,
        close,
        applyLocale,
        setEntryNative,
        setSecondLocale,
        secondLocaleFor,
        updateMusic,
        accountIsVip,
        earth,
        wordLearning,
        prologue,
        rewardFeedback,
        globalReward,
        spellSound,
        localPlay,
        toast,
        onOpenCreationForm,
        loginRoles,
        roleOperation,
        activateRole,
        syncRoles,
        reconcileRoles,
        resetRoleAccount,
        ROLE_RECOVERY_MESSAGE,
        LAST_ACCOUNT_KEY,
    });
    const { showTitle, deleteCurrentRole, paintTitle, paintRoles, beginOriginalImport, openCreationForm, newRoleForm, paintCreation } = titleCtrl;

    function canAutoSave() {
        const ctx = getContext();
        return (
            ctx.stage === 'world'
            && !ctx.save?.pendingEncounter
            && !!ctx.roleStore?.owner
            && ctx.roleStore.dirty
            && !ctx.roleStore.recovering
            && !roles.localOnly
            && !roles.busy
            && !cloud.busy
            && !roles.conflict
        );
    }

    return {
        roles,
        cloud,
        canAutoSave,
        currentRoleLimit,
        openCloud,
        paintCloud,
        loginForCharacterChat,
        loginRoles,
        showTitle,
        deleteCurrentRole,
        paintTitle,
        paintRoles,
        roleOperation,
        refreshRoleCache,
        activateRole,
        beginOriginalImport,
        openCreationForm,
        newRoleForm,
        paintCreation,
        syncRoles,
        reconcileRoles,
        connectRoles,
        resetRoleAccount,
    };
}
