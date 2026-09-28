// Shared battle-playback clock. Durations match adventure_app tickAnimation.
import { effectDuration } from './spell_effects_core.js';
import { HIT_DURATION_MS } from './actor_animation_core.js';
import { POINTER_TURN_MS } from './battle_pointer_core.js';

export function presentationEventDurationMs(event, {effects, card, hp = 0, reducedMotion = false} = {}) {
    if (!event?.type || event.type === 'combat_end') return 0;
    if (event.type === 'movearrow') return POINTER_TURN_MS;
    if (event.type === 'status') return 700;
    if (event.type === 'aura') return 1;
    if (event.type === 'speak') return 1300;
    if (event.type === 'cast') return effectDuration(effects, card, reducedMotion);
    if (event.type === 'pass') return 300;
    if (event.type === 'damage' && hp > 0) return HIT_DURATION_MS;
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
