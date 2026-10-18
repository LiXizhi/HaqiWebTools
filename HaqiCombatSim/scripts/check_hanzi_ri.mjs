// Standalone browser acceptance: node scripts/check_hanzi_ri.mjs --playwright <package path> [--channel chrome|msedge]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const {chromium} = createRequire(import.meta.url)(option('--playwright', 'playwright'));
const output = path.resolve('.cache/hanzi-ri'); fs.mkdirSync(output, {recursive: true});
const html = fs.readFileSync(new URL('../hanzi/hanzi_ri.html', import.meta.url));
const external = [];
const server = http.createServer((req, res) => {
  if (req.url === '/hanzi/hanzi_ri.html') { res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end(html); }
  else { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const channel = option('--channel', '');
const browser = await chromium.launch({...(channel ? {channel} : {}), headless: true});
const report = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? {width: 390, height: 844} : {width: 1440, height: 900},
      hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 2 : 1,
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => {
      if (!r.url().startsWith(`http://127.0.0.1:${server.address().port}/hanzi/`) && !r.url().startsWith('data:')) external.push(r.url());
    });
    await page.clock.install();
    await page.goto(`http://127.0.0.1:${server.address().port}/hanzi/hanzi_ri.html`);
    const tag = mobile ? 'mobile' : 'desktop';
    const shot = async name => { await page.clock.runFor(200); await page.waitForTimeout(350); await page.screenshot({path: path.join(output, `${tag}-${name}.png`)}); };
    const g = expr => page.evaluate(expr);
    const until = async (expr, limit = 140000, label = expr) => {
      for (let t = 0; t < limit; t += 250) { if (await page.evaluate(expr)) return; await page.clock.runFor(250); }
      throw new Error(`timeout: ${label}`);
    };
    const scr = (fn, ...a) => page.evaluate(([fn, a]) => window.__ri[fn](...a), [fn, a]);

    await page.clock.runFor(5000); await shot('01-intro');
    await page.getByRole('button', {name: '开始', exact: true}).click();
    await page.clock.runFor(6000); await shot('02-dawn');
    await until(`window.__ri.scene==='sMist'&&document.body.classList.contains('hold')`);
    await shot('03-mist');

    // Mist: press and hold on the stage to blow away sea mist.
    await page.mouse.move(mobile ? 195 : 720, mobile ? 380 : 420); await page.mouse.down();
    for (let i = 0; i < 10; i++) await page.clock.runFor(250);
    await shot('04-blowing-mist');
    await until(`window.__ri.state.mist<0.01`, 8000, 'mist clears'); await page.mouse.up();
    assert.equal((await g('window.__ri.interactions'))[0], 'user');
    await page.clock.runFor(1500); await shot('05-mist-cleared');

    // Rise: drag the sun upward; a short drag falls back.
    await until(`document.body.classList.contains('drag')`);
    let s = await scr('sunScreen');
    await page.mouse.move(s.x, s.y); await page.mouse.down(); await page.mouse.move(s.x, s.y - 25, {steps: 4}); await page.mouse.up();
    await page.clock.runFor(1500); assert.ok(await g('window.__ri.state.sun.rise<0.2'), 'short drag falls back');
    await page.mouse.move(s.x, s.y); await page.mouse.down();
    for (let i = 1; i <= 24; i++) {
      const q = await scr('sunPoint', i / 24);
      const p = await scr('toScreen', q.x, q.y);
      await page.mouse.move(p.x, p.y); await page.clock.runFor(30);
    }
    await shot('06-rising'); await page.mouse.up(); await page.clock.runFor(100);
    assert.equal((await g('window.__ri.interactions'))[1], 'user');
    await page.clock.runFor(2800); await shot('07-sun-risen');

    // Shine: tap 3 morning beacons.
    await until(`window.__ri.scene==='sShine'`);
    for (let i = 0; i < 3; i++) {
      await until(`window.__ri.state.beacons[${i}].ready&&document.body.classList.contains('sky')`);
      if (i === 1) await shot('08-beacon-ready');
      const spot = await scr('beaconSpot', i), p = await scr('toScreen', spot.x, spot.y);
      await page.mouse.click(p.x, p.y); await page.clock.runFor(300);
    }
    assert.deepEqual((await g('window.__ri.interactions')).slice(2, 5), ['user', 'user', 'user']);
    await until(`window.__ri.scene==='sNoon'`); await page.clock.runFor(2200); await shot('09-noon');

    // Glyph evolution: ancient script -> regular script + labels
    await until(`window.__ri.state.glyph.prog[3]>0.99&&window.__ri.state.glyph.morph===0`); await shot('10-oracle');
    await until(`window.__ri.state.glyph.labels>0.99`); await shot('11-labels');

    // Write: 4 strokes of 日
    await until(`document.body.classList.contains('trace')&&window.__ri.state.glyph.ghost>0.99`);
    await shot('12-trace-start');
    let pts = await page.evaluate(() => window.__ri.strokes[0].map(([x, y]) => window.__ri.localToScreen(x, y)));
    const last = pts[pts.length - 1];
    await page.mouse.move(last.x, last.y); await page.mouse.down(); await page.mouse.move(pts[0].x, pts[0].y, {steps: 6}); await page.mouse.up();
    await page.mouse.move(pts[0].x, pts[0].y); await page.mouse.down(); for (const q of pts.slice(0, 28)) await page.mouse.move(q.x, q.y); await page.mouse.up();
    await page.clock.runFor(400); assert.equal(await g('window.__ri.state.trace.stroke'), 0);
    for (let i = 0; i < 4; i++) {
      pts = await page.evaluate(i => window.__ri.strokes[i].map(([x, y]) => window.__ri.localToScreen(x, y)), i);
      await page.mouse.move(pts[0].x, pts[0].y); await page.mouse.down();
      for (const q of pts.slice(1)) await page.mouse.move(q.x, q.y);
      if (i === 2) await shot('13-tracing');
      await page.mouse.up(); await page.clock.runFor(120);
      assert.equal(await g('window.__ri.state.trace.stroke'), i + 1, `stroke ${i + 1}`);
    }
    assert.ok((await g('window.__ri.interactions')).includes('user'));
    await page.clock.runFor(2200); await shot('14-written');

    await until(`window.__ri.state.wordOn===1`); await page.clock.runFor(1200); await shot('15-words');
    await until(`window.__ri.finished`);
    await page.mouse.click(mobile ? 160 : 520, mobile ? 200 : 200); await page.clock.runFor(2500); await shot('16-finale');

    const overflow = await g('document.documentElement.scrollWidth>innerWidth');
    assert.equal(overflow, false);
    const interactions = await g('window.__ri.interactions.slice()');
    await page.getByRole('button', {name: '重播', exact: true}).click(); await page.clock.runFor(1500);
    assert.equal(await g('window.__ri.scene'), 'sDawn');
    assert.deepEqual(errors, []);
    report.push({viewport: tag, interactions, errors: errors.length});
    await context.close();
  }
  assert.deepEqual(external, []);
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report), `screenshots: ${output}`);
} finally {
  await browser.close();
  server.close();
}
