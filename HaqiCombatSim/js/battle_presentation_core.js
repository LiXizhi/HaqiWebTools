import {cinematicCast} from './battle_camera_core.js';
// Shared battle-playback clock. Durations match adventure_app tickAnimation.
import { effectDuration } from './spell_effects_core.js';
import { HIT_DURATION_MS } from './actor_animation_core.js';
import { POINTER_TURN_MS } from './battle_pointer_core.js';

export const CAST_NAME_HOLD_MS=1900;
export function presentationEffectDuration(effects,card,reducedMotion=false){
    return reducedMotion?effectDuration(effects,card,true):Math.max(1500,effectDuration(effects,card)*1.65);
}

export function presentationEventDurationMs(event, {effects, card, hp = 0, reducedMotion = false} = {}) {
    if (!event?.type || event.type === 'combat_end') return 0;
    if (event.type === 'movearrow') return POINTER_TURN_MS;
    if (event.type === 'status') return 700;
    if (event.type === 'aura') return 1;
    if (event.type === 'speak') return 1300;
    if (event.type === 'cast') {
        const base=presentationEffectDuration(effects,card,reducedMotion);
        return cinematicCast(event,card)?CAST_NAME_HOLD_MS+base*.88:base;
    }
    if (event.type === 'pass'||event.type === 'fizzle') return 2100;
    if (['damage','dot'].includes(event.type)) return hp>0?HIT_DURATION_MS:900;
    if (['heal','hot'].includes(event.type)) return 1000;
    return 600;
}

// frames[].duration is milliseconds. Zero-length frames are skipped, then the last frame is held.
export function samplePresentationClock(frames, elapsedSeconds) {
    let remaining = Math.max(0, elapsedSeconds) * 1000, index = 0;
    for (let i = 0; i < frames.length; i++) {
        index = i;
        const duration = frames[i].duration || 0;
        if (duration <= 0) continue;
        if (remaining < duration) return {index: i, progress: remaining / duration};
        remaining -= duration;
    }
    return {index, progress: frames[index]?.duration > 0 ? 1 : 0};
}

// Readable front-facing name beat, followed by the shared slower effect clock.
export function presentationEventProgress(event,linear,options={}) {
    const p=Math.max(0,Math.min(1,linear));
    if(p===1||event?.type!=='cast'||!cinematicCast(event,options.card))return p;
    const base=presentationEffectDuration(options.effects,options.card,options.reducedMotion);
    const elapsed=p*(CAST_NAME_HOLD_MS+base*.88);
    return elapsed<=CAST_NAME_HOLD_MS?elapsed/CAST_NAME_HOLD_MS*.12:Math.min(1,.12+(elapsed-CAST_NAME_HOLD_MS)/base);
}
