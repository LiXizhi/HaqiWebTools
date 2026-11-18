// social/local_play_panels.js — 本地双人模式个人面板、共享法阵编队、NPC 对话与社交动作弹窗。
import { shopNavigationState, equipmentNavigationState } from '../adventure_shop_navigation_core.js';
import { createShopRefreshQueue, paintShopPreservingFocus } from '../adventure_shop_refresh_core.js';
import { validateLocalFormation, moveLocalSeat, equipLocalPet } from '../adventure_local_coop_core.js';
import { createCloseButton } from '../ui/controls.js';
import { el, button } from '../ui/dom.js';
import { renderDialogue } from '../views/adventure/view_npc_dialogue.js';
import { renderPanel } from '../views/adventure/view_panel_modal.js';
import { heroPortrait } from '../hero_renderer.js';
import { petPortrait } from '../views/adventure/view_adventure_pets.js';
import { petAppearanceStage } from '../adventure_pets_core.js';
import { ownedPetRecords } from '../adventure_pet_files_core.js';
import { earthCityQuestOffers, applyEarthCityQuest, earthCityStory } from '../adventure_earth_city_config_core.js';
import { renderSocialActions } from '../views/adventure/view_social_actions.js';
import { localSocialBubbles } from '../adventure_social_motion_core.js';
import { socialActionOptions, socialActionParams } from '../adventure_social_actions_core.js';
import { SOCIAL_DEFAULTS } from '../adventure_social_core.js';
import * as A from '../adventure_core.js';
import * as W from '../adventure_world_core.js';

const personal = new Set(['inventory', 'equipment', 'pet', 'deck', 'shop', 'upgrade', 'gems', 'quests', 'npc-services']);

export function createLocalPanelsController({
    state,
    saves,
    getSession,
    getRecord,
    queueWrite,
    isBusy,
    safe,
    storeSaves,
    loadPet,
    api,
    getCompanion,
    voices,
    roots,
    panels,
    dialogs,
    ui,
    pressed,
    paths,
    following,
    setFollowing,
}) {
    let formationDrag = null;
    let localGesture = null;
    let lastLocalGesture = -Infinity;
    let socialMenuTicket = 0;
    const actionPending = [0, 0];

    const shopRefresh = createShopRefreshQueue({
        isOpen: owner => !!getSession() && panels[owner] === 'shop',
        isBlocked: owner =>
            state().stage !== 'world' || !!state().battle || !!actionPending[owner] || !!roots[owner].querySelector('dialog[open]'),
        paint: owner => paintShopPreservingFocus(roots[owner], () => paintPanel(owner)),
    });

    function close(owner) {
        shopRefresh.clear(owner);
        void voices[owner].cancel();
        roots[owner].disposeDialogue?.();
        roots[owner].replaceChildren();
        roots[owner].className = `local-personal local-${owner ? 'right' : 'left'}`;
        panels[owner] = null;
        dialogs[owner] = null;
        pressed[owner].clear();
        paths[owner] = [];
        if (formationDrag?.owner === owner) formationDrag = null;
        delete ui[owner].seat;
    }

    function closeAll() {
        close(0);
        close(1);
        formationDrag = null;
    }

    function resetFormationSelection(owner) {
        formationDrag = null;
        delete ui[owner].seat;
    }

    function openPeerActions(owner) {
        const session = getSession();
        if (!session || state().stage !== 'world' || state().globalPaused || W.distance(state().save.position, session.second.position) > 180)
            return;
        const peer = { ...session.second, id: 'local-hero-1', kind: 'companion' };
        openLocalSocial(owner, peer, true);
    }

    function openLocalSocial(owner, profile, localPeer = false) {
        const session = getSession();
        if (!session || state().stage !== 'world') return;
        close(owner);
        panels[owner] = 'local-social';
        const ticket = ++socialMenuTicket;
        const paint = affinity => {
            if (ticket !== socialMenuTicket || panels[owner] !== 'local-social') return;
            const root = roots[owner],
                body = el('div', 'modal-body'),
                box = el(
                    'section',
                    'modal social-modal',
                    el('header', 'modal-header', el('h2', '', profile.name), createCloseButton(() => close(owner))),
                    body,
                );
            root.replaceChildren(box);
            root.classList.add('overlay', 'visible');
            box.setAttribute('role', 'dialog');
            box.setAttribute('aria-modal', 'false');
            renderSocialActions(
                box,
                body,
                {
                    selected: profile,
                    friends: api.model().social?.friends || [],
                    team: [],
                    busy: false,
                    coopActive: true,
                    localPeer,
                    following: following[1],
                    followTargetName: state().save.name,
                    actionAffinity: affinity,
                },
                {
                    assets: () => state().assets,
                    close: () => close(owner),
                    login: api.login,
                    friend: p => api.socialAccount(p, 'social-profile'),
                    friends: () => api.socialAccount(profile, 'mail'),
                    follow: () => {
                        setFollowing(1, !following[1]);
                        close(owner);
                    },
                    gesture: id => {
                        const curSession = getSession();
                        const target = localPeer
                            ? curSession.second.position
                            : api.socialActors().find(a => a.profile.id === profile.id)?.position;
                        if (!target || W.distance(saves()[localPeer ? 0 : owner].position, target) > (localPeer ? 180 : SOCIAL_DEFAULTS.converseRadius)) {
                            api.toast('请靠近伙伴再互动');
                            close(owner);
                            return;
                        }
                        const rules = socialActionParams(state().assets.content),
                            at = Date.now(),
                            action = socialActionOptions({ profile, affinity, content: state().assets.content }).find(a => a.id === id);
                        if (!action || action.disabled) return;
                        if (at - lastLocalGesture < rules.cooldownMs) {
                            api.toast('稍等一下，再与伙伴互动');
                            return;
                        }
                        lastLocalGesture = at;
                        localGesture = {
                            ids: localPeer ? ['hero', 'local-hero-1'] : [owner ? 'local-hero-1' : 'hero', profile.id],
                            action: id,
                            at,
                            until: at + rules.durationMs,
                            world: state().world,
                        };
                        close(owner);
                    },
                    talk: () => {
                        close(owner);
                        const curSession = getSession();
                        if (localPeer && curSession.controller === 'ai') getCompanion().openChat();
                        else api.characterTalk(localPeer ? 0 : owner, profile, { localPeer });
                    },
                    profile: () => {
                        close(owner);
                        if (localPeer) openPanel(1, 'equipment');
                        else api.characterTalk(owner, profile, { detailsOnly: true });
                    },
                },
            );
        };
        paint(null);
        if (!localPeer) void api.characterAffinity(owner, profile).then(paint).catch(() => {});
    }

    function petPanelSave(owner) {
        const session = getSession();
        const s = saves()[owner],
            heroSlot = session.formation.slots.findIndex(u => u?.kind === 'hero' && u.owner === owner);
        return {
            ...s,
            heroSlot,
            formation: session.formation.slots.map((u, i) =>
                i === heroSlot ? s.formation[s.heroSlot] : u?.kind === 'pet' && u.owner === owner ? u.id : null,
            ),
        };
    }

    function panelModel(owner) {
        const m = api.model();
        return {
            ...m,
            save: panels[owner] === 'pet' ? petPanelSave(owner) : saves()[owner],
            petView: (ui[owner].petView ||= {}),
            equipmentView: (ui[owner].equipmentView ||= { tab: 'gear', slot: 0, query: '', item: null, guid: null }),
            shopView: (ui[owner].shopView ||= { category: 'pet', query: '', school: '', slot: '', ownership: '', page: 0 }),
            strengtheningView: (ui[owner].strengtheningView ||= {}),
            gemView: (ui[owner].gemView ||= {}),
            serviceNpc: ui[owner].npc,
            npcServiceView: (ui[owner].npcServiceView ||= { query: '', page: 0, kind: '', category: '' }),
        };
    }

    function flushShopRefresh() {
        shopRefresh.flush();
    }

    function refreshShops() {
        for (let owner = 0; owner < 2; owner++) shopRefresh.request(owner);
        flushShopRefresh();
    }

    function repaint() {
        for (let i = 0; i < 2; i++) {
            if (panels[i] && panels[i] !== 'arena') {
                if (panels[i] === 'shop') shopRefresh.request(i);
                else paintPanel(i);
            }
        }
        flushShopRefresh();
    }

    async function saveFormation() {
        const session = getSession();
        const record = getRecord();
        validateLocalFormation(session.formation, session.ids, saves());
        record.formations[session.ids.join(':')] = structuredClone(session.formation);
        await queueWrite();
        repaint();
    }

    function action(owner, value) {
        return safe(async () => {
            actionPending[owner]++;
            try {
                const session = getSession();
                if (state().battle || isBusy()) throw Error('请先结束当前战斗或保存');
                if (value.type === 'formation') {
                    const s = petPanelSave(owner),
                        id = value.slots.find((id, i) => id && s.formation[i] !== id);
                    if (id) {
                        await loadPet(owner, id);
                        const target = session.formation.slots.findIndex(u => !u || (u.kind === 'pet' && u.owner === owner));
                        if (target < 0) throw Error('没有空余宠物位置');
                        session.formation = equipLocalPet(session.formation, owner, id, target, saves());
                        await saveFormation();
                    } else {
                        const pet = session.formation.slots.find(u => u?.kind === 'pet' && u.owner === owner);
                        if (pet && !value.slots.includes(pet.id)) {
                            session.formation.slots = session.formation.slots.map(u => (u === pet ? null : u));
                            await saveFormation();
                        }
                    }
                    return;
                }
                let access = {};
                const product = value.type === 'buy' && state().assets.content.shop.find(item => item.id === value.productId);
                if (product?.vipOnly) {
                    const targetSession = session,
                        targetStore = state().store,
                        target = saves()[owner];
                    const membership = await api.refreshMembership();
                    if (
                        getSession() !== targetSession ||
                        state().store !== targetStore ||
                        saves()[owner] !== target ||
                        state().stage !== 'world' ||
                        state().battle ||
                        isBusy()
                    )
                        throw Error('角色或游戏状态已变化，请重新操作。');
                    if (membership.status === 'guest') throw Error('请先登录会员账号，再使用会员权益。');
                    access = { keepworkVip: membership.isVip, expiresAt: membership.expiresAt, now: Date.now() };
                }
                const next = structuredClone(saves());
                A.applyAction(next[owner], state().assets.content, value, access);
                storeSaves(next);
                repaint();
                api.paintHud();
                return true;
            } finally {
                actionPending[owner]--;
            }
        });
    }

    function paintFormation(owner) {
        const session = getSession();
        const root = roots[owner],
            body = root.querySelector('.modal-body');
        if (!body) return;
        const existing = body.querySelector('.pet-stage-line');
        if (existing) existing.hidden = true;
        const grid = el('div', 'local-formation'),
            caption = el('p', 'muted', '共享四个法阵 · 点击选中，再点击目标位置交换；也可拖动');
        session.formation.slots.forEach((seat, index) => {
            const s = seat && saves()[seat.owner],
                p = seat?.kind === 'pet' && s.pets[seat.id];
            const name = !seat ? '空位' : seat.kind === 'hero' ? s.name : state().assets.content.pets[p?.speciesId]?.name || '宠物';
            const portrait = !seat
                ? el('span', '', '空位')
                : seat.kind === 'hero'
                  ? heroPortrait(state().assets, s, 70, 90, { lookAround: false })
                  : petPortrait(state().assets, p?.speciesId, p ? petAppearanceStage(p, state().assets.content) : 0, 70);
            const b = button(
                [portrait, el('strong', '', name), el('small', '', seat ? `玩家${seat.owner + 1} · 法阵${index + 1}` : `法阵${index + 1}`)],
                () =>
                    safe(async () => {
                        if (formationDrag && formationDrag.owner !== owner) throw Error('队友正在调整法阵');
                        if (ui[owner].seat != null) {
                            session.formation = moveLocalSeat(session.formation, ui[owner].seat, index);
                            delete ui[owner].seat;
                            formationDrag = null;
                            await saveFormation();
                        } else if (seat) {
                            ui[owner].seat = index;
                            formationDrag = { owner, index };
                            b.classList.add('selected');
                        }
                    }),
                'secondary local-seat',
            );
            b.dataset.localSeat = String(index);
            b.draggable = !!seat;
            b.ondragstart = e => {
                if (formationDrag && formationDrag.owner !== owner) {
                    e.preventDefault();
                    return;
                }
                formationDrag = { owner, index };
                e.dataTransfer.setData('text/plain', String(index));
            };
            b.ondragover = e => e.preventDefault();
            b.ondrop = e => {
                e.preventDefault();
                if (!formationDrag) return;
                const from = formationDrag.index;
                formationDrag = null;
                safe(async () => {
                    session.formation = moveLocalSeat(session.formation, from, index);
                    await saveFormation();
                });
            };
            b.ondragend = () => {
                formationDrag = null;
            };
            grid.append(b);
        });
        const choices = el('div', 'local-pet-choices');
        for (const [id, p] of Object.entries(ownedPetRecords(saves()[owner]))) {
            if (id === saves()[owner].formation[saves()[owner].heroSlot]) continue;
            choices.append(
                button(
                    state().assets.content.pets[p.speciesId]?.name || id,
                    () =>
                        safe(async () => {
                            await loadPet(owner, id);
                            const target = session.formation.slots.findIndex(u => !u || (u.kind === 'pet' && u.owner === owner));
                            session.formation = equipLocalPet(session.formation, owner, id, target, saves());
                            await saveFormation();
                        }),
                    'secondary small',
                ),
            );
        }
        choices.append(
            button(
                '宠物休息',
                () =>
                    safe(async () => {
                        session.formation.slots = session.formation.slots.map(u => (u?.owner === owner && u.kind === 'pet' ? null : u));
                        await saveFormation();
                    }),
                'secondary small',
            ),
        );
        body.prepend(caption, grid, choices);
    }

    function paintPanel(owner) {
        const kind = panels[owner];
        if (!kind) return;
        if (kind === 'gathering') {
            close(owner);
            return;
        }
        renderPanel(roots[owner], kind, panelModel(owner), {
            close: () => close(owner),
            action: v => action(owner, v),
            loadPet: id => loadPet(owner, id),
            panel: (k, options) => openPanel(owner, k, options),
            refresh: () => paintPanel(owner),
            seenGuide: () => {},
            track: () => {
                if (!owner) api.track();
            },
            travel: zone => {
                if (!owner) api.travel(zone);
            },
            encounter: id => api.interact({ kind: 'encounter', id }),
            cloud: api.login,
            learningEvent: () => {},
        });
        roots[owner].classList.add('local-personal', owner ? 'local-right' : 'local-left');
        if (kind === 'pet') paintFormation(owner);
        const head = roots[owner].querySelector('.modal-header');
        if (head) head.prepend(el('span', 'local-owner', `玩家${owner + 1} · ${saves()[owner].name}`));
    }

    function openPanel(owner, kind, options = {}) {
        if (state().stage !== 'world') return;
        if (kind === 'membership' || kind === 'recharge') {
            api.openAccountPanel(kind, options);
            return;
        }
        close(owner);
        panels[owner] = kind;
        ui[owner].npc = options.npc || ui[owner].npc;
        if (kind === 'shop') ui[owner].shopView = shopNavigationState(ui[owner].shopView, options);
        if (kind === 'inventory' || kind === 'equipment')
            Object.assign((ui[owner].equipmentView ||= {}), equipmentNavigationState(options, saves()[owner], state().assets.content));
        if (kind === 'pet') (ui[owner].petView ||= {}).tab = options.tab === 'mount' ? 'mount' : 'follow';
        paintPanel(owner);
        if (kind === 'shop') void safe(() => api.refreshMembership());
    }

    function openPersonal(kind, options = {}) {
        if (!getSession() || !personal.has(kind)) return false;
        openPanel(0, kind, options);
        if (['inventory', 'equipment', 'pet'].includes(kind)) openPanel(1, kind, options);
        return true;
    }

    function talk(owner, npc) {
        if (owner === 0) void voices[1].cancel();
        close(owner);
        dialogs[owner] = { npcId: npc.id, npc };
        paintTalk(owner);
    }

    function paintTalk(owner) {
        const d = dialogs[owner];
        if (!d) return;
        const start = (lines, label, done) => {
            Object.assign(d, { lines: lines || [], index: 0, finishLabel: label, done });
            if (!d.lines.length) advance();
            else paintTalk(owner);
        };
        const advance = () => {
            if (d.index + 1 < d.lines.length) {
                d.index++;
                paintTalk(owner);
            } else {
                safe(() => {
                    d.done?.();
                    storeSaves();
                    dialogs[owner] = { npcId: d.npcId, npc: d.npc };
                    paintTalk(owner);
                    api.paintHud();
                });
            }
        };
        const doAction = v => A.applyAction(saves()[owner], state().assets.content, v);
        if (d.npc.earthNpc && state().world.city) {
            const city = state().world.city,
                s = saves()[owner],
                story = earthCityStory(s, city, d.npc),
                offers = earthCityQuestOffers(s, city, d.npc.id);
            roots[owner].replaceChildren(
                el(
                    'section',
                    'modal',
                    el('header', 'modal-header', el('h2', '', d.npc.name), createCloseButton(() => close(owner))),
                    el(
                        'div',
                        'modal-body',
                        el('p', '', story.text),
                        ...offers.map(offer =>
                            button(
                                offer.quest.name,
                                () =>
                                    safe(() => {
                                        applyEarthCityQuest(s, city, d.npc.id, offer.quest.id, offer.kind);
                                        storeSaves();
                                        paintTalk(owner);
                                        api.paintHud();
                                    }),
                                'primary',
                            ),
                        ),
                    ),
                ),
            );
            return;
        }
        renderDialogue(roots[owner], panelModel(owner), d, {
            close: () => close(owner),
            next: advance,
            readDialogue: (text, locale, signal, speaker) =>
                owner === 1 && dialogs[0] ? Promise.resolve() : voices[owner].speak(text, locale, signal, speaker),
            mapDialogue: api.mapDialogue,
            chat: () => {
                openPanel(owner, 'npc-services', { npc: d.npc });
            },
            panel: k => openPanel(owner, k, { npc: d.npc }),
            travel: zone => {
                if (!owner) api.travel(zone);
            },
            track: () => {
                if (!owner) api.track();
            },
            startQuest: q => start(q.startDialog, '接取任务', () => doAction({ type: 'accept', questId: q.id, npcId: q.startNpc })),
            finishQuest: q => start(q.endDialog, '领取奖励', () => doAction({ type: 'claim', questId: q.id, npcId: q.endNpc })),
            startCatalog: q => start(q.startDialog, '接取任务', () => doAction({ type: 'accept-catalog', questId: q.id, npcId: q.startNpc })),
            finishCatalog: q => start(q.endDialog, '领取奖励', () => doAction({ type: 'claim-catalog', questId: q.id, npcId: q.endNpc })),
            questTalk: (q, t) => start(t.dialog, '谢谢你', () => doAction({ type: 'talk', npcId: t.npcId })),
        });
        roots[owner].classList.add('local-personal', owner ? 'local-right' : 'local-left');
        roots[owner].querySelector('[role="dialog"]')?.setAttribute('aria-modal', 'false');
    }

    function interceptSocial(point) {
        if (!getSession()) return false;
        const bubbles = localSocialBubbles(
            api.socialActors(),
            saves().map(s => s.position),
            { gesture: localGesture || api.socialGesture(), at: Date.now() },
        );
        const hit = bubbles.find(b => point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h);
        if (!hit) return false;
        openLocalSocial(hit.owner, hit.profile);
        return true;
    }

    return {
        close,
        closeAll,
        resetFormationSelection,
        openPeerActions,
        openLocalSocial,
        flushShopRefresh,
        refreshShops,
        repaint,
        openPanel,
        openPersonal,
        talk,
        interceptSocial,
        get gesture() {
            return getSession() && localGesture?.world === state().world && localGesture.until > Date.now() ? localGesture : null;
        },
    };
}
