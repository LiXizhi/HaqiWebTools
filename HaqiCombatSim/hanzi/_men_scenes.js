/* ---------- 门板（局部坐标，原点在门扇中心；flip=-1 时门轴在外侧） ---------- */
function makeDoor(parent, withHit) {
  const g = el('g', { class: 'door' }, parent);
  const parts = [];
  const add = node => { node.style.opacity = '0'; parts.push(node); return node; };
  add(el('ellipse', { cx: 0, cy: 40, rx: 16, ry: 2.2, fill: 'rgba(30,25,20,.22)' }, g));
  add(el('path', { d: 'M-16 -34 L-16 36', stroke: '#5c3b24', 'stroke-width': 3.6, 'stroke-linecap': 'round', fill: 'none' }, g));
  for (const d of [
    'M-14 -32 L16 -32 L16 -22 L-14 -22 Z',
    'M-12 -18 L14 -18 L14 -6 L-12 -6 Z',
    'M-12 -2 L14 -2 L14 10 L-12 10 Z',
    'M-12 14 L14 14 L14 26 L-12 26 Z',
    'M-14 28 L16 28 L16 36 L-14 36 Z',
  ]) add(el('path', { d, fill: 'url(#woodG)', stroke: '#4a2e1a', 'stroke-width': 0.45 }, g));
  const studs = el('g', null, g);
  studs.style.opacity = '0';
  parts.push(studs);
  for (const [cx, cy] of [[-6, -12], [8, -12], [-6, 4], [8, 4], [-6, 20], [8, 20]]) {
    el('circle', { cx, cy, r: 1.45, fill: '#e4c47c', stroke: '#6b4a2b', 'stroke-width': 0.35 }, studs);
  }
  if (withHit) el('rect', { class: 'hit', x: -22, y: -42, width: 44, height: 88 }, g);
  g._parts = parts;
  return g;
}
function showDoor(door) { for (const p of door._parts) p.style.opacity = '1'; }
function setPose(g, p) {
  g.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) scale(${p.flip || 1} 1)`);
}
async function revealDoor(door, tk) {
  for (let i = 0; i < door._parts.length; i++) {
    const p = door._parts[i];
    if (i > 0 && i < 7) Sound.brush(0.16);
    await tween(150 * M, t => { p.style.opacity = t.toFixed(3); }, tk, ease.out);
  }
}

const DOOR_L = { x: 33, y: 50, flip: 1 };
const DOOR_R = { x: 67, y: 50, flip: -1 };

/* ---------- 场景 ---------- */
async function sceneXiang(tk) {
  await caption('象形 · 一扇', '先有一扇门板。一扇，叫做户。', tk);
  progress(0);
  vtitle('象形', '远古');
  Sound.pluck(NOTE.D4);
  const lg = local(L.back);
  lg.style.opacity = 0;
  el('rect', { x: 8, y: 8, width: 84, height: 8, rx: 1, fill: '#4a3424' }, lg);
  el('rect', { x: 8, y: 8, width: 7, height: 82, fill: '#3d2a1c' }, lg);
  el('rect', { x: 85, y: 8, width: 7, height: 82, fill: '#3d2a1c' }, lg);
  el('rect', { x: 15, y: 16, width: 70, height: 72, fill: '#241c16' }, lg);
  el('rect', { x: 6, y: 88, width: 88, height: 7, rx: 1, fill: '#6b4e32' }, lg);
  await tween(500 * M, t => { lg.style.opacity = t.toFixed(3); }, tk);
  S.leftRoot = local(L.glyph);
  S.left = makeDoor(S.leftRoot, false);
  setPose(S.left, DOOR_L);
  await revealDoor(S.left, tk);
  await wait(500, tk);
}

async function sceneDrag(tk) {
  S.rightRoot = local(L.front);
  S.right = makeDoor(S.rightRoot, true);
  showDoor(S.right);
  const pose = { x: 108, y: 62, flip: -1 };
  setPose(S.right, pose);
  S.right.style.opacity = 0;
  await tween(500 * M, t => { S.right.style.opacity = t.toFixed(3); }, tk);
  hint('拖动右边的门板，合到光点上');
  const lg = local(L.back);
  const ghost = el('path', {
    d: 'M51 16 H83 V86 H51 Z M55 32 H79 M55 50 H79 M55 68 H79',
    class: 'ghostLine',
  }, lg);
  const glow = el('ellipse', { cx: 67, cy: 50, rx: 8, ry: 3.2, class: 'glow', filter: 'url(#softL)' }, lg);
  const door = S.right;
  const hit = door.querySelector('.hit');
  const T = DOOR_R;
  let dragging = false, grab = null, done = null, pid = null;
  const dist = () => Math.hypot(pose.x - T.x, pose.y - T.y);
  const down = e => {
    dragging = true; pid = e.pointerId;
    try { stage.setPointerCapture(pid); } catch {}
    const p = toLocal(e);
    grab = { x: p.x - pose.x, y: p.y - pose.y };
    door.classList.add('held');
    Sound.hiss(0.12, 700, 0.05);
    e.preventDefault();
  };
  const move = e => {
    if (!dragging || e.pointerId !== pid) return;
    const p = toLocal(e);
    pose.x = p.x - grab.x;
    pose.y = p.y - grab.y;
    setPose(door, pose);
  };
  const up = e => {
    if (!dragging || e.pointerId !== pid) return;
    dragging = false;
    door.classList.remove('held');
    if (dist() < 18) done = 'user';
  };
  hit.addEventListener('pointerdown', down);
  stage.addEventListener('pointermove', move);
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  const off = () => {
    hit.removeEventListener('pointerdown', down);
    stage.removeEventListener('pointermove', move);
    stage.removeEventListener('pointerup', up);
    stage.removeEventListener('pointercancel', up);
  };
  cleanups.push(off);

  const t0 = performance.now();
  let limit = 5000;
  while (!done) {
    const now = await frame(tk);
    if (dragging) limit = Math.max(limit, now - t0 + 2500);
    else if (now - t0 > limit) done = 'auto';
    glow.setAttribute('opacity', (0.5 + 0.35 * Math.sin(now / 220)).toFixed(3));
  }
  off();
  hint(null);
  S.interactions.push(done);
  const from = { x: pose.x, y: pose.y };
  if (done === 'user') {
    await tween(320, t => setPose(door, { x: lerp(from.x, T.x, t), y: lerp(from.y, T.y, t), flip: -1 }), tk, ease.out);
  } else {
    await tween(1100 * M, t => setPose(door, {
      x: lerp(from.x, T.x, t),
      y: lerp(from.y, T.y, t) - 10 * Math.sin(Math.PI * t),
      flip: -1,
    }), tk);
  }
  setPose(door, T);
  Sound.knock();
  const slit = el('rect', { x: 48.5, y: 18, width: 3.2, height: 66, fill: 'url(#warmG)', opacity: 0 }, lg);
  bg(tween(420, t => slit.setAttribute('opacity', t.toFixed(3)), tk));
  await caption('象形 · 两扇', '两扇相对，才是一座门。', tk);
  bg(tween(400, t => { ghost.style.opacity = 1 - t; glow.style.opacity = 1 - t; }, tk));
  await wait(700, tk);
}

const CRACKS = ['M300 300 L340 302 L352 286', 'M702 322 L662 326 L652 310', 'M302 558 L344 554 L356 570', 'M704 550 L662 554 L650 540'];

async function sceneJiagu(tk) {
  await caption('甲骨文 · 商', '刻在甲骨上的「门」，已经是两扇门板面对面。', tk);
  progress(1);
  vtitle('甲骨文', '商');
  Sound.pluck(NOTE.G4);
  boneSvg.classList.add('on');
  const leftRoot = S.leftRoot, rightRoot = S.rightRoot;
  bg(tween(1100 * M, t => {
    leftRoot.style.opacity = 1 - t;
    rightRoot.style.opacity = 1 - t;
    L.back.style.opacity = 1 - t;
  }, tk));
  await wait(350 * M, tk);
  S.jg = new Glyph(L.glyph, G.jiagu, { filter: 'carve', color: BONE_INK });
  await S.jg.draw(tk, { per: 200, gap: 40, sound: 'carve' });
  leftRoot.remove(); rightRoot.remove();
  L.back.replaceChildren(); L.back.style.opacity = '';
  const cr = el('g', { class: 'cracks' }, L.back);
  const paths = CRACKS.map(d => el('path', { d }, cr));
  const lens = paths.map(p => p.getTotalLength());
  paths.forEach((p, i) => { p.style.strokeDasharray = lens[i]; p.style.strokeDashoffset = lens[i]; });
  Sound.hiss(0.5, 2600, 0.07);
  await tween(800 * M, t => paths.forEach((p, i) => { p.style.strokeDashoffset = lens[i] * (1 - t); }), tk);
  await wait(1100, tk);
}

async function sceneJinwen(tk) {
  await caption('金文 · 西周', '铸在青铜器上，笔画变得圆厚。两扇门还在，只是更稳、更重。', tk);
  progress(2);
  vtitle('金文', '西周');
  Sound.pluck(NOTE.A4);
  boneSvg.classList.remove('on');
  bronzeSvg.classList.add('on');
  const jg = S.jg;
  bg(tween(900 * M, t => { jg.wrap.style.opacity = 1 - t; L.back.style.opacity = 1 - t; }, tk));
  await wait(500 * M, tk);
  S.jw = new Glyph(L.glyph, G.jinwen, { filter: 'cast', color: GOLD });
  await S.jw.draw(tk, { per: 190, gap: 40, sound: 'cast' });
  jg.remove();
  L.back.replaceChildren(); L.back.style.opacity = '';
  Sound.drum(0.25);
  await wait(1400, tk);
}

async function sceneZhuan(tk) {
  await caption('小篆 · 秦', '线条匀圆，两扉左右对称，写成「門」。秦统一文字，小篆像玉箸一样匀。', tk);
  progress(3);
  vtitle('小篆', '秦');
  Sound.pluck(NOTE.D5);
  bronzeSvg.classList.remove('on');
  const jw = S.jw;
  bg(tween(700 * M, t => { jw.wrap.style.opacity = 1 - t; }, tk));
  S.seal = new Glyph(L.glyph, G.seal, { filter: 'brush' });
  await S.seal.draw(tk, { per: 180, gap: 40 });
  jw.remove();
  const SX = 770, SY = 600;
  const st = el('g', { class: 'stamp' }, L.front);
  st.style.opacity = 0;
  const inner = el('g', { filter: 'url(#stamp)' }, st);
  el('rect', { x: -38, y: -38, width: 76, height: 76, rx: 3, fill: CINNABAR }, inner);
  new Glyph(inner, G.seal, { x: -31, y: -31, s: 0.62, color: PAPER }).showAll();
  S.stamp = st;
  await tween(450 * M, t => {
    st.setAttribute('transform', `translate(${SX} ${SY}) scale(${lerp(1.7, 1, t).toFixed(3)}) rotate(${lerp(-8, -3, t).toFixed(2)})`);
    st.style.opacity = t;
  }, tk, ease.out);
  Sound.drum(0.55);
  await wait(1000, tk);
}

async function sceneLi(tk) {
  await caption('隶书 · 汉', '化圆为方，蚕头燕尾，汉字从线条变成了笔画。', tk);
  progress(4);
  vtitle('隶书', '汉');
  Sound.pluck(NOTE.E5);
  const seal = S.seal, stamp = S.stamp;
  bg(tween(700 * M, t => { seal.wrap.style.opacity = 1 - t; stamp.style.opacity = 1 - t; }, tk));
  S.li = new Glyph(L.glyph, G.li, { filter: 'brush' });
  await S.li.draw(tk, { per: 150, gap: 30 });
  seal.remove(); stamp.remove();
  await wait(1200, tk);
}

async function sceneKai(tk) {
  await caption('楷书 · 魏晋以后', '横平竖直。「門」的样子，从此定形一千多年。', tk);
  progress(5);
  vtitle('楷书', '魏晋以后');
  Sound.pluck(NOTE.D5);
  const li = S.li;
  bg(tween(600 * M, t => { li.wrap.style.opacity = 1 - t; }, tk));
  S.kai = new Glyph(L.glyph, G.kai, { filter: 'brush' });
  await S.kai.draw(tk, { per: 160, gap: 35 });
  li.remove();
  await wait(700, tk);
  await caption('引申 · 从门里长出来', '门缝里透出光。门口、入门、部门，都从这一座门长出来。', tk);
  const lg = local(L.front);
  S.meanG = lg;
  const glow = el('ellipse', { cx: 50, cy: 52, rx: 7, ry: 28, fill: 'url(#warmG)', opacity: 0, filter: 'url(#softL)' }, lg);
  const labels = [['门口', 50, -4], ['入门', 2, 48], ['部门', 98, 48]];
  const texts = labels.map(([w, x, y]) => {
    const t = el('text', {
      x, y, 'font-size': 6, fill: CINNABAR, 'text-anchor': 'middle',
      'font-family': 'Kaiti SC, STKaiti, KaiTi, serif',
    }, lg);
    t.textContent = w;
    t.style.opacity = 0;
    return t;
  });
  await tween(600 * M, t => glow.setAttribute('opacity', (t * 0.9).toFixed(3)), tk);
  for (const t of texts) {
    Sound.pluck(NOTE.A4, 0.08, 1.2);
    await tween(260 * M, v => { t.style.opacity = v.toFixed(3); }, tk, ease.out);
  }
  await wait(900, tk);
}

const MEN_GUIDE = [
  [[22, 16], [22, 90]],
  [[22, 16], [86, 15], [84, 76], [75.5, 84], [66, 80]],
  [[36, 50], [72, 49.5]],
];

function guideBins(parent, pts) {
  const bins = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(2, Math.round(len / 7));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const x1 = lerp(a[0], b[0], t0), y1 = lerp(a[1], b[1], t0);
      const x2 = lerp(a[0], b[0], t1), y2 = lerp(a[1], b[1], t1);
      bins.push({
        x1, y1, x2, y2,
        el: el('path', { d: `M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}` }, parent),
      });
    }
  }
  return bins;
}
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  const u = clamp(((px - x1) * dx + (py - y1) * dy) / l2);
  return Math.hypot(px - (x1 + u * dx), py - (y1 + u * dy));
}

async function sceneJian(tk) {
  await caption('简体 · 1956', '1956 年，「門」简化为「门」。三笔写成：竖、横折钩、横。', tk);
  progress(6);
  vtitle('简体', '1956');
  Sound.pluck(NOTE.G5, 0.16, 3);
  Sound.pluck(NOTE.D5, 0.12, 3);
  if (S.meanG) {
    const g = S.meanG;
    await tween(280 * M, t => { g.style.opacity = (1 - t).toFixed(3); }, tk);
    g.remove();
    S.meanG = null;
  }
  const kai = S.kai;
  const lg = local(L.front);
  const parts = [];
  G.kai.strokes.forEach((st, i) => {
    if (!st.plank) return;
    const stroke = kai.strokes[i];
    for (let j = 0; j < stroke.pts.length; j += 3) {
      const [x, y] = stroke.pts[j];
      parts.push({ c: el('circle', { cx: x, cy: y, r: 1.1, fill: INK }, lg), x, y, vx: (rand() - 0.5) * 26, vy: -6 - rand() * 22, s: rand() });
    }
    kai.hide(i);
  });
  Sound.hiss(1.0, 2200, 0.05);
  bg(tween(1200 * M, t => {
    for (const p of parts) {
      const tt = clamp((t - p.s * 0.3) / (1 - p.s * 0.3));
      p.c.setAttribute('cx', (p.x + p.vx * tt).toFixed(2));
      p.c.setAttribute('cy', (p.y + p.vy * tt).toFixed(2));
      p.c.setAttribute('r', (1.1 * (1 - tt * 0.7)).toFixed(2));
      p.c.setAttribute('opacity', (1 - tt).toFixed(3));
    }
  }, tk, ease.out).then(() => lg.remove()));
  await wait(500 * M, tk);
  await tween(450 * M, t => { kai.wrap.style.opacity = (1 - t).toFixed(3); }, tk);
  kai.remove();

  const guideRoot = local(L.front);
  const guide = el('g', { class: 'guide' }, guideRoot);
  const bins = MEN_GUIDE.flatMap(pts => guideBins(guide, pts));
  const need = Math.ceil(bins.length * 0.72);
  const trailG = el('g', { class: 'trail', filter: 'url(#brush)' }, L.front);
  hint('沿虚线描出「门」的三笔');
  stage.classList.add('trace');
  const covered = new Set();
  const mark = (x, y) => {
    bins.forEach((bin, i) => {
      if (covered.has(i)) return;
      if (segDist(x, y, bin.x1, bin.y1, bin.x2, bin.y2) < 8) {
        covered.add(i);
        bin.el.classList.add('hit');
      }
    });
  };
  const markSeg = (a, b) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
    for (let i = 0; i <= n; i++) mark(lerp(a.x, b.x, i / n), lerp(a.y, b.y, i / n));
  };
  let drawing = false, pid = null, last = null, trail = null, lastAct = 0;
  const down = e => {
    drawing = true; pid = e.pointerId; lastAct = performance.now();
    try { stage.setPointerCapture(pid); } catch {}
    const sp = toStage(e);
    trail = { el: el('path', null, trailG), d: `M${sp.x.toFixed(1)} ${sp.y.toFixed(1)}` };
    trail.el.setAttribute('d', trail.d);
    last = toLocal(e); mark(last.x, last.y);
    Sound.brush(0.3);
    e.preventDefault();
  };
  const move = e => {
    if (!drawing || e.pointerId !== pid) return;
    lastAct = performance.now();
    const sp = toStage(e);
    trail.d += `L${sp.x.toFixed(1)} ${sp.y.toFixed(1)}`;
    trail.el.setAttribute('d', trail.d);
    const p = toLocal(e);
    markSeg(last, p); last = p;
  };
  const up = e => { if (e.pointerId === pid) drawing = false; };
  stage.addEventListener('pointerdown', down);
  stage.addEventListener('pointermove', move);
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  const off = () => {
    stage.removeEventListener('pointerdown', down);
    stage.removeEventListener('pointermove', move);
    stage.removeEventListener('pointerup', up);
    stage.removeEventListener('pointercancel', up);
    stage.classList.remove('trace');
  };
  cleanups.push(off);
  const t0 = performance.now();
  let done = null;
  while (!done) {
    const now = await frame(tk);
    if (covered.size >= need) done = 'user';
    else if (now - t0 > 5500 && !drawing && now - lastAct > 1200) done = 'auto';
    else if (now - t0 > 12000) done = 'auto';
  }
  off();
  hint(null);
  S.interactions.push(done);
  Sound.drum(0.35);
  S.jian = new Glyph(L.glyph, G.jian, { filter: 'brush' });
  await S.jian.draw(tk, { per: done === 'user' ? 150 : 190, gap: 50, numbers: L.front });
  bg(tween(500 * M, t => { guide.style.opacity = (1 - t).toFixed(3); trailG.style.opacity = (1 - t).toFixed(3); }, tk)
    .then(() => { guideRoot.remove(); trailG.remove(); }));
  await wait(800, tk);
  const nums = S.jian.numG;
  bg(tween(600 * M, t => { nums.style.opacity = (1 - t).toFixed(3); }, tk));
  await wait(900, tk);
}

async function sceneFinale(tk) {
  await caption('门 · 三千年', '从两扇门板，到一个门框，一个「门」字写了三千多年。', tk);
  progress(7);
  vtitle(null);
  Sound.pluck(NOTE.D4, 0.2, 3);
  Sound.pluck(NOTE.A4, 0.14, 3);
  const jian = S.jian;
  await tween(700 * M, t => { jian.wrap.style.opacity = (1 - t).toFixed(3); }, tk);
  jian.remove();
  L.front.replaceChildren();
  buildScroll();
  const notes = [NOTE.D4, NOTE.E4, NOTE.G4, NOTE.A4, NOTE.B4, NOTE.D5];
  for (let i = 0; i < S.scroll.cells.length; i++) {
    const c = S.scroll.cells[i].g;
    Sound.pluck(notes[i], 0.14, 1.6);
    await tween(300 * M, t => { c.style.opacity = t; }, tk, ease.out);
  }
  hint('点击任一字形，重看它的笔画');
  window.__men.finishedAt = performance.now();
  await wait(6000, tk);
  hint(null);
}

const Timeline = {
  scenes: [sceneXiang, sceneDrag, sceneJiagu, sceneJinwen, sceneZhuan, sceneLi, sceneKai, sceneJian, sceneFinale],
  async play(tk) {
    for (const scene of this.scenes) {
      window.__men.scene = scene.name;
      await scene(tk);
    }
  },
};
