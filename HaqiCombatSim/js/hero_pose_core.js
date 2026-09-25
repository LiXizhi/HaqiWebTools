import { createRng } from './rng_core.js';

export const HEAD_DIRECTIONS = Array.from({length:16},(_,i)=>i*22.5);
export const BODY_TO_HEAD = [0, 4, 12, 8];
const wrap = n => (n % 16 + 16) % 16;
const delta = (a, b) => (a - b + 24) % 16 - 8;
export function direction16(dx, dy) { return wrap(Math.round(Math.atan2(-dx, dy) / (Math.PI / 8))); }
export function clampHead(head, facing) {
    const body = BODY_TO_HEAD[facing] ?? 0;
    return wrap(body + Math.max(-2, Math.min(2, delta(head, body))));
}
export function createHeroActor(seed = 7419) {
    return { rng: createRng(seed), head: 0, facing: 0, stoppedAt: null, nextLook: null, lookUntil: 0, lookOffset: 0, lastTurn: -Infinity, targetId: null,phase:(Number(seed)%31)/31*Math.PI*2,lastTime:null };
}
export function headBreath(time=0,phase=0,reducedMotion=false) {
    if(reducedMotion)return {x:0,y:0,angle:0};
    return {x:Math.sin(time*1.13+phase)*.22,y:Math.sin(time*1.9+phase)*.55,angle:Math.sin(time*.83+phase)*.012};
}
// Seconds, world coordinates, and actual displacement after collisions. No saved state.
export function updateHeroActor(actor, { dx = 0, dy = 0, x = 0, y = 0, time = 0, npcs = [], reducedMotion = false, facing } = {}) {
    if(facing!==undefined)actor.facing=facing;
    if(actor.lastTime!==null&&(time<actor.lastTime||time-actor.lastTime>1)){actor.stoppedAt=time;actor.nextLook=null;actor.lookUntil=0;}
    actor.lastTime=time;
    const moving = Math.hypot(dx, dy) > .01;
    let wanted = BODY_TO_HEAD[actor.facing];
    if (moving) {
        if(facing===undefined)actor.facing = Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 1 : 2 : dy < 0 ? 3 : 0;
        wanted = direction16(dx, dy); actor.stoppedAt = null; actor.nextLook = null; actor.targetId = null;
    } else {
        actor.stoppedAt ??= time;
        const candidates = npcs.filter(n => !n.hidden).map(n => ({ ...n, distance: Math.hypot(n.x-x, n.y-y) })).filter(n => n.distance < 90).sort((a,b) => a.distance-b.distance);
        const previous = candidates.find(n => n.id === actor.targetId);
        const target = previous && previous.distance <= (candidates[0]?.distance ?? 0)+12 ? previous : candidates[0];
        actor.targetId = target?.id ?? null;
        if (target) { wanted = direction16(target.x-x, target.y-y); actor.nextLook = null; }
        else if (!reducedMotion && time-actor.stoppedAt >= .8) {
            actor.nextLook ??= time + .5 + actor.rng.float()*1.3;
            if (time >= actor.nextLook) {
                const sign=actor.lookOffset ? -Math.sign(actor.lookOffset) : actor.rng.int(0,1)?1:-1;
                actor.lookOffset = sign*actor.rng.int(1,2);
                actor.lookUntil = time + .7 + actor.rng.float()*1.1;
                actor.nextLook = actor.lookUntil + 1.1 + actor.rng.float()*2.1;
            }
            wanted = wrap(BODY_TO_HEAD[actor.facing] + (time < actor.lookUntil ? actor.lookOffset : 0));
        }
    }
    wanted = clampHead(wanted, actor.facing);
    // A body turn must not leave a transient backwards neck pose.
    actor.head = clampHead(actor.head, actor.facing);
    if (actor.head !== wanted && time-actor.lastTurn >= .12) {
        actor.head = wrap(actor.head + Math.sign(delta(wanted, actor.head))); actor.lastTurn = time;
    }
    return { facing: actor.facing, head: actor.head, moving, targetId: actor.targetId,breath:headBreath(time,actor.phase,reducedMotion) };
}
