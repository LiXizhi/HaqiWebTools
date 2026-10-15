// Standalone browser acceptance: node scripts/check_hanzi_sen.mjs --playwright <package path> [--channel chrome|msedge]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const { chromium } = createRequire(import.meta.url)(option('--playwright', 'playwright'));
const output = path.resolve('.cache/hanzi-sen');
fs.mkdirSync(output, { recursive: true });
const html = fs.readFileSync(new URL('../hanzi/hanzi_sen.html', import.meta.url));
const ALLOWED_CDN = 'https://cdn.keepwork.com/keepwork/cdn/vendor/three/three.module.js';
const external = [];

const server = http.createServer((req, res) => {
  if (req.url === '/hanzi/hanzi_sen.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const channel = option('--channel', '');
const browser = await chromium.launch({ ...(channel ? { channel } : {}), headless: true });
const report = [];

try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      hasTouch: mobile,
      isMobile: mobile,
      deviceScaleFactor: mobile ? 2 : 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => {
      const u = r.url();
      if (!u.startsWith(`http://127.0.0.1:${server.address().port}/hanzi/`) && !u.startsWith('data:') && u !== ALLOWED_CDN) {
        external.push(u);
      }
    });

    await page.clock.install();
    await page.goto(`http://127.0.0.1:${server.address().port}/hanzi/hanzi_sen.html`);
    const tag = mobile ? 'mobile' : 'desktop';
    const shot = async name => {
      await page.clock.runFor(200);
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(output, `${tag}-${name}.png`) });
    };
    const g = expr => page.evaluate(expr);
    const until = async (expr, limit = 120000, label = expr) => {
      for (let t = 0; t < limit; t += 250) {
        if (await page.evaluate(expr)) return;
        await page.clock.runFor(250);
      }
      throw new Error(`timeout: ${label}`);
    };
    const scr = (fn, ...a) => page.evaluate(([fn, a]) => window.__sen[fn](...a), [fn, a]);

    // 01. Intro
    await page.clock.runFor(4500);
    await shot('01-intro');
    await page.getByRole('button', { name: '开始', exact: true }).click();
    await page.clock.runFor(5000);
    await shot('02-barren');

    // 02. Sprout (木): press and hold to water the seed, underground roots + trunk grow
    await until(`window.__sen.scene==='sSprout'&&document.body.classList.contains('hold')`);
    await shot('03-seed-ready');
    const rp = await scr('rootPoint');
    await page.mouse.move(rp.x, rp.y);
    await page.mouse.down();
    for (let i = 0; i < 6; i++) await page.clock.runFor(250);
    await shot('04-watering-roots');
    await until(`window.__sen.state.tree0Grow>=1`, 8000, 'first tree grows');
    await page.mouse.up();
    assert.equal((await g('window.__sen.interactions'))[0], 'user');
    await page.clock.runFor(2200);
    await shot('05-tree-mu');

    // 03. Twin (林): short drag falls back, full drag brings second tree beside first
    await until(`window.__sen.scene==='sTwin'&&document.body.classList.contains('drag')`);
    await shot('06-storm-lone');
    const p0 = await scr('saplingPoint', 0);
    const p1 = await scr('saplingPoint', 1);
    await page.mouse.move(p0.x, p0.y);
    await page.mouse.down();
    await page.mouse.move(p0.x - 18, p0.y, { steps: 4 });
    await page.mouse.up();
    await page.clock.runFor(1200);
    assert.ok(await g('window.__sen.state.twinMove<0.2'), 'short drag falls back');

    await page.mouse.move(p0.x, p0.y);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) {
      const u = i / 20;
      await page.mouse.move(p0.x + (p1.x - p0.x) * u, p0.y + (p1.y - p0.y) * u);
      await page.clock.runFor(30);
    }
    await shot('07-twin-dragging');
    await page.mouse.up();
    await page.clock.runFor(200);
    assert.equal((await g('window.__sen.interactions'))[1], 'user');
    await page.clock.runFor(2600);
    await shot('08-twin-lin');

    // 04. Forest (森): swipe spring breeze across the ridge
    await until(`window.__sen.scene==='sForest'&&document.body.classList.contains('wind')`);
    await shot('09-wind-ready');
    const w0 = await scr('windPoint', 0);
    const w1 = await scr('windPoint', 1);
    await page.mouse.move(w0.x, w0.y);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) {
      const u = i / 20;
      await page.mouse.move(w0.x + (w1.x - w0.x) * u, w0.y + (w1.y - w0.y) * u);
      await page.clock.runFor(30);
    }
    await page.mouse.up();
    await page.clock.runFor(200);
    assert.equal((await g('window.__sen.interactions'))[2], 'user');
    await page.clock.runFor(4200);
    await shot('10-forest-sen');

    // 05. Glyph evolution (Oracle -> Regular script)
    await until(`window.__sen.scene==='sGlyph'&&window.__sen.state.glyph.prog[11]>0.99&&window.__sen.state.glyph.morph===0`);
    await shot('11-oracle');
    await until(`window.__sen.state.glyph.labels>0.99`);
    await shot('12-kaishu-labels');

    // 06. Trace 12 strokes of 森
    await until(`window.__sen.scene==='sWrite'&&document.body.classList.contains('trace')&&window.__sen.state.glyph.ghost>0.99`);
    await shot('13-trace-start');
    // Verify reverse stroke and half stroke are rejected
    let pts = await page.evaluate(() => window.__sen.strokes[0].map(([x, y]) => window.__sen.localToScreen(x, y)));
    const lastPt = pts[pts.length - 1];
    await page.mouse.move(lastPt.x, lastPt.y);
    await page.mouse.down();
    await page.mouse.move(pts[0].x, pts[0].y, { steps: 5 });
    await page.mouse.up();
    await page.mouse.move(pts[0].x, pts[0].y);
    await page.mouse.down();
    for (const q of pts.slice(0, 22)) await page.mouse.move(q.x, q.y);
    await page.mouse.up();
    await page.clock.runFor(350);
    assert.equal(await g('window.__sen.state.trace.stroke'), 0);

    for (let i = 0; i < 12; i++) {
      pts = await page.evaluate(i => window.__sen.strokes[i].map(([x, y]) => window.__sen.localToScreen(x, y)), i);
      await page.mouse.move(pts[0].x, pts[0].y);
      await page.mouse.down();
      for (const q of pts.slice(1)) await page.mouse.move(q.x, q.y);
      if (i === 7) await shot('14-tracing-stroke8');
      await page.mouse.up();
      await page.clock.runFor(100);
      assert.equal(await g('window.__sen.state.trace.stroke'), i + 1, `stroke ${i + 1}`);
    }
    assert.equal((await g('window.__sen.interactions'))[3], 'user');
    await page.clock.runFor(2000);
    await shot('15-written');

    // 07. Words & Finale 3D orbit + seasons
    await until(`window.__sen.state.wordOn===1`);
    await page.clock.runFor(1200);
    await shot('16-words');
    await until(`window.__sen.finished`);
    // Rotate 3D forest and switch season to Autumn Gold
    await page.getByRole('button', { name: '秋金', exact: true }).click();
    const cx = mobile ? 195 : 720, cy = mobile ? 380 : 420;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 90, cy, { steps: 8 });
    await page.mouse.up();
    await page.mouse.click(mobile ? 140 : 480, mobile ? 240 : 220);
    await page.clock.runFor(1500);
    await shot('17-finale-autumn');

    const overflow = await g('document.documentElement.scrollWidth>innerWidth');
    assert.equal(overflow, false);
    const interactions = await g('window.__sen.interactions.slice()');
    assert.deepEqual(interactions, ['user', 'user', 'user', 'user']);

    // Replay returns to first scene
    await page.getByRole('button', { name: '重播', exact: true }).click();
    await page.clock.runFor(1200);
    assert.equal(await g('window.__sen.scene'), 'sBarren');
    assert.deepEqual(errors, []);
    report.push({ viewport: tag, interactions, errors: errors.length });
    await context.close();
  }
  assert.deepEqual(external, []);
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report), `screenshots: ${output}`);
} finally {
  await browser.close();
  server.close();
}
