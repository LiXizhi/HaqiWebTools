// social/local_play_gathering.js — 本地双人模式采集、冶炼、掉落拾取与采集画布渲染。
import { drawGatheringProgress } from '../views/adventure/view_gathering_progress.js';
import { selectCompanionId } from '../adventure_companion_core.js';
import {
    canPetAssistGathering,
    smeltGroundDrop,
    applyGroundPickup,
    gatheringPetPower,
    advanceGathering,
    gatheringRemaining,
    gatheringParams,
    gatheringNodes,
    gatheringValue,
    collectGathering,
} from '../adventure_gathering_core.js';
import * as W from '../adventure_world_core.js';

export function createLocalGatheringController({
    state,
    saves,
    ids,
    getSession,
    getRecord,
    setRecord,
    getLoadedKey,
    getWriteQueue,
    db,
    isBusy,
    setBusy,
    safe,
    storeSaves,
    api,
    companion,
    panels,
    dialogs,
    following,
    gatherCanvas,
    day,
}) {
    let gatherConfig = null;
    let gatherVisible = [];
    let gatherTick = 0;
    let gatherWorld = null;
    const gatherProgress = [null, null];
    const gatherEffects = [];
    const smeltProgress = [null, null];
    const petJobs = [null, null];
    const petCooldown = [0, 0];
    let pickupPromise = null;

    async function ensureConfig() {
        gatherConfig ||= await fetch(new URL('../../data/adventure/gathering.json', import.meta.url)).then(r => {
            if (!r.ok) throw Error('采集配置加载失败');
            return r.json();
        });
        return gatherConfig;
    }

    function resetSessionGathering() {
        petJobs.fill(null);
        smeltProgress.fill(null);
        gatherProgress.fill(null);
    }

    async function collect(owner, node, ensure) {
        if (isBusy()) return false;
        setBusy(true);
        try {
            await ensure();
            const record = getRecord();
            const next = collectGathering(record, node, ids()[owner], day());
            await getWriteQueue();
            await db.write(getLoadedKey(), next);
            setRecord(next);
            gatherEffects.push({ ...node, at: performance.now(), owner });
            gatherTick = 0;
            if (getSession()) void companion.remember(`${saves()[owner].name}采集了${node.name || node.itemId}。`);
            return true;
        } finally {
            setBusy(false);
        }
    }

    async function finishSmelt() {
        const record = getRecord();
        const tx = record?.smelt;
        if (!tx) return;
        const { store } = state();
        const updates = {};
        for (const [id, coins] of Object.entries(tx.allocation)) {
            const row = store.catalog.roles.find(r => r.id === id);
            if (!row) throw Error('冶炼收款角色不存在，材料已保留');
            const s = structuredClone(row.save);
            if (!s.rewardedEncounters.includes(tx.id)) {
                s.inventory[100] = (s.inventory[100] || 0)+ coins;
                s.rewardedEncounters.push(tx.id);
                s.revision++;
            }
            updates[id] = s;
        }
        store.commitRoles(updates);
        const session = getSession();
        if (session) {
            const runtime = {
                zone: session.second.zone,
                position: session.second.position,
                positionCoordinateVersion: session.second.positionCoordinateVersion,
                dungeonReturn: session.second.dungeonReturn,
            };
            api.replaceSave(store.catalog.roles.find(r => r.id === ids()[0]).save);
            session.second = { ...store.catalog.roles.find(r => r.id === ids()[1]).save, ...runtime };
        } else if (ids()[0] && updates[ids()[0]]) {
            api.replaceSave(updates[ids()[0]]);
        }
        const cleared = structuredClone(record);
        cleared.bags[tx.owner] = {};
        cleared.smelt = null;
        await getWriteQueue();
        await db.write(getLoadedKey(), cleared);
        setRecord(cleared);
        api.paintHud();
    }

    async function createGroundSmelt(owner) {
        if (isBusy()) return;
        setBusy(true);
        const key = getLoadedKey();
        try {
            const record = getRecord();
            const s = saves()[owner];
            const result = smeltGroundDrop(record, ids()[owner], s.zone, s.position, gatheringParams(state().assets.content));
            if (!result) return;
            const params = gatheringParams(state().assets.content);
            const world = state().world;
            const angle = Math.atan2(result.drop.y - s.position.y, result.drop.x - s.position.x);
            let spot = null;
            for (let i = 0; i < 8; i++) {
                const a = angle + (i * Math.PI) / 4;
                const p = {
                    x: s.position.x + Math.cos(a) * params.gatherDropDistance,
                    y: s.position.y + Math.sin(a) * params.gatherDropDistance,
                };
                if (
                    W.walkable(world, p.x, p.y) &&
                    saves()
                        .filter(Boolean)
                        .every(actor => W.distance(actor.position, p) > params.gatherPickupDistance + 10) &&
                    W.findPath(world, s.position, p).length
                ) {
                    spot = p;
                    break;
                }
            }
            if (!spot) return;
            Object.assign(result.drop, spot);
            await getWriteQueue();
            await db.write(key, result.state);
            if (key !== getLoadedKey()) return;
            setRecord(result.state);
        } finally {
            setBusy(false);
        }
    }

    function finishPickup() {
        if (pickupPromise) return pickupPromise;
        pickupPromise = (async () => {
            const key = getLoadedKey();
            const record = getRecord();
            const tx = record?.pickup;
            if (!tx) return;
            const row = state().store.catalog.roles.find(r => r.id === tx.roleId);
            if (!row) return;
            const nextSave = applyGroundPickup(row.save, tx.drop);
            state().store.commitRoles({ [tx.roleId]: nextSave });
            const owner = ids().indexOf(tx.roleId);
            const session = getSession();
            if (owner === 0) api.replaceSave(nextSave);
            else if (owner === 1 && session) {
                const runtime = session.second;
                session.second = {
                    ...nextSave,
                    zone: runtime.zone,
                    position: runtime.position,
                    positionCoordinateVersion: runtime.positionCoordinateVersion,
                    dungeonReturn: runtime.dungeonReturn,
                };
            }
            const next = structuredClone(record);
            next.drops = (next.drops || []).filter(d => d.id !== tx.drop.id);
            next.pickup = null;
            await getWriteQueue();
            await db.write(key, next);
            if (key !== getLoadedKey()) return;
            setRecord(next);
            api.paintHud();
        })().finally(() => {
            pickupPromise = null;
        });
        return pickupPromise;
    }

    async function pickupGroundDrop(owner, drop) {
        if (isBusy()) return;
        setBusy(true);
        try {
            storeSaves();
            const next = structuredClone(getRecord());
            next.pickup = { roleId: ids()[owner], drop };
            await getWriteQueue();
            await db.write(getLoadedKey(), next);
            setRecord(next);
            await finishPickup();
            api.toast(`玩家${owner + 1}获得${drop.amount}${drop.currency === 100 ? '奇豆' : '仙豆'}`);
        } finally {
            setBusy(false);
        }
    }

    function nearestResource(owner) {
        const record = getRecord();
        const s = saves()[owner];
        const distance = gatheringParams(state().assets.content).gatherDistance;
        return gatherVisible
            .filter(n => gatheringRemaining(record, n, day()) > 0 && W.distance(s.position, n) < distance)
            .sort((a, b) => W.distance(s.position, a) - W.distance(s.position, b))[0];
    }

    function tickGathering(now, dt, ensure) {
        const { world, renderer } = state();
        const session = getSession();
        const record = getRecord();
        if (gatherWorld !== world) {
            gatherWorld = world;
            gatherTick = 0;
            gatherVisible = [];
            gatherProgress.fill(null);
            gatherEffects.length = 0;
            smeltProgress.fill(null);
            petJobs.fill(null);
            petCooldown.fill(0);
        }
        if (now - gatherTick > 500) {
            gatherTick = now;
            const params = gatheringParams(state().assets.content);
            const nodes = new Map();
            if (gatherConfig) {
                for (const s of saves().filter(Boolean)) {
                    for (const n of gatheringNodes(world, s.position, gatherConfig, params)) {
                        if (gatheringRemaining(record, n, day())) nodes.set(n.id, n);
                    }
                }
            }
            gatherVisible = [...nodes.values()];
        }
        gatherCanvas.hidden = false;
        if (gatherCanvas.width !== innerWidth) gatherCanvas.width = innerWidth;
        if (gatherCanvas.height !== innerHeight) gatherCanvas.height = innerHeight;
        const c = gatherCanvas.getContext('2d');
        c.clearRect(0, 0, gatherCanvas.width, gatherCanvas.height);
        const params = gatheringParams(state().assets.content);
        for (let owner = 0; owner < (session ? 2 : 1); owner++) {
            const s = saves()[owner];
            const enabled = !state().globalPaused && !panels[owner] && !dialogs[owner];
            const value = (record.credits?.[ids()[owner]] || 0) + gatheringValue(record.bags[ids()[owner]], params);
            const smelting = advanceGathering(smeltProgress[owner], {
                position: s.position,
                node: value >= params.gatherSmeltValue ? { id: 'smelt' } : null,
                dt,
                enabled,
                params: { ...params, gatherDwellSeconds: 0, gatherUnitSeconds: params.gatherSmeltSeconds },
            });
            smeltProgress[owner] = smelting;
            if (smelting.elapsed > 0 && enabled && value >= params.gatherSmeltValue) {
                const p = renderer.worldToScreen(s.position);
                c.strokeStyle = '#ffbd58';
                c.lineWidth = 3;
                c.beginPath();
                c.ellipse(p.x, p.y + 5, 34, 12, 0, 0, Math.PI * 2);
                c.stroke();
                c.fillStyle = '#ffe4a0';
                c.font = '14px sans-serif';
                c.textAlign = 'center';
                c.fillText('冶炼中', p.x, p.y - 65);
                for (let i = 0; i < 6; i++) {
                    const a = now / 180 + (i * Math.PI) / 3;
                    c.fillRect(p.x + Math.cos(a) * 24, p.y - 16 + Math.sin(a) * 12 - smelting.progress * 25, 4, 4);
                }
                if (smelting.ready && !isBusy()) {
                    smeltProgress[owner] = null;
                    safe(() => createGroundSmelt(owner));
                }
            }
            const petId = session
                ? session.formation.slots.find(slot => slot?.owner === owner && slot.kind === 'pet')?.id
                : selectCompanionId(s, state().assets.content);
            const pet = s.pets?.[petId];
            const power = gatheringPetPower(pet, state().assets.content);
            const activeGather = gatherProgress[owner];
            const sharedNode = nearestResource(owner);
            const helping = canPetAssistGathering(activeGather, sharedNode, s.position, params, enabled && !following[owner]);
            let job = petJobs[owner];
            if (!helping || !power || (job && job.pet.id !== petId) || (job && job.node.id !== sharedNode?.id)) {
                petJobs[owner] = null;
                job = null;
            }
            if (helping && power && !job) {
                petCooldown[owner] -= dt;
                if (petCooldown[owner] <= 0) {
                    const node = sharedNode;
                    if (node) {
                        const path = W.findPath(state().world, s.position, node);
                        if (path.length) job = petJobs[owner] = { pet, node, position: { ...s.position }, path, elapsed: 0 };
                    }
                    petCooldown[owner] = params.gatherPetCooldown / power;
                }
            }
            if (job) {
                const moved = W.followPath(state().world, job.position, job.path, W.WALK_SPEED * dt);
                job.position = moved.position;
                job.path = moved.path;
                if (!gatheringRemaining(record, job.node, day())) petJobs[owner] = null;
                else if (W.distance(job.position, job.node) < 25) {
                    job.elapsed += dt;
                    const p = renderer.worldToScreen(job.position);
                    c.fillStyle = '#ffe8a0';
                    c.font = '12px sans-serif';
                    c.textAlign = 'center';
                    c.fillText('宠物协助采集', p.x, p.y - 35);
                    if (job.elapsed >= params.gatherUnitSeconds / power && !isBusy()) {
                        petJobs[owner] = null;
                        safe(() => collect(owner, job.node, ensure));
                    }
                } else if (!job.path.length) petJobs[owner] = null;
            }
        }
        for (const drop of record.drops || []) {
            if (drop.zone !== state().world.zone) continue;
            const p = renderer.worldToScreen(drop);
            const fairy = drop.currency === 17213;
            c.fillStyle = fairy ? '#9cecf9' : '#ffd768';
            c.strokeStyle = fairy ? '#2f94b5' : '#ad7621';
            c.lineWidth = 2;
            c.beginPath();
            c.ellipse(p.x, p.y - 8 + Math.sin(now / 220) * 3, 10, 7, -0.35, 0, Math.PI * 2);
            c.fill();
            c.stroke();
            c.fillStyle = '#fff5cf';
            c.font = '12px sans-serif';
            c.textAlign = 'center';
            c.fillText(`${fairy ? '仙豆' : '奇豆'} × ${drop.amount}`, p.x, p.y - 25);
            if (state().globalPaused) continue;
            const candidates = saves()
                .filter(Boolean)
                .map((s, owner) => ({ owner, distance: W.distance(s.position, drop) }))
                .filter(row => row.distance < params.gatherPickupDistance && !panels[row.owner] && !dialogs[row.owner])
                .sort((a, b) => a.distance - b.distance || a.owner - b.owner);
            if (candidates.length && !isBusy()) safe(() => pickupGroundDrop(candidates[0].owner, drop));
        }
        for (let owner = 0; owner < (session ? 2 : 1); owner++) {
            const node = nearestResource(owner);
            const position = saves()[owner].position;
            const enabled = !state().globalPaused && !panels[owner] && !dialogs[owner] && !following[owner];
            const progress = advanceGathering(gatherProgress[owner], { position, node, dt, enabled, params });
            gatherProgress[owner] = progress;
            if (!enabled || !node || progress.elapsed < params.gatherDwellSeconds) continue;
            drawGatheringProgress(c, renderer.worldToScreen(node), progress.progress, `${node.name} · ${gatheringRemaining(record, node, day())}`, owner);
            if (progress.ready && !isBusy()) {
                progress.elapsed = params.gatherDwellSeconds;
                progress.progress = 0;
                safe(() => collect(owner, node, ensure));
            }
        }
        for (let i = gatherEffects.length - 1; i >= 0; i--) {
            const effect = gatherEffects[i];
            const t = (now - effect.at) / 600;
            if (t >= 1) {
                gatherEffects.splice(i, 1);
                continue;
            }
            const p = renderer.worldToScreen(effect);
            c.globalAlpha = 1 - Math.max(0, t);
            c.fillStyle = effect.color;
            for (let j = 0; j < 8; j++) {
                const angle = (j * Math.PI) / 4;
                c.save();
                c.translate(p.x + Math.cos(angle) * t * 36, p.y - 20 + Math.sin(angle) * t * 25 + t * t * 18);
                c.rotate(angle + t * 3);
                c.fillRect(-3, -3, 6, 6);
                c.restore();
            }
            c.fillStyle = '#fff8d0';
            c.fillText('+1', p.x, p.y - 32 - t * 28);
            c.globalAlpha = 1;
        }
    }

    return {
        get visible() {
            return gatherVisible;
        },
        get gatheringPets() {
            return petJobs
                .filter(Boolean)
                .map(job => ({ pet: job.pet, position: job.position, moving: !!job.path.length, phase: performance.now() / 200, facing: 1 }));
        },
        ensureConfig,
        resetSessionGathering,
        collect,
        finishSmelt,
        createGroundSmelt,
        finishPickup,
        pickupGroundDrop,
        nearestResource,
        tickGathering,
    };
}
