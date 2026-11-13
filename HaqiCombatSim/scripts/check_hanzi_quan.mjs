// Standalone browser acceptance for 泉:
// node scripts/check_hanzi_quan.mjs --playwright <package path> [--executable <browser path>]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const { chromium } = createRequire(import.meta.url)(option('--playwright', 'playwright'));
const output = path.resolve('.cache/hanzi-quan');
fs.mkdirSync(output, { recursive: true });
const html = fs.readFileSync(new URL('../hanzi/hanzi_quan.html', import.meta.url));
const external = [];

// 只服务本机回环地址上的目标页面，页面自身不得请求任何外部资源
const server = http.createServer((req, res) => {
  // 按路径匹配，保留 ?auto&fast 等调试参数
  if (req.url.split('?')[0] === '/hanzi/hanzi_quan.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const executablePath = option('--executable', '');
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
  args: ['--no-sandbox', '--disable-gpu'],
});
const report = [];

const VIEWPORTS = [
  { tag: 'desktop', width: 1440, height: 900, touch: false },
  { tag: 'portrait', width: 390, height: 844, touch: true },
  { tag: 'landscape', width: 844, height: 390, touch: true },
  { tag: 'tablet', width: 768, height: 1024, touch: true },
];

const only = option('--only', '');
try {
  for (const vp of VIEWPORTS.filter(v => !only || v.tag === only)) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.touch,
      isMobile: vp.touch,
      deviceScaleFactor: vp.touch ? 2 : 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => {
      const u = r.url();
      if (!u.startsWith(`${origin}/hanzi/`) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
    });

    // 时钟只在 runFor 时前进：否则相机 tween 会在"取坐标"与"点击"之间继续移动，造成假失败
    await page.clock.install({ time: new Date('2026-11-13T00:00:00Z') });
    await page.goto(`${origin}/hanzi/hanzi_quan.html`);
    await page.clock.pauseAt(new Date('2026-11-13T00:00:10Z'));
    const shot = async name => {
      await page.clock.runFor(200);
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(output, `${vp.tag}-${name}.png`) });
    };
    const g = expr => page.evaluate(expr);
    const until = async (expr, limit = 120000, label = expr) => {
      for (let t = 0; t < limit; t += 250) {
        if (await page.evaluate(expr)) return;
        await page.clock.runFor(250);
      }
      throw new Error(`[${vp.tag}] timeout: ${label}`);
    };

    // 01. Intro
    await page.clock.runFor(4200);
    await shot('01-intro');
    await page.getByRole('button', { name: '开始', exact: true }).click();
    await until(`window.__quan.scene==='sNight'`, 8000, 'first scene');
    await page.clock.runFor(4000);
    await shot('02-night');

    // 02. Listen: 三处回声，第一处点空白也应就近命中（容错），后两处精确点击
    await until(`window.__quan.scene==='sListen'&&window.__quan.state.listenUI>0.9`, 60000, 'listen ready');
    await page.clock.runFor(2400); // 等相机落位，避免坐标随 tween 漂移
    await shot('03-listen-ready');
    const spotScreen = i => page.evaluate(i => {
      const s = window.__quan.state.spots[i];
      return window.__quan.toScreen(s.x, s.y, 0.94);
    }, i);
    let sp = await spotScreen(0);
    await page.mouse.click(sp.x, sp.y);
    await page.clock.runFor(300);
    if (!await g('window.__quan.state.spots[0].found')) {
      const diag = await page.evaluate(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return {
          at: [x, y], hit: el ? `${el.tagName}#${el.id}.${el.className}` : 'null',
          scene: window.__quan.scene, mode: document.body.className,
          found: window.__quan.state.spots.map(s => s.found),
          inter: window.__quan.interactions.slice(),
          listenUI: window.__quan.state.listenUI,
        };
      }, [sp.x, sp.y]);
      throw new Error(`[${vp.tag}] spot0 not found; diag=${JSON.stringify(diag)}`);
    }
    assert.equal(await g('window.__quan.interactions[0]'), 'tap');
    for (const i of [1, 2]) {
      sp = await spotScreen(i);
      await page.mouse.click(sp.x, sp.y);
      await page.clock.runFor(300);
    }
    await until(`window.__quan.state.charge>=0.99`, 8000, 'all echoes');
    await shot('04-listen-done');
    await page.clock.runFor(2600);

    // 03. Gush: 三次叩泉
    await until(`window.__quan.scene==='sGush'&&window.__quan.state.gushUI>0.9`, 60000, 'gush ready');
    await page.clock.runFor(2600); // 等相机落位
    await shot('05-gush-ready');
    const cave = await g('window.__quan.toScreen(900,470,0.94)');
    const tapsBefore = (await g('window.__quan.interactions.slice()')).length;
    for (let i = 0; i < 3; i++) {
      await page.mouse.click(cave.x, cave.y);
      await page.clock.runFor(220);
      // 每一叩都应被计入，且泉压随之上升（开泉后 crack 会按演出回落，不能用它判开合）
      assert.equal((await g('window.__quan.interactions.slice()')).length, tapsBefore + i + 1, `tap ${i + 1} counted`);
    }
    assert.equal(await g('window.__quan.state.spring>0.42'), true, 'spring bursts past the sealed level');
    await until(`window.__quan.state.spring>=0.99&&window.__quan.state.pool>=0.99`, 30000, 'spring full');
    await page.clock.runFor(1500);
    await shot('06-gush-flow');

    // 04. Glyph evolution: 甲骨 -> 小篆 -> 楷书
    await until(`window.__quan.scene==='sGlyph'&&window.__quan.state.glyph.plate>0.99`, 60000, 'oracle plate');
    await shot('07-oracle');
    await until(`window.__quan.state.glyph.m>=0.99&&window.__quan.state.glyph.m<1.01`, 30000, 'seal script');
    await shot('08-seal');
    await until(`window.__quan.state.glyph.labels>0.99`, 30000, 'kaishu labels');
    await shot('09-kaishu');

    // 05. Trace 9 strokes：先验证逆序与半笔被拒
    // body.trace 才是指针处理器真正挂上的信号（ghost 补间结束时开场字幕可能还没读完）
    await until(`window.__quan.scene==='sWrite'&&document.body.classList.contains('trace')&&window.__quan.state.glyph.ghost>0.99`, 90000, 'trace ready');
    await shot('10-trace-start');
    let pts = await g(`window.__quan.tracePoints[0].map(([x,y])=>window.__quan.localToScreen(x,y))`);
    const tail = pts[pts.length - 1];
    await page.mouse.move(tail.x, tail.y);
    await page.mouse.down();
    await page.mouse.move(pts[0].x, pts[0].y, { steps: 6 });
    await page.mouse.up();
    await page.clock.runFor(400);
    assert.equal(await g('window.__quan.state.trace.stroke'), 0, 'reverse stroke rejected');

    await page.mouse.move(pts[0].x, pts[0].y);
    await page.mouse.down();
    for (const q of pts.slice(1, Math.floor(pts.length * 0.3))) await page.mouse.move(q.x, q.y);
    await page.mouse.up();
    await page.clock.runFor(400);
    assert.equal(await g('window.__quan.state.trace.stroke'), 0, 'half stroke rejected');
    assert.equal(await g('window.__quan.state.glyph.prog[0]<0.05'), true, 'half stroke rolls back');

    for (let i = 0; i < 9; i++) {
      pts = await page.evaluate(i => window.__quan.tracePoints[i].map(([x, y]) => window.__quan.localToScreen(x, y)), i);
      await page.mouse.move(pts[0].x, pts[0].y);
      await page.mouse.down();
      for (const q of pts.slice(1)) {
        await page.mouse.move(q.x, q.y);
        await page.clock.runFor(16);
      }
      if (i === 5) await shot('11-tracing-stroke6');
      await page.mouse.up();
      await page.clock.runFor(120);
      assert.equal(await g('window.__quan.state.trace.stroke'), i + 1, `stroke ${i + 1} accepted`);
    }
    await until(`window.__quan.events.includes('written')`, 8000, 'written event');
    assert.deepEqual(await g('window.__quan.events.slice()'), ['written'], 'written fires once, before completed');
    await page.clock.runFor(2200);
    await shot('12-written');

    // 06. Words
    await until(`window.__quan.scene==='sWords'&&window.__quan.state.wordOn>=0`, 30000, 'words');
    await page.clock.runFor(1400);
    await shot('13-words');

    // 07. Finale：自由互动（水面涟漪 / 松林流萤）
    await until(`window.__quan.finished`, 90000, 'finale');
    await page.clock.runFor(3600);
    await shot('14-finale');
    const pool = await g('window.__quan.toScreen(1200,800,1)');
    await page.mouse.click(pool.x, pool.y);
    await page.clock.runFor(600);
    assert.equal(await g('window.__quan.state.ripples.length>0'), true, 'pool ripple spawned');
    const pine = await g('window.__quan.toScreen(700,560,1)');
    await page.mouse.click(pine.x, pine.y);
    await page.clock.runFor(900);
    await shot('15-finale-play');
    assert.deepEqual(await g('window.__quan.events.slice()'), ['written', 'completed'], 'protocol order');
    // 记录完整一轮的真实交互序列：寻声三叩 + 叩泉三下 + 描红一次 user
    const fullRunInteractions = await g('window.__quan.interactions.slice()');
    assert.deepEqual(fullRunInteractions, ['tap', 'tap', 'tap', 'tap', 'tap', 'tap', 'user'], 'full-run interaction sequence');

    // 08. 暂停 / 继续：虚拟时钟必须冻结
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    assert.equal(await g('window.__quan.paused'), true, 'paused flag');
    assert.equal(await page.getAttribute('#pause', 'aria-pressed'), 'true');
    const fly0 = await g('JSON.stringify(window.__quan.state.flies.map(f=>[f.x,f.y]))');
    await page.clock.runFor(2500);
    const fly1 = await g('JSON.stringify(window.__quan.state.flies.map(f=>[f.x,f.y]))');
    assert.equal(fly0, fly1, 'world frozen while paused');
    await shot('16-paused');
    await page.getByRole('button', { name: '继续', exact: true }).click();
    assert.equal(await g('window.__quan.paused'), false, 'resumed flag');
    await page.clock.runFor(1200);

    // 09. 静音开关双向
    await page.getByRole('button', { name: '静音', exact: true }).click();
    assert.equal(await g('window.__quan.muted'), true, 'muted');
    assert.equal(await page.getAttribute('#mute', 'aria-pressed'), 'true');
    await page.getByRole('button', { name: '开启声音', exact: true }).click();
    assert.equal(await g('window.__quan.muted'), false, 'unmuted');

    // 10. Resize：横竖屏切换后不溢出、控件不出屏
    const checkLayout = async label => {
      const box = await g(`(() => {
        const vw = innerWidth, vh = innerHeight;
        const bad = [];
        for (const sel of ['#controls', '#progress', '#caption', '#hint', '#brand']) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) bad.push(sel + ':' + JSON.stringify([r.left|0, r.top|0, r.right|0, r.bottom|0, vw, vh]));
        }
        return { overflow: document.documentElement.scrollWidth > vw, bad };
      })()`);
      assert.equal(box.overflow, false, `${label}: no horizontal overflow`);
      assert.deepEqual(box.bad, [], `${label}: controls inside viewport`);
    };
    await checkLayout('initial');
    await page.setViewportSize({ width: vp.height, height: vp.width });
    await page.clock.runFor(900);
    await shot('17-resized');
    await checkLayout('rotated');
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.clock.runFor(900);
    await checkLayout('restored');

    // 11. 重播三次：状态归零、事件清空、无残留
    for (let r = 0; r < 3; r++) {
      await page.getByRole('button', { name: '重播', exact: true }).click();
      await page.clock.runFor(900);
      assert.equal(await g('window.__quan.scene'), 'sNight', `replay ${r + 1} back to first scene`);
      assert.deepEqual(await g('window.__quan.events.slice()'), [], `replay ${r + 1} events cleared`);
      assert.equal(await g('window.__quan.finished'), false);
      assert.equal(await g('window.__quan.state.trace===undefined||window.__quan.state.trace.stroke===0'), true);
      assert.equal(await g('window.__quan.state.spots.every(s=>!s.found)'), true, 'echoes reset');
      assert.equal(await g('window.__quan.paused'), false, 'replay clears pause');
    }
    // 重播后仍可再次走到寻声幕，说明状态机没有卡死
    await until(`window.__quan.scene==='sListen'`, 90000, 'replay reaches listen again');
    await shot('18-replay-listen');

    // 重播会清空 interactions，故报告使用本轮完整流程中记录的快照
    assert.deepEqual(errors, [], `${vp.tag}: console clean`);
    report.push({ viewport: vp.tag, size: `${vp.width}x${vp.height}`, interactions: fullRunInteractions, errors: errors.length });
    await context.close();
  }

  // 12. ?auto 全自动演示：不交互也能走完七幕并触发 completed
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.clock.install({ time: new Date('2026-11-13T00:00:00Z') });
    await page.goto(`${origin}/hanzi/hanzi_quan.html?auto&fast`);
    await page.clock.pauseAt(new Date('2026-11-13T00:00:10Z'));
    for (let t = 0; t < 240000; t += 500) {
      if (await page.evaluate('window.__quan.finished')) break;
      await page.clock.runFor(500);
    }
    assert.equal(await page.evaluate('window.__quan.finished'), true, 'auto demo completes');
    assert.deepEqual(await page.evaluate('window.__quan.events.slice()'), ['written', 'completed']);
    assert.deepEqual(errors, []);
    report.push({ viewport: 'auto', size: '1280x800', errors: errors.length });
    await context.close();
  }

  assert.deepEqual(external, [], 'no external requests');
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report), `screenshots: ${output}`);
} finally {
  await browser.close();
  server.close();
}