import {assetMode, assetUrl} from './adventure_media_core.js';

const $ = id => document.getElementById(id);
const mode = assetMode(location.hostname, location.search);
const palette = {ice:'#70d9ff',fire:'#ff9b4d',storm:'#ffdc6e',life:'#93ee98',death:'#c598ff'};
const schoolNames = {ice:'寒冰',fire:'烈火',storm:'风暴',life:'生命',death:'死亡'};
const labels = ['银蓝冰盾 · 防护主体','棱面冰晶 · 飞行主体','海狮冰剑 · 召唤主体','火焰爆发 · 命中主体','展翼火凤 · 召唤主体','分叉雷电 · 命中主体','静水灵体 · 治疗主体','灵木刺阵 · 飞行主体','吸血幽灵 · 飞行主体'];
const kinds = ['防护显现','冰晶飞行','召唤登场','火焰爆发','火凤掠过','雷电轰击','治疗脉冲','木刺飞行','幽灵汲取'];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const stage = $('atlas-effect'), ctx = stage.getContext('2d');
let sheet, manifest, selected = 0, playing = false, progress = 0, last = 0, frame = 0;
const buttons = [];
const clamp = x => Math.max(0, Math.min(1, x));

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('样张配置加载失败');
  return response.json();
}
function loadImage(row) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败，请检查资源模式或网络'));
    image.src = assetUrl(row, mode);
  });
}
// Both card and animation use this exact same atlas cell and the same draw path.
function sprite(c, cell, x, y, size, angle = 0, alpha = 1) {
  c.save(); c.translate(x, y); c.rotate(angle); c.globalAlpha *= alpha;
  c.drawImage(sheet, ...cell.rect, -size / 2, -size / 2, size, size); c.restore();
}
function drawCard(canvas, background, cell, index) {
  const c = canvas.getContext('2d'); c.scale(2, 2);
  c.drawImage(background, 0, 0, 302, 460);
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  c.font = '900 27px "Microsoft YaHei", sans-serif'; c.lineWidth = 5;
  c.strokeStyle = '#1d2631'; c.strokeText(cell.name, 151, 52, 221);
  c.fillStyle = '#fffde5'; c.fillText(cell.name, 151, 52, 221);
  c.save(); c.beginPath(); c.rect(22, 88, 258, 176); c.clip();
  sprite(c, cell, 151, 175, 204); c.restore();
  c.fillStyle = palette[cell.school]; c.font = 'bold 24px sans-serif';
  c.strokeText(schoolNames[cell.school][0], 28, 27); c.fillText(schoolNames[cell.school][0], 28, 27);
  c.fillStyle = '#173b42'; c.font = 'bold 19px sans-serif'; c.fillText('样', 276, 28);
  c.fillText(String(index + 1), 36, 277);
  c.textAlign = 'left'; c.font = 'bold 18px "Microsoft YaHei", sans-serif';
  const [subject, role] = labels[index].split(' · ');
  c.fillText(subject, 40, 319); c.fillText(role, 40, 349);
  c.font = '14px "Microsoft YaHei", sans-serif'; c.fillStyle = '#315164';
  c.fillText('同格复用：卡面 / 施法', 40, 385);
}
function ring(x, y, radius, color, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(x, y, radius, radius * .28, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}
function drawEffect() {
  if (!manifest || !sheet) return;
  const cell = manifest.cells[selected], color = palette[cell.school], t = progress;
  ctx.clearRect(0, 0, 1000, 440);
  const glow = ctx.createRadialGradient(500, 250, 10, 500, 250, 450);
  glow.addColorStop(0, '#28445c'); glow.addColorStop(1, '#101f30');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 1000, 440);
  ring(170, 342, 76, '#72b8b2', .55); ring(810, 342, 76, '#72b8b2', .55);
  ctx.fillStyle = '#b2c8ca'; ctx.font = '18px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('施法位置', 170, 396); ctx.fillText('目标位置', 810, 396);
  const motion = clamp((t - .12) / .65), ease = motion * motion * (3 - 2 * motion);
  let x = 500, y = 235, size = 310, angle = 0;
  const traveling = [1,4,7,8].includes(selected);
  if (!reduced.matches) {
    if (traveling) { x = 170 + 640 * ease; y = 245 - Math.sin(motion * Math.PI) * 80; size = 240; angle = Math.sin(t * Math.PI * 2) * .1; }
    else if (selected === 2) { y = 292 - Math.sin(clamp(t / .3) * Math.PI / 2) * 68; size = 230 + 110 * clamp(t / .35); }
    else if ([3,5].includes(selected)) { x = 810; y = 217; size = 230 + 110 * Math.sin(clamp(t / .5) * Math.PI / 2); }
    else { x = selected === 0 ? 810 : 170; size = 275 + Math.sin(t * Math.PI * 4) * 22; }
  }
  const opacity = reduced.matches ? 1 : Math.min(1, t / .12, (1 - t) / .15);
  ring(x, 342, 75 + motion * 65, color, Math.max(0, opacity * .7));
  if (!reduced.matches) {
    for (let i = 0; i < 24; i++) {
      const a = i * 2.399963 + t * 2, r = 70 + (i % 6) * 13;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * .8;
      ctx.globalAlpha = Math.max(0, opacity) * (.3 + .4 * Math.sin(i + t * 5) ** 2);
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px, py, 1.5 + i % 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  sprite(ctx, cell, x, y, size, angle, Math.max(0, opacity));
  if (traveling && motion > .85 && !reduced.matches) ring(810, 342, 70 + (motion - .85) * 600, color, (1 - motion) * 5);
}
function updatePlay() { $('effect-play').textContent = playing ? '暂停演出' : '播放演出'; }
function tick(now) {
  if (!playing || document.hidden) { frame = 0; return; }
  if (last) progress = (progress + Math.min(now - last, 100) / 3000) % 1;
  last = now; $('effect-progress').value = Math.round(progress * 1000); drawEffect();
  frame = requestAnimationFrame(tick);
}
function run() { last = 0; if (!frame && playing && !document.hidden) frame = requestAnimationFrame(tick); updatePlay(); }
function select(index) {
  selected = index; progress = .35; $('effect-progress').value = 350;
  buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  $('effect-name').textContent = manifest.cells[index].name;
  $('effect-kind').textContent = kinds[index];
  drawEffect();
}
$('effect-play').onclick = () => { playing = !playing; run(); };
$('effect-replay').onclick = () => { progress = 0; playing = true; run(); };
$('effect-progress').oninput = event => { playing = false; progress = Number(event.target.value) / 1000; updatePlay(); drawEffect(); };
document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
reduced.addEventListener('change', () => { playing = false; updatePlay(); drawEffect(); });

try {
  const [atlas, backgrounds] = await Promise.all([json('data/adventure/card-atlas.json'), json('data/adventure/card-frames.json')]);
  manifest = atlas;
  const schools = [...new Set(atlas.cells.map(cell => cell.school))];
  const images = await Promise.all([loadImage(atlas.image), ...schools.map(school => loadImage(backgrounds.entries[school]))]);
  sheet = images[0];
  const backgroundImages = Object.fromEntries(schools.map((school, i) => [school, images[i + 1]]));
  atlas.cells.forEach((cell, index) => {
    const article = document.createElement('article'); article.className = 'atlas-card';
    const button = document.createElement('button'); button.className = 'atlas-select';
    button.setAttribute('aria-label', '预览' + cell.name + '施法演出'); button.setAttribute('aria-pressed', 'false');
    const canvas = document.createElement('canvas'); canvas.width = 604; canvas.height = 920;
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', cell.name + '重绘卡面');
    button.append(canvas); button.onclick = () => select(index); buttons.push(button);
    drawCard(canvas, backgroundImages[cell.school], cell, index);
    const meta = document.createElement('p'); meta.className = 'meta'; meta.textContent = `第 ${index + 1} 格 · ${schoolNames[cell.school]} · ${cell.name}`;
    const details = document.createElement('details'); details.className = 'original-card';
    const summary = document.createElement('summary'); summary.textContent = '对照原版卡面';
    const original = document.createElement('img'); original.alt = cell.name + '原版卡面'; original.loading = 'lazy';
    original.crossOrigin = 'anonymous'; original.src = assetUrl(cell.original, mode);
    details.append(summary, original); article.append(button, meta, details); $('atlas-cards').append(article);
  });
  $('atlas-sheet').src = assetUrl(atlas.image, mode);
  $('atlas-size').textContent = `3 × 3 · ${(atlas.image.size / 1000).toFixed(1)}KB`;
  $('atlas-source-info').textContent = `${atlas.image.width} × ${atlas.image.height} 像素；每格 ${atlas.image.width / 3} × ${atlas.image.height / 3} 像素。实际加载：${mode === 'cdn' ? 'Keepwork CDN' : '本地 WebP'}。`;
  $('atlas-status').textContent = '九张样张已就绪。点击卡牌切换技能；展开对照可查看原版来源。';
  $('effect-play').disabled = false; $('effect-replay').disabled = false;
  select(0); playing = !reduced.matches; run();
} catch (error) {
  $('atlas-status').textContent = error.message;
}
