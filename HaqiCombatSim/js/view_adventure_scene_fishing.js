import { readStamina } from './adventure_fishing_core.js';
import { createCloseButton } from './view_adventure_controls.js';
import { setText } from './locale_runtime.js';

// Transparent scene presentation. Inventory and persistence belong to the controller.
export function createSceneFishing(root, cb, { el, button }) {
    const layer = el('div', 'scene-fishing');
    layer.hidden = true;
    const ring = el('div', 'fishing-cast-ring');
    ring.setAttribute('aria-hidden', 'true');
    const catchLabel = el('div', 'fishing-catch-label');
    catchLabel.setAttribute('aria-hidden', 'true');
    const status = el('p', 'fishing-status');
    status.setAttribute('role', 'status');
    const stamina = el('span', 'fishing-energy');
    const select = el('select', 'fishing-select');
    select.setAttribute('aria-label', '选择渔网');
    const cast = button('撒网', castNearest, 'primary');
    const potions = el('div', 'fishing-potions');
    const meter = el('div', 'fishing-timing', el('span', 'fishing-timing-zone'), el('i', 'fishing-timing-needle'));
    meter.setAttribute('aria-hidden', 'true');
    const session = el('small', 'fishing-session', '本次渔获 0');
    const bar = el('section', 'fishing-bar',
        el('div', 'fishing-heading', el('strong', '', '海边捕鱼'), stamina, session, createCloseButton(stop, '结束捕鱼')),
        status, meter, el('div', 'fishing-tools', select, cast, potions));
    bar.setAttribute('aria-label', '海边捕鱼操作');
    layer.append(ring, catchLabel, bar); root.append(layer);
    let active = false, anchor, started = 0, pending = null, count = 0, streak = 0;
    let model, fish = [], netId = null, lastInventory = '', lastPhase = '', feedback = null, placeAnchor = false;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const fishButtons = Array.from({ length: 5 }, (_, index) => {
        const node = button(el('span', 'fishing-fish-shape'), () => aim(fish[index]), 'fishing-shadow');
        node.setAttribute('aria-label', `向第${index + 1}条鱼影撒网`);
        layer.append(node); return node;
    });
    function say(text) { setText(status, text); }
    function selected() { return model.assets.content.fishing.nets.find(net => net.id === netId); }
    function refresh() {
        const { save, assets: { content } } = model;
        const catalog = content.fishing;
        const signature = JSON.stringify([catalog.nets.map(n => save.inventory[n.id]), catalog.potions.map(p => save.inventory[p.id]), save.stamina]);
        if (signature === lastInventory) return;
        lastInventory = signature;
        const owned = catalog.nets.filter(net => save.inventory[net.id] > 0);
        if (!owned.some(net => net.id === netId)) netId = owned[0]?.id ?? null;
        select.replaceChildren();
        for (const net of catalog.nets) {
            const amount = save.inventory[net.id] || 0;
            const option = el('option', '', `${content.items[net.id].name} ×${amount}`);
            option.value = String(net.id); option.disabled = !amount; option.selected = net.id === netId;
            select.append(option);
        }
        select.disabled = !owned.length;
        setText(stamina, `精力 ${readStamina(save, content)}/${catalog.staminaMax}`);
        potions.replaceChildren();
        for (const potion of catalog.potions) {
            if (potion.blocked || !(save.inventory[potion.id] > 0)) continue;
            potions.append(button(`使用${content.items[potion.id].name} ×${save.inventory[potion.id]}`, () => {
                if (pending) return;
                const result = cb.action({ type: 'stamina-potion', itemId: potion.id });
                say(result?.message || '未能使用药剂，请重试。');
            }, 'secondary'));
        }
    }
    select.addEventListener('change', () => {
        netId = Number(select.value);
        say(selected()?.absolutelyHit ? '必中网与捕鱼器点海面即可自动收网，奖励仍按原兑换表。' : '罩住鱼影，再看准金色区收网；失手不扣网和精力。');
    });
    function stop() { active = false; pending = null; layer.hidden = true; cb.focus?.(); }
    function start(point, value) {
        model = value; anchor = { ...point }; active = true; pending = null;
        started = performance.now(); count = 0; streak = 0; lastInventory = ''; lastPhase = ''; feedback = null; placeAnchor = true;
        layer.hidden = false; ring.hidden = true; meter.hidden = true; catchLabel.hidden = true;
        setText(session, '本次渔获 0'); refresh();
        say(netId ? '点鱼影撒网，指针进入金色区时收网。空格也能操作；点陆地离开。' : '没有渔网。可从米酒葫芦领取，或查看背包。');
    }
    function aim(point) {
        if (!active || !point || !cb.isWater(point)) return;
        if (pending) { haul(); return; }
        const net = selected();
        if (!net) { say('背包里没有渔网。可从米酒葫芦领取。'); return; }
        if (readStamina(model.save, model.assets.content) < net.staminaRequired) {
            say(`精力值低于${net.staminaRequired}，先使用精力药剂吧。`); return;
        }
        const hit = fish.some(p => p && Math.hypot(p.x - point.x, p.y - point.y) <= 48);
        pending = { point: { ...point }, at: performance.now(), netId, hit, automatic: net.absolutelyHit };
        lastPhase = '';
        say(net.absolutelyHit ? '渔网正在合拢…' : reduced.matches ? '鱼影已锁定，点击收网。' : '等指针进入金色区，再点收网！');
    }
    function castNearest() { if (pending) haul(); else aim(fish.find(Boolean) || anchor); }
    function haul() {
        if (!pending || pending.automatic) return;
        const age = performance.now() - pending.at;
        finish(pending.hit && (reduced.matches || (age >= 650 && age <= 1550)));
    }
    function finish(hit) {
        const castData = pending;
        if (!castData) return;
        pending = null; ring.hidden = true; meter.hidden = true;
        const result = cb.action({ type: 'fish', netId: castData.netId, hit });
        if (result?.caught) { count += result.items.reduce((sum, item) => sum + item.count, 0); streak++; }
        else streak = 0;
        setText(session, `本次渔获 ${count}${streak > 1 ? ` · 连中 ${streak}` : ''}`);
        say(result?.message || '未能保存这次渔获，请重试。'); lastInventory = '';
        feedback = { point: castData.point, at: performance.now() };
        setText(catchLabel, result?.caught ? result.items.map(item => `${item.name} ×${item.count}`).join('、') : result ? '鱼影溜走了' : '未能保存');
    }
    layer.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); stop(); }
    });
    function key(event) {
        if (!active) return false;
        if (event.key === 'Escape') { stop(); return true; }
        if (event.code === 'Space' && !['BUTTON', 'SELECT', 'INPUT'].includes(event.target.tagName)) {
            if (!event.repeat) castNearest(); return true;
        }
        return false;
    }
    function update(value, time, project) {
        if (!active) return;
        model = value; refresh();
        const elapsed = reduced.matches ? 0 : (time - started) / 1000;
        const w = root.clientWidth, h = root.clientHeight;
        const barTop = bar.getBoundingClientRect().top - root.getBoundingClientRect().top;
        // A tap near the bottom must not leave the school hidden behind the controls.
        if (placeAnchor) {
            placeAnchor = false;
            const desired = project(anchor), origin = project({x:0,y:0}), unit = project({x:1,y:1});
            let best = Infinity;
            for (let y = 90; y < barTop - 60; y += 32) for (let x = 55; x < w - 55; x += 32) {
                const point = { x:(x-origin.x)/(unit.x-origin.x), y:(y-origin.y)/(unit.y-origin.y) };
                const distance = Math.hypot(x-desired.x,y-desired.y);
                if (distance < best && cb.isWater(point)) { anchor = point; best = distance; }
            }
        }
        fish = fishButtons.map((node, index) => {
            const angle = index * Math.PI * 2 / 5 + elapsed * (.22 + index * .025);
            const point = { x: anchor.x + Math.cos(angle) * (55 + index * 16), y: anchor.y + Math.sin(angle) * (35 + index * 9) };
            const screen = project(point);
            const visible = cb.isWater(point) && screen.x >= 28 && screen.x <= w - 28 && screen.y >= 28 && screen.y < Math.min(h - 28, barTop - 28);
            node.hidden = !visible; node.disabled = !!pending;
            node.style.left = `${screen.x}px`; node.style.top = `${screen.y}px`;
            node.style.setProperty('--fish-direction', Math.sin(angle) > 0 ? '-1' : '1');
            return visible ? point : null;
        });
        if (pending) {
            const age = time - pending.at;
            if (pending.automatic && age >= (reduced.matches ? 100 : 850)) finish(true);
            else if (!pending.automatic && !reduced.matches && age > 2200) finish(false);
        }
        const phase = pending ? pending.automatic ? 'automatic' : 'haul' : 'aim';
        if (phase !== lastPhase) { setText(cast, phase === 'aim' ? '撒网' : phase === 'automatic' ? '收网中…' : '收网'); lastPhase = phase; }
        select.disabled = !!pending || !netId;
        cast.disabled = phase === 'automatic' || (!pending && (!selected() || readStamina(model.save, model.assets.content) < selected().staminaRequired));
        for (const node of potions.children) node.disabled = !!pending;
        meter.hidden = !pending || pending.automatic || reduced.matches;
        ring.hidden = !pending;
        if (pending) {
            const age = time - pending.at, screen = project(pending.point);
            const ready = reduced.matches || (age >= 650 && age <= 1550);
            ring.style.left = `${screen.x}px`; ring.style.top = `${screen.y}px`;
            ring.style.width = ring.style.height = `${reduced.matches ? 76 : Math.max(48, 130 - age / 22)}px`;
            ring.classList.toggle('ready', ready); cast.classList.toggle('fishing-ready', ready);
            meter.lastElementChild.style.left = `${Math.max(0, Math.min(100, age / 2200 * 100))}%`;
        } else cast.classList.remove('fishing-ready');
        catchLabel.hidden = !feedback || time - feedback.at > 1800;
        if (!catchLabel.hidden) {
            const screen = project(feedback.point);
            catchLabel.style.left = `${Math.max(90,Math.min(w-90,screen.x))}px`;
            catchLabel.style.top = `${screen.y - 28 - (reduced.matches ? 0 : (time-feedback.at)/70)}px`;
        }
    }
    return { start, stop, aim, update, key, get active() { return active; } };
}
