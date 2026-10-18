// Standalone browser acceptance: node scripts/check_hanzi_shan.mjs --playwright <package path> [--channel chrome|msedge]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const playwrightPath = option('--playwright', process.env.HAQI_PLAYWRIGHT || 'playwright');
const { chromium } = createRequire(import.meta.url)(playwrightPath);
const output = path.resolve('.cache/hanzi-shan');
fs.mkdirSync(output, { recursive: true });
const html = fs.readFileSync(new URL('../hanzi/hanzi_shan.html', import.meta.url));
const external = [];
const server = http.createServer((req, res) => {
  if (req.url === '/hanzi/hanzi_shan.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); }
  else { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/hanzi/`;
const channel = option('--channel', process.env.HAQI_BROWSER_CHANNEL || '');
const browser = await chromium.launch({ ...(channel ? { channel } : {}), headless: true });
const report = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 2 : 1,
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) external.push(r.url()); });
    await page.clock.install();
    await page.goto(base + 'hanzi_shan.html');
    const tag = mobile ? 'mobile' : 'desktop';
    const shot = async name => { await page.clock.runFor(200); await page.waitForTimeout(400); await page.screenshot({ path: path.join(output, `${tag}-${name}.png`) }); };
    const g = expr => page.evaluate(expr);
    const scr = (fn, ...a) => page.evaluate(([n, args]) => window.__shan[n](...args), [fn, a]);
    const until = async (expr, limit = 120000, label = expr) => {
      for (let t = 0; t < limit; t += 250) { if (await page.evaluate(expr)) return; await page.clock.runFor(250); }
      throw new Error(`timeout: ${label}`);
    };

    await page.clock.runFor(5200); await shot('01-intro');
    await page.getByRole('button', { name: '开始', exact: true }).click();
    await page.clock.runFor(6000); await shot('02-valley');
    await until(`window.__shan.scene==='sCloud'&&document.body.classList.contains('hold')`);
    await shot('03-clouds');

    await page.mouse.move(mobile ? 195 : 720, mobile ? 380 : 420); await page.mouse.down();
    for (let i = 0; i < 10; i++) await page.clock.runFor(250);
    await shot('04-clearing-clouds');
    await until(`window.__shan.state.clouds<0.01`, 8000, 'clouds clear'); await page.mouse.up();
    assert.equal((await g('window.__shan.interactions'))[0], 'user');
    await page.clock.runFor(1500); await shot('05-base');

    await until(`document.body.classList.contains('drag')`);
    let p0 = await scr('peakScreen');
    await page.mouse.move(p0.x, p0.y); await page.mouse.down(); await page.mouse.move(p0.x, p0.y - 25, { steps: 4 }); await page.mouse.up();
    await page.clock.runFor(1500); assert.ok(await g('window.__shan.state.mtn.rise<0.2'), 'short drag falls back');
    await page.mouse.move(p0.x, p0.y); await page.mouse.down();
    for (let i = 1; i <= 24; i++) {
      const q = await scr('peakPoint', i / 24);
      const p = await scr('toScreen', q.x, q.y);
      await page.mouse.move(p.x, p.y); await page.clock.runFor(30);
    }
    await shot('06-rising'); await page.mouse.up(); await page.clock.runFor(100);
    assert.equal((await g('window.__shan.interactions'))[1], 'user');
    await page.clock.runFor(2800); await shot('07-peaks-risen');

    await until(`window.__shan.scene==='sLife'`);
    for (let i = 0; i < 3; i++) {
      await until(`window.__shan.state.beacons[${i}].ready&&document.body.classList.contains('sky')`);
      if (i === 1) await shot('08-beacon-ready');
      const spot = await scr('beaconSpot', i), p = await scr('toScreen', spot.x, spot.y);
      await page.mouse.click(p.x, p.y); await page.clock.runFor(300);
    }
    assert.deepEqual((await g('window.__shan.interactions')).slice(2, 5), ['user', 'user', 'user']);
    await until(`window.__shan.scene==='sEcho'`); await page.clock.runFor(2200); await shot('09-echo');

    await until(`window.__shan.state.glyph.prog[2]>0.99&&window.__shan.state.glyph.morph===0`); await shot('10-oracle');
    await until(`window.__shan.state.glyph.labels>0.99`); await shot('11-labels');

    await until(`document.body.classList.contains('trace')&&window.__shan.state.glyph.ghost>0.99`);
    await shot('12-trace-start');
    for (let i = 0; i < 3; i++) {
      const pts = await page.evaluate(i => window.__shan.strokes[i].map(([x, y]) => window.__shan.localToScreen(x, y)), i);
      await page.mouse.move(pts[0].x, pts[0].y); await page.mouse.down();
      for (const q of pts.slice(1)) await page.mouse.move(q.x, q.y);
      if (i === 1) await shot('13-tracing');
      await page.mouse.up(); await page.clock.runFor(120);
    }
    await page.clock.runFor(1200); await shot('14-traced');
    await until(`window.__shan.scene==='sWords'&&window.__shan.state.wordOn===2`); await page.clock.runFor(700); await shot('15-words');
    await until(`window.__shan.finished===true`); await shot('16-finale');

    assert.deepEqual(await g('window.__shan.interactions'), ['user', 'user', 'user', 'user', 'user', 'user']);
    assert.equal(errors.length, 0, `${tag} console/page errors: ${errors.join('; ')}`);
    assert.equal(external.length, 0, `external requests: ${external.join(', ')}`);
    report.push({ viewport: tag, interactions: await g('window.__shan.interactions'), errors: errors.length });
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(JSON.stringify(report), 'screenshots:', output);
