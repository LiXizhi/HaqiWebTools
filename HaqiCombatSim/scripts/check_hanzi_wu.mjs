// Standalone browser acceptance: node scripts/check_hanzi_wu.mjs --playwright <package path> [--channel chrome|msedge]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const { chromium } = createRequire(import.meta.url)(option('--playwright', 'playwright'));
const output = path.resolve('.cache/hanzi-wu');
fs.mkdirSync(output, { recursive: true });
const html = fs.readFileSync(new URL('../hanzi/hanzi_wu.html', import.meta.url));
const external = [];
const server = http.createServer((req, res) => {
  if (req.url === '/hanzi/hanzi_wu.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); }
  else { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/hanzi/`;
const channel = option('--channel', '');
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
    await page.goto(base + 'hanzi_wu.html');
    const tag = mobile ? 'mobile' : 'desktop';
    const shot = async name => { await page.clock.runFor(200); await page.waitForTimeout(400); await page.screenshot({ path: path.join(output, `${tag}-${name}.png`) }); };
    const g = expr => page.evaluate(expr);
    const until = async (expr, limit = 120000) => {
      for (let t = 0; t < limit; t += 250) { if (await page.evaluate(expr)) return; await page.clock.runFor(250); }
      throw new Error(`timeout: ${expr}`);
    };
    const ORDER = ['sceneGe','sceneJiagu','sceneJinwen','sceneZhiGe','sceneZhuan','sceneLi','sceneKai','sceneTrace','sceneFinale'];
    const reach = name => until(`window.__wu && `+JSON.stringify(ORDER)+`.indexOf(window.__wu.scene)>=`+ORDER.indexOf(name));
    const center = mobile ? { x: 195, y: 360 } : { x: 720, y: 380 };

    await page.clock.runFor(7000); await shot('01-intro');
    await page.locator('#start').click();
    await until(`window.__wu && window.__wu.scene==='sceneGe' && document.body.querySelector('#stage').classList.contains('tap')`);
    await shot('02-ge');
    for (let i = 0; i < 3; i++) { await page.mouse.click(center.x, center.y); await page.clock.runFor(400); }
    assert.equal((await g('window.__wu.interactions'))[0], 'user', 'steps by user');
    await page.clock.runFor(2500); await shot('03-steps');
    await reach('sceneJiagu'); await page.clock.runFor(9000); await shot('04-jiagu');
    await reach('sceneJinwen'); await page.clock.runFor(8000); await shot('05-jinwen');
    await reach('sceneZhiGe'); await page.clock.runFor(6000); await shot('06-battle');
    await until(`document.querySelector('#stage').classList.contains('hold')`);
    await shot('07-zhige-eq');
    // A short press is not enough; holding lays the weapons down.
    await page.mouse.move(center.x, center.y); await page.mouse.down(); await page.clock.runFor(500); await page.mouse.up();
    await page.clock.runFor(300);
    assert.equal((await g('window.__wu.interactions')).length, 1, 'short press does not complete');
    await page.mouse.down();
    for (let i = 0; i < 12; i++) { await page.clock.runFor(250); if (i === 4) await shot('08-holding'); }
    await page.mouse.up();
    assert.equal((await g('window.__wu.interactions'))[1], 'user', 'hold by user');
    await page.clock.runFor(4000); await shot('09-peace');
    await page.clock.runFor(9000); await shot('10-virtues');
    await reach('sceneZhuan'); await page.clock.runFor(8000); await shot('11-seal');
    await reach('sceneLi'); await page.clock.runFor(6000); await shot('12-li');
    await reach('sceneKai'); await until(`[...document.querySelectorAll('#lFront text')].some(t=>t.textContent==='撇'&&+t.style.opacity>0.9)`); await shot('13-kai-pie');
    await until(`window.__wu.scene==='sceneTrace' && document.querySelector('#stage').classList.contains('trace')`);
    await shot('14-trace-start');
    const strokes = await page.evaluate(() => window.__wuApi.medians.map(m => m.map(([x, y]) => window.__wuApi.localToScreen(x, y))));
    for (const [i, pts] of strokes.entries()) {
      await page.mouse.move(pts[0].x, pts[0].y); await page.mouse.down();
      for (let k = 1; k < pts.length; k++) await page.mouse.move(pts[k].x, pts[k].y, { steps: 6 });
      await page.mouse.up(); await page.clock.runFor(60);
      if (i === 4) await shot('15-tracing');
    }
    await page.clock.runFor(500);
    assert.equal((await g('window.__wu.interactions'))[2], 'user', 'trace by user');
    await page.clock.runFor(6000); await shot('16-written');
    await until(`window.__wu.finishedAt>0`, 180000); await page.clock.runFor(1500); await shot('17-scroll');
    const overflow = await g('document.documentElement.scrollWidth>innerWidth');
    // Replay returns to the first scene.
    await page.locator('#replay').click(); await page.clock.runFor(2500);
    assert.equal(await g('window.__wu.scene'), 'sceneGe');
    assert.deepEqual(errors, [], `${tag} page errors`);
    assert.equal(overflow, false, `${tag} horizontal overflow`);
    report.push({ tag, interactions: ['user', 'user', 'user'], errors: errors.length, overflow });
    await context.close();
  }
  assert.deepEqual(external, [], 'no external requests');
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ report, external }, null, 2));
  console.log('hanzi_wu ok', JSON.stringify(report));
} finally {
  await browser.close();
  server.close();
}
