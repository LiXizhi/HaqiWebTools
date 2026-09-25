// Original tutorial: Login/Tutorial/PickSchoolOfSpell.kids.html RepSkills L29–35.
// Three representative GSIDs per school; card numbers/art remain in runtime data.
import { createSpellEffects } from './spell_effects.js';
import { effectDuration, spellEffect } from './spell_effects_core.js';
import { drawAnimatedActor } from './actor_animation.js';
import { previewTargetAction } from './actor_animation_core.js';

export const TUTORIAL_SKILLS = {
    fire: [22105, 22113, 22331], ice: [22146, 22150, 22332],
    storm: [22135, 22133, 22125], life: [22173, 22163, 22165], death: [22188, 22334, 22192],
};
export function tutorialCards(assets, school) {
    return (TUTORIAL_SKILLS[school] || []).map(id => {
        const key = assets.content.cardItems[id], card = (assets.previewCards || assets.dataset.cards)[key];
        if (!card || !assets.effects.cards[key]) throw Error('学系演示资源缺失');
        return { key, name: spellEffect(assets.effects, card).name };
    });
}
export function createCreationPreview(assets) {
    const fx = createSpellEffects(assets), reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const hero=assets.hero?.createActor(6173);
    let frameId = 0, generation = 0, paused = false;
    function stop() { generation++;cancelAnimationFrame(frameId);frameId = 0; }
    async function play(canvas, key, appearance, status, next) {
        stop();paused = false;const current = generation;
        const selection=typeof appearance==='object'?appearance:{appearance};appearance=selection.appearance;
        if (!canvas) return;
        const card = (assets.previewCards || assets.dataset.cards)[key], spec = spellEffect(assets.effects, card);
        status('正在准备技能演出…');
        try { await Promise.all([assets.skillArt.ensure(spec.base),assets.hero?.ensure({gender:appearance==='girl'?'female':'male',headId:selection.headId})]); }
        catch { if (current === generation) status('动画暂时无法加载，可重播重试或继续选择系别。');return; }
        if (current !== generation || !canvas.isConnected) return;
        const duration = effectDuration(assets.effects, card, reduced.matches), ctx = canvas.getContext('2d');
        let elapsed = 0, last = 0, finished = false;
        status(spec.name + ' · 演示中');
        function draw(now) {
            if (current !== generation || !canvas.isConnected) return;
            const dt = last ? Math.min(60, now - last) : 0;last = now;
            if (!document.hidden && !paused) elapsed += dt;
            const w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
            if (w < 1 || h < 1) { frameId = requestAnimationFrame(draw);return; }
            if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr);canvas.height = Math.round(h * dpr); }
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);ctx.clearRect(0, 0, w, h);
            const gradient = ctx.createLinearGradient(0, 0, 0, h);gradient.addColorStop(0, '#112e3e');gradient.addColorStop(1, '#345548');ctx.fillStyle = gradient;ctx.fillRect(0, 0, w, h);
            const p = Math.min(1, elapsed / duration), from = { x: w * .2, y: h * .73 }, to = { x: w * .8, y: h * .68 }, center = { x: w * .5, y: h * .66 };
            ctx.strokeStyle = '#b1c2a155';ctx.lineWidth = 1.5;
            for (const scale of [1, .8, .5]) { ctx.beginPath();ctx.ellipse(center.x, center.y, w * .43 * scale, h * .24 * scale, 0, 0, Math.PI * 2);ctx.stroke(); }
            const size = Math.min(68, w * .15), targets = spec.area ? [{ x: w * .68, y: h * .5 }, to, { x: w * .85, y: h * .85 }] : [spec.friendly ? from : to];
            const pose = previewTargetAction(spec, assets.effects.timeline, elapsed, duration, 'auto');
            const actor = (at, sheet, index, action, progress, direction) => drawAnimatedActor(ctx, at, action, progress, direction, reduced.matches, () => {
                if(sheet==='sprites'&&index>=8&&index<16&&assets.hero){const pose=assets.hero.updateActor(hero,{time:elapsed/1000,facing:index%4,reducedMotion:reduced.matches});assets.hero.drawTile(ctx,index,-size/2,-size,size,size,{time:elapsed/1000,head:pose.head,breath:pose.breath,headId:selection.headId});}
                else assets.tile(ctx,sheet,index,-size/2,-size,size,size);
            });
            actor(from, 'sprites', appearance === 'girl' ? 14 : 10, 'cast', Math.min(1, p / .45), 1);
            for (const at of spec.area ? targets : [to]) actor(at, spec.friendly ? 'sprites' : 'creatures', spec.friendly ? (appearance==='girl'?14:10) : 1, pose.action, pose.progress, -1);
            fx.draw(ctx, { card, progress: p, from, to: targets[0], targets, center, width: w, height: h, seed: 7, reducedMotion: reduced.matches });
            if (p === 1 && !finished) { finished = true;status(spec.name + (next ? ' · 稍后播放下一个技能' : ' · 可重播或选择其他技能')); }
            // Count the intermission in visible, unpaused time, just like the animation.
            if (p < 1 || (next && elapsed < duration + 1800)) frameId = requestAnimationFrame(draw);
            else { frameId = 0;if (next) next(); }
        }
        frameId = requestAnimationFrame(draw);
    }
    return { play, stop, togglePause() { paused = !paused;return paused; } };
}
