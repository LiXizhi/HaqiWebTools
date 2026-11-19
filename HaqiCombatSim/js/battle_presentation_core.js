import {cinematicCast} from './battle_camera_core.js';
// Shared battle-playback clock. Durations match adventure_app tickAnimation.
import { effectDuration } from './spell_effects_core.js';
import { HIT_DURATION_MS } from './actor_animation_core.js';
import { POINTER_TURN_MS } from './battle_pointer_core.js';

export const CAST_NAME_HOLD_MS=1900;
const REPEAT_NAME_HOLD_MS = 650;

export function markRepeatedTacticalCasts(events, seenByCaster) {
    return events.map(event => {
        if (event.type !== 'cast' || !event.caster || !event.card || event.sourceType === 'reflection' || event.label === 'reflection') return event;
        let spells = seenByCaster.get(event.caster);
        if (!spells) seenByCaster.set(event.caster, spells = new Set());
        if (spells.has(event.card)) return {...event, repeatTacticalCast: true};
        spells.add(event.card);
        return event;
    });
}

export function presentationEffectDuration(effects, card, reducedMotion = false, repeated = false) {
    if (reducedMotion) return effectDuration(effects, card, true);
    const authored = effectDuration(effects, card);
    return repeated && card?.pipcost === 0 ? Math.max(900, authored * 1.1) : Math.max(1500, authored * 1.65);
}

export function presentationEventDurationMs(event, {effects, card, hp = 0, reducedMotion = false, briskTraining = false} = {}) {
    if (!event?.type || event.type === 'combat_end') return 0;
    if (event.type === 'movearrow') return POINTER_TURN_MS;
    if (event.type === 'status') return briskTraining ? 450 : 700;
    if (event.type === 'aura') return 1;
    if (event.type === 'speak') return briskTraining ? 900 : 1300;
    if (event.type === 'cast') {
        const base = presentationEffectDuration(effects, card, reducedMotion, event.repeatTacticalCast);
        const hold = event.repeatTacticalCast ? REPEAT_NAME_HOLD_MS : CAST_NAME_HOLD_MS;
        return cinematicCast(event,card)?hold+base*.88:base;
    }
    // A skipped turn has no spell to watch. Keep failures readable and preserve
    // every cast, hit and reward event; only shorten idle beginner beats.
    if (event.type === 'pass') return briskTraining ? 750 : 2100;
    if (event.type === 'fizzle') return 2100;
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
    const base = presentationEffectDuration(options.effects, options.card, options.reducedMotion, event.repeatTacticalCast);
    const hold = event.repeatTacticalCast ? REPEAT_NAME_HOLD_MS : CAST_NAME_HOLD_MS;
    const elapsed = p * (hold + base * .88);
    return elapsed <= hold ? elapsed / hold * .12 : Math.min(1, .12 + (elapsed - hold) / base);
}
