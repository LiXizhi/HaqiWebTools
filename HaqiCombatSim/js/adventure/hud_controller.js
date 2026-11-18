// adventure/hud_controller.js — HUD 渲染守卫与营地/首只伙伴欢迎引导视图控制。
import { campArrivalPet } from '../adventure_arrival_core.js';
import { createHudRenderGuard } from '../hud_render_guard.js';
import { recommendedLanguageQuest, languageSceneTarget } from '../language_quest_core.js';
import { openingJourney, openingJourneyActive } from '../opening_journey_core.js';
import { playOpeningPetWelcome, renderPetWelcome } from '../views/adventure/view_opening_journey.js';
import { renderHud as defaultRenderHud } from '../views/adventure/view_hud.js';

export function createHudController({
    nodes,
    getContext,
    model,
    services,
    close = services?.navigation?.close,
    openPanel = services?.navigation?.openPanel,
    persist = services?.persistence?.persist,
    queueCloudSave = services?.persistence?.queueCloudSave,
    loginRoles,
    track,
    interactNearest,
    performAction,
    dungeon,
    opening,
    languageTasks,
    localPlay,
    spellSound = services?.feedback?.spellSound,
    renderHud = defaultRenderHud,
    renderPetWelcomeFn = renderPetWelcome,
    playOpeningPetWelcomeFn = playOpeningPetWelcome,
    onOpenPanel,
}) {
    let firstWelcomePetId = null;

    const hudRenderGuard = nodes?.hud?.ownerDocument
        ? createHudRenderGuard(nodes.hud, {
              render: paintHudNow,
              getScope: () => {
                  const { world, roleEpoch, roleStore, stage } = getContext();
                  return [world, roleEpoch, roleStore?.owner, roleStore?.catalog.activeId, stage];
              },
              canRender: () => {
                  const { stage, save, assets } = getContext();
                  return stage === 'world' && !!save && !!assets;
              },
          })
        : { request: () => paintHudNow(), reset() {}, dispose() {} };

    function paintHud() {
        hudRenderGuard.request();
    }

    function paintHudNow() {
        const ctx = getContext();
        languageTasks.ensure();
        if (ctx.world) {
            const languageQuest =
                openingJourneyActive(ctx.save) || (ctx.save.zone === 'camp' && openingJourney(ctx.save))
                    ? null
                    : recommendedLanguageQuest(ctx.save, ctx.assets.content, languageTasks.snapshot().rows);
            ctx.world.languageQuestTarget = languageQuest?.courseId ? languageSceneTarget(languageQuest, ctx.world) : null;
        }
        const openPanelFn = (...args) => (onOpenPanel || openPanel)(...args);
        renderHud(nodes.hud, model(), {
            panel: openPanelFn,
            playerPanel: (owner, kind) => localPlay().openPanel(owner, kind),
            playerMountToggle: owner => localPlay().toggleMount(owner),
            membership: () => openPanelFn('membership'),
            cloud: () => void loginRoles(),
            track,
            untrack: ctx.untrack,
            leaveDungeon: dungeon.exitDungeon,
            interact: interactNearest,
            mountToggle: () => performAction({ type: 'mount-visibility', hidden: !getContext().save?.mountHidden }),
        });
    }

    function openCampArrival() {
        close({ silent: true });
        getContext().setPanel('camp-arrival');
        paintCampArrival();
        if (playOpeningPetWelcomeFn(nodes.overlay)) spellSound.play('petJoin');
    }

    function departCampArrival() {
        const ctx = getContext();
        ctx.save.tips.campArrivalSeen = true;
        persist();
        if (getContext().storageWarning) {
            delete ctx.save.tips.campArrivalSeen;
            return false;
        }
        queueCloudSave();
        if (openingJourney(ctx.save)?.phase === 'offer') opening.trackOpeningJourney();
        else track();
        return true;
    }

    function paintCampArrival() {
        const { save } = getContext();
        const petId = campArrivalPet(save);
        if (!petId) {
            close();
            return;
        }
        renderPetWelcomeFn(
            nodes.overlay,
            model(),
            petId,
            { close: departCampArrival, go: departCampArrival },
            { line: '跟我去见青龙！', actionLabel: '一起出发' },
        );
    }

    function leaveFirstPetWelcome() {
        const ctx = getContext();
        const pending = ctx.save.tips.pendingCompanionWelcome;
        ctx.save.tips.pendingCompanionWelcome = null;
        persist();
        if (getContext().storageWarning) {
            ctx.save.tips.pendingCompanionWelcome = pending;
            return false;
        }
        queueCloudSave();
        close();
        return true;
    }

    function paintFirstPetWelcome() {
        const { save } = getContext();
        if (!save.pets[firstWelcomePetId]) {
            close();
            return;
        }
        renderPetWelcomeFn(nodes.overlay, model(), firstWelcomePetId, {
            close: leaveFirstPetWelcome,
            go: () => {
                const nowSave = getContext().save;
                if (!nowSave.formation.includes(firstWelcomePetId)) {
                    const slots = [...nowSave.formation];
                    const slot = slots.findIndex((id, index) => id === null && index !== nowSave.heroSlot);
                    if (slot < 0) {
                        (onOpenPanel || openPanel)('pet');
                        return;
                    }
                    slots[slot] = firstWelcomePetId;
                    if (performAction({ type: 'formation', slots, heroSlot: nowSave.heroSlot }) === false) return;
                }
                if (leaveFirstPetWelcome()) track();
            },
        });
    }

    return {
        paintHud,
        paintHudNow,
        openCampArrival,
        departCampArrival,
        paintCampArrival,
        leaveFirstPetWelcome,
        paintFirstPetWelcome,
        setFirstWelcomePetId: id => {
            firstWelcomePetId = id;
        },
        disposeHud: () => hudRenderGuard.dispose?.(),
    };
}
