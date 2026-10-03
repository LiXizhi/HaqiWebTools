import { HeroRenderer } from '../../js/hero_renderer.js';
import { BODY_TO_HEAD } from '../../js/hero_pose_core.js';

const root = new URL('../../', import.meta.url);
const $ = id => document.getElementById(id);
const names = ['前', '左', '右', '后'];
const headKey = row => `urban-${row.id}-${row.gender === 'female' ? 'girl' : 'boy'}`;
const local = new URLSearchParams(location.search).get('assets') !== 'cdn';
let renderer, designs, art, appearance, revision = 0, start = 0;
const stages = [], frames = [], angles = [];
const read = async path => {
  const response = await fetch(new URL(path, root), { cache: 'no-store' });
  if (!response.ok) throw new Error(`清单加载失败：${path}`);
  return response.json();
};
function options(select, rows, value) {
  select.replaceChildren();
  for (const row of rows) {
    const option = document.createElement('option'); option.value = row.id; option.textContent = row.name;
    select.append(option);
  }
  if (value) select.value = value;
}
function drawCanvas(canvas, facing, walkTime, moving, size, headIndex) {
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
  const result = renderer.draw(ctx, appearance, {
    x: canvas.width/2, y: canvas.height-20, size, facing,
    head: headIndex ?? (BODY_TO_HEAD[facing]+Number($('turn').value)+16)%16,
    time: 0, walkTime, moving, reducedMotion: false,
    breath: { x: 0, y: 0, angle: 0 }, debug: $('debug').checked,
  });
  canvas.dataset.ready = String(result.ready);
  return result.ready;
}
function paintFrames() {
  for (const row of frames) drawCanvas(row.canvas, row.facing, (row.frame+.1)/10, row.frame < 6, 95);
  for (const row of angles) drawCanvas(row.canvas, row.facing, 0, false, 95, row.head);
}
function tick(now) {
  if (appearance) for (const row of stages) drawCanvas(row.canvas, row.facing, (now-start)/1000, $('animate').checked, 160);
  requestAnimationFrame(tick);
}
async function selectAppearance() {
  const token = ++revision;
  document.body.dataset.ready = 'false';
  appearance = null; $('status').textContent = '正在准备头部与身体…';
  try {
    const head = art.heads[$('head').value], body = art.bodyVariants[$('body').value];
    if (!head || !body) throw new Error('此搭配尚未生成');
    if (head.gender !== body.gender) throw new Error('请选择同一身体模板内的头部和身体');
    const next = { gender: head.gender, headId: head.id, bodyId: body.id };
    const result = await renderer.prepare(next);
    if (token !== revision) return;
    if (result.fallback) throw new Error(result.errors.join('；'));
    appearance = next; start = performance.now(); paintFrames();
    for (const {canvas} of frames) {
      if (canvas.dataset.ready !== 'true') throw new Error('动作帧未完成合成');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = false, visible = false;
      for (let i = 3; i < pixels.length; i += 4) { transparent ||= pixels[i] === 0; visible ||= pixels[i] > 0; }
      if (!transparent || !visible) throw new Error('透明通道或可见像素异常');
    }
    const sourceURL = row => {
      const url = new URL(local ? row.local : row.cdn, root); url.searchParams.set('v', row.sha256); return url.href;
    };
    $('head-atlas').src = sourceURL(head); $('body-atlas').src = sourceURL(body);
    $('error').textContent = '';
    $('status').textContent = `${local ? '本地' : 'Keepwork CDN'} · ${head.name}头部／${body.name}服装 · 已生成 ${Object.keys(art.heads).length}/20 个头部、${Object.keys(art.bodyVariants).length}/20 套身体 · 28帧合成就绪，透明与像素读取通过`;
    document.body.dataset.ready = 'true';
  } catch (error) {
    if (token === revision) { $('error').textContent = error.message; document.body.dataset.ready = 'error'; }
  }
}
function paired() {
  const resident = designs.residents.find(row => row.id === $('resident').value);
  options($('head'), Object.values(art.heads).filter(row => row.gender === resident.gender), headKey(resident));
  options($('body'), Object.values(art.bodyVariants).filter(row => row.gender === resident.gender), `${resident.gender}-urban-${resident.id}`);
  selectAppearance();
}
for (let facing = 0; facing < 4; facing++) {
  const card = document.createElement('article'), title = document.createElement('h2'), canvas = document.createElement('canvas');
  title.textContent = names[facing]; canvas.width = 320; canvas.height = 300;
  canvas.setAttribute('aria-label', names[facing]+'方向动画');
  card.append(title, canvas); $('stage').append(card); stages.push({ canvas, facing });
  for (let frame = 0; frame < 7; frame++) {
    const item = document.createElement('article'), c = document.createElement('canvas'), caption = document.createElement('small');
    c.width = 144; c.height = 170; c.setAttribute('aria-label', `${names[facing]}／${frame < 6 ? '步行'+(frame+1) : '静止'}`);
    caption.textContent = names[facing]+' · '+(frame < 6 ? frame+1 : '静止');
    item.append(c, caption); $('frames').append(item); frames.push({ canvas: c, facing, frame });
  }
}
$('resident').onchange = paired;
const angleTitle = document.createElement('h2'), angleGrid = document.createElement('div');
angleTitle.textContent = '16方向头部与就近身体方向连接'; angleGrid.className = 'frames'; angleGrid.id = 'angles';
$('frames').after(angleTitle, angleGrid);
for (let head = 0; head < 16; head++) {
  const facing = head < 2 || head >= 14 ? 0 : head < 6 ? 1 : head < 10 ? 3 : 2;
  const item = document.createElement('article'), canvas = document.createElement('canvas'), caption = document.createElement('small');
  canvas.width = 144; canvas.height = 170; caption.textContent = `${head*22.5}°`;
  item.append(canvas, caption); angleGrid.append(item); angles.push({canvas, facing, head});
}
$('head').onchange = selectAppearance; $('body').onchange = selectAppearance;
$('turn').onchange = paintFrames; $('debug').onchange = paintFrames;
try {
  const [manifest, catalog, plan, assets] = await Promise.all([
    read('data/hero-preview.json'), read('data/adventure/mount-catalog.json'),
    read('art-references/urban-residents/designs.json'), read('art-references/urban-residents/assets.json'),
  ]);
  designs = plan; art = assets;
  Object.assign(manifest.heads, art.heads); Object.assign(manifest.bodyVariants, art.bodyVariants);
  renderer = new HeroRenderer(manifest, catalog, { local, baseURL: root });
  const generated = designs.residents.filter(row => art.heads[headKey(row)] && art.bodyVariants[`${row.gender}-urban-${row.id}`]);
  if (!generated.length) throw new Error('尚无已生成的完整搭配');
  options($('resident'), generated, new URLSearchParams(location.search).get('resident'));
  paired(); requestAnimationFrame(tick);
} catch (error) { $('error').textContent = error.message; document.body.dataset.ready = 'error'; }
