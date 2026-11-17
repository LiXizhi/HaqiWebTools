// social/local_play_world.js — 本地双人模式存档分写、宠物按需加载、焦点导航与世界帧移动步进。
import { constrainLocalPosition } from '../adventure_local_coop_core.js';
import { tickCare } from '../adventure_pets_core.js';
import { SOCIAL_DEFAULTS } from '../adventure_social_core.js';
import * as A from '../adventure_core.js';
import * as W from '../adventure_world_core.js';

export function storeLocalDuoSaves({ store, saves, ids, session, api, next = saves(), runtimeOnly = false }) {
    const updates = {};
    ids().forEach((id, i) => {
        if (next[i]) updates[id] = next[i];
    });
    const secondRuntime = session && {
        zone: next[1].zone,
        position: next[1].position,
        positionCoordinateVersion: next[1].positionCoordinateVersion,
        dungeonReturn: next[1].dungeonReturn,
    };
    if (session) {
        updates[ids()[1]] = {
            ...next[1],
            zone: session.returnTo.zone,
            position: session.returnTo.position,
            positionCoordinateVersion: session.returnTo.coordinateVersion ?? 1,
            dungeonReturn: session.returnTo.dungeonReturn,
        };
    }
    if (runtimeOnly) {
        store.saveRuntime(updates);
        return;
    }
    store.commitRoles(updates);
    api.replaceSave(store.catalog.roles.find(r => r.id === ids()[0]).save);
    if (session) {
        session.second = { ...store.catalog.roles.find(r => r.id === ids()[1]).save, ...secondRuntime };
    }
}

export async function loadLocalPet({ store, saves, ids, api, owner, id }) {
    const roleId = ids()[owner];
    const current = saves()[owner];
    const identity = store.owner;
    if (current.pets[id]) return current.pets[id];
    const ref = current.petFileRefs?.[id];
    if (!ref) throw Error('找不到宠物');
    try {
        store.petFileIO(roleId).read(ref.path);
    } catch {
        await api.loadPetFile(roleId, ref.path);
    }
    if (identity !== store.owner || saves()[owner] !== current) throw Error('角色已切换');
    const next = store.loadPet(current, id, roleId);
    Object.assign(current.pets, next.pets);
    return current.pets[id];
}

export function navigateLocalPane({ pane, currentState, battle, ui, owner, action, override = null }) {
    if (!pane) return;
    const root = [...pane.querySelectorAll('dialog[open]')].at(-1) || pane;
    if (!override && currentState.stage === 'battle') battle.syncBattleTargetFocus(owner);
    const selector =
        !override && currentState.stage === 'battle' && battle.isOwnerSelectableInBattle(owner)
            ? battle.hasOwnerSelectedCard(owner)
                ? '.combatant-status.is-targetable:not(:disabled)'
                : '.card-select:not(:disabled),.battle-actions button:not(:disabled)'
            : 'button:not(:disabled),select,input:not(:disabled),summary';
    const searchRoot =
        !override && currentState.stage === 'battle' && battle.hasOwnerSelectedCard(owner)
            ? currentState.battleRoot.querySelector('.local-battle-shared')
            : root;
    const controls = [...searchRoot.querySelectorAll(selector)].filter(n => n.getClientRects().length && !n.closest('[hidden]'));
    if (!controls.length) return;
    let index = ui[owner].focus ?? 0;
    if (['left', 'up', 'right', 'down'].includes(action)) {
        index = (index + (['left', 'up'].includes(action) ? -1 : 1) + controls.length) % controls.length;
        ui[owner].focus = index;
    }
    index = Math.min(index, controls.length - 1);
    searchRoot.querySelectorAll('.local-focus').forEach(n => n.classList.remove('local-focus'));
    controls[index].classList.add('local-focus');
    controls[index].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (action === 'confirm') {
        if (controls[index].tagName === 'SELECT') {
            const select = controls[index];
            for (let n = 0; n < select.options.length; n++) {
                select.selectedIndex = (select.selectedIndex + 1) % select.options.length;
                if (!select.options[select.selectedIndex].disabled) break;
            }
            select.dispatchEvent(new Event('change'));
        } else {
            controls[index].click();
        }
    }
}

export function stepLocalWorldMotion({
    world,
    save,
    assets,
    globalPaused,
    saves,
    session,
    localFollowing,
    teamFollowing,
    followMotion,
    planAI,
    pressed,
    paths,
    mouseTargets,
    panels,
    dialogs,
    api,
    talk,
    now,
    dt,
    careAt,
    setCareAt,
}) {
    session.moving = [false, false];
    const follow = localFollowing();
    planAI(now, localFollowing);
    const positions = saves();
    for (let owner = 0; owner < 2; owner++) {
        const s = positions[owner];
        const peer = positions[1 - owner];
        if (panels[owner] || dialogs[owner] || globalPaused) continue;
        if (teamFollowing() || follow[owner]) {
            paths[owner] = [];
            if (owner === 1 || follow[owner]) {
                mouseTargets[owner] = null;
                continue;
            }
        }
        let dx = Number(pressed[owner].has('right')) - Number(pressed[owner].has('left'));
        let dy = Number(pressed[owner].has('down')) - Number(pressed[owner].has('up'));
        if (paths[owner].length) {
            const next = W.followPath(world, s.position, paths[owner], W.WALK_SPEED * dt);
            paths[owner] = next.path;
            dx = next.position.x - s.position.x;
            dy = next.position.y - s.position.y;
        }
        if (dx || dy) {
            const n = Math.hypot(dx, dy);
            const step = Math.min(
                W.WALK_SPEED * dt,
                follow[owner] || mouseTargets[owner] || (owner === 1 && session.controller === 'ai') ? n : Infinity,
            );
            const next = W.movePosition(world, s.position, (dx / n) * step, (dy / n) * step);
            if (
                constrainLocalPosition(next, peer.position, innerWidth, innerHeight) &&
                !(owner === 1 && session.controller === 'ai' && W.autoInteraction(world, next))
            ) {
                session.moving[owner] = W.distance(s.position, next) > 0.01;
                s.position = next;
                s.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0;
            }
        }
    }
    if (!teamFollowing()) {
        const moved = followMotion.step(world, positions, follow, dt, {
            paused: globalPaused || panels.some(Boolean) || dialogs.some(Boolean),
            params: { ...SOCIAL_DEFAULTS, ...assets.content.balanceParams?.islandSocial },
        });
        moved.forEach((value, owner) => {
            if (follow[owner]) session.moving[owner] = value;
        });
    }
    if (mouseTargets[1] && W.distance(session.second.position, mouseTargets[1]) < 85) {
        const target = mouseTargets[1];
        mouseTargets[1] = null;
        paths[1] = [];
        if (target.itemId) {
            /* Standing still starts collection on the next tick. */
        } else if (target.kind === 'npc') {
            talk(1, target);
        } else if (target.kind === 'encounter') {
            api.interact(target);
        }
    }
    if (!teamFollowing() && !follow.some(Boolean) && session.lastLeader && !constrainLocalPosition(save.position, session.second.position, innerWidth, innerHeight)) {
        save.position = { ...session.lastLeader };
    }
    session.lastLeader = { ...save.position };
    if (!teamFollowing() && !follow[1] && session.controller !== 'ai' && !panels[1] && !dialogs[1] && !globalPaused) {
        const target = W.autoInteraction(world, session.second.position);
        if (target?.kind === 'encounter' && target.id !== session.secondContact) api.interact(target);
        session.secondContact = target?.id ?? null;
    }
    if (now - careAt > 1000) {
        setCareAt(now);
        if (tickCare(session.second, assets.content, A.playerSpec(session.second, assets.content), Date.now(), true)) {
            api.onCoreChange();
        }
    }
}
