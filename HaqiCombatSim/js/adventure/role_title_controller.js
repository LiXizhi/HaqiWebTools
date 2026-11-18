// adventure/role_title_controller.js — 标题页、角色列表、角色创建表单与原服角色导入控制。
import { roleLimitReachedMessage } from '../adventure_roles_core.js';
import { createHeroDraft } from '../hero_body_core.js';
import { confirmDuoRole } from '../role_selection_core.js';
import { renderRoles } from '../views/adventure/view_adventure_roles.js';
import { tutorialCards } from '../adventure_creation_preview.js';
import { openOriginalImport } from '../haqi_import.js';
import { displayLocale } from '../locale.js';
import { tr } from '../locale_runtime.js';
import * as A from '../adventure_core.js';
import * as W from '../adventure_world_core.js';
import { renderEntry } from '../views/adventure/view_entry.js';

export function createRoleTitleController({
    nodes,
    getContext,
    roles,
    cloud,
    getTitleView,
    setTitleView,
    getRoleDraft,
    setRoleDraft,
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
}) {
    async function showTitle() {
        const ctx = getContext();
        wordLearning.clearRecordings();
        wordLearning.stopWordAudio();
        roles.duoSelection = null;
        const lp = localPlay();
        if (lp.active) {
            persist();
            lp.leave();
        }
        earth.resetSession();
        spellSound.stop();
        persist();
        if (ctx.storageWarning && ctx.stage !== 'title') {
            toast('当前进度尚未保存，请勿关闭页面。请检查浏览器存储或重试。');
            return;
        }
        close();
        rewardFeedback.reset();
        globalReward.reset();
        ctx.setStage('title');
        updateMusic();
        ctx.clearMovementInput();
        ctx.setAnimation(null);
        ctx.setBattle(null);
        nodes.hud.hidden = true;
        nodes.battle.disposeHandGesture?.();
        nodes.battle.replaceChildren();
        nodes.battle.className = 'battle-layer';
        const roleStore = ctx.roleStore;
        const nextSave = roleStore.catalog.roles.find(row => row.id === roleStore.catalog.activeId)?.save || A.createAdventure(ctx.assets.content);
        ctx.setSave(nextSave);
        await applyLocale();
        if (getContext().stage !== 'title') return;
        nodes.entry.hidden = false;
        const nowSave = getContext().save;
        ctx.setWorld(W.createWorld(nowSave.zone === 'earth' ? 'camp' : nowSave.zone, ctx.assets.content, nowSave.zone === 'earth' ? null : nowSave));
        const nextTitleView = roleStore.catalog.roles.length || roleStore.recovering || roles.localOnly ? 'roles' : 'create';
        setTitleView(nextTitleView);
        if (nextTitleView === 'create') setRoleDraft(null);
        paintTitle();
        if (getTitleView() === 'create' && !roleStore.catalog.roles.length && !prologue.wasOffered() && !prologue.isRunning()) {
            await prologue.runPrologue();
            if (getContext().stage === 'title') paintTitle();
        }
    }

    function deleteCurrentRole() {
        const ctx = getContext();
        if (roles.busy || cloud.busy || roles.conflict || ctx.stage !== 'world' || ctx.save?.pendingEncounter) {
            toast('当前无法删除角色，请结束战斗或处理云端同步后重试。');
            return;
        }
        return roleOperation('正在删除角色…', async () => {
            const nowCtx = getContext();
            nowCtx.roleStore.remove(nowCtx.roleStore.catalog.activeId);
            autoSave.reset();
            nowCtx.bumpRoleEpoch();
            nowCtx.setRoleStorage(null);
            nowCtx.setStage('title');
            await showTitle();
            try {
                await syncRoles();
                const latestStore = getContext().roleStore;
                roles.message =
                    latestStore.owner && latestStore.dirty
                        ? '角色已从本机删除，云端删除尚未同步，请在角色列表重试同步。'
                        : '角色已删除。';
            } catch (error) {
                throw Error(`${tr('角色已从本机删除，云端删除尚未同步，请在角色列表重试同步。')} ${error.message}`);
            }
        });
    }

    function paintTitle() {
        const ctx = getContext();
        if (ctx.stage !== 'title') return;
        if (roles.conflict || (ctx.roleStore.owner && ctx.roleStore.dirty && !ctx.roleStore.catalog.roles.length)) {
            setTitleView('roles');
        }
        if (getTitleView() === 'create') paintCreation();
        else paintRoles();
    }

    function paintRoles() {
        const ctx = getContext();
        if (ctx.stage !== 'title') return;
        ctx.creationPreview?.stop();
        const roleStore = ctx.roleStore;
        if (roles.duoSelection) {
            roles.duoSelection = roles.duoSelection.map(id => (roleStore.catalog.roles.some(row => row.id === id) ? id : null));
        }
        const startDuo = () => {
            if (!roles.duoSelection?.every(Boolean)) return;
            const [first, second] = roles.duoSelection;
            roleStore.rememberDuoSelection([first, second]);
            return roleOperation('正在准备双人冒险…', async () => {
                try {
                    await localPlay().start(first, second, { controller: roles.duoController });
                } catch (error) {
                    roles.duoSelection = [first, null];
                    throw error;
                }
                await syncRoles();
            });
        };
        renderRoles(
            nodes.entry,
            ctx.assets,
            {
                ...roles,
                duoRecent: roleStore.duoSelection,
                recovering: roleStore.recovering || roles.localOnly,
                recoveryIssues: roleStore.recoveryIssues,
                recoveryReason: roleStore.recoveryReason,
                owner: roleStore.owner,
                catalog: roleStore.catalog,
                dirty: roleStore.dirty,
                locale: displayLocale(),
                roleLimit: currentRoleLimit(),
                isVip: accountIsVip(),
            },
            {
                setLocale: setEntryNative,
                setSecondLocale,
                secondLocale: secondLocaleFor(displayLocale()),
                select: id =>
                    roleOperation('正在进入角色…', async () => {
                        await localPlay().guardSolo();
                        await activateRole(id);
                        await syncRoles();
                    }),
                toggleDuo: () => {
                    if (roles.busy || cloud.busy) return;
                    roles.duoSelection = roles.duoSelection ? null : [null, null];
                    roles.error = '';
                    paintRoles();
                },
                confirmDuo: id => {
                    if (roles.busy || cloud.busy || !roles.duoSelection) return;
                    roles.duoSelection = confirmDuoRole(roles.duoSelection, id, roleStore.catalog.roles.map(row => row.id));
                    if (roles.duoSelection.every(Boolean)) return startDuo();
                    paintRoles();
                },
                setDuoController: value => {
                    roles.duoController = value;
                    paintRoles();
                },
                create: newRoleForm,
                login: () => void loginRoles(),
                logout: () =>
                    roleOperation('正在退出…', async () => {
                        let pending = false;
                        try {
                            await syncRoles();
                        } catch {
                            pending = true;
                        }
                        await getContext().cloudClient.disconnect();
                        resetRoleAccount();
                        localStorage.removeItem(LAST_ACCOUNT_KEY);
                        if (pending) roles.message = '已退出账号。未同步进度仍保留在该账号的本机缓存，下次登录可继续。';
                    }),
                remove: id =>
                    roleOperation('正在删除角色…', async () => {
                        if (roleStore.recovering || roles.conflict) throw Error(tr('当前无法删除角色，请结束战斗或处理云端同步后重试。'));
                        const active = roleStore.catalog.activeId === id;
                        roleStore.remove(id);
                        if (active) {
                            autoSave.reset();
                            getContext().bumpRoleEpoch();
                            getContext().setRoleStorage(null);
                        }
                        try {
                            await syncRoles();
                            roles.message =
                                roleStore.owner && roleStore.dirty
                                    ? '角色已从本机删除，云端删除尚未同步，请在角色列表重试同步。'
                                    : '角色已删除。';
                        } catch (error) {
                            throw Error(`${tr('角色已从本机删除，云端删除尚未同步，请在角色列表重试同步。')} ${error.message}`);
                        }
                    }),
                sync: () => roleOperation('正在保存角色…', syncRoles),
                retryLocal: roleStore.recovering
                    ? () =>
                          roleOperation('正在重新读取本地角色…', async () => {
                              await roleStore.retryRecovery();
                              getContext().setRoleStorage(roleStore.catalog.activeId ? roleStore.scoped() : null);
                              roles.message = roleStore.recovering ? ROLE_RECOVERY_MESSAGE : '本地角色已恢复。';
                              if (!roleStore.recovering && roles.conflict) await reconcileRoles(roles.conflict);
                          })
                    : null,
                refresh: () =>
                    roleOperation('正在读取角色…', async () => {
                        const cc = getContext().cloudClient;
                        const remote = await cc.roles({ refresh: true });
                        await reconcileRoles(remote);
                        if (roleStore.catalog.activeId) void import('../home/home_session_controller.js').then(m => m.primeHomeDirectory(cc, roleStore.catalog.activeId));
                        roles.localOnly = false;
                        if (!roles.conflict && remote.partsStale?.length) await syncRoles(true);
                    }),
                useRemote: () =>
                    roleOperation('正在备份并加载云端…', async () => {
                        if (!roles.conflict) return;
                        localStorage.setItem(
                            `haqi.roles.conflict.${encodeURIComponent(roleStore.owner)}.${Date.now()}`,
                            JSON.stringify(roleStore.catalog),
                        );
                        roleStore.replace(roles.conflict.catalog, roles.conflict.revision, false, { resolveRecovery: true });
                        roles.conflict = null;
                        roles.localOnly = false;
                        getContext().setRoleStorage(roleStore.catalog.activeId ? roleStore.scoped() : null);
                        roles.message = '已加载云端角色，本地进度已备份。';
                    }),
                importOriginal: beginOriginalImport,
            },
        );
    }

    function beginOriginalImport() {
        const ctx = getContext();
        if (roles.busy || roles.conflict || cloud.busy) return;
        if (ctx.roleStore.catalog.roles.length >= currentRoleLimit()) {
            toast(roleLimitReachedMessage(accountIsVip()));
            return;
        }
        ctx.creationPreview?.stop();
        const epoch = ctx.roleEpoch;
        const owner = ctx.roleStore.owner;
        openOriginalImport({
            root: nodes.entry,
            overlay: nodes.overlay,
            assets: ctx.assets,
            isCurrent: () => {
                const nowCtx = getContext();
                return nowCtx.stage === 'title' && epoch === nowCtx.roleEpoch && owner === nowCtx.roleStore.owner && !roles.conflict;
            },
            commit: (imported, sourceOwner) => {
                if (owner && owner !== sourceOwner) throw Error('当前角色账号与原服账号不同，请切换账号后重试。');
                getContext().roleStore.create(imported, { isVip: accountIsVip() });
                setTitleView('roles');
                toast('角色已导入并保存在本机，可从角色列表进入。');
            },
            onClose: () => paintTitle(),
        });
    }

    function openCreationForm() {
        if (onOpenCreationForm) {
            onOpenCreationForm();
            return;
        }
        setTitleView('create');
        setRoleDraft(null);
        paintCreation();
    }

    async function playPrologueBeforeCreate() {
        if (prologue.isRunning()) return;
        await prologue.runPrologue();
        if (getContext().stage === 'title') openCreationForm();
    }

    function newRoleForm() {
        if (roles.busy) return;
        if (getContext().roleStore.catalog.roles.length >= currentRoleLimit()) {
            toast(roleLimitReachedMessage(accountIsVip()));
            return;
        }
        void playPrologueBeforeCreate();
    }

    function paintCreation() {
        const ctx = getContext();
        ctx.creationPreview?.stop();
        let draft = getRoleDraft();
        if (!draft) {
            draft = createHeroDraft(ctx.assets.hero?.manifest);
            setRoleDraft(draft);
        }
        renderEntry(
            nodes.entry,
            ctx.assets,
            null,
            {
                draft,
                busy: roles.busy,
                owner: ctx.roleStore.owner,
                setLocale: setEntryNative,
                setSecondLocale,
                locale: displayLocale(),
                secondLocale: secondLocaleFor(displayLocale()),
                roles:
                    ctx.roleStore.catalog.roles.length || ctx.roleStore.recovering || roles.localOnly
                        ? () => {
                              setTitleView('roles');
                              paintRoles();
                          }
                        : null,
                accountChoice: !ctx.roleStore.owner && !ctx.roleStore.catalog.roles.length,
                login: () => void loginRoles(),
                cloud: () => void loginRoles(),
                importOriginal: beginOriginalImport,
                playPrologue: () =>
                    void prologue.runPrologue().then(() => {
                        if (getContext().stage === 'title' && getTitleView() === 'create') paintCreation();
                    }),
                previewChoices: school => tutorialCards(ctx.assets, school),
                preview: (...args) => getContext().creationPreview.play(...args),
                stopPreview: () => getContext().creationPreview.stop(),
                pausePreview: () => getContext().creationPreview.togglePause(),
                create: options =>
                    roleOperation('正在创建角色…', async () => {
                        const nowCtx = getContext();
                        if (nowCtx.roleStore.owner && !nowCtx.roleStore.recovering && !roles.localOnly) {
                            await reconcileRoles(await nowCtx.cloudClient.roles());
                            if (roles.conflict) throw Error('请先处理角色云端冲突，再新建角色。');
                        }
                        const next = A.createAdventure(nowCtx.assets.content, { ...options, seed: Date.now() });
                        const native = displayLocale();
                        const target = secondLocaleFor(native);
                        next.locale = native;
                        next.languageLearning = { ...next.languageLearning, native, target, selectionConfirmed: true };
                        if (['en', 'zh-CN', 'ja', 'ko'].includes(target) && native !== target) next.openingJourney = { version: 1, phase: 'offer' };
                        const id = nowCtx.roleStore.create(next, { isVip: accountIsVip() });
                        await activateRole(id);
                        await syncRoles();
                    }),
            },
            roles.error,
        );
    }

    return {
        showTitle,
        deleteCurrentRole,
        paintTitle,
        paintRoles,
        beginOriginalImport,
        openCreationForm,
        newRoleForm,
        paintCreation,
    };
}
