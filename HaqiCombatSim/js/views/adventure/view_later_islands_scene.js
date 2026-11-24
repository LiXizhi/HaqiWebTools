// Storybook canvas painters for Lv.60/70/80 continuation island landmark restorations.
// Pure rendering helpers with no state mutation.

const TAU = Math.PI * 2;

export function drawLaterIslandRestoration(ctx, landmark, state, t, { reduced = false, low = false } = {}, drawPlate) {
    if (!state) return;
    const { x, y } = landmark;
    const pulse = reduced ? 0.5 : Math.sin(t * 2.2 + x * 0.01) * 0.5 + 0.5;
    ctx.save();
    if (state.restored) {
        if (state.effect === 'lighthouse' || state.effect === 'lantern' || state.effect === 'bridge' || state.effect === 'ember' || state.effect === 'mist-lantern') {
            const radius = state.effect === 'lighthouse' ? 70 : 54;
            const glow = ctx.createRadialGradient(x, y - 22, 4, x, y - 22, radius);
            if (state.effect === 'ember') {
                glow.addColorStop(0, `rgba(255, 196, 112, ${0.48 + pulse * 0.16})`);
                glow.addColorStop(0.6, `rgba(232, 108, 62, ${0.18 + pulse * 0.08})`);
                glow.addColorStop(1, 'rgba(232, 108, 62, 0)');
            } else if (state.effect === 'mist-lantern') {
                glow.addColorStop(0, `rgba(164, 245, 204, ${0.44 + pulse * 0.16})`);
                glow.addColorStop(0.6, `rgba(88, 198, 168, ${0.16 + pulse * 0.08})`);
                glow.addColorStop(1, 'rgba(88, 198, 168, 0)');
            } else {
                glow.addColorStop(0, `rgba(255, 224, 134, ${0.44 + pulse * 0.16})`);
                glow.addColorStop(0.6, `rgba(245, 184, 92, ${0.15 + pulse * 0.08})`);
                glow.addColorStop(1, 'rgba(245, 184, 92, 0)');
            }
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, y - 22, radius, 0, TAU);
            ctx.fill();
        }
        if (state.effect === 'water') {
            ctx.strokeStyle = `rgba(110, 208, 232, ${0.52 + pulse * 0.25})`;
            ctx.lineWidth = 2;
            const r = 22 + (reduced ? 6 : (t * 13) % 18);
            ctx.beginPath();
            ctx.ellipse(x, y + 6, r, r * 0.45, 0, 0, TAU);
            ctx.stroke();
        }
        if (state.effect === 'compass') {
            ctx.strokeStyle = `rgba(164, 214, 252, ${0.52 + pulse * 0.25})`;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(x, y - 24, 24, 0, TAU);
            ctx.stroke();
            if (!low) {
                const a = reduced ? 0 : t * 0.7;
                ctx.beginPath();
                ctx.moveTo(x - Math.cos(a) * 18, y - 24 - Math.sin(a) * 18);
                ctx.lineTo(x + Math.cos(a) * 18, y - 24 + Math.sin(a) * 18);
                ctx.stroke();
            }
        }
        if (state.effect === 'festival' && !low) {
            const colors = ['#f6cd72', '#8fd6f2', '#f39a76', '#a4dfa8'];
            for (let i = 0; i < 4; i++) {
                const angle = (reduced ? 0 : t * 0.85) + (i * TAU) / 4;
                ctx.fillStyle = colors[i];
                ctx.beginPath();
                ctx.arc(x + Math.cos(angle) * 46, y - 34 + Math.sin(angle * 2) * 5, 4.5, 0, TAU);
                ctx.fill();
            }
        }
    } else if (state.active) {
        ctx.strokeStyle = `rgba(235, 216, 156, ${0.48 + pulse * 0.28})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.ellipse(x, y + 4, 28, 13, 0, 0, TAU);
        ctx.stroke();
    }
    ctx.restore();
    if (state.label && drawPlate) {
        drawPlate(state.label, x, y - 40, state.restored);
    }
}
