import { SHADOW_COUNT, castLandsOnShadow, markerPosition, readStamina, shadowPosition } from './adventure_fishing_core.js';

const STAGE = { w: 640, h: 280 };

export function renderFishing(body, model, cb, { el, button, art }) {
    const { assets, save } = model;
    const content = assets.content;
    const fishing = content.fishing;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stamina = readStamina(save, content);
    const owned = fishing.nets.filter(net => (save.inventory[net.id] || 0) > 0);
    let selected = owned.find(net => net.id === model.fishingView?.netId) || owned[0] || null;
    const stage = el('canvas', 'fishing-stage');
    stage.width = STAGE.w;
    stage.height = STAGE.h;
    stage.tabIndex = 0;
    stage.setAttribute('role', 'img');
    stage.setAttribute('aria-label', '海面。点击鱼影撒网，或使用下方撒网按钮对准金色光圈。');
    const status = el('p', 'fishing-status', model.fishingView?.message || (owned.length ? '点击海面，把网撒向游过的鱼影。金色光圈是键盘撒网的落点。' : '背包里没有渔网。米酒葫芦会发放捕鱼网。'));
    const bar = el('div', 'fishing-stamina', el('span', '', `精力 ${stamina}/${fishing.staminaMax}`), el('span', 'fishing-stamina-track', el('span', 'fishing-stamina-fill')));
    bar.querySelector('.fishing-stamina-fill').style.width = `${stamina / fishing.staminaMax * 100}%`;
    const nets = el('div', 'gui-tabs fishing-nets');
    for (const net of fishing.nets) {
        const count = save.inventory[net.id] || 0;
        const choice = button(`${content.items[net.id].name} ${count}`, () => {
            if (!count) return;
            selected = net;
            model.fishingView.netId = net.id;
            for (const node of nets.children) node.setAttribute('aria-pressed', node.dataset.net === String(net.id) ? 'true' : 'false');
        }, 'fishing-net');
        choice.dataset.net = String(net.id);
        choice.disabled = count < 1;
        choice.setAttribute('aria-pressed', selected?.id === net.id ? 'true' : 'false');
        if (content.items[net.id].art) choice.prepend(art(assets, content.items[net.id].art, 28, 28));
        nets.append(choice);
    }
    const cast = button('撒网', () => { if (selected) throwAt(aimPoint()); }, 'primary');
    cast.disabled = !selected || stamina < (selected?.staminaRequired || 10);
    const potions = el('div', 'fishing-potions');
    for (const potion of fishing.potions) {
        const count = save.inventory[potion.id] || 0;
        if (!count || potion.blocked) continue;
        potions.append(button(`使用${content.items[potion.id].name}（${count}）`, () => cb.action({ type: 'stamina-potion', itemId: potion.id }), 'secondary'));
    }
    const rules = el('p', 'fishing-rules muted', '普通网要罩住鱼影才结算。必中网和捕鱼器点中海面就会结算。渔获、扣网和扣精力都按原版兑换表，鱼的种类不由你点中的影子决定。');
    body.append(bar, stage, status, nets, el('div', 'fishing-actions', cast, potions), rules);
    const context = stage.getContext('2d');
    const started = performance.now();
    let busy = false;
    let splash = null;
    function elapsed() { return reduced ? 0 : performance.now() - started; }
    function aimPoint() { return reduced ? shadowPosition(0, 0, STAGE.w, STAGE.h) : markerPosition(elapsed(), STAGE.w, STAGE.h); }
    function throwAt(point) {
        if (busy || !selected) return;
        if (stamina < selected.staminaRequired) { status.textContent = `精力值低于${selected.staminaRequired}，现在不能捕鱼。`; return; }
        busy = true;
        const hit = selected.absolutelyHit || castLandsOnShadow(point, elapsed(), STAGE.w, STAGE.h);
        splash = { point, hit, at: performance.now(), net: selected };
        window.setTimeout(() => {
            if (!stage.isConnected) return;
            cb.action({ type: 'fish', netId: splash.net.id, hit });
        }, reduced ? 0 : 720);
    }
    stage.addEventListener('click', event => {
        const rect = stage.getBoundingClientRect();
        throwAt({ x: (event.clientX - rect.left) * STAGE.w / rect.width, y: (event.clientY - rect.top) * STAGE.h / rect.height });
    });
    function frame(now) {
        if (!stage.isConnected) return;
        draw(context, elapsed(), splash && now - splash.at < 720 ? splash : null, reduced ? shadowPosition(0, 0, STAGE.w, STAGE.h) : null);
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}
function draw(context, time, splash, parkedMarker) {
    const { w, h } = STAGE;
    const sky = context.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#1f6f86');
    sky.addColorStop(1, '#0d3b4a');
    context.fillStyle = sky;
    context.fillRect(0, 0, w, h);
    context.strokeStyle = 'rgba(214,244,232,.28)';
    context.lineWidth = 2;
    for (let band = 0; band < 5; band++) {
        context.beginPath();
        for (let x = 0; x <= w; x += 12) {
            const y = 36 + band * 48 + Math.sin((x + time * .12) / 28 + band) * 6;
            if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.stroke();
    }
    for (let index = 0; index < SHADOW_COUNT; index++) {
        const fish = shadowPosition(index, time, w, h);
        drawFish(context, fish.x, fish.y, 1.4 + index * .08, time, index);
    }
    const marker = parkedMarker || markerPosition(time, w, h);
    context.strokeStyle = '#f4ca69';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(marker.x, marker.y, 16 + Math.sin(time / 180) * 3, 0, Math.PI * 2);
    context.stroke();
    if (!splash) return;
    const age = Math.min(1, (performance.now() - splash.at) / 720);
    context.strokeStyle = splash.hit ? 'rgba(244,202,105,.9)' : 'rgba(255,255,255,.45)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(splash.point.x, splash.point.y, 18 + age * 46, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 1 - age;
    context.fillStyle = '#e8fff4';
    for (let i = 0; i < 8; i++) {
        const angle = i / 8 * Math.PI * 2;
        context.beginPath();
        context.arc(splash.point.x + Math.cos(angle) * age * 40, splash.point.y + Math.sin(angle) * age * 22, 4, 0, Math.PI * 2);
        context.fill();
    }
    context.globalAlpha = 1;
}
function drawFish(context, x, y, scale, time, index) {
    const wag = Math.sin(time / 140 + index) * 6;
    const colors = ['#f2d27a', '#8fd0c6', '#d7e7a1', '#f0b07a', '#c9d6ef'];
    context.save();
    context.translate(x, y);
    context.scale(scale, scale * (0.72 + Math.sin(time / 200 + index) * 0.06));
    context.fillStyle = colors[index];
    context.beginPath();
    context.ellipse(0, 0, 16, 8, 0, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(-14, 0);
    context.lineTo(-24, -7 - wag * .2);
    context.lineTo(-24, 7 + wag * .2);
    context.closePath();
    context.fill();
    context.fillStyle = '#17343c';
    context.beginPath();
    context.arc(7, -1, 1.4, 0, Math.PI * 2);
    context.fill();
    context.restore();
}
