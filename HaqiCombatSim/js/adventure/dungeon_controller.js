import {
    enterCityDungeon,
    leaveCityDungeon,
    cityDungeonState,
    cityActionStatus,
    applyCityInteraction,
} from '../adventure_city_dungeons_core.js';
import { generatedCityRoute } from '../adventure_city_generated_core.js';
import { renderCityInteraction } from '../views/adventure/view_city_dungeon.js';
import { renderEarthLoading } from '../views/adventure/view_adventure_earth.js';
import { createDungeonStory } from '../adventure_dungeon_story.js';
import { claimTowerReward, journeyParty, towerMilestoneBonus } from '../adventure_dungeon_journeys_core.js';
import { createSaveCommitter } from '../adventure_reward_persistence.js';
import { startCoopRun, coopParty as journeyCoopParty } from '../adventure_coop_core.js';
import { partySpecs as journeyPetParty } from '../adventure_pets_core.js';
import { dungeonFor, enterDungeon, leaveDungeon } from '../adventure_dungeons_core.js';
import { islandName, travelStatus } from '../adventure_world_map_core.js';
import { askAdventureConfirm } from '../ui/confirm_dialog.js';
import { tr } from '../locale_runtime.js';
import * as A from '../adventure_core.js';
import * as W from '../adventure_world_core.js';
import {sparkRescueNear,applySparkRescue} from '../spark_rescue_core.js';
import {renderSparkRescue} from '../views/adventure/view_spark_rescue.js';

export function createDungeonController({
    nodes,
    getContext,
    services,
    close = services?.navigation?.close,
    openPanel = services?.navigation?.openPanel,
    persist = services?.persistence?.persist,
    queueCloudSave = services?.persistence?.queueCloudSave,
    commitSave = services?.persistence?.commitSave,
    paintHud = services?.navigation?.paintHud,
    paintPanel = services?.navigation?.paintPanel,
    toast = services?.feedback?.toast,
    safely = services?.feedback?.safely,
    enterWorld = services?.navigation?.enterWorld,
    showTeleportEffect,
    loginForCharacterChat,
    awardLanguageSpeech,
    earth,
    islandSocial,
    localPlay,
    dialogueVoice,
}) {
    const saveCommitter = commitSave
        ? { commitSave }
        : createSaveCommitter({ getContext, queueCloudSave, paintHud, paintPanel });
    let dungeonLoading = null;
    let journeyId = null;
    let journeyRestart = false;
    let sparkMessage = '';

    function openSparkRescue() {
        const ctx=getContext();
        if(ctx.stage!=='world'||!sparkRescueNear(ctx.save,ctx.assets.content))return false;
        sparkMessage='';openPanel('spark-rescue');return true;
    }

    function paintSparkRescue({focus=true}={}) {
        const ctx=getContext();
        if(ctx.panel!=='spark-rescue')return;
        if(ctx.stage!=='world'||!sparkRescueNear(ctx.save,ctx.assets.content)){close();return;}
        const expected={save:ctx.save,epoch:ctx.roleEpoch};
        renderSparkRescue(nodes.overlay,{save:ctx.save,message:sparkMessage,focus},{
            close:()=>{const now=getContext();if(now.panel==='spark-rescue'&&now.save===expected.save&&now.roleEpoch===expected.epoch)close();},
            leave:()=>{const now=getContext();if(now.panel==='spark-rescue'&&now.save===expected.save&&now.roleEpoch===expected.epoch)exitDungeon();},
            action:action=>{
                const now=getContext();
                if(now.panel!=='spark-rescue'||now.stage!=='world'||now.save!==expected.save||now.roleEpoch!==expected.epoch)return false;
                const committed=saveCommitter.commitSave(next=>applySparkRescue(next,now.assets.content,action),{expected,paint:'none',shouldSave:result=>result.changed!==false});
                if(!committed||committed.rejected)return false;
                sparkMessage=committed.result?.message||'';
                if(!committed.skipped){
                    const current=getContext();
                    if(committed.result?.completed&&current.world?.portal)current.world.portal.name='火种已安顿 · 离开副本';
                    paintHud();paintSparkRescue({focus:true});
                }
                return committed.result;
            },
        });
    }

    const dungeonStory = createDungeonStory({
        root: nodes.overlay,
        getState: () => {
            const { save, assets, roleStore } = getContext();
            return {
                save,
                assets,
                sceneCanvas: nodes.world,
                owner: roleStore?.owner,
                role: roleStore?.catalog.activeId,
            };
        },
        onLogin: ({ dungeon, index }) =>
            loginForCharacterChat(null, null, () => {
                const { save } = getContext();
                if (save.zone === dungeon.id) {
                    getContext().setPanel('dungeon-story');
                    nodes.hud.hidden = true;
                    dungeonStory.open(dungeon, { index });
                } else {
                    openJourney(dungeon.id);
                }
            }),
        award: awardLanguageSpeech,
        onDone: () => {
            const ctx = getContext();
            if (ctx.panel === 'dungeon-story') ctx.setPanel(null);
            nodes.hud.hidden = ctx.stage !== 'world';
            if (ctx.stage === 'world') {
                persist();
                paintHud();
                nodes.world.focus({ preventScroll: true });
            }
        },
    });

    function openJourney(id, restart = false) {
        journeyId = id;
        journeyRestart = restart;
        openPanel('dungeon-journey');
    }

    function claimFloorReward(id, floor) {
        const { assets } = getContext();
        const bonus = towerMilestoneBonus(assets.content, dungeonFor(assets.content, id), floor);
        const committed = saveCommitter.commitSave(
            draft => claimTowerReward(draft, assets.content, id, floor),
            { paint: 'both', mutateInPlace: true, setWarning: false },
        );
        toast(bonus ? `已领取 ${committed.result} 奇豆与 ${bonus.name}×${bonus.count}` : `已领取 ${committed.result} 奇豆`);
    }

    function pickDungeonLobby(id, restart = false) {
        const { assets } = getContext();
        const d = dungeonFor(assets.content, id);
        if (d?.kind) {
            openJourney(id, restart);
            return;
        }
        islandSocial().pickPartyDungeon(id, { restart });
    }

    async function loadAndEnterCityDungeon(id, city = null) {
        const ctx = getContext();
        if (dungeonLoading || ctx.stage !== 'world') return;
        close();
        ctx.setPanel('city-loading');
        const current = ctx.save;
        const epoch = ctx.roleEpoch;
        const ticket = earth.nextTicket();
        const zone = ctx.save.zone;
        dungeonLoading = id;
        renderEarthLoading(nodes.overlay, { close, message: '正在准备城市地点…' });
        try {
            const social = islandSocial();
            const team = social.team.length ? social.preparedTeam() : [];
            const fallback = city ? generatedCityRoute(city, current, team) : null;
            await ctx.assets.dungeons.load(id, {
                cityFallback: fallback,
                isCurrent: () => {
                    const nowCtx = getContext();
                    return current === nowCtx.save
                        && epoch === nowCtx.roleEpoch
                        && ticket === earth.currentTicket()
                        && nowCtx.save.zone === zone
                        && nowCtx.panel === 'city-loading';
                },
            });
            let latest = getContext();
            if (current !== latest.save || epoch !== latest.roleEpoch || ticket !== earth.currentTicket() || latest.save.zone !== zone || latest.panel !== 'city-loading') return;
            const next = structuredClone(latest.save);
            enterCityDungeon(next, latest.assets.content, id);
            if (fallback) next.cityFallback = fallback;
            else delete next.cityFallback;
            if (team.length && latest.assets.content.dungeons.find(d => d.id === id)?.nodeId) {
                const dungeon = dungeonFor(latest.assets.content, id);
                startCoopRun(next, team, latest.assets.dataset, dungeon, A.playerSpec(next, latest.assets.content));
                next.coopRun.returnTo = structuredClone(next.dungeonReturn);
                next.coopRun.runs[id].cleared = [...cityDungeonState(next, dungeon.cityId, id).cleared];
                next.coopRun.relationshipRunId = crypto.randomUUID();
            }
            const prepared = W.createWorld(id, latest.assets.content, next);
            await latest.assets.warmNearby?.(prepared, next);
            latest = getContext();
            if (current !== latest.save || epoch !== latest.roleEpoch || ticket !== earth.currentTicket() || latest.panel !== 'city-loading') return;
            Object.assign(latest.save, next);
            await enterWorld(latest.save);
            showTeleportEffect();
        } catch (error) {
            const latest = getContext();
            if (current === latest.save && epoch === latest.roleEpoch && ticket === earth.currentTicket() && latest.panel === 'city-loading') {
                renderEarthLoading(nodes.overlay, {
                    close,
                    message: `${error.message}。原场景已保留。`,
                    retry: () => {
                        dungeonLoading = null;
                        void loadAndEnterCityDungeon(id, city);
                    },
                });
            }
        } finally {
            dungeonLoading = null;
        }
    }

    function openCityHotspot(target) {
        const ctx = getContext();
        const dungeon = ctx.world.dungeon;
        const hotspot = dungeon.scene.hotspots.find(h => h.id === target.cityHotspot);
        if (!hotspot) return;
        close();
        ctx.setPanel('city-interaction');
        const state = cityDungeonState(ctx.save, dungeon.cityId, dungeon.id);
        const actions = dungeon.scene.actions
            .filter(a => a.hotspot === hotspot.id)
            .map(action => {
                const needed = (action.requires || []).filter(id => !state.done.includes(id)).map(id => dungeon.scene.actions.find(a => a.id === id).label);
                const battles = (action.requiresBattles || []).filter(id => !state.cleared.includes(id));
                const items = Object.entries(action.consume || {})
                    .filter(([id, n]) => (state.items[id] || 0) < n)
                    .map(([id]) => dungeon.scene.items[id].name);
                return {
                    action,
                    status: cityActionStatus(state, action),
                    hint: [
                        needed.length ? '先完成：' + needed.join('、') : '',
                        battles.length ? '先处理出现的异常魔力' : '',
                        items.length ? '需要：' + items.join('、') : '',
                    ]
                        .filter(Boolean)
                        .join('；'),
                };
            });
        renderCityInteraction(
            nodes.overlay,
            { dungeon, hotspot, actions, state, showChinese: ctx.save.languageLearning.showChinese !== false },
            {
                close,
                apply: id =>
                    safely(() => {
                        const nowCtx = getContext();
                        const result = applyCityInteraction(nowCtx.save, dungeon, id);
                        persist();
                        queueCloudSave();
                        toast(result.message);
                        const nextWorld = W.createWorld(nowCtx.save.zone, nowCtx.assets.content, nowCtx.save);
                        nowCtx.setWorld(nextWorld);
                        nowCtx.renderer.prepareScene(nextWorld, nowCtx.save);
                        paintHud();
                        openCityHotspot(target);
                    }),
                toggleChinese: () => {
                    const nowCtx = getContext();
                    nowCtx.save.languageLearning.showChinese = nowCtx.save.languageLearning.showChinese === false;
                    persist();
                    openCityHotspot(target);
                },
                read: (text, locale) => void dialogueVoice().speak(text, locale),
                practice: learning => {
                    const nowCtx = getContext();
                    const npc =
                        nowCtx.world.npcs.find(n => n.id === hotspot.npcId) || {
                            ...nowCtx.world.city.npcs.find(n => n.languages.includes('en')),
                            cityId: dungeon.cityId,
                        };
                    void earth.practiceEarth(npc, learning);
                },
            },
        );
    }

    async function loadAndEnterDungeon(id, restart = false) {
        if (id?.startsWith('city:')) return loadAndEnterCityDungeon(id);
        const ctx = getContext();
        if (ctx.world.isCityDungeon) {
            toast('请先退出城市副本');
            return;
        }
        if (dungeonLoading || ctx.stage !== 'world') return;
        if (restart && !dungeonFor(ctx.assets.content, id)?.kind && !confirm(tr('重新开启会重置该副本的清怪进度，确定继续吗？'))) return;
        const target = ctx.save;
        const epoch = ctx.roleEpoch;
        const zone = ctx.save.zone;
        const fromParty = ctx.panel === 'social-party';
        dungeonLoading = id;
        paintPanel();
        try {
            await ctx.assets.dungeons.load(id);
            const latest = getContext();
            if (
                latest.save !== target
                || latest.roleEpoch !== epoch
                || latest.stage !== 'world'
                || !['dungeons', 'social-party', 'dungeon-journey'].includes(latest.panel)
                || latest.save.zone !== zone
            ) {
                return;
            }
            if (latest.save.coopRun && latest.save.coopRun.dungeonId !== id) throw Error('请先暂离当前组队副本');
            const next = structuredClone(latest.save);
            const social = islandSocial();
            if (social.team.length && !next.coopRun) {
                if (dungeonFor(latest.assets.content, next.zone)) leaveDungeon(next, latest.assets.content);
                startCoopRun(next, social.preparedTeam(), latest.assets.dataset, dungeonFor(latest.assets.content, id), A.playerSpec(next, latest.assets.content));
                next.coopRun.relationshipRunId = crypto.randomUUID();
            }
            if (restart && next.coopRun) {
                const members = next.coopRun.members.map(m => m.profile);
                const hero = next.coopRun.hero;
                leaveDungeon(next, latest.assets.content);
                startCoopRun(next, members, latest.assets.dataset, dungeonFor(latest.assets.content, id), hero);
                next.coopRun.relationshipRunId = crypto.randomUUID();
            }
            const d = dungeonFor(latest.assets.content, id);
            const lp = localPlay();
            const party = lp.active
                ? lp.partyFor(next)
                : journeyCoopParty(next, A.playerSpec(next, latest.assets.content))
                  || journeyPetParty(next, latest.assets.content, A.playerSpec(next, latest.assets.content));
            if (d.kind === 'tower') next.dungeonMode = Math.max(1, Math.min(4, party?.length || 1));
            journeyParty(next, d, party);
            const freshStory = restart || !(next.coopRun?.runs || next.dungeonRuns)?.[id];
            enterDungeon(next, latest.assets.content, id, { restart });
            delete latest.save.dungeonLanguageBuff;
            Object.assign(latest.save, next);
            await enterWorld(latest.save);
            queueCloudSave();
            if (fromParty) close();
            const after = getContext();
            if (freshStory && d.kind && d.story?.length && after.save === target && after.roleEpoch === epoch && after.save.zone === id) {
                after.renderer.render(after.world, after.save, performance.now(), { socialActors: social.actors });
                after.setPanel('dungeon-story');
                nodes.hud.hidden = true;
                dungeonStory.open(d);
            }
        } catch (error) {
            toast('副本加载失败：{message}，请重试。', { message: error.message });
            if (error.message.includes('出战单位') && dungeonFor(getContext().assets.content, id)?.kind) {
                islandSocial().pickPartyDungeon(id, { restart });
            }
        } finally {
            dungeonLoading = null;
            if (getContext().panel === 'dungeons') paintPanel();
        }
    }

    function exitDungeon() {
        safely(() => {
            const { world, save, assets } = getContext();
            if (world.isCityDungeon) leaveCityDungeon(save, assets.content);
            else leaveDungeon(save, assets.content);
            enterWorld(save);
            queueCloudSave();
        });
    }

    function travel(zone) {
        safely(async () => {
            const { save, assets, world } = getContext();
            const status = travelStatus(save, assets.content, zone);
            if (
                status.allowed
                && status.requiresConfirmation
                && !(await askAdventureConfirm({
                    parent: nodes.overlay,
                    title: tr('危险的地方'),
                    message: tr('那里很危险，确定还要前往吗？'),
                }))
            ) {
                return;
            }
            if (world.isCityDungeon) {
                while (save.zone.startsWith('city:')) leaveCityDungeon(save, assets.content);
            } else if (dungeonFor(assets.content, save.zone)) {
                leaveDungeon(save, assets.content);
            }
            A.applyAction(save, assets.content, { type: 'travel', zone });
            earth.resetSession();
            enterWorld(save);
            showTeleportEffect();
            toast('已抵达{name}。', { name: islandName(zone) });
        });
    }

    function getState() {
        return { dungeonLoading, journeyId, journeyRestart };
    }

    return {
        dungeonStory,
        openJourney,
        openSparkRescue,
        paintSparkRescue,
        claimFloorReward,
        pickDungeonLobby,
        loadAndEnterCityDungeon,
        openCityHotspot,
        loadAndEnterDungeon,
        exitDungeon,
        travel,
        getState,
    };
}
