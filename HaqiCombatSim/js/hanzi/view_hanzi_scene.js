// Storybook canvas painters for Hanzi Island (字源岛) world restoration signs
// and landmark ambience. Pure rendering helpers with no state mutation.

const TAU = Math.PI * 2;

export function drawHanziSignPlaque(ctx, sign, t, reduced = false) {
    const pulse = reduced ? 0 : Math.sin(t * 2.2 + sign.x * 0.02) * 0.5 + 0.5;
    const x = sign.x;
    const y = sign.y;
    ctx.save();
    if (sign.restored) {
        const glow = ctx.createRadialGradient(x, y - 14, 2, x, y - 14, 26);
        glow.addColorStop(0, `rgba(255, 226, 138, ${0.34 + pulse * 0.14})`);
        glow.addColorStop(1, 'rgba(255, 226, 138, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y - 14, 26, 0, TAU);
        ctx.fill();
    }
    // Wooden stake
    ctx.fillStyle = '#6f4e2a';
    ctx.fillRect(x - 3, y - 4, 6, 10);
    // Warm parchment/wood tablet
    ctx.fillStyle = sign.restored ? '#fff2c7' : '#efe1bc';
    ctx.strokeStyle = sign.restored ? '#b57b2a' : '#7b5b33';
    ctx.lineWidth = sign.restored ? 2 : 1.5;
    ctx.beginPath();
    ctx.roundRect(x - 14, y - 31, 28, 30, 6);
    ctx.fill();
    ctx.stroke();
    // Carved character
    ctx.fillStyle = sign.restored ? '#4b2d14' : '#654b2c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 18px KaiTi, STKaiti, serif';
    ctx.fillText(sign.glyph, x, y - 16);
    ctx.restore();
}

export function drawHanziLandmarkRestoration(ctx, landmark, state, t, { reduced = false, low = false } = {}, drawPlate) {
    if (!state) return;
    const { x, y } = landmark;
    const pulse = reduced ? 0.5 : Math.sin(t * 2.4 + x * 0.01) * 0.5 + 0.5;
    ctx.save();
    if (state.restored) {
        if (state.effect === 'lantern' || state.effect === 'letter' || state.effect === 'festival') {
            const radius = state.effect === 'festival' ? 68 : 54;
            const glow = ctx.createRadialGradient(x, y - 24, 4, x, y - 24, radius);
            glow.addColorStop(0, `rgba(255, 220, 125, ${0.42 + pulse * 0.16})`);
            glow.addColorStop(0.6, `rgba(248, 179, 86, ${0.14 + pulse * 0.08})`);
            glow.addColorStop(1, 'rgba(248, 179, 86, 0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, y - 24, radius, 0, TAU);
            ctx.fill();
        }
        if (state.effect === 'canal') {
            ctx.strokeStyle = `rgba(116, 207, 224, ${0.55 + pulse * 0.25})`;
            ctx.lineWidth = 2;
            const r = 24 + (reduced ? 6 : (t * 14) % 18);
            ctx.beginPath();
            ctx.ellipse(x, y + 6, r, r * 0.45, 0, 0, TAU);
            ctx.stroke();
        }
        if (state.effect === 'weather') {
            ctx.strokeStyle = `rgba(250, 232, 160, ${0.48 + pulse * 0.24})`;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(x, y - 28, 22, 0, TAU);
            ctx.stroke();
        }
        if (state.effect === 'festival' && !low) {
            const colors = ['#f4c56a', '#f28b66', '#9ad9a5', '#87c8e8'];
            for (let i = 0; i < 4; i++) {
                const angle = (reduced ? 0 : t * 0.9) + (i * TAU) / 4;
                const lx = x + Math.cos(angle) * 44;
                const ly = y - 34 + Math.sin(angle * 2) * 6;
                ctx.fillStyle = colors[i];
                ctx.beginPath();
                ctx.arc(lx, ly, 4.5, 0, TAU);
                ctx.fill();
            }
        }
    } else if (state.active) {
        ctx.strokeStyle = `rgba(233, 214, 154, ${0.5 + pulse * 0.3})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.ellipse(x, y + 4, 30, 14, 0, 0, TAU);
        ctx.stroke();
    }
    if (state.effect === 'festival' && Array.isArray(state.forgedGlyphs) && state.forgedGlyphs.length && !low) {
        const shown = state.forgedGlyphs.slice(-6);
        const radius = 56;
        shown.forEach((glyph, i) => {
            const angle = (reduced ? 0 : t * 0.45) + (i * TAU) / shown.length;
            const gx = x + Math.cos(angle) * radius;
            const gy = y - 46 + Math.sin(angle) * 18;
            ctx.fillStyle = 'rgba(255, 245, 210, 0.92)';
            ctx.strokeStyle = '#c58a2e';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(gx, gy, 11, 0, TAU);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#4a2b10';
            ctx.font = 'bold 12px KaiTi, STKaiti, serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(glyph, gx, gy + 0.5);
        });
    }
    ctx.restore();
    if (state.label && drawPlate) {
        drawPlate(state.label, x, y - 40, state.restored || state.ready);
    }
}
